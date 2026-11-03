// Audit retained raw results, including warmups. No sample filtering.
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=process.argv[2],checks=[];
for(const file of readdirSync(root).filter(f=>f.endsWith('.json.gz'))){
 const x=JSON.parse(gunzipSync(readFileSync(resolve(root,file))));
 if(!Array.isArray(x.blocks)||!x.profile)continue;
 assert.equal(x.error,undefined,file);assert.equal(x.node,'v24.22.0',file);
 assert.equal(x.blocks.length,6,file);
 let responses=0;
 for(const b of [...x.blocks,...(x.warmups||[]),x.profileWarmup,x.profile].filter(Boolean)){
  assert.deepEqual(Object.keys(b.statuses),['200'],file);
  assert.equal(b.statuses['200'],b.n,file);responses+=b.n;
 }
 if(x.equivalence)assert.equal(x.equivalence.normalizedEqual??x.equivalence.equal,true,file);
 checks.push({file,blocks:x.blocks.length,responses,all200:true});
}
writeFileSync(resolve(root,'audit.json'),JSON.stringify(checks,null,2));
console.log(checks);
