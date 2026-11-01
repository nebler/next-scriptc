import {writeFile,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import os from 'node:os';
import {createRequire} from 'node:module';
import {root,scratch,raw,sizes,args,hash,addon,stats,save} from './common.mjs';
import {serialize} from '../../packages/next-scriptc/src/functions/json.ts';
import {createSidecar} from '../../packages/next-scriptc/src/functions/sidecar.mjs';
import {callNative} from '../../packages/next-scriptc/src/functions/client.mjs';
const {revenue}=await import(scratch+'/stage/revenue-js.ts');
const a=addon();
const serial=createRequire(import.meta.url)(scratch+'/revenue-serialized.node');
const result={date:new Date().toISOString(),node:process.version,execPath:process.execPath,os:os.release(),arch:process.arch,cpu:os.cpus()[0],cpuCount:os.cpus().length,warmups:50,samples:300,method:'Rotating mode order per sample; sequential, full strict argument/result boundary; hashes outside timing',cases:[]};
const expected={};
for(const size of sizes){const value=await revenue(...args(size));expected[size]=hash(JSON.stringify(value));await writeFile(raw+'/revenue-'+size+'-result.json',JSON.stringify(value)+'\n');}
const sidecar=createSidecar(scratch+'/functions');
try {
const port=await sidecar.port();
for(const size of sizes){
 const input=args(size),c={size,expectedSha256:expected[size],modes:{}};result.cases.push(c);
 const modes={node:()=>revenue(...input),sidecar:()=>callNative(port,'revenue',input),sync:()=>JSON.parse(a.revenueJson(serialize(input))),async:async()=>JSON.parse(await a.revenueJsonAsync(serialize(input))),serialSync:()=>JSON.parse(serial.revenueJson(serialize(input))),serialAsync:async()=>JSON.parse(await serial.revenueJsonAsync(serialize(input)))};
 const names=Object.keys(modes);for(const name of names)c.modes[name]={warmup:[],samples:[]};
 for(let i=-result.warmups;i<result.samples;i++){
  const offset=(i+result.warmups)%names.length;
  for(let k=0;k<names.length;k++){
   const name=names[(offset+k)%names.length];
   const start=performance.now();
   // Sync stays synchronous within the timed interval; async paths include await.
   let value=(name==='sync'||name==='serialSync')?modes[name]():await modes[name]();
   const ms=performance.now()-start;
   const sha256=hash(JSON.stringify(value));assert.equal(sha256,expected[size],`${name} ${size} ${i}`);
   const row={i,ms,sha256};c.modes[name][i<0?'warmup':'samples'].push(row);
  }
 }
 for(const name of names)c.modes[name].wallMs=stats(c.modes[name].samples.map(r=>r.ms));
 console.log(size,Object.fromEntries(names.map(name=>[name,c.modes[name].wallMs])));await save('measure',result);
}
}finally{sidecar.stop();}
// Isolate only N-API + UTF-8 marshalling + runtime export; no JSON validator/parse.
const boundary={warmups:1000,samples:20000,cases:[]};
for(const text of ['x','é😀\u0000漢字','x'.repeat(24000)]){
 const c={inputBytes:Buffer.byteLength(text),sync:{warmup:[],samples:[]},async:{warmup:[],samples:[]},serialSync:{warmup:[],samples:[]},serialAsync:{warmup:[],samples:[]}};boundary.cases.push(c);
 for(let i=-boundary.warmups;i<boundary.samples;i++)for(const mode of ['sync','async','serialSync','serialAsync']){
  const start=performance.now();const value=mode==='sync'?a.echo(text):mode==='async'?await a.echoAsync(text):mode==='serialSync'?serial.echo(text):await serial.echoAsync(text);const ms=performance.now()-start;
  assert.equal(value,text);c[mode][i<0?'warmup':'samples'].push(ms);
 }
 for(const mode of ['sync','async','serialSync','serialAsync'])c[mode].wallMs=stats(c[mode].samples);
 console.log('boundary',c.inputBytes,c.sync.wallMs,c.async.wallMs);await save('boundary',boundary);
}
