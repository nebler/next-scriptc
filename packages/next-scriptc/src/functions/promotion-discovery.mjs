import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { extractFunctions } from './extract.mjs';
import { checkFunctionTypes } from './types.mjs';
const require = createRequire(import.meta.url);
const babel = require('next/dist/compiled/babel/bundle.js');
const parse = text => babel.parser().parse(text, {sourceType:'module',plugins:['typescript','jsx']});
const traverse = babel.traverse().default;

// Deliberately reject imports and nonlocal mutation rather than trusting opaque
// callees. Local helpers/constants are included by the existing extractor.
export function promotionCandidates(text, source, report = console.log) {
 const ast = parse(text), names=[];let program;
 if(ast.program.directives.some(d=>['use client','use js','use native'].includes(d.value.value)))return [];
 traverse(ast,{Program(p){program=p;},Function(p){
  const decl=p.isFunctionDeclaration()?p:p.parentPath.isVariableDeclarator()?p.parentPath:null;
  const statement=decl?.getStatementParent();
  const name=decl?.node.id?.name;
  const exported=statement?.isExportNamedDeclaration()||statement?.parentPath.isExportNamedDeclaration()||program.scope.getBinding(name)?.referencePaths.some(ref=>ref.parentPath.isExportSpecifier());
  if(!exported||p.node.async||p.node.generator||p.node.body.type!=='BlockStatement')return;
  if(p.node.body.directives.some(d=>d.value.value==='use js'))return;
  names.push({name:name,forced:p.node.body.directives.some(d=>d.value.value==='use native')});
 }});
 const candidates=[];
 for(const {name,forced} of names){try{
  const module=extractFunctions(text,source,name);if(!module)continue;
  if(module.imports.some(i=>!i.specifier.startsWith('.') || !/import\s+type\b/.test(module.native)))throw Error('purity: opaque import');
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
     if(!b||b.scope.path.isProgram()||b.kind==='param')throw Error('purity: nonlocal mutation');
    }
   }
  });
  if(!work&&!forced)throw Error('work: no loop, recursion, array callback or JSON parse');
  candidates.push({...module,functions:module.functions.map(fn=>({...fn,promotion:true})),promotion:true,forced});
 }catch(e){if(forced)throw e;report(`[next-scriptc] not a candidate ${name}: ${e.message}`);}}
 return candidates;
}

export async function discoverPromotions(projectDir, distDir, config, report=console.log){
 const modules=[];
 async function visit(dir){for(const e of await readdir(dir,{withFileTypes:true})){
  if(e.name.startsWith('.')||['node_modules','research','test','tests'].includes(e.name))continue;
  const file=path.join(dir,e.name);if(file===distDir)continue;
  if(e.isDirectory())await visit(file);
  else if(/\.[cm]?[jt]sx?$/.test(file)&&!/^route\./.test(e.name)){
   modules.push(...promotionCandidates(await readFile(file,'utf8'),file,report));
  }
 }}await visit(projectDir);
 if(!modules.length)return [];
 const ts=require(require.resolve('typescript',{paths:[projectDir]}));
 const file=path.resolve(projectDir,config?.typescript?.tsconfigPath??'tsconfig.json');
 const loaded=ts.readConfigFile(file,ts.sys.readFile);
 const parsed=ts.parseJsonConfigFileContent(loaded.config??{compilerOptions:{strict:true}},ts.sys,projectDir);
 if(!(parsed.options.strictNullChecks??parsed.options.strict)){report('[next-scriptc] auto disabled: strictNullChecks required');return [];}
 const program=ts.createProgram({rootNames:[...new Set([...parsed.fileNames,...modules.map(m=>m.source)])],options:parsed.options});
 return modules.filter(m=>{try{checkFunctionTypes(ts,program,[m]);return true;}catch(e){if(m.forced)throw e;report(`[next-scriptc] not a candidate: ${e.message}`);return false;}});
}
