import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createDispatcher as after} from '../../packages/scriptc-promote/src/functions/promotion.mjs';
import {createDispatcher as before} from '../../.checks/d3/before-promotion.mjs';
const base=process.cwd()+'/.checks/d3',require=createRequire(import.meta.url),addon=require(base+'/native/promotion.node');
const ids=JSON.parse(readFileSync(base+'/native/ids.json')),schemas=JSON.parse(readFileSync(base+'/native/encodings.json')).functions;
const modules={};for(const lane of ['off','before','after'])modules[lane]=await import(base+'/'+lane+'.mjs');
const result={rows:[],snapshots:[],micro:[],transitions:[],node:process.version,affinity:readFileSync('/proc/self/status','utf8').match(/Cpus_allowed_list:.*/)[0]};
const save=()=>writeFileSync(process.argv[2],JSON.stringify(result));
const drain=async d=>{while(d.pending)await new Promise(r=>setTimeout(r,1));};
for(const n of [600,6000,60000]){
 const args=JSON.stringify(Array.from({length:n},(_,i)=>i%97)),expected=modules.off.nestedAggregation(args),ds={};
 for(const lane of ['before','after'])ds[lane]=(lane==='before'?before:after)({schemas,cpuNow:addon.threadCpuMs,native:(id,input)=>addon.run(ids.indexOf(id),input),nativeSample:(id,input)=>addon.runShadow(ids.indexOf(id),input),log:s=>result.transitions.push({lane,n,s})});
 for(const section of ['training','steady']){
  const count=section==='training'?700:100;
  for(let i=0;i<count;i++)for(const lane of (i%2?['off','before','after']:['after','before','off'])){
   const d=ds[lane];globalThis.d3Dispatcher=d;
   const cpu=process.cpuUsage(),thread=addon.threadCpuMs(),wall=performance.now();const value=modules[lane].nestedAggregation(args);
   const threadMs=addon.threadCpuMs()-thread,wallMs=performance.now()-wall,u=process.cpuUsage(cpu);
   if(d)await drain(d);const inclusive=process.cpuUsage(cpu);
   assert.equal(value,expected);result.rows.push({n,section,i,lane,threadMs,wallMs,cpuMs:(u.user+u.system)/1000,inclusiveCpuMs:(inclusive.user+inclusive.system)/1000});
  }
  result.snapshots.push({n,section,states:JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(ds).map(([k,d])=>[k,d.snapshot()]))))});save();
 }
}
// Settled-JS dispatcher cost, thread CPU, batched to amortize clock calls.
for(const lane of ['before','after']){
 const d=(lane==='before'?before:after)({cpuNow:addon.threadCpuMs,nativeSample:async()=>({value:'1',cpuMs:100,elapsedMs:100}),log:()=>{},sampleEvery:1,jsSamples:1,policy:{samples:24,required:19,coldSamples:2,recheckEvery:1000000000}});
 for(let i=0;i<26;i++){d.dispatch('micro',x=>x,[1]);await drain(d);}assert.equal(d.snapshot().micro.buckets[0].state,'js-final');
 const js=x=>x,args=[1];let sum=0;
 for(let i=-10;i<50;i++)for(const route of (i%2?['direct','dispatch']:['dispatch','direct'])){
  const start=addon.threadCpuMs(),count=100000;
  for(let j=0;j<count;j++)sum+=route==='direct'?js(...args):d.dispatch('micro',js,args);
  if(i>=0)result.micro.push({lane,route,ns:(addon.threadCpuMs()-start)*1e6/count});
 }
 assert.ok(sum>0);
}
save();console.log('nested done');
