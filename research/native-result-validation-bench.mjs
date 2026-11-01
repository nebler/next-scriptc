// Short host-only encode probe. Fixture computation is outside all timed calls.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import {buildPromotion} from '../packages/next-scriptc/src/functions/promotion-build.mjs';
import {revenueCore} from '../examples/demo/lib/revenue-core.ts';
import {revenueEventsJson} from '../examples/demo/app/api/analytics/revenue/events.ts';
import {resultValidator,containerSource} from './legacy-result-validator.mjs';
const root=path.resolve(import.meta.dirname,'..'),dir=root+'/.checks/result-validation-bench';
await mkdir(dir,{recursive:true});
const helpers=(await readFile(root+'/packages/next-scriptc/src/functions/json.ts','utf8')).replaceAll('export function','function')+'\n'+containerSource.replaceAll('export function','function');
const n={kind:'number'}, str={kind:'string'};
const shape={kind:'object',fields:[['from',str],['to',str],['events',n],['revenueCents',n],['daily',{kind:'array',value:{kind:'object',fields:[['day',str],['region',str],['revenueCents',n],['units',n],['events',n]]}}],['timings',{kind:'null'}]]};
const validator=resultValidator(shape);
const values=[1000,5000].map(n=>revenueCore('2026-01-01','2026-01-31',revenueEventsJson(n)));
const native=`${helpers}\n${validator}\nconst one=${JSON.stringify(values[0])};\nconst five=${JSON.stringify(values[1])};\nexport function encode(size:number,mode:number):string {const value=size===1000?one:five;return mode===0?serialize(value,true,()=>JSON.stringify(value)):mode===1?(validateResult(value)?JSON.stringify(value):serialize(value,true,()=>JSON.stringify(value))):JSON.stringify(value);}`;
try{
 await buildPromotion([{native,forced:true,functions:[{name:'encode',id:'encode',boundary:{params:['number','number'],result:'string'}}]}],dir,{timing:true});
 const addon=createRequire(import.meta.url)(dir+'/promotion.node'),rows=[];
 for(const [j,size] of [1000,5000].entries())for(let i=-10;i<120;i++)for(let k=0;k<3;k++){
  const mode=(i+10+k)%3,output=addon.run(0,[size,mode]);
  assert.equal(output.value,JSON.stringify(values[j]));
  if(i>=0)rows.push({size,mode,i,...output.timings});
 }
 const stats=xs=>{const s=xs.toSorted((a,b)=>a-b);return {p05:s[Math.ceil(s.length*.05)-1],median:s[Math.ceil(s.length*.5)-1],p95:s[Math.ceil(s.length*.95)-1]};};
 const summary=[];
 for(const size of [1000,5000])for(let mode=0;mode<3;mode++){
  const rs=rows.filter(r=>r.size===size&&r.mode===mode);
  summary.push({size,mode,encode:stats(rs.map(r=>r.compute)),arenaAndScalarCheck:stats(rs.map(r=>r.nativeEncode)),copyBack:stats(rs.map(r=>r.copyBack)),combined:stats(rs.map(r=>r.compute+r.nativeEncode))});
 }
 const paired=[1000,5000].map(size=>({size,generatedMinusBaseline:stats(Array.from({length:120},(_,i)=>rows.find(r=>r.size===size&&r.i===i&&r.mode===1).compute-rows.find(r=>r.size===size&&r.i===i&&r.mode===0).compute))}));
 const result={paired,at:new Date().toISOString(),platform:process.platform,arch:process.arch,node:process.version,load:os.loadavg(),warmups:10,samples:120,note:'loaded-host; mode 0 strict baseline, mode 1 generated strict visit, mode 2 unchecked control (never production); compute stage contains only encoding of cached typed results; nativeEncode contains scalar string check and result-arena conversion; elapsed ms, not CPU',summary,rows};
 await writeFile(root+'/research/native-result-validation-host.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
}finally{await rm(dir,{recursive:true,force:true});}
