import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const directory=process.env.FINAL_OUTPUT ?? 'research/use-native-final';
const load=name=>JSON.parse(readFileSync(`${directory}/${name}.json`));
const q=(xs,p)=>xs.toSorted((a,b)=>a-b)[Math.ceil(xs.length*p)-1];
const stats=xs=>({count:xs.length,functionP50:q(xs.map(s=>s.computeMs),.5),functionP95:q(xs.map(s=>s.computeMs),.95),e2eP50:q(xs.map(s=>s.totalMs),.5),e2eP95:q(xs.map(s=>s.totalMs),.95),renderP50:q(xs.map(s=>s.renderMs),.5),functionMax:Math.max(...xs.map(s=>s.computeMs)),e2eMax:Math.max(...xs.map(s=>s.totalMs)),instances:[...new Set(xs.map(s=>s.targetInstance))]});
const references=load('reference'),batches=[],deployments=[],pairRows=[],all=[];
for(const pair of [1,2]) {
 const run=load(`pair-${pair}-run`);assert.equal(run.status,'complete');
 for(const variant of ['node','native']) {
  const d=load(`${variant}-${pair}`);assert.equal(d.status,'complete');deployments.push(d);
  const s=d.first.samples[0];assert.equal(s.phase,'measured');assert.equal(s.resultSha256,references[5000]);
  batches.push(d.first);
 }
 const samples=[];
 for(const b of run.batches) {const batch=load(b.name);assert.equal(batch.status,'complete');batches.push(batch);samples.push(...batch.samples);}
 for(const size of run.protocol.sizes) for(const variant of ['node','native']) {
  const target=`report-${variant}-${pair}-${size}`,xs=samples.filter(s=>s.target===target);
  assert.equal(xs.filter(s=>s.phase==='warmup').length,10);const measured=xs.filter(s=>s.phase==='measured');assert.equal(measured.length,60);
  for(const s of xs) assert.equal(s.resultSha256,references[size]);
  pairRows.push({pair,size,variant,...stats(measured)});all.push(...measured.map(s=>({...s,size,variant,pair})));
 }
}
for(const b of batches) {assert.equal(b.region,'iad1');for(const s of b.samples) {assert.equal(s.status,200);assert(s.valid);assert.equal(s.cache,'MISS');assert.match(s.vercelId,/^iad1::iad1::/);if(s.target.includes('native'))assert.equal(s.attempts,'1');}}
assert.equal(new Set(deployments.map(d=>d.sourceCommit)).size,1);
for(const d of deployments.filter(d=>d.variant==='native')) {
 const samples=batches.flatMap(b=>b.samples).filter(s=>s.target.startsWith(`report-${d.label}-`));
 assert.equal(new Set(samples.map(s=>s.pid)).size,1);
 assert.equal(new Set(samples.map(s=>s.targetInstance)).size,1);
 assert.equal(d.first.samples[0].readyBeforeCall,'true');
} 
const rows=[];
for(const size of [1000,2000,3000,5000,15000,200000])for(const variant of ['node','native'])rows.push({size,variant,...stats(all.filter(s=>s.size===size&&s.variant===variant))});
const first=deployments.map(d=>({label:d.label,url:d.url,...d.first.samples[0]}));
const cpu=batches.reduce((v,b)=>({cpuMs:v.cpuMs+b.cpu.userMs+b.cpu.systemMs,wallMs:v.wallMs+b.elapsedMs}),{cpuMs:0,wallMs:0});
const out={protocol:{pairs:2,perPair:{warmups:10,measured:60},pooledPerRow:120,percentile:'nearest rank',firstSize:5000,retries:0},sourceCommit:deployments[0].sourceCommit,rows,pairRows,first,validation:{responses:batches.reduce((n,b)=>n+b.samples.length,0),measured:all.length,allCacheMiss:true,allIad1:true,allHashesMatch:true,clientInstances:[...new Set(batches.map(b=>b.instance))],warmSocketsReused:all.filter(s=>s.reusedSocket).length,cpu:{...cpu,cores:cpu.cpuMs/cpu.wallMs},maxInvocationMs:Math.max(...batches.map(b=>b.elapsedMs)),maxInvocationCores:Math.max(...batches.map(b=>b.cpu.cores))}};
writeFileSync(`${directory}/summary.json`,JSON.stringify(out)+'\n');
console.log(JSON.stringify(out,null,2));
