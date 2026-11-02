import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import os from 'node:os';
import * as modern from '../../packages/scriptc-promote/src/functions/promotion-encodings.mjs';
import * as legacy from '../../packages/scriptc-promote/test/support/legacy-encodings.mjs';
import {createDispatcher} from '../../packages/scriptc-promote/src/functions/promotion.mjs';
const lane=process.argv[2],out=process.argv[3],base=process.cwd()+'/.checks/e1/'+lane;
const addon=createRequire(import.meta.url)(base+'/promotion.node'),columnAddon=createRequire(import.meta.url)(base+'-columns/promotion.node');
const schemas=JSON.parse(readFileSync(base+'/encodings.json')).functions,id=Object.keys(schemas)[0],schema=schemas[id];
const {aggregate}=await import('../../.checks/e1/reference.mjs');
const data={node:process.version,platform:process.platform,arch:process.arch,cpus:os.cpus()[0],rows:[],transitions:[],snapshots:[],host:os.loadavg(),schema};
const d=createDispatcher({schemas,timing:true,cpuNow:addon.threadCpuMs,log:s=>data.transitions.push(s),native:(_,a)=>addon.run(0,a),nativeSample:(_,a)=>addon.runShadow(0,a)});
const save=()=>writeFileSync(out,JSON.stringify(data)+'\n');
const timed=fn=>{const cpu=process.cpuUsage(),t=performance.now(),value=fn(),wall=performance.now()-t,u=process.cpuUsage(cpu);return {value,wall,cpu:(u.user+u.system)/1000};};
for(const n of [600,6000,60000]){
 const rows=Array.from({length:n},(_,i)=>({category:'c'+i%8,amount:i%1000/10,weight:1+i%5,enabled:i%3!==0,label:'record '+i,region:'eu',sequence:i,timestamp:1700000000+i})),args=[rows,1.25],expected=aggregate(...args);
 const col={amount:rows.map(r=>r.amount),weight:rows.map(r=>r.weight),enabled:rows.map(r=>r.enabled)},columnWire=JSON.stringify(col);
 for(let i=-10;i<60;i++){
  for(const name of (i%2?['legacy','stringify','generated']:['generated','stringify','legacy'])){
   const api=name==='generated'?modern:legacy,e=timed(()=>api.encodeArguments(schema,args,name==='stringify')),call=timed(()=>addon.run(0,e.value)),decode=timed(()=>modern.decodeResult(schema,call.value.value,api.argumentTable(e.value))),canon=timed(()=>modern.canonicalResult(decode.value,schema,api.argumentTable(e.value)));
   assert.equal(canon.value,modern.canonicalResult(expected,schema,api.argumentTable(e.value)));
   const js=timed(()=>aggregate(...args));assert.deepEqual(js.value,expected);
   if(i>=0)data.rows.push({n,i,name,encode:e.wall,encodeCPU:e.cpu,native:call.wall,totalCPU:e.cpu+call.cpu+decode.cpu,total:e.wall+call.wall+decode.wall,js:js.wall,jsCPU:js.cpu,decode:decode.wall,canonical:canon.wall,bytes:e.value[0].length,...call.value.timings});
  }
  const c=columnAddon.run(0,[columnWire,1.25]);assert.deepEqual(JSON.parse(c.value),{sum:expected.sum,count:expected.count});
  if(i>=0)data.rows.push({n,i,name:'columns',bytes:columnWire.length,...c.timings});
 }
 // Default D1/D2 policy and quota. 700 calls cover staggered sampling.
 for(let i=0;i<700;i++){assert.deepEqual(d.dispatch(id,aggregate,args),expected);await new Promise(setImmediate);while(d.pending)await new Promise(r=>setTimeout(r,1));}
 data.snapshots.push({n,state:structuredClone(d.snapshot())});save();console.log('finished',lane,n);
 if(n!==60000)await new Promise(r=>setTimeout(r,63000));
}
save();
