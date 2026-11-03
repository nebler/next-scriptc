import {sourceDiagnostic} from './diagnostics.mjs';
import {normalizeModuleFunctions} from './module-functions.mjs';
import {inertDefaultExpression} from './module-initialization.mjs';
import {lowerCheckedIndexes} from './checked-index.mjs';
import {parserOptions} from './parser-options.mjs';
import {lowerOpaqueHandles} from './opaque-handles.mjs';
import {babelModules} from '../babel.mjs';
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {dependencyClosure} from './dependency-closure.mjs';
import { extractFunctions } from './extract.mjs';
import {constructionProof,strictClosureProgram} from './construction-proof.mjs';
import {specializeCallSites} from './call-site-specialization.mjs';
import { checkFunctionTypes } from './types.mjs';
const require = createRequire(import.meta.url);
const babel = babelModules;
const parse = (text,source,options) => babel.parser().parse(text, parserOptions(source,options));
const traverse = babel.traverse().default;
const sourceParseFailure=Symbol('sourceParseFailure');

// These operations allocate a new array container. Mutating that container
// (e.g. sorting a mapped result) does not mutate the source collection.
function freshArray(p) {
 const n=p.node;
 if(n.type==='ArrayExpression')return true;
 if(n.type!=='CallExpression'||n.callee.type!=='MemberExpression'||n.callee.computed)return false;
 const c=n.callee;
 if(c.object.type==='Identifier'&&c.object.name==='Array'&&!p.scope.getBinding('Array')&&['from','of'].includes(c.property.name))return true;
 return ['map','filter','slice','flat','flatMap','concat'].includes(c.property.name)&&freshArray(p.get('callee.object'));
}

