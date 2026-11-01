import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {stripTypeScriptTypes,createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {promotionCandidates} from '../../packages/next-scriptc/src/functions/promotion-discovery.mjs';
import {checkFunctionTypes} from '../../packages/next-scriptc/src/functions/types.mjs';
import {buildPromotion} from '../../packages/next-scriptc/src/functions/promotion-build.mjs';
const root=process.cwd(),s=root+'/.checks/phase1';await mkdir(s,{recursive:true});
const require=createRequire(import.meta.url),ts=require('../../examples/demo/node_modules/typescript');
let source=await readFile('examples/demo/lib/revenue-core.ts','utf8');
source=source.slice(0,source.indexOf('export function timeDecoy')).replace(/import type[^;]+;/,'type RevenueEvent={day:string;region:string;amountCents:number;quantity:number};');
await writeFile(s+'/core.mjs',stripTypeScriptTypes(source));
await writeFile(s+'/events.mjs',stripTypeScriptTypes(await readFile('examples/demo/app/api/analytics/revenue/events.ts','utf8')));
for(const constructionResults of [false,true]){
 const old=false;
 const text=source+(old?'\nexport function oldBoundary(args:[string,string,string]) {return revenueCore(args[0],args[1],args[2]);}\n':'');
 const file=s+(old?'/old.ts':'/new.ts');await writeFile(file,text);
 const modules=promotionCandidates(text,file).filter(m=>m.functions[0].name===(old?'oldBoundary':'revenueCore'));
 checkFunctionTypes(ts,ts.createProgram([file],{strict:true,target:ts.ScriptTarget.ES2022}),modules);
 if(modules.length!==1)throw Error('missing candidate');
 for(const timing of [false,true]){
 const output=s+'/'+(constructionResults?'construction':'new')+(timing?'-timing':'');
 const accepted=await buildPromotion(modules,output,{target:'linux-arm64-gnu',timing,constructionResults});
 if(accepted.length!==1)throw Error('refused');
 }
}
const artifacts=[];for(const mode of ['new','construction','new-timing','construction-timing']){const b=await readFile(s+'/'+mode+'/promotion.node');artifacts.push({mode,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});}
await writeFile((process.env.M3_ARTIFACTS??'research/phase1/raw/m3/artifacts.json'),JSON.stringify({artifacts,compiler:process.env.SCRIPTC_COMPILER},null,2));
