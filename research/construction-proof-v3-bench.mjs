// Real revenueCore, including parse and aggregation. Held-out Papermark stays correctness-only.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {extractFunctions} from '../packages/next-scriptc/src/functions/extract.mjs';
import {buildPromotion} from '../packages/next-scriptc/src/functions/promotion-build.mjs';
import {encodeArguments} from '../packages/next-scriptc/src/functions/promotion-encodings.mjs';
import {revenueCore} from '../examples/demo/lib/revenue-core.ts';
import {revenueEventsJson} from '../examples/demo/app/api/analytics/revenue/events.ts';
const root=path.resolve(import.meta.dirname,'..'),dir=root+'/.checks/construction-v3-bench';
const file=root+'/examples/demo/lib/revenue-core.ts',module=extractFunctions(await readFile(file,'utf8'),file,'revenueCore');
const arms=[],rows=[];
try{
 for(const [screened,catchFallback] of [[false,true],[true,false],[true,true]]){
  const output=dir+'/'+Number(screened)+Number(catchFallback),fn={id:'revenueCore',name:'revenueCore',boundary:{params:['string','string','string'],result:'json'}};
  await buildPromotion([{native:module.native,forced:true,functions:[fn]}],output,{constructionResults:screened,catchFallback,timing:true,report:()=>{}});
  assert.equal(fn.constructionProof.eligible,true);
  const schema=JSON.parse(await readFile(output+'/encodings.json','utf8')).functions.revenueCore;
  arms.push({addon:createRequire(import.meta.url)(output+'/promotion.node'),schema,screened,arm:screened?(catchFallback?'catch':'preflight'):'strict'});
 }
 for(const size of [1000,5000]){
 const args=['2026-01-01','2026-01-31',revenueEventsJson(size)],expected=JSON.stringify(revenueCore(...args));
 for(let round=-10;round<120;round++)for(let k=0;k<3;k++){
 const arm=arms[(round+10+k)%3],cpu=process.cpuUsage(),begin=performance.now();
 const input=encodeArguments(arm.schema,args),out=arm.addon.run(0,input),wall=performance.now()-begin,usage=process.cpuUsage(cpu);
 assert.equal(out.value,expected);
 if(round>=0)rows.push({size,round,arm:arm.arm,wall,cpu:(usage.user+usage.system)/1000,...out.timings});
 }
 }
 const stats=xs=>{const s=xs.toSorted((a,b)=>a-b);return {p05:s[Math.ceil(s.length*.05)-1],median:s[Math.ceil(s.length*.5)-1],p95:s[Math.ceil(s.length*.95)-1]};};
 const summary=[];
 for(const size of [1000,5000])for(const a of ['strict','preflight','catch']){const rs=rows.filter(r=>r.size===size&&r.arm===a);summary.push({size,arm:a,wall:stats(rs.map(r=>r.wall)),cpu:stats(rs.map(r=>r.cpu)),compute:stats(rs.map(r=>r.compute)),encode:stats(rs.map(r=>r.nativeEncode))});}
 await mkdir(root+'/research',{recursive:true});
 await writeFile(root+'/research/construction-proof-v3-host.json',JSON.stringify({at:new Date().toISOString(),node:process.version,platform:process.platform,arch:process.arch,load:os.loadavg(),rounds:120,warmups:10,label:'loaded-host; three arms rotate (strict, CR3 preflight guard, try/catch fallback without JS preflight); milliseconds; real revenueCore parse+aggregate; wall includes JS argument preparation, syntax guard, handoff and copy; nativeDecode includes native parsed-schema preflight; no hosted extrapolation',summary,rows},null,2)+'\n');console.log(JSON.stringify(summary,null,2));
}finally{await rm(dir,{recursive:true,force:true});}
