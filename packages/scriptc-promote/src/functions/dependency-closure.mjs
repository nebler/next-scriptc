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
 const modules=new Map(), active=new Set(), chunks=[];
 function resolve(specifier, importer) {
  if(/^(?:node:|next(?:\/|$)|react(?:\/|$))/.test(specifier))throw Error(`dependency closure: unsupported runtime import ${specifier}`);
  const result=ts.resolveModuleName(specifier,importer,{...options,allowJs:true,moduleResolution:options.moduleResolution??ts.ModuleResolutionKind.Bundler},host,undefined,undefined,ts.ModuleKind.ESNext).resolvedModule;
  if(!result||declarationFile(result.resolvedFileName))throw Error(`dependency closure: unresolved runtime import ${specifier}`);
  return fs.realpathSync(result.resolvedFileName);
 }
 function visit(file, input) {
  if(active.has(file))throw Error('dependency closure: module cycle');
  if(modules.has(file))return modules.get(file);
  active.add(file);
  const code=input??fs.readFileSync(file,'utf8'), ast=babel.parser().parse(code,{sourceType:'module',plugins:['typescript','jsx']});
  traverse(ast,{Identifier(p){if(p.node.name.startsWith('__dep_'))throw Error('dependency closure: reserved generated binding');}});
  const fail=reason=>{throw Error(`dependency closure: ${file}: ${reason}`);};
  if(/\.cjs$/.test(file))fail('CommonJS mutable module exports require a module-object proof');
  if(ast.program.directives.some(d=>['use client','use js'].includes(d.value.value)))fail('module directive');
  // Whole-module initialization matters, including unused imports and initializers.
  // Only literal immutable scalars and function creation can run here.
  const scalar=n=>n&&(['StringLiteral','NumericLiteral','BooleanLiteral','NullLiteral'].includes(n.type)||n.type==='UnaryExpression'&&['+','-'].includes(n.operator)&&n.argument.type==='NumericLiteral');
  for(const statement of ast.program.body){
   const n=statement.type==='ExportNamedDeclaration'?statement.declaration:statement;
   if(!n&&statement.type==='ExportNamedDeclaration'&&!statement.source)continue;
   if(n?.type==='ImportDeclaration'||['TSInterfaceDeclaration','TSTypeAliasDeclaration','FunctionDeclaration','EmptyStatement'].includes(n?.type))continue;
   if(n?.type==='VariableDeclaration'&&n.kind==='const'&&n.declarations.every(d=>d.id.type==='Identifier'&&(scalar(d.init)||['ArrowFunctionExpression','FunctionExpression'].includes(d.init?.type))))continue;
   fail(`unproved module initialization ${n?.type??statement.type}`);
  }
  traverse(ast,{
   'ImportExpression|ThisExpression|NewExpression|ObjectMethod|ClassDeclaration|ClassExpression'(p){fail(`unsupported ${p.node.type}`);},
   MemberExpression(p){if(p.node.computed||['prototype','constructor','__proto__'].includes(p.node.property.name))fail('computed or prototype member');},
   ReferencedIdentifier(p){if(['eval','Function','require','module','exports','globalThis','process','Date','crypto','console','fetch','performance'].includes(p.node.name))fail(`unsupported ${p.node.name}`);},
  });
  let program;traverse(ast,{Program(p){program=p;}});
  const exports=new Map(), prefix='__dep_'+digest(file).slice(0,12)+'_';
  for(const binding of Object.values(program.scope.bindings))if(binding.constantViolations.length)fail('module binding reassignment');
  const bindings=Object.keys(program.scope.bindings);
  for(const local of bindings)if(file!==source||local!==name)program.scope.rename(local,prefix+local);
  for(const statement of ast.program.body){
   if(statement.type!=='ImportDeclaration')continue;
   if(statement.importKind==='type')fail('imported types require separate type linking');
   const child=visit(resolve(statement.source.value,file));
   for(const spec of statement.specifiers){
    if(spec.type==='ImportNamespaceSpecifier')fail('namespace import requires module-object proof');
    if(spec.importKind==='type')fail('imported types require separate type linking');
    const exported=spec.type==='ImportDefaultSpecifier'?'default':spec.imported.name;
    const target=child.exports.get(exported);if(!target)fail(`unresolved export ${exported}`);
    program.scope.rename(spec.local.name,target);
   }
  }
  const exportNames=new Set();
  for(const statement of ast.program.body)if(statement.type==='ExportNamedDeclaration')for(const spec of statement.specifiers??[]){if(exportNames.has(spec.exported.name))fail('duplicate export assignment');exportNames.add(spec.exported.name);}
  for(const statement of ast.program.body){
   if(statement.type==='ExportNamedDeclaration'){
    const d=statement.declaration;
    if(d?.id)exports.set(file===source&&d.id.name===name?name:d.id.name.slice(prefix.length),d.id.name);
    for(const v of d?.declarations??[])exports.set(v.id.name.slice(prefix.length),v.id.name);
    for(const s of statement.specifiers??[])exports.set(s.exported.name,s.local.name);
   }
  }
  ast.program.body=ast.program.body.flatMap(n=>n.type==='ImportDeclaration'?[]:n.type==='ExportNamedDeclaration'?(n.declaration?[n.declaration]:[]):[n]);
  let packageInfo=null;
  for(let dir=path.dirname(file);;dir=path.dirname(dir)){
   const manifest=path.join(dir,'package.json');
   if(fs.existsSync(manifest)){const p=JSON.parse(fs.readFileSync(manifest,'utf8'));
    function conditions(value){if(!value||typeof value!=='object')return;for(const [key,child] of Object.entries(value)){if(!key.startsWith('.')&&!/^\d+$/.test(key)&&!['import','require','default','types'].includes(key))fail(`unsupported package export condition ${key}`);conditions(child);}}
    conditions(p.exports);packageInfo={name:p.name??null,version:p.version??null,manifest,manifestHash:digest(fs.readFileSync(manifest))};break;}
   if(path.dirname(dir)===dir)break;
  }
  const record={exports,file,hash:digest(code),package:packageInfo};modules.set(file,record);active.delete(file);chunks.push(generate(ast).code);return record;
 }
 visit(source,text);
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
 return {native:extracted.native,dependencies:[...modules.values()].map(({exports,...row})=>row),closureHash:digest(combined)};
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
