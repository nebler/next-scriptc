import assert from 'node:assert/strict';
import {client,fixture,sample,variants,save,load,quantile} from './common.mjs';
const protocol={warmup:10,count:40,concurrency:4,concurrentWarmup:4,concurrentCap:16,concurrentDurationMs:2000,rounds:3};
const report={startedAt:new Date().toISOString(),protocol,rounds:[],status:'running'};
const name=process.argv[2]??'measurements';
const cpu=process.cpuUsage(),started=performance.now();
const summary=xs=>({count:xs.length,computeP50Ms:quantile(xs.map(x=>x.computeMs),.5),computeP95Ms:quantile(xs.map(x=>x.computeMs),.95),e2eP50Ms:quantile(xs.map(x=>x.e2eMs),.5),e2eP95Ms:quantile(xs.map(x=>x.e2eMs),.95),cpuP50Ms:quantile(xs.map(x=>x.cpuMs),.5),cpuMeanMs:xs.reduce((s,x)=>s+x.cpuMs,0)/xs.length,rssMedianMiB:quantile(xs.map(x=>x.rss),.5)/1048576,instances:[...new Set(xs.map(x=>x.instance))]});
try {
 for(let r=1;r<=3;r++){
  const configs=['node','stock','patched'].flatMap(kind=>{const d=load(`${kind}-${r}`);assert.equal(d.status,'complete');return variants(kind,d.url)});
  const row={round:r,rows:configs.map(v=>({...v,warmup:[],sequential:[],concurrent:{warmup:[],samples:[]}}))};report.rounds.push(row);save(name,report);
  const pools=new Map(configs.map(v=>[v.variant,client.agent(v.url,1)]));
  const order=r%2===1?[...row.rows]:[...row.rows].reverse();
  try {
   for(let i=0;i<50;i++){
    const rotation=i%order.length,rotated=[...order.slice(rotation),...order.slice(0,rotation)];
    for(const v of rotated){
     const response=sample(await client.request(v.url,{...fixture,path:v.path},pools.get(v.variant)));
     (i<10?v.warmup:v.sequential).push(response);
    }
    save(name,report);
   }
  }finally{for(const p of pools.values())p.destroy();}
  for(const v of order){
   const diagnosticPool=client.agent(v.url,1);
   try { v.afterSequential=await client.request(v.url,{path:v.diagnostic,diagnostic:true,responseType:'application/json'},diagnosticPool); } finally { diagnosticPool.destroy(); }
   v.summary=summary(v.sequential);console.log(JSON.stringify({round:r,variant:v.variant,...v.summary}));
   const pool=client.agent(v.url,4),c=v.concurrent;
   try{
    c.warmup=await Promise.all(Array.from({length:4},async()=>sample(await client.request(v.url,{...fixture,path:v.path},pool))));
    let dispatched=0;const start=performance.now(),cpu=process.cpuUsage();let failure;
    await Promise.all(Array.from({length:4},async()=>{
     while(!failure&&dispatched<16&&performance.now()-start<2000){dispatched++;try{c.samples.push(sample(await client.request(v.url,{...fixture,path:v.path},pool)));}catch(e){failure??=e;}}
    }));
    c.elapsedMs=performance.now()-start;c.dispatched=dispatched;c.countLimited=dispatched===16;c.durationLimitMs=2000;
    const used=process.cpuUsage(cpu);c.generatorCpuMs=(used.user+used.system)/1000;c.generatorCpuCores=c.generatorCpuMs/c.elapsedMs;
    c.summary=summary(c.samples);c.requestsPerSecond=c.samples.length*1000/c.elapsedMs;
    if(failure)throw failure;
    c.status='complete';
   }finally{pool.destroy();save(name,report);}
  }
  row.status='complete';save(name,report);
 }
 report.status='complete';
}catch(e){report.status='failed';report.error=e.message;throw e;}
finally{
 report.finishedAt=new Date().toISOString();report.elapsedMs=performance.now()-started;
 const used=process.cpuUsage(cpu);report.generatorCpuMs=(used.user+used.system)/1000;report.generatorCpuCores=report.generatorCpuMs/report.elapsedMs;report.requestsIssued=client.issued;save(name,report);
}
