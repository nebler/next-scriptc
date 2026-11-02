import {babelModules} from '../babel.mjs';
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { checkFunctionTypes } from "./types.mjs";

const require = createRequire(import.meta.url);
const babel = babelModules;
const { parse } = babel.parser();
const traverse = babel.traverse().default;
const globals = new Set(["Array", "ArrayBuffer", "BigInt", "Boolean", "Date", "Error", "Infinity", "Int8Array", "Int16Array", "Int32Array", "JSON", "Map", "Math", "NaN", "Number", "Object", "Promise", "RangeError", "RegExp", "Set", "String", "TypeError", "Uint8Array", "Uint16Array", "Uint32Array", "Float32Array", "Float64Array", "decodeURIComponent", "encodeURIComponent", "isNaN", "parseFloat", "parseInt", "undefined"]);
function marked(node, source) {
  if (node?.directives?.some((directive) => directive.value.value === "use scriptc")) {
    throw new Error(`[next-scriptc] ${source}: "use scriptc" was renamed to "use native". Replace the directive to keep the function native.`);
  }
  return node?.directives?.some((directive) => directive.value.value === "use native");
}
const forbidden = (name) => /^(?:next|react|react-dom)(?:\/|$)/.test(name);

export function extractFunctions(text, source, autoName = null, skipSync = false) {
  if (!autoName && !text.includes("use native") && !text.includes("use scriptc")) return null;
  const ast = parse(text, { sourceType: "module", plugins: ["typescript", "jsx"] });
  const fileLevel = marked(ast.program, source);
  const client = ast.program.directives.some((directive) => directive.value.value === "use client");
  const functions = [];
  let program;
  function fail(name, reason) { throw new Error(`[next-scriptc] ${source}: function ${name}: ${reason}`); }
  traverse(ast, {
    Program(p) { program = p; },
    Function(p) {
      const declaration = p.isFunctionDeclaration() ? p : p.parentPath.isVariableDeclarator() ? p.parentPath : null;
      const statement = declaration?.getStatementParent();
      const topLevel = statement?.parentPath.isProgram() || statement?.parentPath.isExportNamedDeclaration() && statement.parentPath.parentPath.isProgram();
      const name = (declaration?.isVariableDeclarator() ? declaration.node.id.name : p.node.id?.name) ?? "<anonymous>";
      const binding = program.scope.getBinding(name);
      const exported = binding?.referencePaths.some((ref) => ref.parentPath.isExportSpecifier()) || statement?.isExportNamedDeclaration() || statement?.parentPath.isExportNamedDeclaration();
      if (autoName ? name !== autoName : !marked(p.node.body, source) && !(fileLevel && topLevel && exported)) return;
      if (skipSync && !p.node.async) return;
      if (client) fail(name, '"use native" is forbidden in a "use client" module');
      if (!topLevel || !declaration || !binding) fail(name, "must be a named module-level function; component-scope closures are unsupported");
      if ((autoName ? p.node.async : !p.node.async) || p.node.generator) fail(name, "must be async and cannot be a generator");
      if (!autoName && p.node.body?.type !== "BlockStatement") fail(name, "must have a block body");
      const id = createHash("sha256").update(`${source}\0${name}`).digest("hex").slice(0, 20);
      const literal = n => ['StringLiteral','NumericLiteral','BooleanLiteral','NullLiteral'].includes(n.type) || n.type==='UnaryExpression' && ['+','-'].includes(n.operator) && n.argument.type==='NumericLiteral';
      function pattern(n) {
        if(n.type==='Identifier')return true;
        if(n.type==='AssignmentPattern')return literal(n.right)&&pattern(n.left);
        if(n.type==='ObjectPattern')return n.properties.every(v=>v.type==='ObjectProperty'&&!v.computed&&pattern(v.value));
        if(n.type==='ArrayPattern')return n.elements.every(v=>v===null||pattern(v));
        return false;
      }
      if(p.node.params.some(param=>autoName?!pattern(param):param.type!=='Identifier'))fail(name,'parameters must be identifiers or JSON destructuring with literal defaults (rest unsupported)');
      functions.push({ name, id, start:p.node.body.start, end:p.node.body.end,
        ...(autoName?{expression:p.node.body.type!=='BlockStatement',
          originalParams:p.node.params.map(v=>text.slice(v.start,v.end)),
          parameterRanges:p.node.params.map(v=>[v.start,v.end]),
          defaults:p.node.params.map(v=>v.type==='AssignmentPattern')}:{}),
        params:p.node.params.map((param,i)=>autoName?`__scriptc_arg_${id}_${i}`:param.name) });
    },
  });
  if (fileLevel && !autoName) {
    for (const p of program.get("body")) {
      if (p.node.exportKind === "type") continue;
      if (p.isExportDefaultDeclaration() || p.isExportAllDeclaration() || p.isExportNamedDeclaration() && p.node.source) fail("<exports>", "use local named async function exports in a use native file");
      if (!p.isExportNamedDeclaration() || p.node.exportKind === "type") continue;
      const names = p.node.declaration?.id ? [p.node.declaration.id.name] : p.node.declaration?.declarations?.map((d) => d.id.name) ?? p.node.specifiers.filter((s) => s.exportKind !== "type").map((s) => s.local.name);
      for (const name of names) if (!functions.some((fn) => fn.name === name)) fail(name, "all value exports in a use native file must be async functions");
    }
  }
  if (!functions.length) return null;
  const types = new Map();
  for (const p of program.get("body")) {
    const declaration = p.isExportNamedDeclaration() ? p.get("declaration") : p;
    if (declaration.isTSTypeAliasDeclaration() || declaration.isTSInterfaceDeclaration()) types.set(declaration.node.id.name, { path: declaration, identifier: declaration.node.id, constantViolations: [] });
  }
  const imports = [];
  const statements = new Set();
  const visiting = new Set();
  function include(binding, owner) {
    if (visiting.has(binding)) return;
    visiting.add(binding);
    if (binding.constantViolations.length) fail(owner, `reference ${binding.identifier.name} is reassigned outside its declaration`);
    let statement = binding.path;
    while (statement.parentPath && !statement.parentPath.isProgram()) statement = statement.parentPath;
    if (statement.isImportDeclaration()) {
      if (forbidden(statement.node.source.value)) fail(owner, `reference ${binding.identifier.name} imports unsupported ${statement.node.source.value}`);
      imports.push({ specifier: statement.node.source.value, reference: binding.identifier.name, owner });
    }
    statements.add(statement);
    const check = (p) => {
      if (!p.isReferencedIdentifier()) return;
      const dependency = p.scope.getBinding(p.node.name) ?? types.get(p.node.name);
      if (!dependency) {
        // Unbound type names (ReadonlyArray, Record, utility types, type
        // parameters) belong to TypeScript, not the runtime-global allowlist.
        if (!globals.has(p.node.name) && !p.findParent((parent) => parent.isTSType())) fail(owner, `unsupported reference ${p.node.name}`);
      } else if (dependency.scope === program.scope || types.has(p.node.name)) include(dependency, owner);
    };
    statement.traverse({
      Identifier: check,
      ThisExpression() { fail(owner, "unsupported reference this"); },
      ImportExpression() { fail(owner, "dynamic import is unsupported"); },
      CallExpression(p) { if (p.node.callee.type === "Import") fail(owner, "dynamic import is unsupported"); },
      JSXElement() { fail(owner, "React/JSX is unsupported"); },
      JSXFragment() { fail(owner, "React/JSX is unsupported"); },
    });
  }
  for (const fn of functions) include(program.scope.getBinding(fn.name), fn.name);
  for (const p of program.get("body")) {
    if (!p.isDeclaration() && !p.isImportDeclaration() && !p.isExportDeclaration() && !p.isEmptyStatement()) fail(functions[0].name, `unsupported module initialization ${p.node.type}; move setup into a declaration initializer`);
  }
  const native = [...statements].sort((a, b) => a.node.start - b.node.start).map((p) => {
    const node = p.isExportNamedDeclaration() ? p.node.declaration : p.node;
    if (!node) return "";
    let code = text.slice(node.start, node.end);
    if (p.isImportDeclaration() && p.node.source.value.startsWith(".")) {
      const specifier = p.node.source;
      code = code.slice(0, specifier.start - node.start) + JSON.stringify(path.resolve(path.dirname(source), specifier.value)) + code.slice(specifier.end - node.start);
    }
    return code;
  }).join("\n") + `\nexport { ${functions.map((fn) => fn.name).join(", ")} };\n`;
  return { source, functions, native, imports, hash: createHash("sha256").update(text).digest("hex") };
}

