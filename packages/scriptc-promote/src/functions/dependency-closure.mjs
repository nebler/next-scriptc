import {normalizeModuleFunctions} from './module-functions.mjs';
import {inertDefaultExpression,literalArithmetic} from './module-initialization.mjs';
import {assertRuntimeExportTarget} from './runtime-export-target.mjs';
import {nodeRuntimeConditions,hasNodeConditionFlags} from './resolution-conditions.mjs';
import {lowerCheckedIndexes} from './checked-index.mjs';
import {parserOptions} from './parser-options.mjs';
import {structuralType} from './structural-types.mjs';
import {lowerOpaqueHandles} from './opaque-handles.mjs';
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
export function dependencyClosure(text, source, name, {ts, options={}, runtimeConditions=[], runtimeConditionSets, unsupportedResolver=false}={}) {
 const contexts=runtimeConditionSets??[{mode:'import',conditions:[...nodeRuntimeConditions,...runtimeConditions]}];
 if(!contexts.length||contexts.some(c=>!['import','require'].includes(c.mode)||!Array.isArray(c.conditions)||c.conditions.some(v=>typeof v!=='string'||['import','require','default'].includes(v))))throw Error('dependency closure: unknown active export conditions');
 // Discovery passes the app's TypeScript; standalone callers resolve it from
 // the app (cwd) first, like construction-proof.mjs.
 ts??=require(require.resolve('typescript',{paths:[path.dirname(source),process.cwd()]}));
 const host={...ts.sys,fileExists:f=>!declarationFile(f)&&ts.sys.fileExists(f)};
 const modules=new Map(), chunks=[], sourceNodes=[],resolverManifests=new Map();
 let typeProgram;
 function resolveQuery(record,local){
  if(!typeProgram){const host=ts.createCompilerHost({...options,strict:true});const read=host.readFile;host.readFile=f=>path.resolve(f)===path.resolve(source)?text:read(f);typeProgram=ts.createProgram([source],{...options,strict:true,moduleResolution:options.moduleResolution??ts.ModuleResolutionKind.Bundler,module:ts.ModuleKind.ESNext},host);}
  const sf=typeProgram.getSourceFile(record.file)??typeProgram.getSourceFiles().find(sf=>fs.existsSync(sf.fileName)&&fs.realpathSync(sf.fileName)===record.file),checker=typeProgram.getTypeChecker();
  const node=sf?.statements.find(n=>ts.isTypeAliasDeclaration(n)&&n.name.text===local);
  if(!node)record.fail('unresolved type query '+local);
  return structuralType(checker.getTypeAtLocation(node),checker,ts,node);
 }
 function resolve(specifier, importer, typeOnly=false) {
  if(/^(?:node:|next(?:\/|$)|react(?:\/|$))/.test(specifier))throw Error(`dependency closure: unsupported runtime import ${specifier}`);
  if(!typeOnly){
   if(hasNodeConditionFlags())throw Error('dependency closure: unknown active package export conditions from Node flags require explicit resolver integration');
   if(unsupportedResolver)throw Error('dependency closure: custom application resolver requires explicit integration');
   for(const condition of options.customConditions??[])if(!['node','import','default',...contexts.flatMap(c=>c.conditions)].includes(condition))throw Error(`dependency closure: unsupported active package export condition ${condition}`);
  }
  const selected=typeOnly?[{mode:'import',conditions:options.customConditions??[]}]:contexts;
  const files=selected.map(context=>{
   function select(request,seen=new Set()){
   if(seen.has(request))throw Error('dependency closure: module cycle');
   if(/^(?:node:|next(?:\/|$)|react(?:\/|$))/.test(request))throw Error(`dependency closure: unsupported runtime import ${request}`);
   const result=ts.resolveModuleName(request,importer,{...options,allowJs:true,...(typeOnly?{}:{resolvePackageJsonExports:true,resolvePackageJsonImports:true}),moduleResolution:context.bundled?ts.ModuleResolutionKind.Bundler:options.moduleResolution??ts.ModuleResolutionKind.Bundler,customConditions:[...new Set(typeOnly?['node',...context.conditions]:context.conditions)]},typeOnly?ts.sys:host,undefined,undefined,context.mode==='require'?ts.ModuleKind.CommonJS:ts.ModuleKind.ESNext).resolvedModule;
   if(!result||!typeOnly&&declarationFile(result.resolvedFileName))throw Error(`dependency closure: unresolved runtime import ${specifier}`);
   let file=fs.realpathSync(result.resolvedFileName);
   if(!typeOnly)file=assertRuntimeExportTarget(request,importer,file,context,manifest=>resolverManifests.set(manifest,digest(fs.readFileSync(manifest))),seen,select);
   if(context.bundled&&!request.startsWith('.')&&!request.startsWith('#')&&!path.isAbsolute(request))for(let directory=path.dirname(file);;directory=path.dirname(directory)){
    const manifest=path.join(directory,'package.json');
    if(fs.existsSync(manifest)){const p=JSON.parse(fs.readFileSync(manifest,'utf8'));if(!p.exports&&typeof p.module==='string'&&path.resolve(directory,p.module)!==path.resolve(directory,p.main??'index.js'))throw Error(`dependency closure: ambiguous bundled package main/module entries for ${specifier}`);break;}
    if(path.dirname(directory)===directory)break;
   }
   return file;
   }
   return select(specifier);
  });
  if(new Set(files).size!==1)throw Error(`dependency closure: ambiguous active package export conditions for ${specifier}`);
  return files[0];
 }
 // Parse once, then accumulate a union of requested bindings before emitting.
 // Never cache a completed closure by filename: a diamond can request new exports.

 function load(file, input, typeOnly=false) {
  if(modules.has(file)){const record=modules.get(file);if(!typeOnly)record.checkRuntime();return record;}
  const code=input??fs.readFileSync(file,'utf8');let ast;
  try{ast=babel.parser().parse(code,parserOptions(file,Object.keys(options).length?options:undefined));}
  catch(error){error.message=`${file}: ${error.message}`;throw error;}
  const fail=reason=>{throw Error(`dependency closure: ${file}: ${reason}`);};


  let program;traverse(ast,{Program(p){program=p;}});
  const exports=new Map(), reexports=new Map(), types=new Map(), prefix='__dep_'+digest(file).slice(0,12)+'_';
  function checkRuntime(){
   if(declarationFile(file))fail('unresolved runtime declaration module');
   if(/\.cjs$/.test(file))fail('CommonJS mutable module exports require a module-object proof');
   if(ast.program.directives.some(d=>['use client','use js'].includes(d.value.value)))fail('module directive');
   for(const statement of program.get('body')){
    const n=statement.isExportNamedDeclaration()?statement.get('declaration'):statement;
    if(statement.isImportDeclaration()){if(!statement.node.specifiers.length&&statement.node.importKind!=='type'&&statement.node.source.value!=='server-only')fail('unproved module initialization side-effect import');continue;}
    if(statement.isExportDefaultDeclaration()){if(!babel.types().isDeclaration(statement.node.declaration)&&!inertDefaultExpression(statement.node.declaration,program.scope))fail('unproved module initialization default expression');continue;}
    if(statement.isExportDeclaration())continue;
    if(!n.isDeclaration()&&!n.isEmptyStatement())fail(`unproved module initialization ${n.node.type}`);
   }
  }
  if(!typeOnly)checkRuntime();
  for(const statement of program.get('body')){
   const n=statement.isExportNamedDeclaration()?statement.get('declaration'):statement;
   if(statement.isImportDeclaration()||statement.isExportDefaultDeclaration())continue;
   if(statement.isExportNamedDeclaration()&&statement.node.source){for(const spec of statement.node.specifiers)if(spec.type==='ExportSpecifier')reexports.set(spec.exported.name,{source:statement.node.source.value,local:spec.local.name});continue;}
   if(statement.isExportAllDeclaration()||statement.isExportNamedDeclaration()&&!n.node)continue;
   if(n.isTSTypeAliasDeclaration()||n.isTSInterfaceDeclaration()||n.isTSEnumDeclaration())types.set(n.node.id.name,n);
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
packageInfo={name:p.name??null,version:p.version??null,manifest,manifestHash:digest(fs.readFileSync(manifest))};break;}
   if(path.dirname(dir)===dir)break;
  }
  const record={checkRuntime,exports,reexports,file,hash:digest(code),package:packageInfo,ast,program,types,prefix,fail,needed:new Set(),runtimeNeeded:new Set(),imports:new Map()};
  program.traverse({ReferencedIdentifier(p){if(p.node.name==='eval')record.reflective=true;}});
  record.enumReferences=new Map();for(const [local,declaration] of types)if(declaration.isTSEnumDeclaration()){const refs=[];program.traverse({ReferencedIdentifier(p){if(p.node.name===local&&!p.scope.getBinding(local))refs.push(p);}});record.enumReferences.set(local,refs);}
  modules.set(file,record);return record;
 }
 const lookup=(value,key)=>value instanceof Map?value.get(String(key)):Array.isArray(value)?key==='length'?babel.types().numericLiteral(value.length):String(Number(key))===String(key)&&Number.isSafeInteger(Number(key))&&Number(key)>=0?value[Number(key)]:undefined:undefined;
 const scalar=n=>n&&(['StringLiteral','NumericLiteral','BooleanLiteral','NullLiteral'].includes(n.type)||n.type==='UnaryExpression'&&['+','-'].includes(n.operator)&&n.argument.type==='NumericLiteral');
 // A scalar array can be recreated for a read-only call without sharing identity.
 // some callbacks cannot receive the original receiver through a third/rest parameter.
 function scalarArrayRead(member,value){
  if(!Array.isArray(value)||!value.every(scalar)||member.node.computed)return false;
  const call=member.parentPath;if(!call.isCallExpression()||member.key!=='callee'||call.node.arguments.length!==1)return false;
  const arg=call.node.arguments[0],name=member.node.property.name;
  return name==='includes'&&arg.type!=='SpreadElement'||name==='some'&&arg.type==='ArrowFunctionExpression'&&!arg.async&&arg.params.length<=2&&arg.params.every(p=>p.type==='Identifier');
 }
 function linkExport(record, name, chain, typeOnly){
  const alias=record.reexports.get(name);
  if(alias){const file=resolve(alias.source,record.file,typeOnly);if(chain.includes(file))record.fail('module cycle');return linkExport(load(file,undefined,typeOnly),alias.local,[...chain,file],typeOnly);}
  const target=record.exports.get(name);if(!target)record.fail(`unresolved export ${name}`);
  include(record,target,chain,typeOnly);return {child:record,target};
 }
 function include(record, local, chain, typeOnly=false) {
  const {program,types,needed,fail}=record;
  const binding=program.scope.getBinding(local), declaration=binding?.path??types.get(local)??program.get('body').map(p=>p.isExportNamedDeclaration()?p.get('declaration'):p).find(p=>p.isTSEnumDeclaration()&&p.node.id.name===local);
  if(!declaration)fail(`unresolved export or binding ${local}`);
  typeOnly ||= declaration.isTSTypeAliasDeclaration()||declaration.isTSInterfaceDeclaration()||declaration.isImportSpecifier()&&(declaration.node.importKind==='type'||declaration.parentPath.node.importKind==='type');
  if(!typeOnly)record.checkRuntime();
  if(needed.has(local)&&(typeOnly||record.runtimeNeeded.has(local)))return;
  if(!typeOnly)record.runtimeNeeded.add(local);
  needed.add(local);
  if(binding?.constantViolations.length)fail('module binding reassignment');
  if(declaration.isImportSpecifier()||declaration.isImportDefaultSpecifier()||declaration.isImportNamespaceSpecifier()){
   const statement=declaration.parentPath;
   typeOnly ||= statement.node.importKind==='type'||declaration.node.importKind==='type';
   if(declaration.isImportNamespaceSpecifier())fail('namespace import requires module-object proof');
   const file=resolve(statement.node.source.value,record.file,typeOnly);
   if(chain.includes(file))fail('module cycle');
   const child=load(file,undefined,typeOnly), exported=declaration.isImportDefaultSpecifier()?'default':declaration.node.imported.name;
   const linked=linkExport(child,exported,[...chain,file],typeOnly);record.imports.set(local,linked);return;
  }
  if(declaration.isClassDeclaration()){
   if(declaration.node.decorators?.length||declaration.node.body.body.some(n=>n.decorators?.length))fail('unsupported decorated class');
   record.throwClasses??=new Set();record.throwClasses.add(local);return;
  }
  if(declaration.isTSEnumDeclaration()){
   if(!declaration.node.members.length)fail('empty enum');
   const values=new Map();let next=0;
   for(const member of declaration.node.members){const key=member.id.name??member.id.value;if(values.has(String(key))||['__proto__','prototype','constructor'].includes(String(key))||/^-?\d/.test(String(key)))fail('enum unsafe or duplicate member');let value=member.initializer;
    if(!value){if(!Number.isFinite(next))fail('enum requires literal member');value=babel.types().numericLiteral(next);}
    if(!scalar(value)||!['StringLiteral','NumericLiteral','UnaryExpression'].includes(value.type))fail('enum computed member');
    const number=value.type==='NumericLiteral'?value.value:value.type==='UnaryExpression'?(value.operator==='-'?-1:1)*value.argument.value:null;
    if(number!==null&&!Number.isFinite(number))fail('enum non-finite member');next=number===null?NaN:number+1;values.set(String(key),value);
   }
   record.constants??=new Map();record.constants.set(local,values);return;
  }
  if(declaration.isTSTypeAliasDeclaration()||declaration.isTSInterfaceDeclaration()){
   if(declaration.node.typeParameters?.params.some(p=>types.has(p.name)||program.scope.getBinding(p.name)))fail('type parameter shadows a module binding; scoped type linking required');
   let query=false;declaration.traverse({TSTypeQuery(){query=true;}});
   if(query){
    if(declaration.node.typeParameters)fail('generic type query unsupported');
    declaration.node.typeAnnotation=babel.parser().parse('type Resolved='+resolveQuery(record,local),{plugins:['typescript']}).program.body[0].typeAnnotation;
   }
   declaration.traverse({enter(p){if(['TSMappedType','TSConditionalType','TSInferType','TSTypeQuery','TSImportType'].includes(p.node.type))fail(`type ${local} is not bounded JSON data: ${p.node.type} ${p.node.name??''}`);}});
  }
  if(declaration.isVariableDeclarator()&&declaration.parent.kind==='const'){const value=literalArithmetic(declaration.node.init);if(value!==undefined)declaration.node.init=babel.types().numericLiteral(value);}
  const init=declaration.node.init;
  const frozen=init?.type==='CallExpression'&&init.callee.type==='MemberExpression'&&!init.callee.computed&&init.callee.object.name==='Object'&&!declaration.scope.getBinding('Object')&&init.callee.property.name==='freeze'&&init.arguments.length===1;
  if(frozen){declaration.node.init=babel.types().tsAsExpression(init.arguments[0],babel.types().tsTypeReference(babel.types().identifier('const')));}
  if(declaration.isVariableDeclarator()&&declaration.node.init?.type==='TSAsExpression'&&declaration.node.init.typeAnnotation.type==='TSTypeReference'&&declaration.node.init.typeAnnotation.typeName.name==='const'&&scalar(declaration.node.init.expression))declaration.node.init=declaration.node.init.expression;
  if(declaration.isVariableDeclarator()&&(['ObjectExpression','ArrayExpression'].includes(declaration.node.init?.type)||declaration.node.init?.type==='TSAsExpression'&&declaration.node.init.typeAnnotation.type==='TSTypeReference'&&declaration.node.init.typeAnnotation.typeName.name==='const')){
   if(record.reflective)fail('constant graph lexical eval');
   if(declaration.parent.kind!=='const'||[...record.exports.values()].includes(local))fail('constant graph exported reference can escape');
   function graph(n){if(scalar(n))return n;const value=literalArithmetic(n);if(value!==undefined)return babel.types().numericLiteral(value);if(n.type==='ArrayExpression')return n.elements.map(e=>{if(!e)fail('constant graph hole');return graph(e);});if(n.type==='ObjectExpression'){const out=new Map();for(const p of n.properties){if(p.type!=='ObjectProperty'||p.computed||p.shorthand||['__proto__','prototype','constructor','toJSON'].includes(p.key.name??p.key.value))fail('constant graph property');out.set(String(p.key.name??p.key.value),graph(p.value));}return out;}fail('constant graph requires literals');}
   record.constants??=new Map();record.constants.set(local,graph(declaration.node.init.type==='TSAsExpression'?declaration.node.init.expression:declaration.node.init));return;
  }
  if(declaration.isVariableDeclarator()){
   if(declaration.parent.kind!=='const'||declaration.node.id.type!=='Identifier'||!(scalar(declaration.node.init)||['ArrowFunctionExpression','FunctionExpression'].includes(declaration.node.init?.type)))fail('unproved module initialization VariableDeclaration');
  }else if(!declaration.isFunctionDeclaration()&&!declaration.isTSTypeAliasDeclaration()&&!declaration.isTSInterfaceDeclaration())fail(`unproved module initialization ${declaration.node.type}`);
  declaration.traverse({ReferencedIdentifier(p){
   const top=program.scope.getBinding(p.node.name);
   if(top&&top===p.scope.getBinding(p.node.name)||!p.scope.getBinding(p.node.name)&&types.has(p.node.name))include(record,p.node.name,chain,!!p.findParent(q=>q.isTSType()));
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
   if(n.type==='ClassDeclaration')return [];
   if(n.type==='TSEnumDeclaration'){if(!needed.has(n.id.name))return [];const values=[...record.constants.get(n.id.name).values()];return [babel.types().tsTypeAliasDeclaration(babel.types().identifier(n.id.name),null,babel.types().tsUnionType(values.map(v=>babel.types().tsLiteralType(babel.types().cloneNode(v,true)))))];}
   if(n.type==='VariableDeclaration'){
    n.declarations=n.declarations.filter(d=>!record.constants?.has(d.id.name)).filter(d=>Object.keys(babel.types().getBindingIdentifiers(d.id)).some(k=>needed.has(k)));
    return n.declarations.length?[n]:[];
   }
   return n.id&&needed.has(n.id.name)?[n]:[];
  });
  function defining(record,local){const imported=record.imports.get(local);return imported?defining(imported.child,imported.target):{record,local};}
  // Audit all original references, including unreachable helpers, before erasure.
  for(const local of needed){const target=defining(record,local),values=target.record.constants?.get(target.local),isClass=target.record.throwClasses?.has(target.local);
   if(!values&&!isClass)continue;
   const binding=program.scope.getBinding(local);
   const refs=binding?.referencePaths??record.enumReferences.get(local)??[];
   for(const ref of refs){
    if((ref.parentPath.isTSTypeAliasDeclaration()||ref.parentPath.isTSEnumDeclaration())&&ref.key==='id'||ref.isExportNamedDeclaration()||ref.parentPath.isExportSpecifier()||ref.findParent(p=>p.isTSType()))continue;
    if(isClass){if(!ref.findParent(p=>ast.program.body.includes(p.node)))continue;const call=ref.parentPath;if(!call.isNewExpression()||ref.key!=='callee'||!call.parentPath.isThrowStatement())fail('class value is not throw-only');continue;}
    let read=ref,value=values,arrayRead=false;
    while(read.parentPath.isMemberExpression()&&read.key==='object'){
     const member=read.parentPath.node,key=member.computed?member.property.value:member.property.name;
     if(member.computed&&!['StringLiteral','NumericLiteral'].includes(member.property.type))fail('constant graph requires literal member read');
     if(scalarArrayRead(read.parentPath,value)){record.arrayReads??=new WeakMap();record.arrayReads.set(read.node,value);arrayRead=true;break;}
     value=lookup(value,key);
     if(!value)fail('constant graph unresolved member');read=read.parentPath;
    }
    if(arrayRead)continue;
    if(!scalar(value)||read.parentPath.isAssignmentExpression()&&read.key==='left'||read.parentPath.isUpdateExpression()||read.parentPath.isUnaryExpression({operator:'delete'}))fail('constant graph mutation or escaping reference');
   }
  }
  traverse(ast,{enter(p){const values=record.arrayReads?.get(p.node);if(values){p.replaceWith(babel.types().arrayExpression(values.map(v=>babel.types().cloneNode(v,true))));p.skip();}},TSTypeReference(p){const n=p.node.typeName;if(n.type!=='TSQualifiedName'||n.left.type!=='Identifier')return;const target=defining(record,n.left.name),value=target.record.constants?.get(target.local)?.get(n.right.name);if(scalar(value))p.replaceWith(babel.types().tsLiteralType(babel.types().cloneNode(value,true)));},ThrowStatement(p){const n=p.node.argument;if(n?.type!=='NewExpression'||n.callee.type!=='Identifier'||p.scope.getBinding(n.callee.name)!==program.scope.getBinding(n.callee.name))return;const target=defining(record,n.callee.name);if(!target.record.throwClasses?.has(target.local))return;
   p.node.argument=babel.types().stringLiteral('__scriptc_throw_fallback__');record.requiresFallback=true;
  },MemberExpression:{exit(p){let n=p.node,keys=[];while(n.type==='MemberExpression'){keys.unshift(n.computed?n.property.value:n.property.name);n=n.object;}if(n.type!=='Identifier'||p.scope.getBinding(n.name)!==program.scope.getBinding(n.name))return;
   const target=defining(record,n.name);let value=target.record.constants?.get(target.local);if(!value)return;
   for(const key of keys)value=lookup(value,key);
   if(scalar(value))p.replaceWith(babel.types().cloneNode(value,true));
  }}});
  traverse(ast,{
   Identifier(p){if(p.node.name.startsWith('__dep_')||p.node.name.startsWith('__scriptc_checked_index'))fail('reserved generated binding');},
   'ImportExpression|ThisExpression|NewExpression|ObjectMethod|ClassDeclaration|ClassExpression'(p){fail(`unsupported ${p.node.type}`);},
   MemberExpression(p){if(!p.node.computed&&['prototype','constructor','__proto__'].includes(p.node.property.name))fail(`computed or prototype member at line ${p.node.loc?.start.line??'unknown'}`);},
   ReferencedIdentifier(p){if(p.findParent(q=>q.isTSType()))return;if(['eval','Function','require','module','exports','globalThis','process','Date','crypto','console','fetch','performance'].includes(p.node.name))fail(`unsupported ${p.node.name}`);},
  });
  // Keep import bindings in the original scope until all references are renamed.
  for(const local of needed){
   if(record.throwClasses?.has(local))continue;
   program.scope.rename(local,targetName(record,local));
   traverse(ast,{Identifier(p){if(p.node.name===local&&(p.isReferencedIdentifier()&&p.findParent(q=>q.isTSType())||p.parentPath.isTSTypeAliasDeclaration()&&p.key==='id'||p.parentPath.isTSInterfaceDeclaration()&&p.key==='id'))p.node.name=targetName(record,local);}});
  }
  chunks.push(generate(ast).code);
  sourceNodes.push(...ast.program.body);
 }
 let requiresFallback=[...modules.values()].some(r=>r.requiresFallback);
 if(requiresFallback)for(const record of modules.values())traverse(record.ast,{TryStatement(){record.fail('throw fallback excludes local catch/finally');}});
 const combined=chunks.join('\n')+`\nexport {${name}};`;
 // Scalar const reads have no identity or initialization effects. Inline them
 // before the allocation proof, which otherwise rejects all module variables.
 const flat=babel.parser().parse(combined,{sourceType:'module',plugins:['typescript']});
 flat.program.body=[...sourceNodes,flat.program.body.at(-1)];
 traverse(flat,{Program(p){
  for(const binding of Object.values(p.scope.bindings)){
   const d=binding.path.node,n=d.init;
   if(d.type!=='VariableDeclarator'||binding.kind!=='const'||!n)continue;
   if(!['StringLiteral','NumericLiteral','BooleanLiteral','NullLiteral'].includes(n.type)&&!(n.type==='UnaryExpression'&&['+','-'].includes(n.operator)&&n.argument.type==='NumericLiteral'))continue;
   for(const ref of binding.referencePaths){if(ref.findParent(p=>p.isTSType()))throw Error('dependency closure: scalar type query unsupported');ref.replaceWith(babel.types().cloneNode(n,true));}
   binding.path.remove();
  }
 }});
 const generated=generate(flat,{sourceMaps:true});
 const extracted=extractFunctions(generated.code,source,name);
 const lowered=lowerOpaqueHandles(normalizeModuleFunctions(extracted.native,source,options).native,name,ts);
 const checked=lowerCheckedIndexes(lowered.native,ts);if(checked.requiresFallback)for(const record of modules.values())traverse(record.ast,{TryStatement(){record.fail('throw fallback excludes local catch/finally');}});lowered.native=checked.native;requiresFallback ||= checked.requiresFallback;
 const proof=constructionProof(lowered.native,ts);
 if(!proof.eligible)throw Error(`dependency closure: transitive effect proof: ${proof.reason}`);
 return {loweringMap:lowered.loweringMap,compilerSourceMap:{text:generated.code,segments:extracted.sourceMap,mappings:generated.rawMappings},referenceNative:extracted.native,rawLinks:Object.fromEntries([...root.imports].map(([local,{child,target}])=>[local,{source:child.file,name:target}])),native:lowered.native,opaqueInputs:lowered.inputs,requiresFallback,dependencies:[...[...(typeProgram?.getSourceFiles()??[])].filter(sf=>!typeProgram.isSourceFileDefaultLibrary(sf)&&!modules.has(sf.fileName)&&fs.existsSync(sf.fileName)).map(sf=>({file:sf.fileName,hash:digest(fs.readFileSync(sf.fileName)),package:null})),...[...modules.values()].reverse().map(({file,hash,package:packageInfo})=>({file,hash,package:packageInfo})),...[...resolverManifests].filter(([file])=>![...modules.values()].some(r=>r.package?.manifest===file)).map(([file,hash])=>({file,hash,package:null}))],closureHash:digest(combined)};
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
