import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import os from 'node:os';
import {parseSourceText} from '../../packages/scriptc-promote/src/functions/source-text.mjs';
import {encodeArguments,decodeResult} from '../../packages/scriptc-promote/src/functions/promotion-encodings.mjs';
import {createDispatcher} from '../../packages/scriptc-promote/src/functions/promotion.mjs';
import {aggregate} from '../../.checks/e2/reference.mjs';
const base=process.cwd()+'/.checks/e2',addon=createRequire(import.meta.url)(base+'/promotion.node');
const schemas=JSON.parse(readFileSync(base+'/encodings.json')).functions,id=Object.keys(schemas)[0];
// Same three-field projection as E1; identity is deliberately omitted. The
// benchmark's native fixture reads exactly these fields and returns scalars.
const schema={...schemas[id],opaque:{inputs:[{kind:'array',value:{kind:'object',fields:[['amount',{kind:'number'}],['weight',{kind:'number'}],['enabled',{kind:'boolean'}]]}},{kind:'number'}],result:{kind:'object',fields:[['sum',{kind:'number'}],['count',{kind:'number'}]]}}};
const data={node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0].model,load:os.loadavg(),rows:[],snapshots:[],transitions:[],parse:[]};
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const time=fn=>{const cpu=process.cpuUsage(),t=performance.now(),value=fn(),wall=performance.now()-t,u=process.cpuUsage(cpu);return {value,wall,cpu:(u.user+u.system)/1000};};
for(const n of [600,6000,60000]){
 const text=JSON.stringify(Array.from({length:n},(_,i)=>({amount:i%1000,weight:1+i%5,enabled:i%3!==0,category:'c'+i%8,label:'record '+i,region:'eu',sequence:i,timestamp:1700000000+i})));
 const old=JSON.parse(text),fresh=parseSourceText(JSON.parse,text),expected=aggregate(old,2);
 for(let i=-10;i<60;i++){
  for(const name of i%2?['encoder','text']:['text','encoder']){
   const args=[name==='text'?fresh:old,2],e=time(()=>encodeArguments(schema,args));
   assert.equal(name==='text',e.value[0]===text);
   const native=time(()=>addon.run(0,e.value)),decode=time(()=>decodeResult(schema,native.value.value,[]));
   assert.deepEqual(decode.value,expected);
   const js=time(()=>aggregate(...args));assert.deepEqual(js.value,expected);
   if(i>=0)data.rows.push({n,i,name,encode:e.wall,encodeCPU:e.cpu,total:e.wall+native.wall+decode.wall,totalCPU:e.cpu+native.cpu+decode.cpu,js:js.wall,jsCPU:js.cpu,bytes:e.value[0].length,...native.value.timings});
  }
 }
 // Acquisition overhead is separate from per-call economics, but included in
 // the one-parse/one-call comparison. Capture is not free.
 for(let i=-2;i<10;i++){
  const plain=time(()=>JSON.parse(text)),capture=time(()=>parseSourceText(JSON.parse,text));
  if(i>=0)data.parse.push({n,i,plain:plain.wall,capture:capture.wall});
 }
 // Separate dispatchers avoid quota pauses; defaults and thresholds unchanged.
 for(const name of ['encoder','text']){
  const args=[name==='text'?fresh:old,2];
  const d=createDispatcher({schemas:{[id]:schema},timing:true,cpuNow:addon.threadCpuMs,native:(_,a)=>addon.run(0,a),nativeSample:(_,a)=>addon.runShadow(0,a),log:s=>data.transitions.push({n,name,message:s})});
  for(let i=0;i<700;i++){assert.deepEqual(d.dispatch(id,aggregate,args),expected);await new Promise(setImmediate);while(d.pending)await new Promise(setImmediate);}
  data.snapshots.push({n,name,state:d.snapshot()});
 }
 console.log('finished',n);
}
data.summary=[600,6000,60000].flatMap(n=>['encoder','text'].map(name=>{const rows=data.rows.filter(r=>r.n===n&&r.name===name),p=data.parse.filter(r=>r.n===n);return {n,name,...Object.fromEntries(['encode','encodeCPU','nativeDecode','compute','total','totalCPU','js','jsCPU','bytes'].map(key=>[key,median(rows.map(r=>r[key]))])),plainParse:median(p.map(r=>r.plain)),captureParse:median(p.map(r=>r.capture))};}));
writeFileSync(process.argv[2]??'research/source-text-passthrough/local.json',JSON.stringify(data)+'\n');
console.log(JSON.stringify(data.summary,null,2));
