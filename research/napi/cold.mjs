import { readArtifact } from '../lib/artifact.mjs';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {sizes,raw,stats,save} from './common.mjs';
const warm=JSON.parse(readArtifact(raw+'/measure.json'));
const result={node:process.version,date:new Date().toISOString(),samples:10,cases:[],note:'Fresh child process per call; filesystem caches warm; parent spawn wall time includes Node startup and child exit'};
for(const size of sizes)for(const mode of ['node','sidecar','sync','async','serialSync','serialAsync']){
 const c={size,mode,samples:[]};result.cases.push(c);
 for(let i=0;i<result.samples;i++){
  const start=performance.now();const r=spawnSync(process.execPath,[import.meta.dirname+'/cold-child.mjs',mode,String(size)],{encoding:'utf8',timeout:30000});const spawnMs=performance.now()-start;
  assert.equal(r.status,0,r.stderr);const row=JSON.parse(r.stdout.trim());assert.equal(row.sha256,warm.cases.find(c=>c.size===size).expectedSha256);c.samples.push({i,spawnMs,...row});
 }
 c.summary=Object.fromEntries(['loadMs','firstCallMs','totalMs','spawnMs'].map(k=>[k,stats(c.samples.map(r=>r[k]))]));console.log(size,mode,c.summary);await save('cold',result);
}
for(const mode of ['echoSync','echoAsync','serialEchoSync','serialEchoAsync']){
 const c={size:0,mode,samples:[]};result.cases.push(c);
 for(let i=0;i<10;i++){
  const r=spawnSync(process.execPath,[import.meta.dirname+'/cold-child.mjs',mode,'0'],{encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr);c.samples.push({i,...JSON.parse(r.stdout.trim())});
 }
 c.summary=Object.fromEntries(['loadMs','firstCallMs','totalMs'].map(k=>[k,stats(c.samples.map(r=>r[k]))]));await save('cold',result);
}
