import { readArtifact } from '../lib/artifact.mjs';
import {writeFile} from 'node:fs/promises';
const out='research/wasm-simd-workerd',r={};
for(const mode of ['workerd','workerd-repeat','workerd-patched','node','node-patched']){const x=JSON.parse(readArtifact(out+'/raw/'+mode+'.json','utf8'));r[mode]=x.cases.map(c=>({kind:c.kind,size:c.size,sha256:c.sha256,failures:c.failures,variants:Object.fromEntries(['js','stock','scalar','simd'].filter(v=>c[v]).map(v=>[v,{cpuMs:c[v]?.cpuMs.mean,p50:c[v]?.wallMs.p50,p95:c[v]?.wallMs.p95,memoryBytes:c.meta[v]?.memoryBytes}]))}));}
await writeFile(out+'/raw/summary.json',JSON.stringify(r,null,2));console.log(JSON.stringify(r,null,2));
