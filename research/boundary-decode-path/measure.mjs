import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire,stripTypeScriptTypes} from 'node:module';
import assert from 'node:assert/strict';
import os from 'node:os';
import {encodeArguments,decodeResult,canonicalResult,argumentTable} from '../../packages/scriptc-promote/src/functions/promotion-encodings.mjs';
import {createDispatcher} from '../../packages/scriptc-promote/src/functions/promotion.mjs';
import {fuzzFunction} from '../../packages/scriptc-promote/src/functions/promotion-fuzz.mjs';
import {inputShapes} from '../../packages/scriptc-promote/src/functions/promotion-inputs.mjs';
const require=createRequire(import.meta.url),index=JSON.parse(readFileSync('.checks/e4/index.json')),out={node:process.version,host:os.cpus()[0],load:os.loadavg(),rows:[],fuzz:[],lanes:[],ir:[]};
const median=a=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)];
const timed=f=>{const cpu=process.cpuUsage(),start=performance.now(),value=f(),wall=performance.now()-start,u=process.cpuUsage(cpu);return {value,wall,cpu:(u.user+u.system)/1000};};
if(process.env.E4_RESUME)Object.assign(out,JSON.parse(readFileSync('research/boundary-decode-path/results.json')));
for(const item of index){
 if(process.env.E4_RESUME&&out.ir.some(r=>r.name===item.name&&r.mode===item.mode))continue;
 const ir=readFileSync(item.dir+'/entry.lib.ll','utf8');const calls=ir.split('\n').filter(s=>/call .*@scr_json_parse(?:_schema)?\(/.test(s));out.ir.push({name:item.name,mode:item.mode,calls,helpers:ir.match(/^define internal ptr @sc_jp_[\s\S]*?^}/gm)??[],native:item.native,entry:readFileSync(item.dir+'/entry.ts','utf8'),module:readFileSync(item.dir+'/module-0.ts','utf8')});
 if(item.name==='specialized')continue;
 const addon=require(item.dir+'/promotion.node'),schemas=JSON.parse(readFileSync(item.dir+'/encodings.json')).functions,schema=schemas[item.fn.id];
 const js=(await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(item.name==='e1'?readFileSync('research/boundary-encoders/fixture.ts','utf8'):item.native)).toString('base64')))[item.fn.name];
 const fuzz=fuzzFunction({js,native:a=>{const r=addon.run(0,a);return r?.fallback?r:r.value;},schema,shapes:inputShapes({native:item.native},item.fn)},{seed:20935,budgetMs:10000,maxCases:128});assert.notEqual(fuzz.status,'mismatch',JSON.stringify(fuzz));out.fuzz.push({name:item.name,mode:item.mode,...fuzz});
 for(const n of [600,6000,60000]){
  const rows=Array.from({length:n},(_,i)=>item.name==='event'?{event:'page',timestamp:1700000000+i,session:'session'+i%100,duration:i%1000,country:'DE',mobile:i%3===0,tags:['a','b']}:item.name==='union'?{amount:i%1000}:{category:'c'+i%8,amount:i%1000/10,weight:1+i%5,enabled:i%3!==0,label:'record '+i,region:'eu',sequence:i,timestamp:1700000000+i});
  const args=item.name==='guarded'?[JSON.stringify(rows)]:item.name==='e1'?[rows,1.25]:[rows];const samples=[];
  for(let i=-8;i<32;i++){
   const e=timed(()=>encodeArguments(schema,args)),call=timed(()=>addon.run(0,e.value)),d=timed(()=>decodeResult(schema,call.value.value,argumentTable(e.value))),ref=timed(()=>js(...args));assert.equal(canonicalResult(d.value,schema,argumentTable(e.value)),canonicalResult(ref.value,schema,argumentTable(e.value)));
   if(i>=0)samples.push({encode:e.wall,nativeDecode:call.value.timings.nativeDecode,total:e.wall+call.wall+d.wall,totalCPU:e.cpu+call.cpu+d.cpu,js:ref.wall,jsCPU:ref.cpu});
  }
  out.rows.push({name:item.name,mode:item.mode,n,samples,medians:Object.fromEntries(Object.keys(samples[0]).map(k=>[k,median(samples.map(s=>s[k]))]))});
  if(['e1','guarded'].includes(item.name)){
   const d=createDispatcher({schemas,timing:true,cpuNow:addon.threadCpuMs,native:(_,a)=>addon.run(0,a),nativeSample:(_,a)=>addon.runShadow(0,a),log:()=>{}});
   for(let i=0;i<700;i++){d.dispatch(item.fn.id,js,args);await new Promise(setImmediate);while(d.pending)await new Promise(setImmediate);}
   out.lanes.push({name:item.name,mode:item.mode,n,state:d.snapshot()});
  }
 }
 console.log('measured',item.name,item.mode);writeFileSync('research/boundary-decode-path/results.json',JSON.stringify(out,null,2));
}
