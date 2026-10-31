// Offline audit; regenerates tables without allocating compute or dropping data.
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const dir=import.meta.dirname;
const get=n=>JSON.parse(readFileSync(`${dir}/${n}.json`));
const data=get('kernels'),first=get('controller'),controller=get('final-attempt'),builds=get('builds');
assert.equal(data.status,'complete');assert.equal(controller.stopped,true);assert.ok(controller.combinedWallVcpuHours<=.1);
const median=xs=>{const s=xs.slice().sort((a,b)=>a-b);return s.length%2?s[s.length>>1]:(s[s.length/2-1]+s[s.length/2])/2};
const kinds=['int8-i32','int8-imul','float','binary'];
const summary={method:data.method,rows:[],startup:[],process:[],fallback:[],budget:{failedUpload:first,failedCwd:get('replacement'),finalAttempt:controller}};
for(const mode of kinds){
 const runs=data.runs.filter(r=>r.mode===mode), runtimes=[...new Set(runs.map(r=>r.runtime))];
 const p50=Object.fromEntries(runtimes.map(runtime=>[runtime,median(runs.filter(r=>r.runtime===runtime).flatMap(r=>r.times))]));
 const base=runs.find(r=>r.runtime==='node');
 for(const r of runs){assert.deepEqual(r.ids,base.ids);for(let i=0;i<10;i++)assert.ok(Math.abs(r.scores[i]-base.scores[i])<=(mode==='float'?1e-10+1e-12*Math.abs(base.scores[i]):0));}
 for(const runtime of runtimes){
  const group=runs.filter(r=>r.runtime===runtime);assert.equal(group.length,2);
  assert.deepEqual(group.map(r=>r.round).sort(),[0,1]);
  const times=group.flatMap(r=>r.times).sort((a,b)=>a-b);assert.equal(times.length,20);
  const ms=p50[runtime];
  summary.rows.push({mode,runtime,ms,p95Ms:times[Math.ceil(.95*times.length)-1],ratioGoSIMD:mode==='binary'?null:ms/p50['go-simd'],ratioGoPlain:ms/p50[mode==='binary'?'go-binary':'go-plain'],ratioNode:ms/p50.node,maxScoreError:Math.max(...group.map(r=>r.maxScoreError)),processMs:median(group.map(r=>r.processMs)),roundMs:group.map(r=>median(r.times))});
 }
}
for(const b of builds.builds){
 const samples=data.startup.filter(r=>r.runtime===b.name).map(r=>r.processMs);assert.equal(samples.length,30);
 summary.startup.push({runtime:b.name,bytes:b.bytes,medianMs:median(samples),p95Ms:samples.slice().sort((a,b)=>a-b)[28],samples});
}
for(const r of data.fallback){const ref=data.runs.find(x=>x.mode===r.mode);assert.deepEqual(r.ids,ref.ids);for(let i=0;i<10;i++)assert.ok(Math.abs(r.scores[i]-ref.scores[i])<=(r.mode==='float'?1e-10+1e-12*Math.abs(ref.scores[i]):0));summary.fallback.push({runtime:r.runtime,level:r.level,mode:r.mode,ms:median(r.times)});}
try{
 const http=get('http');assert.equal(http.status,'complete');
 const ref=http.variants[0].rows[0].first.body;
 summary.http=http.variants.flatMap(v=>v.rows.map(r=>{assert.equal(r.first.body,ref);assert.equal(r.times.length,20);return {level:v.level,runtime:r.runtime,path:r.path,ms:median(r.times),p95Ms:r.times.slice().sort((a,b)=>a-b)[18],cpuMsPerRequest:r.cpuMs/20,rssAfter:r.rssAfter,firstMs:r.first.elapsedMs,initMs:r.first.initMs}}));
}catch(e){if(e.code!=='ENOENT')throw e;}
writeFileSync(`${dir}/summary.json`,JSON.stringify(summary,null,2)+'\n');
const f=x=>x===null?'—':x.toFixed(3);
let md='| Mode | Runtime | p50 ms | p95 ms | / Go SIMD | / Go plain | / Node |\n|---|---|---:|---:|---:|---:|---:|\n';
for(const r of summary.rows)md+=`| ${r.mode} | ${r.runtime} | ${f(r.ms)} | ${f(r.p95Ms)} | ${f(r.ratioGoSIMD)} | ${f(r.ratioGoPlain)} | ${f(r.ratioNode)} |\n`;
md+='\n| Native binary | Stripped bytes | Tiny fresh process p50 ms | p95 ms |\n|---|---:|---:|---:|\n';
for(const r of summary.startup)md+=`| ${r.runtime} | ${r.bytes} | ${f(r.medianMs)} | ${f(r.p95Ms)} |\n`;
if(summary.http){md+='\n| HTTP runtime | CPU policy | p50 ms | p95 ms | CPU ms/request | Tree RSS after MiB |\n|---|---|---:|---:|---:|---:|\n';for(const r of summary.http)md+=`| ${r.runtime} | ${r.level} | ${f(r.ms)} | ${f(r.p95Ms)} | ${f(r.cpuMsPerRequest)} | ${f(r.rssAfter/2**20)} |\n`;}
writeFileSync(`${dir}/tables.md`,md);
console.log(md);
