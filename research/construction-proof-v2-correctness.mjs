import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {extractFunctions} from '../packages/next-scriptc/src/functions/extract.mjs';
import {buildPromotion} from '../packages/next-scriptc/src/functions/promotion-build.mjs';
import {loadPromotion} from '../packages/next-scriptc/src/functions/promotion-runtime.mjs';
import {revenueCore} from '../examples/demo/lib/revenue-core.ts';
import {revenueEventsJson} from '../examples/demo/app/api/analytics/revenue/events.ts';
const file=new URL('../examples/demo/lib/revenue-core.ts',import.meta.url).pathname;
const module=extractFunctions(await readFile(file,'utf8'),file,'revenueCore');
const dir=await mkdtemp('/tmp/construction-revenue-');
try{
 const fn={name:'revenueCore',id:'revenueCore',boundary:{params:['string','string','string'],result:'json'}};
 await buildPromotion([{native:module.native,forced:true,functions:[fn]}],dir,{constructionResults:true,report:()=>{}});
 const d=loadPromotion(dir+'/promotion.node',{jsSamples:1,sampleEvery:1,policy:{samples:1000,required:1000,coldSamples:0},log:()=>{}}),cases=[];
 for(const size of [1000,5000]){
 const args=['2026-01-01','2026-01-31',revenueEventsJson(size)],expected=JSON.stringify(revenueCore(...args));
 assert.equal(JSON.stringify(d.dispatch(fn.id,revenueCore,args)),expected);
 while(d.pending)await new Promise(r=>setTimeout(r,1));
 assert.equal(d.snapshot()[fn.id].buckets.reduce((n,b)=>n+b.verified,0),cases.length+1);
 assert.ok(d.snapshot()[fn.id].buckets.every(b=>b.state!=='demoted'));
 cases.push({size,verified:true,bytes:Buffer.byteLength(expected),sha256:createHash('sha256').update(expected).digest('hex')});
 }
 await writeFile(new URL('construction-proof-v2-revenue.json',import.meta.url),JSON.stringify({screened:fn.constructionProof.eligible,cases},null,2)+'\n');console.log(cases);
}finally{await rm(dir,{recursive:true,force:true});}
