import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import assert from 'node:assert/strict';
const dir=import.meta.dirname+'/raw';let warm=0,cold=0,failures=0;const coldInstances=[];
for(const prefix of ['attempt-1/','attempt-2/',''])for(const name of readdirSync(dir+'/'+prefix)){
 if(!/^\d+-(bench|cold-)/.test(name))continue;
 const r=JSON.parse(readFileSync(dir+'/'+prefix+name));
 if(r.status!==200){failures++;assert.equal(prefix,'attempt-1/');continue;}
 assert.equal(r.result.region,'iad1');assert.equal(r.result.node,'v24.22.2');assert.equal(r.result.arch,'x64');assert.match(r.headers['x-vercel-id'],/::iad1::/);
 if(name.includes('bench')){
  for(const mode of ['node','sidecar','sync','async']){
   const rows=r.result.rows.filter(x=>x.mode===mode);assert.equal(rows.length,75);assert.equal(rows.filter(x=>x.i>=0).length,60);
   assert.equal(new Set(rows.map(x=>x.sha256)).size,1);for(const row of rows)assert.equal(row.sha256,r.result.expectedSha256);
  }
  warm+=r.result.rows.length;
 }else{cold++;if(prefix==='')coldInstances.push(r.result.instance);}
}
assert.equal(warm,2400);assert.equal(cold,17);assert.equal(failures,1);assert.equal(new Set(coldInstances).size,8);
const secret=parseEnv(readFileSync('/Users/noah/code/next-scriptc/.env.local','utf8')).VERCEL_AUTOMATION_BYPASS_SECRET;
function scan(path){for(const entry of readdirSync(path,{withFileTypes:true})){const p=path+'/'+entry.name;if(entry.isDirectory())scan(p);else assert(!readFileSync(p).includes(Buffer.from(secret)),'secret persisted');}}
scan(import.meta.dirname);assert(!readFileSync(import.meta.dirname+'/../use-native-napi-vercel.md').includes(Buffer.from(secret)));
const evidence={at:new Date().toISOString(),verifiedWarmCalls:warm,successfulColdCalls:cold,retainedFailures:failures,finalColdDistinctInstances:new Set(coldInstances).size,secretScan:'passed'};
writeFileSync(dir+'/verification.json',JSON.stringify(evidence,null,2)+'\n');console.log(evidence);
