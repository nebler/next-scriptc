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
export function dependencyClosure(text, source, name, {ts, options={}, unsupportedResolver=false}={}) {
 if(unsupportedResolver)throw Error('dependency closure: custom application resolver requires explicit integration');
 // Discovery passes the app's TypeScript; standalone callers resolve it from
 // the app (cwd) first, like construction-proof.mjs.
 ts??=require(require.resolve('typescript',{paths:[path.dirname(source),process.cwd()]}));
 const host={...ts.sys,fileExists:f=>!declarationFile(f)&&ts.sys.fileExists(f)};
 const modules=new Map(), chunks=[];
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
  const result=ts.resolveModuleName(specifier,importer,{...options,allowJs:true,moduleResolution:options.moduleResolution??ts.ModuleResolutionKind.Bundler},typeOnly?ts.sys:host,undefined,undefined,ts.ModuleKind.ESNext).resolvedModule;
  if(!result||!typeOnly&&declarationFile(result.resolvedFileName))throw Error(`dependency closure: unresolved runtime import ${specifier}`);
  return fs.realpathSync(result.resolvedFileName);
 }
 // Parse once, then accumulate a union of requested bindings before emitting.
 // Never cache a completed closure by filename: a diamond can request new exports.
 function load(file, input) {
  if(modules.has(file))return modules.get(file);
  const code=input??fs.readFileSync(file,'utf8');let ast;
  try{ast=babel.parser().parse(code,{sourceType:'module',plugins:['typescript','jsx']});}
  catch(error){error.message=`${file}: ${error.message}`;throw error;}
  const fail=reason=>{throw Error(`dependency closure: ${file}: ${reason}`);};
  if(/\.cjs$/.test(file))fail('CommonJS mutable module exports require a module-object proof');
  if(ast.program.directives.some(d=>['use client','use js'].includes(d.value.value)))fail('module directive');
  let program;traverse(ast,{Program(p){program=p;}});
  const exports=new Map(), reexports=new Map(), types=new Map(), prefix='__dep_'+digest(file).slice(0,12)+'_';
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
   if(statement.isExportNamedDeclaration()&&statement.node.source){for(const spec of statement.node.specifiers)if(spec.type==='ExportSpecifier')reexports.set(spec.exported.name,{source:statement.node.source.value,local:spec.local.name});continue;}
   if(statement.isExportAllDeclaration()||statement.isExportNamedDeclaration()&&!n.node)continue;
   if(!n.isDeclaration()&&!n.isEmptyStatement())fail(`unproved module initialization ${n.node.type}`);
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
    function conditions(value){if(!value||typeof value!=='object')return;for(const [key,child] of Object.entries(value)){if(!key.startsWith('.')&&!/^\d+$/.test(key)&&!['import','require','default','types'].includes(key))fail(`unsupported package export condition ${key}`);conditions(child);}}
    conditions(p.exports);packageInfo={name:p.name??null,version:p.version??null,manifest,manifestHash:digest(fs.readFileSync(manifest))};break;}
   if(path.dirname(dir)===dir)break;
  }
  const record={exports,reexports,file,hash:digest(code),package:packageInfo,ast,program,types,prefix,fail,needed:new Set(),imports:new Map()};
  program.traverse({ReferencedIdentifier(p){if(p.node.name==='eval')record.reflective=true;}});
  record.enumReferences=new Map();for(const [local,declaration] of types)if(declaration.isTSEnumDeclaration()){const refs=[];program.traverse({ReferencedIdentifier(p){if(p.node.name===local&&!p.scope.getBinding(local))refs.push(p);}});record.enumReferences.set(local,refs);}
  modules.set(file,record);return record;
 }
 const lookup=(value,key)=>value instanceof Map?value.get(String(key)):Array.isArray(value)?key==='length'?babel.types().numericLiteral(value.length):String(Number(key))===String(key)&&Number.isSafeInteger(Number(key))&&Number(key)>=0?value[Number(key)]:undefined:undefined;
 const scalar=n=>n&&(['StringLiteral','NumericLiteral','BooleanLiteral','NullLiteral'].includes(n.type)||n.type==='UnaryExpression'&&['+','-'].includes(n.operator)&&n.argument.type==='NumericLiteral');
 function linkExport(record, name, chain, typeOnly){
  const alias=record.reexports.get(name);
  if(alias){const file=resolve(alias.source,record.file,typeOnly);if(chain.includes(file))record.fail('module cycle');return linkExport(load(file),alias.local,[...chain,file],typeOnly);}
  const target=record.exports.get(name);if(!target)record.fail(`unresolved export ${name}`);
  include(record,target,chain,typeOnly);return {child:record,target};
 }
 function include(record, local, chain, typeOnly=false) {
  const {program,types,needed,fail}=record;
  if(needed.has(local))return; // local recursion is handled by the later proofs
  const binding=program.scope.getBinding(local), declaration=binding?.path??types.get(local)??program.get('body').map(p=>p.isExportNamedDeclaration()?p.get('declaration'):p).find(p=>p.isTSEnumDeclaration()&&p.node.id.name===local);
  if(!declaration)fail(`unresolved export or binding ${local}`);
  needed.add(local);
  if(binding?.constantViolations.length)fail('module binding reassignment');
  if(declaration.isImportSpecifier()||declaration.isImportDefaultSpecifier()||declaration.isImportNamespaceSpecifier()){
   const statement=declaration.parentPath;
   typeOnly ||= statement.node.importKind==='type'||declaration.node.importKind==='type';
   if(declaration.isImportNamespaceSpecifier())fail('namespace import requires module-object proof');
   const file=resolve(statement.node.source.value,record.file,typeOnly);
   if(chain.includes(file))fail('module cycle');
   const child=load(file), exported=declaration.isImportDefaultSpecifier()?'default':declaration.node.imported.name;
   const linked=linkExport(child,exported,[...chain,file],typeOnly);record.imports.set(local,linked);return;
  }
  if(declaration.isClassDeclaration()){
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
  if(declaration.isVariableDeclarator()&&declaration.node.init?.type==='TSAsExpression'&&declaration.node.init.typeAnnotation.type==='TSTypeReference'&&declaration.node.init.typeAnnotation.typeName.name==='const'){
   if(record.reflective)fail('constant graph lexical eval');
   if(declaration.parent.kind!=='const'||[...record.exports.values()].includes(local))fail('constant graph exported reference can escape');
   function graph(n){if(scalar(n))return n;if(n.type==='ArrayExpression')return n.elements.map(e=>{if(!e)fail('constant graph hole');return graph(e);});if(n.type==='ObjectExpression'){const out=new Map();for(const p of n.properties){if(p.type!=='ObjectProperty'||p.computed||p.shorthand||['__proto__','prototype','constructor','toJSON'].includes(p.key.name??p.key.value))fail('constant graph property');out.set(String(p.key.name??p.key.value),graph(p.value));}return out;}fail('constant graph requires literals');}
   record.constants??=new Map();record.constants.set(local,graph(declaration.node.init.expression));return;
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
    let read=ref,value=values;
    while(read.parentPath.isMemberExpression()&&read.key==='object'){
     const member=read.parentPath.node,key=member.computed?member.property.value:member.property.name;
     if(member.computed&&!['StringLiteral','NumericLiteral'].includes(member.property.type))fail('constant graph requires literal member read');
     value=lookup(value,key);
     if(!value)fail('constant graph unresolved member');read=read.parentPath;
    }
    if(!scalar(value)||read.parentPath.isAssignmentExpression()&&read.key==='left'||read.parentPath.isUpdateExpression()||read.parentPath.isUnaryExpression({operator:'delete'}))fail('constant graph mutation or escaping reference');
   }
  }
  traverse(ast,{TSTypeReference(p){const n=p.node.typeName;if(n.type!=='TSQualifiedName'||n.left.type!=='Identifier')return;const target=defining(record,n.left.name),value=target.record.constants?.get(target.local)?.get(n.right.name);if(scalar(value))p.replaceWith(babel.types().tsLiteralType(babel.types().cloneNode(value,true)));},ThrowStatement(p){const n=p.node.argument;if(n?.type!=='NewExpression'||n.callee.type!=='Identifier'||p.scope.getBinding(n.callee.name)!==program.scope.getBinding(n.callee.name))return;const target=defining(record,n.callee.name);if(!target.record.throwClasses?.has(target.local))return;
   p.node.argument=babel.types().stringLiteral('__scriptc_throw_fallback__');record.requiresFallback=true;
  },MemberExpression:{exit(p){let n=p.node,keys=[];while(n.type==='MemberExpression'){keys.unshift(n.computed?n.property.value:n.property.name);n=n.object;}if(n.type!=='Identifier'||p.scope.getBinding(n.name)!==program.scope.getBinding(n.name))return;
   const target=defining(record,n.name);let value=target.record.constants?.get(target.local);if(!value)return;
   for(const key of keys)value=lookup(value,key);
   if(scalar(value))p.replaceWith(babel.types().cloneNode(value,true));
  }}});
  traverse(ast,{
   Identifier(p){if(p.node.name.startsWith('__dep_'))fail('reserved generated binding');},
   'ImportExpression|ThisExpression|NewExpression|ObjectMethod|ClassDeclaration|ClassExpression'(p){fail(`unsupported ${p.node.type}`);},
   MemberExpression(p){if(p.node.computed||['prototype','constructor','__proto__'].includes(p.node.property.name))fail(`computed or prototype member at line ${p.node.loc?.start.line??'unknown'}`);},
   ReferencedIdentifier(p){if(p.findParent(q=>q.isTSType()))return;if(['eval','Function','require','module','exports','globalThis','process','Date','crypto','console','fetch','performance'].includes(p.node.name))fail(`unsupported ${p.node.name}`);},
  });
  // Keep import bindings in the original scope until all references are renamed.
  for(const local of needed){
   if(record.throwClasses?.has(local))continue;
   program.scope.rename(local,targetName(record,local));
   traverse(ast,{Identifier(p){if(p.node.name===local&&(p.isReferencedIdentifier()&&p.findParent(q=>q.isTSType())||p.parentPath.isTSTypeAliasDeclaration()&&p.key==='id'||p.parentPath.isTSInterfaceDeclaration()&&p.key==='id'))p.node.name=targetName(record,local);}});
  }
  chunks.push(generate(ast).code);
 }
 const requiresFallback=[...modules.values()].some(r=>r.requiresFallback);
 if(requiresFallback)for(const record of modules.values())traverse(record.ast,{TryStatement(){record.fail('throw fallback excludes local catch/finally');}});
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
 const lowered=lowerOpaqueHandles(extracted.native,name,ts);
 const proof=constructionProof(lowered.native,ts);
 if(!proof.eligible)throw Error(`dependency closure: transitive effect proof: ${proof.reason}`);
 return {referenceNative:extracted.native,rawLinks:Object.fromEntries([...root.imports].map(([local,{child,target}])=>[local,{source:child.file,name:target}])),native:lowered.native,opaqueInputs:lowered.inputs,requiresFallback,dependencies:[...[...(typeProgram?.getSourceFiles()??[])].filter(sf=>!typeProgram.isSourceFileDefaultLibrary(sf)&&!modules.has(sf.fileName)&&fs.existsSync(sf.fileName)).map(sf=>({file:sf.fileName,hash:digest(fs.readFileSync(sf.fileName)),package:null})),...[...modules.values()].reverse().map(({file,hash,package:packageInfo})=>({file,hash,package:packageInfo}))],closureHash:digest(combined)};
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
