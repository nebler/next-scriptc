import { readArtifact } from '../lib/artifact.mjs';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {quantile} from '../../examples/demo/bench/heavy/client.mjs';
const load=n=>JSON.parse(readArtifact(`research/vector-vercel/${n}.json`));
const m=load('measurements');assert.equal(m.status,'complete');assert.equal(m.rounds.length,3);
const order=['patched-natural','stock-natural','stock-imul','go-simd','go-plain','node'];
const rows=order.map(variant=>{
 const rs=m.rounds.map(r=>r.rows.find(v=>v.variant===variant));
 const xs=rs.flatMap(r=>r.sequential);assert.equal(xs.length,120);
 for(const x of xs)assert.equal(x.digest,load('reference').responseSha256);
 const c=rs.flatMap(r=>r.concurrent.samples);
 return {variant,n:xs.length,computeP50Ms:quantile(xs.map(x=>x.computeMs),.5),computeP95Ms:quantile(xs.map(x=>x.computeMs),.95),cpuMsPerRequest:xs.reduce((s,x)=>s+x.cpuMs,0)/xs.length,cpuP50Ms:quantile(xs.map(x=>x.cpuMs),.5),rssMiB:quantile(xs.map(x=>x.rss),.5)/1048576,rssMaxMiB:Math.max(...xs.map(x=>x.rss))/1048576,e2eP50Ms:quantile(xs.map(x=>x.e2eMs),.5),e2eP95Ms:quantile(xs.map(x=>x.e2eMs),.95),sets:rs.map(r=>r.summary),concurrent:{n:c.length,computeP50Ms:quantile(c.map(x=>x.computeMs),.5),computeP95Ms:quantile(c.map(x=>x.computeMs),.95),e2eP50Ms:quantile(c.map(x=>x.e2eMs),.5),e2eP95Ms:quantile(c.map(x=>x.e2eMs),.95),sets:rs.map(r=>({count:r.concurrent.samples.length,elapsedMs:r.concurrent.elapsedMs,rps:r.concurrent.requestsPerSecond,countLimited:r.concurrent.countLimited,generatorCpuCores:r.concurrent.generatorCpuCores}))},first:[1,2,3].map(i=>{const kind=variant.startsWith('stock')?'stock':variant.startsWith('patched')?'patched':'node';const d=load(`${kind}-${i}`);return {round:i,...d.first.find(v=>v.variant===variant)}})};
});
const out={rows,requestsIssued:m.requestsIssued,elapsedMs:m.elapsedMs,generatorCpuCores:m.generatorCpuCores};
writeFileSync('research/vector-vercel/summary.json',JSON.stringify(out)+'\n');
const f=x=>x.toFixed(3);
console.log('| Variant | Compute p50 / p95 ms | CPU ms/request | RSS MiB | WAN p50 / p95 ms |');console.log('| --- | ---: | ---: | ---: | ---: |');
for(const r of rows)console.log(`| ${r.variant} | ${f(r.computeP50Ms)} / ${f(r.computeP95Ms)} | ${f(r.cpuMsPerRequest)} | ${f(r.rssMiB)} | ${f(r.e2eP50Ms)} / ${f(r.e2eP95Ms)} |`);
