// Isolate main-thread contention without changing native work or CPU affinity.
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const base=process.cwd()+'/.checks/phase1';
const {revenueCore:js}=await import(base+'/core.mjs');
const {revenueEventsJson}=await import(base+'/events.mjs');
const addon=createRequire(import.meta.url)(base+'/new/promotion.node');
const rows=[];
for(const n of [5000,200000]){
 const args=['2026-01-01','2026-01-31',revenueEventsJson(n)],expected=JSON.stringify(js(...args));
 for(let i=-3;i<20;i++)for(const kind of (i%2?['timer','busy','js']:['js','busy','timer'])){
  let done=false,jsCpuMs=0,jsWallMs=0,jsCalls=0;
  const promise=addon.runShadow(0,args).then(s=>{done=true;return s;});
  while(!done){
   if(kind==='js'){const wall=performance.now(),cpu=addon.threadCpuMs();assert.equal(JSON.stringify(js(...args)),expected);jsCpuMs+=addon.threadCpuMs()-cpu;jsWallMs+=performance.now()-wall;jsCalls++;}
   await new Promise(r=>kind==='timer'?setTimeout(r,1):setImmediate(r));
  }
  const sample=await promise;assert.equal(sample.value,expected);
  if(i>=0)rows.push({n,i,kind,cpuMs:sample.cpuMs,elapsedMs:sample.elapsedMs,jsCpuMs,jsWallMs,jsCalls});
 }
}
writeFileSync(process.argv[2],JSON.stringify({at:new Date().toISOString(),rows,cpuMax:readFileSync('/sys/fs/cgroup/cpu.max','utf8')})+'\n');
