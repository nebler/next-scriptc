import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {dependencyClosure} from './dependency-closure.mjs';
import { extractFunctions } from './extract.mjs';
import {constructionProof,strictClosureProgram} from './construction-proof.mjs';
import { checkFunctionTypes } from './types.mjs';
const require = createRequire(import.meta.url);
const babel = require('next/dist/compiled/babel/bundle.js');
const parse = text => babel.parser().parse(text, {sourceType:'module',plugins:['typescript','jsx']});
const traverse = babel.traverse().default;

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
 const ast = parse(text), names=[];let program;
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
  names.push({name:name,forced:(p.node.body.directives??[]).some(d=>d.value.value==='use native')});
 }});
 const candidates=[];
 for(const {name,forced} of names){try{
  const module=extractFunctions(text,source,name);if(!module)continue;
  if(module.imports.length && parse(module.native).program.body.some(n=>n.type==='ImportDeclaration'&&n.importKind!=='type')) {
   Object.assign(module,dependencyClosure(text,source,name,resolution));module.imports=[];
  }
  let work=false;
  const native=parse(module.native);
  traverse(native,{
   ImportDeclaration(p){if(p.node.importKind!=='type')throw Error('purity: runtime imports are opaque');},
   ReferencedIdentifier(p){if(['Date','crypto','process','fetch','console','performance'].includes(p.node.name))throw Error('purity: time, randomness or I/O');},
   MemberExpression(p){if(p.node.object.name==='Math'&&p.node.property.name==='random')throw Error('purity: randomness');},
   'AssignmentExpression|UpdateExpression'(p){let target=p.node.left??p.node.argument;while(target.type==='MemberExpression')target=target.object;
    if(target.type==='Identifier'){const b=p.scope.getBinding(target.name);if(!b||b.scope.path.isProgram())throw Error('purity: module state mutation');
     if(b.kind==='param')throw Error('purity: argument mutation');}},
   'ForStatement|ForOfStatement|ForInStatement|WhileStatement|DoWhileStatement'(){work=true;},
   CallExpression(p){const c=p.node.callee;if(c.name===name||c.type==='MemberExpression'&&(['map','reduce','filter','forEach','sort','some','every','flatMap'].includes(c.property.name)||c.object.name==='JSON'&&c.property.name==='parse'))work=true;
    if(c.type==='MemberExpression'&&['set','add','push','delete','clear','splice','sort','reverse'].includes(c.property.name)){
     let target=c.object;while(target.type==='MemberExpression')target=target.object;const b=p.scope.getBinding(target.name);
     if((!b||b.scope.path.isProgram()||b.kind==='param')&&!freshArray(p.get('callee.object')))throw Error('purity: nonlocal mutation');
    }
   }
  });
  if(!work&&!forced)throw Error('work: no loop, recursion, array callback or JSON parse');
  candidates.push({...module,functions:module.functions.map(fn=>({...fn,promotion:true})),promotion:true,forced});
 }catch(e){if(forced)throw e;report(`[next-scriptc] not a candidate ${name}: ${e.message}`);}}
 return candidates;
}

export async function discoverPromotions(projectDir, distDir, config, report=console.log){
 const ts=require(require.resolve('typescript',{paths:[projectDir]}));
 const file=path.resolve(projectDir,config?.typescript?.tsconfigPath??'tsconfig.json');
 const loaded=ts.readConfigFile(file,ts.sys.readFile);
 const parsed=ts.parseJsonConfigFileContent(loaded.config??{compilerOptions:{strict:true}},ts.sys,path.dirname(file),undefined,file);
 const modules=[];
 async function visit(dir){for(const e of await readdir(dir,{withFileTypes:true})){
  if(e.name.startsWith('.')||['node_modules','research','test','tests'].includes(e.name))continue;
  const file=path.join(dir,e.name);if(file===distDir)continue;
  if(e.isDirectory())await visit(file);
  else if(/\.[cm]?[jt]sx?$/.test(file)){
   modules.push(...promotionCandidates(await readFile(file,'utf8'),file,report,{ts,options:parsed.options,unsupportedResolver:!!(config?.webpack||config?.turbopack?.resolveAlias||config?.turbopack?.resolveExtensions)}));
  }
 }}await visit(projectDir);
 if(!modules.length)return [];
 const isolated=!(parsed.options.strictNullChecks??parsed.options.strict);
 const program=ts.createProgram({rootNames:[...new Set([...parsed.fileNames,...modules.map(m=>m.source)])],options:parsed.options});
 return modules.filter(m=>{try{
  if(isolated){
   const strict=strictClosureProgram(m.native,ts);
   const errors=ts.getPreEmitDiagnostics(strict.program);
   if(errors.length)throw Error(`strict closure: TS${errors[0].code}: ${ts.flattenDiagnosticMessageText(errors[0].messageText,' ')}`);
   // Extracted offsets differ from the application. Preserve loader locations
   // while deriving every boundary field from the self-contained strict check.
   const functions=m.functions.map(fn=>{
    let declaration;function find(n){if(ts.isFunctionLike(n)&&n.name?.text===fn.name)declaration=n;else ts.forEachChild(n,find);}find(strict.source);
    if(!declaration?.body)throw Error(`strict closure: missing ${fn.name}`);
    return {...fn,start:declaration.body.getStart(strict.source)};
   });
   checkFunctionTypes(ts,strict.program,[{source:strict.source.fileName,functions}]);
   functions.forEach((fn,i)=>{m.functions[i].strictClosure=true;m.functions[i].boundary=fn.boundary;m.functions[i].resultShape=fn.resultShape;});
  }else checkFunctionTypes(ts,program,[m]);for(const fn of m.functions){
   fn.constructionProof=constructionProof(m.native,ts);
   if(isolated&&fn.boundary.params.includes('json')&&(!fn.constructionProof.eligible||!['json','number','string'].includes(fn.boundary.result)))throw Error('strict closure: JSON inputs require a construction proof and a per-call fallback result ABI');
  }return true;}catch(e){if(m.forced)throw e;report(`[next-scriptc] not a candidate: ${e.message}`);return false;}});
}
