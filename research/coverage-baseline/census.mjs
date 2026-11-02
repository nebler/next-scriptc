import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {base,repo,ts,pins,roots,files,write} from './common.mjs';
import {promotionCandidates,discoverPromotions} from '../../packages/next-scriptc/src/functions/promotion-discovery.mjs';
const result={adapterCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),apps:{}};
const categorize=s=>/call-site specialization:/.test(s)?'call-site specialization':/auto disabled: strictNullChecks/.test(s)?'app strictNullChecks gate':/functions and constructors are not JSON/.test(s)?'collection/callable boundary':/opaque import|runtime import/.test(s)?'runtime import':/optional properties|optional parameters|optional tuple|\(type undefined\)/.test(s)?'undefined/optional':/\(type T\)|unresolved generic function/.test(s)?'generic':/class instances/.test(s)?'class boundary':/parameters must/.test(s)?'default/rest/destructured parameter':/any, unknown|JSON data/.test(s)?'broad/unresolved boundary':/no loop/.test(s)?'work screen':/mutation|reassigned/.test(s)?'mutation':/React|JSX|unsupported next|unsupported react/.test(s)?'React/framework':/reference|imports unsupported/.test(s)?'unsupported reference/import':/time|randomness|I\/O/.test(s)?'time/randomness/I/O':'other extraction';
for(const app of Object.keys(pins).filter(app=>!process.env.RUN_APPS||process.env.RUN_APPS.split(',').includes(app))){
 const project=path.join(base,app),appRoot=app==='dub'?path.join(project,'apps/web'):project;
 if(execFileSync('git',['-C',project,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==pins[app])throw Error('pin mismatch');
 const sources=roots[app].flatMap(r=>files(path.join(project,r)));
 const inventory={files:sources.length,routeFiles:0,functions:0,namedExportSyncBlock:0,async:0,expressionBody:0,nonExport:0,clientModules:0};
 const early=[];let preliminary=0;
 for(const file of sources){
  if(/^route\./.test(path.basename(file))){inventory.routeFiles++;}
  const text=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,/x$/.test(file)?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  if(/^\s*['"]use client['"]/.test(text)){inventory.clientModules++;continue;}
  for(const n of ast.statements){const exported=n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword)&&!n.modifiers?.some(m=>m.kind===ts.SyntaxKind.DefaultKeyword);
   const fns=ts.isFunctionDeclaration(n)?[n]:ts.isVariableStatement(n)?n.declarationList.declarations.map(d=>d.initializer).filter(d=>d&&(ts.isArrowFunction(d)||ts.isFunctionExpression(d))):[];
   for(const f of fns){inventory.functions++;if(!exported){inventory.nonExport++;continue;}if(f.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword)){inventory.async++;continue;}if(!f.body||!ts.isBlock(f.body)){inventory.expressionBody++;continue;}inventory.namedExportSyncBlock++;}
  }
  try{preliminary+=promotionCandidates(text,file,s=>early.push({file:path.relative(project,file),message:s,category:categorize(s)})).length;}catch(e){early.push({file:path.relative(project,file),message:e.message,category:'parse/file error'});}
 }
 const output={commit:pins[app],scope:roots[app],inventory,preliminary,early,actual:[],strictCounterfactual:[]};
 for(const strict of app==='umami'?[false,true]:[false]){
  const logs=[];let accepted=[];
  const config=path.join(base,`${app}-${strict?'strict':'actual'}.json`);
  // Use original app options, but narrow include to server scope. Keep paths based at app root.
  const sourceConfig=ts.readConfigFile(path.join(appRoot,'tsconfig.json'),ts.sys.readFile).config;
  const compilerOptions={...sourceConfig.compilerOptions,baseUrl:appRoot,incremental:false};
  delete compilerOptions.plugins;
  if(strict)compilerOptions.strictNullChecks=true;
  fs.writeFileSync(config,JSON.stringify({extends:path.join(appRoot,"tsconfig.json"),compilerOptions,include:sources}));
  for(const root of roots[app]){
   const dir=path.join(project,root);
   accepted.push(...await discoverPromotions(dir,path.join(base,'absent-dist'),{typescript:{tsconfigPath:config}},s=>logs.push({message:s,category:categorize(s)})));
  }
  const rows=accepted.flatMap(m=>m.functions.map(f=>({file:path.relative(project,m.source),name:f.name,boundary:f.boundary,...(f.specialization?{specialization:f.specialization}:{}),constructionProof:f.constructionProof})));
  output[strict?'strictCounterfactual':'actual']={accepted:rows,logs,counts:Object.fromEntries([...new Set(logs.map(x=>x.category))].map(k=>[k,logs.filter(x=>x.category===k).length]))};
 }
 result.apps[app]=output;write('census.json',result);console.log(app,inventory,output.actual.accepted.length);
}
