// All compiler/discovery work and synchronous dependency I/O stays in this worker.
import {parentPort} from 'node:worker_threads';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire, syncBuiltinESMExports} from 'node:module';
const require = createRequire(import.meta.url);
let ts = require('typescript');
let overlays = {}, target, reads, existence;
const readSync = fs.readFileSync.bind(fs), readAsync = fsp.readFile.bind(fsp), list = fsp.readdir.bind(fsp);
const hash = value => createHash('sha256').update(value).digest('hex');
function content(file) {return overlays[path.resolve(String(file))];}
fs.readFileSync = (file, ...args) => {
  const value = content(file);
  const result = value === undefined ? readSync(file, ...args) : args[0] ? value : Buffer.from(value);
  reads?.set(path.resolve(String(file)), hash(result));
  return result;
};
fsp.readFile = async (file, ...args) => content(file) ?? readAsync(file, ...args);
fsp.readdir = async (dir, ...args) => (await list(dir, ...args)).filter(e => path.resolve(String(dir), typeof e === 'string' ? e : e.name) === target);
syncBuiltinESMExports();
function overlaySystem(implementation) {
  const original = implementation.sys.readFile;
  const exists = implementation.sys.fileExists;
  implementation.sys.fileExists = file => {const result = content(file) !== undefined || exists(file); existence?.set(path.resolve(file), result); return result;};
  implementation.sys.readFile = file => {
    const result = content(file) ?? original(file);
    if (result !== undefined) reads?.set(path.resolve(file), hash(result));
    return result;
  };
}
overlaySystem(ts);
const {discoverPromotions} = await import('../functions/promotion-discovery.mjs');
const {extractFunctions} = await import('../functions/extract.mjs');
const {checkFunctionTypes} = await import('../functions/types.mjs');
const {sourceDiagnostic} = await import('../functions/diagnostics.mjs');
let previous;
parentPort.on('message', async job => {
  try {
    target = path.resolve(job.file); overlays = job.overlays;
    if (job.typescriptPath) {const implementation = require(job.typescriptPath); if (implementation !== ts) {ts = implementation; overlaySystem(ts);}}
    const fingerprint = hash(JSON.stringify([target, overlays, job.options, job.hints]));
    if (previous?.fingerprint === fingerprint && [...previous.reads].every(([file, digest]) => {
      try {return hash(content(file) ?? readSync(file)) === digest;} catch {return false;}
    }) && [...previous.existence].every(([file, value]) => (content(file) !== undefined || fs.existsSync(file)) === value)) {parentPort.postMessage({...previous.result, id: job.id, cached: true}); return;}
    reads = new Map(); existence = new Map();
    const started = performance.now();
    const text = overlays[target];
    const source = ts.createSourceFile(target, text, ts.ScriptTarget.Latest, true);
    const directive = body => body?.statements?.find((s, i, all) => ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression) && s.expression.text === 'use native' && all.slice(0,i).every(p=>ts.isExpressionStatement(p)&&ts.isStringLiteral(p.expression)));
    const fileMarked = !!directive(source);
    const exports = new Set();
    for (const statement of source.statements) if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause && ts.isNamedExports(statement.exportClause)) for (const spec of statement.exportClause.elements) exports.add((spec.propertyName ?? spec.name).text);
    const functions = [];
    function visit(node) {
      if (ts.isFunctionLike(node) && node.body) {
        const nameNode = node.name ?? (ts.isVariableDeclaration(node.parent) ? node.parent.name : undefined);
        let statement = node;
        while (statement.parent && statement.parent !== source) statement = statement.parent;
        const topLevel = node === statement || ts.isVariableDeclaration(node.parent) && ts.isVariableStatement(statement) && node.parent.parent.parent === statement;
        const marked = !!directive(node.body) || fileMarked && topLevel && ((ts.getCombinedModifierFlags(statement) & ts.ModifierFlags.Export) !== 0 || exports.has(nameNode?.getText(source)));
        functions.push({name: nameNode?.getText(source), start: node.getStart(source), end: node.end, marked, async: !!node.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword)});
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    const messages = [];
    const modules = await discoverPromotions(job.root, path.join(job.root, '.scriptc-editor-unused'), {
      reportOnly: true, promotionSourceDir: path.dirname(target), typescript: {implementation: ts},
      onDiagnostic: d => messages.push(d),
    }, () => {});
    // Ask extraction for shape failures discovery deliberately excludes (nested/generator).
    for (const fn of functions.filter(f=>f.marked && !f.async && !fileMarked && !modules.some(m=>m.functions.some(n=>n.name===f.name)) && !messages.some(m=>m.name===f.name))) {
      try {extractFunctions(text, target, fn.name);} catch(error) {messages.push({name:fn.name, message: sourceDiagnostic(text,target,fn.start,error.message)});}
    }
    // Explicit async and file directives use the build extractor and boundary checker.
    if (fileMarked || functions.some(f => f.marked && f.async) || functions.some(f=>f.marked && !modules.some(m=>m.functions.some(n=>n.name===f.name)) && !messages.some(m=>m.name===f.name))) {
      try {
        const module = extractFunctions(text, target, null, !fileMarked);
        if (module) {
          const host = ts.createCompilerHost(job.options);
          const original = host.readFile;
          host.readFile = file => content(file) ?? original(file);
          const program = ts.createProgram([target], job.options, host);
          checkFunctionTypes(ts, program, [module]);
          modules.push(module);
        }
      } catch(error) {messages.push({message: sourceDiagnostic(text, target, 0, error.message)});}
    }
    const diagnostics = [];
    const statuses = [];
    for (const fn of functions) {
      if (!fn.marked && !job.hints) continue;
      const failure = messages.find(d => d.name === fn.name || d.message.includes(`function ${fn.name}:`) || d.message.includes(`not a candidate ${fn.name}:`)) ?? (fileMarked ? messages[0] : undefined);
      const accepted = modules.some(m=>m.functions.some(f=>f.name===fn.name));
      if (!failure && !accepted) {
        if (fn.marked) statuses.push({start: fn.start, end: fn.end, message: 'not considered by build discovery; no eligibility result'});
        continue;
      }
      const message = failure?.message ?? 'would be promoted automatically (static eligibility; runtime speed unmeasured)';
      if (fn.marked) statuses.push({start: fn.start, end: fn.end, message: failure ? `blocked: ${message}` : 'eligible for extraction; compiler and runtime checks still apply'});
      if (failure || !fn.marked) {
        const match = message.match(/:(\d+):(\d+) - NSC(\d+):/);
        let start = fn.start;
        if (match) {const lines = text.split('\n'); start = lines.slice(0, Number(match[1])-1).reduce((n,l)=>n+l.length+1,0)+Number(match[2])-1;}
        const token = ts.getTokenAtPosition?.(source, start);
        const length = token?.getStart(source) === start ? Math.max(1, token.end - start) : 1;
        diagnostics.push({start, length, code: match ? Number(match[3]) : 1000, messageText: message, marked: fn.marked});
      }
    }
    const result = {diagnostics: diagnostics.slice(0,256), statuses: statuses.slice(0,256), analysisMs: performance.now()-started};
    previous = {fingerprint, reads, existence, result}; reads = existence = undefined;
    parentPort.postMessage({...result, id: job.id, cached: false});
  } catch(error) {reads = existence = undefined; parentPort.postMessage({id: job.id, error: String(error.stack || error)});}
});
