import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {stats} from './cases.mjs';
const read=async file=>JSON.parse(await readFile(import.meta.dirname+'/raw/'+file,'utf8'));
const w=await read('workerd.json'),n=await read('node.json'),a=await read('artifacts.json'),native=await read('native.json'),abi=await read('abi-probes.json');
const report={workerdCases:[],nodeCases:[],artifacts:a.artifacts.map(({name,rawBytes,gzipBytes,simdInstructions})=>({name,rawBytes,gzipBytes,simdInstructions})),failures:[]};
for(const c of w.cases) {
 assert.equal(c.failures.length,0);
 assert.equal(c.warmup.length,w.warmups*2);assert.equal(c.samples.length,w.batches*w.batchSize*2);assert.equal(c.cpuBatches.length,w.batches*2);
 const expected=(await readFile(import.meta.dirname+'/raw/'+c.kind+'-'+c.size+'-result.json','utf8')).trimEnd();
 assert.equal(createHash('sha256').update(expected).digest('hex'),c.sha256);
 for(const row of [...c.warmup,...c.samples])assert.equal(row.sha256,c.sha256);
 for(const b of c.cpuBatches){assert.ok(b.after.user_ns>=b.before.user_ns);assert.ok(b.cpuMs>0);assert.ok(b.before.timebase_numer>0&&b.before.timebase_denom>0);assert.equal(b.before.user_ns,b.before.user_ticks*b.before.timebase_numer/b.before.timebase_denom);}
 report.workerdCases.push({kind:c.kind,size:c.size,sha256:c.sha256,jsCPU:c.js.cpuMsPerRequest,wasmCPU:c.wasm.cpuMsPerRequest,cpuSpeedup:c.cpuSpeedup,jsWall:c.js.wallMs,wasmWall:c.wasm.wallMs,memory:c.meta.wasm.memoryBytes});
}
for(const c of n.cases) {
 assert.equal(c.failures.length,0);assert.equal(c.warmup.length,n.warmups*2);assert.equal(c.samples.length,n.samples*2);
 assert.equal(c.sha256,w.cases.find(x=>x.kind===c.kind&&x.size===c.size).sha256);
 for(const row of [...c.warmup,...c.samples])assert.equal(row.sha256,c.sha256);
 report.nodeCases.push({kind:c.kind,size:c.size,js:c.js,wasm:c.wasm,cpuSpeedup:c.cpuSpeedup});
}
for(const c of native.cases){
 assert.equal(c.warmup.length,native.warmups);assert.equal(c.samples.length,native.samples);
 const expected=w.cases.find(x=>x.kind===c.kind&&x.size===c.size).sha256;
 for(const row of [...c.warmup,...c.samples])assert.equal(row.sha256,expected);
}
assert.equal(native.cases.length,3);assert.equal(a.scriptc,'0.4.6');assert.equal(a.runtime,'0.4.6');
assert.ok(abi.find(x=>x.name==='object-abi').diagnostics.includes('SC4003'));
assert.ok(abi.find(x=>x.name==='reachable-async').diagnostics.includes('SC1090'));
assert.ok(abi.find(x=>x.name==='no-wasi-imports').error.includes('wasi_snapshot_preview1'));
assert.equal(abi.filter(x=>x.name==='utf8-json-boundary'&&x.exactMatch).length,3);
report.nativeCases=native.cases.map(({kind,size,wallMs})=>({kind,size,wallMs}));
assert.equal(w.cases.length,7);assert.equal(n.cases.length,7);
report.realisticKindsPassingTwofold=[...new Set(report.workerdCases.filter(c=>c.cpuSpeedup>=2&&c.kind!=='vector').map(c=>c.kind))];
report.verdict=report.realisticKindsPassingTwofold.length>=2?'GO':'NO-GO';
await writeFile(import.meta.dirname+'/raw/summary.json',JSON.stringify(report,null,2)+'\n');
console.log(report.verdict,'all complete result hashes match, every warmup and measured sample retained');