export async function discoverFunctions(projectDir, distDir, config) {
  const modules = [];
  async function visit(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const source = path.join(directory, entry.name);
      if (source === distDir) continue;
      if (entry.isDirectory()) await visit(source);
      else if (entry.isFile() && /\.(?:[cm]?[jt]s|[jt]sx)$/.test(entry.name) && !/^route\.native\./.test(entry.name)) {
        const text = await readFile(source, "utf8");
        const module = extractFunctions(text, source, null, config?.rewrites?.[Symbol.for("next-scriptc.options")]?.nativePromotion === "auto");
        if (module) modules.push(module);
      }
    }
  }
  await visit(projectDir);
  if (modules.length) {
    const ts = require(require.resolve("typescript", { paths: [projectDir] }));
    const configFile = path.resolve(projectDir, config?.typescript?.tsconfigPath ?? "tsconfig.json");
    const loaded = ts.sys.fileExists(configFile) ? ts.readConfigFile(configFile, ts.sys.readFile) : { config: { compilerOptions: { strict: true, allowJs: true } } };
    const parsed = ts.parseJsonConfigFileContent(loaded.config ?? {}, ts.sys, projectDir, undefined, configFile);
    const errors = [loaded.error, ...parsed.errors].filter((error) => error && error.code !== 18003);
    if (errors.length) throw new Error(`[next-scriptc] ${ts.formatDiagnosticsWithColorAndContext(errors, { getCanonicalFileName: (f) => f, getCurrentDirectory: () => projectDir, getNewLine: () => "\n" })}`);
    const options = parsed.options;
    if (!(options.strictNullChecks ?? options.strict)) throw new Error("[next-scriptc] Native function JSON type checking requires strictNullChecks in the project tsconfig (undefined must remain visible).");
    options.moduleResolution ??= ts.ModuleResolutionKind.Bundler;
    const cache = ts.createModuleResolutionCache(projectDir, (file) => file, options);
    for (const module of modules) {
      for (const dependency of module.imports) {
        const visited = new Set();
        async function check(specifier, importer) {
          const fail = (reason) => { throw new Error(`[next-scriptc] ${module.source}: function ${dependency.owner}: reference ${dependency.reference}: ${reason} (via ${importer})`); };
          if (forbidden(specifier)) fail(`unsupported import ${specifier}`);
          const resolved = ts.resolveModuleName(specifier, importer, options, ts.sys, cache).resolvedModule;
          if (!resolved || resolved.isExternalLibraryImport || resolved.resolvedFileName.endsWith(".d.ts") || visited.has(resolved.resolvedFileName)) return;
          const file = resolved.resolvedFileName;
          visited.add(file);
          if (!/\.[cm]?[jt]sx?$/.test(file)) return;
          const ast = parse(await readFile(file, "utf8"), { sourceType: "module", plugins: ["typescript", "jsx"] });
          traverse(ast, {
            JSXElement() { fail(`unsupported React/JSX in ${file}`); },
            JSXFragment() { fail(`unsupported React/JSX in ${file}`); },
            ImportExpression() { fail(`unsupported dynamic import in ${file}`); },
            CallExpression(p) { if (p.node.callee.type === "Import") fail(`unsupported dynamic import in ${file}`); },
          });
          if (ast.program.directives.some((d) => d.value.value === "use client")) fail(`import of client module ${file}`);
          for (const node of ast.program.body) {
            if (node.source && ["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type)) await check(node.source.value, file);
          }
        }
        await check(dependency.specifier, module.source);
      }
    }
    const program = ts.createProgram({ rootNames: [...new Set([...parsed.fileNames, ...modules.map((module) => module.source)])], options });
    checkFunctionTypes(ts, program, modules);
  }
  return modules;
}
