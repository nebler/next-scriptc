import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createDispatcher as after} from '../../packages/scriptc-promote/src/functions/promotion.mjs';
import {createDispatcher as before} from '../../.checks/d3/before-promotion.mjs';
const base=process.cwd()+'/.checks/d3',addon=createRequire(import.meta.url)(base+'/native/promotion.node'),ids=JSON.parse(readFileSync(base+'/native/ids.json'));
const modules={};for(const lane of ['off','before','after'])modules[lane]=await import(base+'/'+lane+'.mjs');
const result=[];
for(const lane of ['before','after']){
 const d=(lane==='before'?before:after)({cpuNow:addon.threadCpuMs,nativeSample:async()=>({value:'4',cpuMs:100,elapsedMs:100}),log:()=>{},jsSamples:1,sampleEvery:1,policy:{recheckEvery:1000000000}});
 globalThis.d3Dispatcher=d;
 for(let i=0;i<26;i++){modules[lane].scalarWeight(1);while(d.pending)await new Promise(setImmediate);}
 assert.equal(d.snapshot()[ids[0]].buckets[0].state,'js-final');
 let sum=0;const args=[1];
 for(let i=-20;i<100;i++)for(const route of (i%2?['direct','dispatcher','wrapper']:['wrapper','dispatcher','direct'])){
  const start=addon.threadCpuMs(),count=100000;
  for(let j=0;j<count;j++)sum+=route==='direct'?modules.off.scalarWeight(1):route==='wrapper'?modules[lane].scalarWeight(1):d.dispatch(ids[0],modules.off.scalarWeight,args);
  if(i>=0)result.push({lane,route,ns:(addon.threadCpuMs()-start)*1e6/count});
 }
 assert.ok(sum>0);
}
writeFileSync(process.argv[2],JSON.stringify(result));