// Runtime imports require a closed module graph and a transitive effect proof.
// Other callees and nonlocal mutation remain subject to the existing screen.
export function promotionCandidates(text, source, report = console.log, resolution = {}) {
 if(text.includes('__scriptc_checked_index'))throw Error('reserved checked index helper');
 let ast;try{ast=parse(text,source,resolution.options);}catch(error){error[sourceParseFailure]=true;throw error;}
 const names=[];let program;
 const handlers=new Set(['GET','HEAD','POST','PUT','DELETE','PATCH','OPTIONS']);
 if(/^route\./.test(path.basename(source))){
  for(const n of ast.program.body)if(n.type==='ExportNamedDeclaration')for(const spec of n.specifiers??[])if(handlers.has(spec.exported.name))handlers.add(spec.local.name);
  let changed=true;while(changed){changed=false;for(const statement of ast.program.body){const n=statement.type==='ExportNamedDeclaration'?statement.declaration:statement;if(n?.type==='VariableDeclaration')for(const d of n.declarations)if(handlers.has(d.id.name)&&d.init?.type==='Identifier'&&!handlers.has(d.init.name)){handlers.add(d.init.name);changed=true;}}}
 }
 if(ast.program.directives.some(d=>['use client','use js','use native'].includes(d.value.value)))return [];
 traverse(ast,{Program(p){program=p;},Function(p){
  const decl=p.isFunctionDeclaration()?p:p.parentPath.isVariableDeclarator()?p.parentPath:null;
  const statement=decl?.getStatementParent();
  const name=decl?.node.id?.name;
  const exported=statement?.isExportNamedDeclaration()||statement?.parentPath.isExportNamedDeclaration()||program.scope.getBinding(name)?.referencePaths.some(ref=>ref.parentPath.isExportSpecifier());
  const topLevel=statement?.parentPath.isProgram()||statement?.parentPath.isExportNamedDeclaration()&&statement.parentPath.parentPath.isProgram();
  if(!topLevel||!name||p.node.async||p.node.generator)return;
  if(/^route\./.test(path.basename(source))&&handlers.has(name))return;
  if(!exported&&!program.scope.getBinding(name)?.referencePaths.length)return;
  if((p.node.body.directives??[]).some(d=>d.value.value==='use js'))return;
  resolution.onConsidered?.({source,name});
  names.push({name:name,offset:p.node.start,forced:(p.node.body.directives??[]).some(d=>d.value.value==='use native')});
 }});
 const candidates=[];
 for(const {name,forced,offset} of names){try{
  const module=extractFunctions(text,source,name);if(!module)continue;
  if(!module.imports.length&&ast.program.body.some(n=>n.type==='ExportDefaultDeclaration'&&!babel.types().isDeclaration(n.declaration)&&!inertDefaultExpression(n.declaration,program.scope)))throw Error(`dependency closure: ${source}: unproved module initialization default expression`);
  const nativeBody=parse(module.native,source,resolution.options).program.body;
  const scalar=n=>n&&(['StringLiteral','NumericLiteral','BooleanLiteral','NullLiteral','ArrowFunctionExpression','FunctionExpression'].includes(n.type)||n.type==='UnaryExpression'&&['+','-'].includes(n.operator)&&n.argument.type==='NumericLiteral');
  const moduleProof=nativeBody.some(n=>['TSEnumDeclaration','ClassDeclaration','TSModuleDeclaration'].includes(n.type)||n.type==='VariableDeclaration'&&n.declarations.some(d=>!scalar(d.init)))||ast.program.body.some(n=>n.type==='ImportDeclaration'&&!n.specifiers.length&&n.importKind!=='type'&&n.source.value!=='server-only');
  if(module.imports.length||moduleProof) {
   Object.assign(module,dependencyClosure(text,source,name,resolution));module.imports=[];
  }
  module.referenceNative??=module.native;
  const normalized=normalizeModuleFunctions(module.native,source,resolution.options);
  if(normalized.changed){const compilerTS=resolution.ts??require(require.resolve('typescript',{paths:[path.dirname(source),process.cwd()]})),lowered=lowerOpaqueHandles(normalized.native,name,compilerTS),guarded=lowerCheckedIndexes(lowered.native,compilerTS);if(constructionProof(guarded.native,compilerTS).eligible){module.native=guarded.native;module.opaqueInputs=lowered.inputs;module.requiresFallback ||= guarded.requiresFallback;}}
  if(!module.opaqueInputs){const lowered=lowerOpaqueHandles(module.native,name,resolution.ts??require(require.resolve('typescript',{paths:[path.dirname(source),process.cwd()]})));module.native=lowered.native;module.loweringMap=lowered.loweringMap;module.opaqueInputs=lowered.inputs;}
  const checked=lowerCheckedIndexes(module.native,resolution.ts??require(require.resolve('typescript',{paths:[path.dirname(source),process.cwd()]})));
  if(!checked.requiresFallback||constructionProof(checked.native,resolution.ts).eligible){module.native=checked.native;module.requiresFallback ||= checked.requiresFallback;}
  let mutationProof;const localMutation=()=> (mutationProof??=constructionProof(module.native,resolution.ts)).eligible;
  let work=false,decorated=false;
  const native=parse(module.native);
  traverse(native,{
   Decorator(){decorated=true;},
   ImportDeclaration(p){if(p.node.importKind!=='type')throw Error('purity: runtime imports are opaque');},
   ReferencedIdentifier(p){if(['Date','crypto','process','fetch','console','performance'].includes(p.node.name))throw Error('purity: time, randomness or I/O');},
   MemberExpression(p){if(p.node.object.name==='Math'&&p.node.property.name==='random')throw Error('purity: randomness');},
   'AssignmentExpression|UpdateExpression'(p){let target=p.node.left??p.node.argument;const member=target.type==='MemberExpression';if(member&&!localMutation())throw Error('purity: argument mutation');while(target.type==='MemberExpression')target=target.object;
    if(target.type==='Identifier'){const b=p.scope.getBinding(target.name);if(!b||b.scope.path.isProgram())throw Error('purity: module state mutation');
     if(b.kind==='param'&&!localMutation())throw Error('purity: argument mutation');}},
   'ForStatement|ForOfStatement|ForInStatement|WhileStatement|DoWhileStatement'(){work=true;},
   CallExpression(p){const c=p.node.callee;if(c.name===name||c.type==='MemberExpression'&&(['map','reduce','filter','forEach','sort','some','every','flatMap'].includes(c.property.name)||c.object.name==='JSON'&&c.property.name==='parse'))work=true;
    if(c.type==='MemberExpression'&&['set','add','push','delete','clear','splice','sort','reverse'].includes(c.property.name)){
     let target=c.object;while(target.type==='MemberExpression')target=target.object;const b=p.scope.getBinding(target.name);
     if(!localMutation())throw Error('purity: nonlocal mutation');
    }
   }
  });
  if(!work&&!forced)throw Error('work: no loop, recursion, array callback or JSON parse');
  if(decorated)throw Error('purity: decorated classes and members are unsupported');
  candidates.push({...module,functions:module.functions.map(fn=>({...fn,promotion:true,rawLinks:module.rawLinks,opaqueInputs:module.opaqueInputs,requiresFallback:module.requiresFallback})),promotion:true,forced});
 }catch(e){if(forced&&!resolution.reportOnly)throw Error(sourceDiagnostic(text,source,offset,e.message));report(`[next-scriptc] not a candidate ${name}: ${sourceDiagnostic(text,source,offset,e.message)}`);}}
 return candidates;
}

