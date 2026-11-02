import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const output=[];
for(const path of ['/numeric?n=1000&lane=worker','/numeric?n=1000&lane=worker&compute=wasm','/trivial','/binding','/wasm-state']){
 const r=await fetch('http://127.0.0.1:18991'+path),text=await r.text();output.push({url:path,status:r.status,path:r.headers.get('x-co1-path'),compute:r.headers.get('x-co1-compute'),text});
 assert.equal(r.status,200);if(path.includes('compute=wasm'))assert.equal(r.headers.get('x-co1-compute'),'wasm');
}
writeFileSync('results/smoke.json',JSON.stringify(output,null,2));
