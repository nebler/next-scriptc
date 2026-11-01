import assert from 'node:assert/strict';
import {root,scratch,sizes,args,hash,addon,stats,save} from './common.mjs';
const {revenue}=await import(scratch+'/stage/revenue-js.ts');
const expected={};for(const n of sizes)expected[n]=hash(JSON.stringify(await revenue(...args(n))));
const a=process.env.NAPI_SERIALIZED?(await import('node:module')).createRequire(import.meta.url)(scratch+'/revenue-serialized.node'):addon();
// Prime all TLS fixture caches on the main thread and each libuv pool thread.
const diagnostics={before:a.diagnostics()};
for(const n of sizes)a.revenueJson(JSON.stringify(args(n)));
for(const n of sizes)await Promise.all(Array.from({length:16},()=>a.revenueJsonAsync(JSON.stringify(args(n)))));
diagnostics.after=a.diagnostics();
const result={node:process.version,date:new Date().toISOString(),expected,diagnostics,phases:[],mismatches:0};
for(const mode of (process.env.SOAK_MODES||'sync,async').split(','))for(const [size,count,concurrency] of [[1000,100000,mode==='sync'?1:4],[200000,1000,mode==='sync'?1:4]]){
 const text=JSON.stringify(args(size));const p={mode,size,count,concurrency,rss:[],start:Date.now(),verified:0};result.phases.push(p);
 const sample=()=>p.rss.push({calls:p.verified,elapsedMs:Date.now()-p.start,...process.memoryUsage()});sample();
 const stride=size===1000?1000:10;
 for(let i=0;i<count;i+=concurrency){
  const outputs=mode==='sync'?[a.revenueJson(text)]:await Promise.all(Array.from({length:Math.min(concurrency,count-i)},()=>a.revenueJsonAsync(text)));
  for(const output of outputs){assert.equal(hash(output),expected[size],`${mode} ${size} ${i}`);p.verified++;}
  if(p.verified%stride===0){sample();if(p.verified%(stride*10)===0){console.log('soak',mode,size,p.verified,Math.round(process.memoryUsage().rss/1048576)+' MiB');await save(process.env.NAPI_SERIALIZED?'soak-serialized':'soak',result);}}
 }
 sample();p.elapsedMs=Date.now()-p.start;
 p.rssBytes=stats(p.rss.map(r=>r.rss));
 await save(process.env.NAPI_SERIALIZED?'soak-serialized':'soak',result);console.log('done',mode,size,p.elapsedMs,p.rssBytes);
}
// Mixed sizes and overlapping outstanding requests; each worker may see any size.
const mix={calls:0,concurrency:16,rounds:125,rss:[]};result.mixed=mix;
for(let r=0;r<mix.rounds;r++){
 const jobs=Array.from({length:16},(_,i)=>sizes[(r+i)%sizes.length]);
 const values=await Promise.all(jobs.map(n=>a.revenueJsonAsync(JSON.stringify(args(n)))));
 values.forEach((v,i)=>{assert.equal(hash(v),expected[jobs[i]]);mix.calls++;});
 if(r%10===0)mix.rss.push({round:r,...process.memoryUsage()});
}
result.finalDiagnostics=a.diagnostics();await save(process.env.NAPI_SERIALIZED?'soak-serialized':'soak',result);
console.log('mixed',mix.calls,'all SHA-256 match');
