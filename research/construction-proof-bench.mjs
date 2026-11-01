// Cached revenue output, not an eligibility claim for revenueCore itself.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import {constructionProof} from '../packages/next-scriptc/src/functions/construction-proof.mjs';
import {buildPromotion} from '../packages/next-scriptc/src/functions/promotion-build.mjs';
import {revenueCore} from '../examples/demo/lib/revenue-core.ts';
import {revenueEventsJson} from '../examples/demo/app/api/analytics/revenue/events.ts';
const root=path.resolve(import.meta.dirname,'..'),dir=root+'/.checks/construction-proof-bench';
const values=[1000,5000].map(n=>revenueCore('2026-01-01','2026-01-31',revenueEventsJson(n)));
const source=values.map((v,i)=>`export function cached${i}(){return ${JSON.stringify(v)};}`).join('\n');
assert.equal(constructionProof(source).eligible,true);
const helpers=(await readFile(root+'/packages/next-scriptc/src/functions/json.ts','utf8')).replaceAll('export function','function');
// Explicitly compare the exact two wrapper expressions; proof excludes the
// harness's mode branch and strict validator implementation from its closure.
const native=helpers+'\n'+source+'\nexport function encode(size:number,mode:number):string {const value=size===1000?cached0():cached1();return mode===0?serialize(value,true,()=>JSON.stringify(value)):JSON.stringify(value);}';
await mkdir(dir,{recursive:true});
try{
 await buildPromotion([{native,forced:true,functions:[{name:'encode',id:'encode',boundary:{params:['number','number'],result:'string'}}]}],dir,{timing:true,report:()=>{}});
 const addon=createRequire(import.meta.url)(dir+'/promotion.node'),rows=[];
 for(const [j,size] of [1000,5000].entries())for(let i=-10;i<120;i++)for(let k=0;k<2;k++){
  const mode=(i+10+k)%2,output=addon.run(0,[size,mode]);
  assert.equal(output.value,JSON.stringify(values[j]));if(i>=0)rows.push({size,mode,i,...output.timings});
 }
 const stats=xs=>{const s=xs.toSorted((a,b)=>a-b);return {p05:s[Math.ceil(s.length*.05)-1],median:s[Math.ceil(s.length*.5)-1],p95:s[Math.ceil(s.length*.95)-1]};};
 const summary=[];
 for(const size of [1000,5000])for(const mode of [0,1]){const rs=rows.filter(r=>r.size===size&&r.mode===mode);summary.push({size,mode,compute:stats(rs.map(r=>r.compute)),combined:stats(rs.map(r=>r.compute+r.nativeEncode))});}
 const result={at:new Date().toISOString(),node:process.version,platform:process.platform,arch:process.arch,load:os.loadavg(),warmups:10,rounds:120,note:'loaded-host; elapsed milliseconds; 0 strict, 1 screened expression; cached revenue result construction + validation/encoding in compute, not revenue aggregation. Both allocate result literals per call. No eligibility or speedup claim for original revenue.',proof:constructionProof(source),summary,rows};
 await writeFile(root+'/research/construction-proof-host.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
}finally{await rm(dir,{recursive:true,force:true});}
