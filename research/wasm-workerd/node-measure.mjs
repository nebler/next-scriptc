import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
import {instantiate} from './src/bridge.mjs';
import {cases,stats} from './cases.mjs';
const root=path.resolve(import.meta.dirname,'../..'),scratch=root+'/.checks/wasm-workerd';
const {serialize}=await import(scratch+'/stage/json.ts');
const warmups=Number(process.env.WARMUPS||30),samples=Number(process.env.SAMPLES||120);
const result={date:new Date().toISOString(),node:process.version,v8:process.versions.v8,arch:process.arch,warmups,samples,cases:[]};
const out=process.env.BENCH_OUT||import.meta.dirname+'/raw/node.json';
for(const spec of cases.filter(x=>!process.env.KIND||x.kind===process.env.KIND)) {
 const c={kind:spec.kind,size:spec.size,warmup:[],samples:[],failures:[]};result.cases.push(c);
 try {
  const js=(await import(scratch+'/stage/'+(spec.kind==='revenue'?'revenue-js':spec.kind)+'.ts'))[spec.kind];
  const api=instantiate(new WebAssembly.Module(await readFile(scratch+'/'+spec.kind+'.wasm')));
  const body=JSON.stringify(spec.args);
  const expected=(await readFile(import.meta.dirname+'/raw/'+spec.kind+'-'+spec.size+'-result.json','utf8')).trimEnd();
  c.sha256=createHash('sha256').update(expected).digest('hex');
  for(let i=-warmups;i<samples;i++)for(const variant of i%2?['wasm','js']:['js','wasm']) {
   const cpu=process.cpuUsage(),start=performance.now();
   const args=JSON.parse(body);
   const value=variant==='js'?await js(...args):JSON.parse(api.run(serialize(args)));
   const text=JSON.stringify(value);
   const ms=performance.now()-start,usage=process.cpuUsage(cpu);
   assert.equal(text,expected);
   const hash=createHash('sha256').update(text).digest('hex');assert.equal(hash,c.sha256);
   const row={i,variant,ms,cpuMs:(usage.user+usage.system)/1000,sha256:hash};
   (i<0?c.warmup:c.samples).push(row);
  }
  c.memoryBytes=api.memoryBytes();c.wasiCalls=api.calls;
  for(const variant of ['js','wasm'])c[variant]={wallMs:stats(c.samples.filter(x=>x.variant===variant).map(x=>x.ms)),cpuMs:stats(c.samples.filter(x=>x.variant===variant).map(x=>x.cpuMs))};
  c.cpuSpeedup=c.js.cpuMs.mean/c.wasm.cpuMs.mean;
  console.log(spec.kind,spec.size,'CPU JS/wasm',c.js.cpuMs.mean.toFixed(3),c.wasm.cpuMs.mean.toFixed(3),'speedup',c.cpuSpeedup.toFixed(3));
 }catch(e){c.failures.push(String(e.stack||e));console.error(e);}
 await writeFile(out,JSON.stringify(result,null,2)+'\n');
}