export async function discoverPromotions(projectDir, distDir, config, report=console.log){
 const ts=config?.typescript?.implementation??require(require.resolve('typescript',{paths:[projectDir]}));
 const file=path.resolve(projectDir,config?.typescript?.tsconfigPath??'tsconfig.json');
 const loaded=ts.readConfigFile(file,ts.sys.readFile);
 const parsed=ts.parseJsonConfigFileContent(loaded.config??{compilerOptions:{strict:true}},ts.sys,path.dirname(file),undefined,file);
 const modules=[];
 async function visit(dir){for(const e of await readdir(dir,{withFileTypes:true})){
  if(e.name.startsWith('.')||['node_modules','research','test','tests'].includes(e.name))continue;
  const file=path.join(dir,e.name);if(file===distDir)continue;
  if(e.isDirectory())await visit(file);
  else if(/\.[cm]?[jt]sx?$/.test(file)){
   try {
   modules.push(...promotionCandidates(await readFile(file,'utf8'),file,message=>{report(message);config?.onDiagnostic?.({source:file,name:message.match(/not a candidate ([^:]+):/)?.[1],message});},{ts,reportOnly:config?.reportOnly,runtimeConditionSets:config?.promotionRuntimeConditionSets,onConsidered:config?.onConsidered,options:parsed.options,unsupportedResolver:!!(config?.webpack||config?.turbopack?.resolveAlias||config?.turbopack?.resolveExtensions)}));
   } catch(error) {
    // A malformed/unsupported source file must not discard other files' results.
    // Forced annotations and non-parser failures retain their fail-fast behavior.
    if(!error[sourceParseFailure]||!(error instanceof SyntaxError)||!error.code?.startsWith('BABEL_PARSER'))throw error;
    const message=`[next-scriptc] parse failure ${file}: ${error.message}`;
    report(message);config?.onFileError?.({source:file,message:error.message,code:error.code});
   }
  }
 }}await visit(config?.promotionSourceDir ? path.resolve(projectDir,config.promotionSourceDir) : projectDir);
 if(!modules.length)return [];
 const isolated=!(parsed.options.strictNullChecks??parsed.options.strict);
 const program=ts.createProgram({rootNames:[...new Set([...parsed.fileNames,...modules.map(m=>m.source)])],options:parsed.options});
 return modules.filter(m=>{try{
  let specialized=false;
  function boundaries(strictRequired){
   if(!strictRequired){checkFunctionTypes(ts,program,[m]);return;}
   const strict=strictClosureProgram(m.native,ts);
   const errors=ts.getPreEmitDiagnostics(strict.program);
   if(errors.length)throw Error(`strict closure: TS${errors[0].code}: ${ts.flattenDiagnosticMessageText(errors[0].messageText,' ')}`);
   // Extracted offsets differ from the app. Keep the loader's original offsets.
   const functions=m.functions.map(fn=>{
    let declaration;function find(n){if(ts.isFunctionLike(n)&&n.name?.text===fn.name)declaration=n;else ts.forEachChild(n,find);}find(strict.source);
    if(!declaration?.body)throw Error(`strict closure: missing ${fn.name}`);
    return {...fn,start:declaration.body.getStart(strict.source)};
   });
   checkFunctionTypes(ts,strict.program,[{source:strict.source.fileName,functions}]);
   functions.forEach((fn,i)=>{m.functions[i].strictClosure=true;m.functions[i].boundary=fn.boundary;m.functions[i].resultShape=fn.resultShape;});
  }
  try { boundaries(isolated||!!m.opaqueInputs||!!m.requiresFallback); }
  catch(original) {
   if(!/any, unknown|expected JSON data/.test(original.message))throw original;
   const specialization=specializeCallSites(ts,program,m);
   m.native=specialization.native;
   m.functions[0].specialization=specialization.metadata;
   specialized=true;
   boundaries(true);
  }
  for(const fn of m.functions){
   fn.constructionProof=constructionProof(m.native,ts);
   if((m.requiresFallback||!!m.opaqueInputs||specialized||isolated&&fn.boundary.params.includes('json'))&&(!fn.constructionProof.eligible||!['json','number','string'].includes(fn.boundary.result)))throw Error('strict closure: JSON inputs require a construction proof and a per-call fallback result ABI');
  }return true;}catch(e){if(m.forced&&!config?.reportOnly)throw Error(sourceDiagnostic(m.originalText??'',m.source,m.functions[0].start,e.message));const message=`[next-scriptc] not a candidate: ${sourceDiagnostic(m.originalText??'',m.source,m.functions[0].start,e.message)}`;report(message);config?.onDiagnostic?.({source:m.source,name:m.functions[0].name,message});return false;}});
}
