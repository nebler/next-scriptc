import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {promotionCandidates,discoverPromotions} from '../../packages/scriptc-promote/src/functions/promotion-discovery.mjs';
import {strictClosureProgram} from '../../packages/scriptc-promote/src/functions/construction-proof.mjs';
import {checkFunctionTypes} from '../../packages/scriptc-promote/src/functions/types.mjs';
import {buildPromotion} from '../../packages/scriptc-promote/src/functions/promotion-build.mjs';
import {compilerPath} from '../../packages/scriptc-promote/src/paths.mjs';
const ts=createRequire(new URL('../../packages/scriptc-promote/package.json',import.meta.url))('typescript'),base=path.resolve('.checks/e4');await mkdir(base,{recursive:true});
const fixtures={plain:'export function sum(rows:{amount:number;weight:number;enabled:boolean}[]):number{let sum=0;for(const row of rows)if(row.enabled)sum+=row.amount*row.weight;return sum;}',event:'type Event={event:string;timestamp:number;session:string;duration:number;country:string;mobile:boolean;tags:string[]}; export function sum(rows:Event[]):number{let sum=0;for(const row of rows)if(!row.mobile)sum+=row.duration;return sum;}',union:'export function sum(rows:({amount:number}|null)[]):number{let sum=0;for(const row of rows)if(row!==null)sum+=row.amount;return sum;}',specialized:'export function sum(rows:{amount:number;weight:number;enabled:boolean}[]):number{let sum=0;for(const row of rows)if(row.enabled)sum+=row.amount*row.weight;return sum;}'};
fixtures.e1=await readFile('research/boundary-encoders/fixture.ts','utf8');
fixtures.specialized='export function sum<T>(rows:T[]){return rows.map(row=>({value:row}));} export function caller(){return sum([{amount:1,weight:2,enabled:true}]);}';
fixtures.guarded='export function sum(text:string):number{const rows=JSON.parse(text) as {amount:number;weight:number;enabled:boolean}[];let sum=0;for(const row of rows)if(row.enabled)sum+=row.amount*row.weight;return sum;}';
await writeFile(base+'/tsconfig.json',JSON.stringify({compilerOptions:{strict:true,target:'ESNext'}}));
const index=[];
for(const [name,text] of Object.entries(fixtures)){
 const sourceDir=name==='specialized'?base+'/specialized-source':base;await mkdir(sourceDir,{recursive:true});if(name==='specialized')await writeFile(sourceDir+'/tsconfig.json',JSON.stringify({compilerOptions:{strict:true}}));
 const file=sourceDir+'/'+name+'.ts';await writeFile(file,text);
 const modules=name==='specialized'?(await discoverPromotions(sourceDir,sourceDir+'/out',{},console.log)).filter(m=>m.functions[0].name==='sum'&&m.source===file&&m.functions[0].specialization):promotionCandidates(text,file,console.log,{ts});
 for(const m of modules){const strict=strictClosureProgram(m.native,ts);for(const fn of m.functions){fn.start=strict.source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===fn.name).body.getStart(strict.source);}checkFunctionTypes(ts,strict.program,[{source:strict.source.fileName,functions:m.functions}]);}
 if(!modules.length)throw Error('no candidate '+name);
 for(const mode of ['default','before','after']){
  const dir=base+'/'+name+'-'+mode;const built=await buildPromotion(structuredClone(modules),dir,{timing:true,catchFallback:mode==='default'});if(built.length!==1)throw Error('build refused '+dir);
  if(mode==='before'){
   await writeFile(dir+'/module-0.ts',built[0].native);
   const old=(await readFile(new URL('./baseline-signature.txt',import.meta.url),'utf8')).replace("'./construction-validator.mjs'",JSON.stringify(new URL('../../packages/scriptc-promote/src/functions/construction-validator.mjs',import.meta.url).href));
   const {signature}=await import('data:text/javascript;base64,'+Buffer.from(old).toString('base64'));
   const entry="import {serialize} from './json.ts';\ndeclare function boundaryStage(stage:number):void;\nimport {"+built[0].functions[0].name+" as f0} from './module-0.ts';\n"+signature(built[0].functions[0],0,true,true,false).source;await writeFile(dir+'/entry.ts',entry);
   execFileSync(compilerPath(),['build','--lib','--profile',dir+'/profile.json','--keep-llvm','-o',dir+'/functions.lib.a'],{cwd:dir,env:{...process.env,SCRIPTC_CHECKER_SERVER:'0'},stdio:'pipe'});
   execFileSync('clang',['-bundle','-undefined','dynamic_lookup','-O2','-DSERIALIZED_RUNTIME','-DBOUNDARY_TIMING','-fPIC','-I'+process.env.HOME+'/Library/Caches/node-gyp/24.22.1/include/node',dir+'/addon.c',dir+'/functions.lib.a','-o',dir+'/promotion.node'],{stdio:'pipe'});
  }
  if(name==='guarded'){
   const module=await readFile(dir+'/module-0.ts','utf8');await writeFile(dir+'/module-0.ts','declare function boundaryStage(stage:number):void;\n'+module.replace(/const rows\s*=[\s\S]*?\[\];/,m=>m+'boundaryStage(1);'));
   execFileSync(compilerPath(),['build','--lib','--profile',dir+'/profile.json','--keep-llvm','-o',dir+'/functions.lib.a'],{cwd:dir,env:{...process.env,SCRIPTC_CHECKER_SERVER:'0'},stdio:'pipe'});
   execFileSync('clang',['-bundle','-undefined','dynamic_lookup','-O2','-DSERIALIZED_RUNTIME','-DBOUNDARY_TIMING','-fPIC','-I'+process.env.HOME+'/Library/Caches/node-gyp/24.22.1/include/node',dir+'/addon.c',dir+'/functions.lib.a','-o',dir+'/promotion.node'],{stdio:'pipe'});
  }
  index.push({name,mode,dir,fn:built[0].functions[0],native:built[0].native});
 }
}
await writeFile(base+'/index.json',JSON.stringify(index,null,2));
