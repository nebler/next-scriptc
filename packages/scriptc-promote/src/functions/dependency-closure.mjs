import {babelModules} from '../babel.mjs';
// Closed, conservative runtime-module subset. Never execute a dependency at build time.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {extractFunctions} from './extract.mjs';
import {constructionProof} from './construction-proof.mjs';
const require=createRequire(import.meta.url), babel=babelModules;
const traverse=babel.traverse().default, generate=babel.generator().default;
const digest=s=>createHash('sha256').update(s).digest('hex');
const declarationFile=f=>/\.d\.[cm]?ts$/.test(f);
export function dependencyClosure(text, source, name, {ts, options={}, unsupportedResolver=false}={}) {
 if(unsupportedResolver)throw Error('dependency closure: custom application resolver requires explicit integration');
 // Discovery passes the app's TypeScript; standalone callers resolve it from
 // the app (cwd) first, like construction-proof.mjs.
 ts??=require(require.resolve('typescript',{paths:[path.dirname(source),process.cwd()]}));
 const host={...ts.sys,fileExists:f=>!declarationFile(f)&&ts.sys.fileExists(f)};
 const modules=new Map(), chunks=[];
 function resolve(specifier, importer) {
  if(/^(?:node:|next(?:\/|$)|react(?:\/|$))/.test(specifier))throw Error(`dependency closure: unsupported runtime import ${specifier}`);
  const result=ts.resolveModuleName(specifier,importer,{...options,allowJs:true,moduleResolution:options.moduleResolution??ts.ModuleResolutionKind.Bundler},host,undefined,undefined,ts.ModuleKind.ESNext).resolvedModule;
  if(!result||declarationFile(result.resolvedFileName))throw Error(`dependency closure: unresolved runtime import ${specifier}`);
  return fs.realpathSync(result.resolvedFileName);
 }
 // Parse once, then accumulate a union of requested bindings before emitting.
 // Never cache a completed closure by filename: a diamond can request new exports.
 function load(file, input) {
  if(modules.has(file))return modules.get(file);
  const code=input??fs.readFileSync(file,'utf8'), ast=babel.parser().parse(code,{sourceType:'module',plugins:['typescript','jsx']});
  const fail=reason=>{throw Error(`dependency closure: ${file}: ${reason}`);};
  if(/\.cjs$/.test(file))fail('CommonJS mutable module exports require a module-object proof');
  if(ast.program.directives.some(d=>['use client','use js'].includes(d.value.value)))fail('module directive');
  let program;traverse(ast,{Program(p){program=p;}});
  const exports=new Map(), types=new Map(), prefix='__dep_'+digest(file).slice(0,12)+'_';
  for(const statement of program.get('body')){
   const n=statement.isExportNamedDeclaration()?statement.get('declaration'):statement;
   // Explicit statements execute independently of bindings. Keep this guard
   // across the whole visited file, even when their values are never read.
   if(statement.isImportDeclaration()){
    // `server-only` is an empty module on the server and throws in client
    // bundles, so a running server has already executed it as a no-op. No other
    // side-effect import is admitted.
    if(!statement.node.specifiers.length&&statement.node.source.value!=='server-only')fail('unproved module initialization side-effect import');
    continue;
   }
   if(statement.isExportDefaultDeclaration()){
    if(!babel.types().isDeclaration(statement.node.declaration))fail('unproved module initialization default expression');
    continue;
   }
   if(statement.isExportAllDeclaration()||statement.isExportNamedDeclaration()&&!n.node)continue;
   if(!n.isDeclaration()&&!n.isEmptyStatement())fail(`unproved module initialization ${n.node.type}`);
   if(n.isTSTypeAliasDeclaration()||n.isTSInterfaceDeclaration())types.set(n.node.id.name,n);
   if(statement.isExportNamedDeclaration()){
    if(n.node.id)exports.set(n.node.id.name,n.node.id.name);
    for(const d of n.node.declarations??[])for(const local of Object.keys(babel.types().getBindingIdentifiers(d.id)))exports.set(local,local);
   }
  }
  for(const statement of ast.program.body)if(statement.type==='ExportNamedDeclaration'&&!statement.source){
   for(const spec of statement.specifiers??[])exports.set(spec.exported.name,spec.local.name);
  }
  let packageInfo=null;
  for(let dir=path.dirname(file);;dir=path.dirname(dir)){
   const manifest=path.join(dir,'package.json');
   if(fs.existsSync(manifest)){const p=JSON.parse(fs.readFileSync(manifest,'utf8'));
    function conditions(value){if(!value||typeof value!=='object')return;for(const [key,child] of Object.entries(value)){if(!key.startsWith('.')&&!/^\d+$/.test(key)&&!['import','require','default','types'].includes(key))fail(`unsupported package export condition ${key}`);conditions(child);}}
    conditions(p.exports);packageInfo={name:p.name??null,version:p.version??null,manifest,manifestHash:digest(fs.readFileSync(manifest))};break;}
   if(path.dirname(dir)===dir)break;
  }
  const record={exports,file,hash:digest(code),package:packageInfo,ast,program,types,prefix,fail,needed:new Set(),imports:new Map()};
  modules.set(file,record);return record;
 }
 const scalar=n=>n&&(['StringLiteral','NumericLiteral','BooleanLiteral','NullLiteral'].includes(n.type)||n.type==='UnaryExpression'&&['+','-'].includes(n.operator)&&n.argument.type==='NumericLiteral');
 function include(record, local, chain) {
  const {program,types,needed,fail}=record;
  if(needed.has(local))return; // local recursion is handled by the later proofs
  const binding=program.scope.getBinding(local), declaration=binding?.path??types.get(local);
  if(!declaration)fail(`unresolved export or binding ${local}`);
  needed.add(local);
  if(binding?.constantViolations.length)fail('module binding reassignment');
  if(declaration.isImportSpecifier()||declaration.isImportDefaultSpecifier()||declaration.isImportNamespaceSpecifier()){
   const statement=declaration.parentPath;
   if(statement.node.importKind==='type'||declaration.node.importKind==='type')fail('imported types require separate type linking');
   if(declaration.isImportNamespaceSpecifier())fail('namespace import requires module-object proof');
   const file=resolve(statement.node.source.value,record.file);
   if(chain.includes(file))fail('module cycle');
   const child=load(file), exported=declaration.isImportDefaultSpecifier()?'default':declaration.node.imported.name;
   const target=child.exports.get(exported);if(!target)fail(`unresolved export ${exported}`);
   include(child,target,[...chain,file]);record.imports.set(local,{child,target});return;
  }
  if(declaration.isVariableDeclarator()){
   if(declaration.parent.kind!=='const'||declaration.node.id.type!=='Identifier'||!(scalar(declaration.node.init)||['ArrowFunctionExpression','FunctionExpression'].includes(declaration.node.init?.type)))fail('unproved module initialization VariableDeclaration');
  }else if(!declaration.isFunctionDeclaration()&&!declaration.isTSTypeAliasDeclaration()&&!declaration.isTSInterfaceDeclaration())fail(`unproved module initialization ${declaration.node.type}`);
  declaration.traverse({ReferencedIdentifier(p){
   const top=program.scope.getBinding(p.node.name);
   if(top&&top===p.scope.getBinding(p.node.name)||!p.scope.getBinding(p.node.name)&&types.has(p.node.name))include(record,p.node.name,chain);
  }});
 }
 const root=load(source,text);include(root,name,[source]);
 function targetName(record, local) {
  const imported=record.imports.get(local);
  return imported?targetName(imported.child,imported.target):record===root&&local===name?name:record.prefix+local;
 }
 // Prune individual declarators (not entire statements), then run exactly the
 // existing initialization/effect restrictions on the retained program.
 for(const record of modules.values()){
  const {ast,needed,program,fail,prefix}=record;
  ast.program.body=ast.program.body.flatMap(statement=>{
   const n=statement.type==='ExportNamedDeclaration'?statement.declaration:statement;
   if(!n||n.type==='ImportDeclaration')return [];
   if(n.type==='VariableDeclaration'){
    n.declarations=n.declarations.filter(d=>Object.keys(babel.types().getBindingIdentifiers(d.id)).some(k=>needed.has(k)));
    return n.declarations.length?[n]:[];
   }
   return n.id&&needed.has(n.id.name)?[n]:[];
  });
  traverse(ast,{
   Identifier(p){if(p.node.name.startsWith('__dep_'))fail('reserved generated binding');},
   'ImportExpression|ThisExpression|NewExpression|ObjectMethod|ClassDeclaration|ClassExpression'(p){fail(`unsupported ${p.node.type}`);},
   MemberExpression(p){if(p.node.computed||['prototype','constructor','__proto__'].includes(p.node.property.name))fail('computed or prototype member');},
   ReferencedIdentifier(p){if(['eval','Function','require','module','exports','globalThis','process','Date','crypto','console','fetch','performance'].includes(p.node.name))fail(`unsupported ${p.node.name}`);},
  });
  // Keep import bindings in the original scope until all references are renamed.
  for(const local of needed){
   program.scope.rename(local,targetName(record,local));
  }
  chunks.push(generate(ast).code);
 }
 const combined=chunks.join('\n')+`\nexport {${name}};`;
 // Scalar const reads have no identity or initialization effects. Inline them
 // before the allocation proof, which otherwise rejects all module variables.
 const flat=babel.parser().parse(combined,{sourceType:'module',plugins:['typescript']});
 traverse(flat,{Program(p){
  for(const binding of Object.values(p.scope.bindings)){
   const d=binding.path.node,n=d.init;
   if(d.type!=='VariableDeclarator'||binding.kind!=='const'||!n)continue;
   if(!['StringLiteral','NumericLiteral','BooleanLiteral','NullLiteral'].includes(n.type)&&!(n.type==='UnaryExpression'&&['+','-'].includes(n.operator)&&n.argument.type==='NumericLiteral'))continue;
   for(const ref of binding.referencePaths){if(ref.findParent(p=>p.isTSType()))throw Error('dependency closure: scalar type query unsupported');ref.replaceWith(babel.types().cloneNode(n,true));}
   binding.path.remove();
  }
 }});
 const extracted=extractFunctions(generate(flat).code,source,name);
 const proof=constructionProof(extracted.native,ts);
 if(!proof.eligible)throw Error(`dependency closure: transitive effect proof: ${proof.reason}`);
 return {native:extracted.native,dependencies:[...modules.values()].reverse().map(({file,hash,package:packageInfo})=>({file,hash,package:packageInfo})),closureHash:digest(combined)};
}

// Fail closed if a dependency changes between discovery, compilation and bundling.
export function assertDependencyHashes(module, addDependency=()=>{}) {
 for(const dep of module.dependencies??[]){
  addDependency(dep.file);
  if(digest(fs.readFileSync(dep.file))!==dep.hash)throw Error(`dependency closure changed after discovery: ${dep.file}`);
  if(dep.package?.manifest){
   addDependency(dep.package.manifest);
   if(digest(fs.readFileSync(dep.package.manifest))!==dep.package.manifestHash)throw Error(`dependency manifest changed after discovery: ${dep.package.manifest}`);
  }
 }
}
