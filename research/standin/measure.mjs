import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import os from 'node:os';
process.env.NEXT_SCRIPTC_VERCEL='1';
const s=new URL('../../.checks/standin/',import.meta.url).pathname;
const {revenue}=await import(s+'stage/revenue-js.mjs');
const {serialize}=await import(s+'stage/json.mjs');
const {createSidecar}=await import(s+'stage/sidecar.mjs');
const {callNative}=await import(s+'stage/client.mjs');
const correctness=process.argv[2]==='correctness';
const addon=createRequire(import.meta.url)(s+(correctness?'x64':'arm64')+'/revenue.node');
const boundaryAddon=correctness?null:createRequire(import.meta.url)(s+'arm64/boundary.node');
const out=process.argv[3],hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const result={at:new Date().toISOString(),node:process.version,arch:process.arch,os:os.release(),cpu:os.cpus()[0],warmups:15,n:60,cases:[],correctness,cpuset:readFileSync('/proc/self/status','utf8').match(/Cpus_allowed_list:.*/)[0],cpuMax:readFileSync('/sys/fs/cgroup/cpu.max','utf8'),memoryMax:readFileSync('/sys/fs/cgroup/memory.max','utf8')};
const save=()=>writeFileSync(out,JSON.stringify(result,null,2)+'\n');
const sidecar=correctness?null:createSidecar(s+'arm64/functions');
const echoSidecar=correctness?null:createSidecar(s+'arm64/echo-functions');
// schedstat counts actual task execution in nanoseconds (not 10ms stat ticks).
function childCpu(child=sidecar){if(!child)return 0;return readdirSync(`/proc/${child.state.pid}/task`).reduce((sum,tid)=>sum+Number(readFileSync(`/proc/${child.state.pid}/task/${tid}/schedstat`,'utf8').split(' ')[0])/1e6,0);}
function throttle(){return readFileSync('/sys/fs/cgroup/cpu.stat','utf8');}
try{
 if(sidecar){await sidecar.port();await echoSidecar.port();assert(childCpu()>0,'schedstat accounting unavailable');assert(childCpu(echoSidecar)>0,'probe schedstat accounting unavailable');}
 for(const size of [1000,5000,15000,200000]){
  const args=()=>['2026-01-01','2026-01-31',size,false];
  const c={size,rows:[],boundary:[],start:new Date().toISOString(),throttleBefore:throttle()};result.cases.push(c);
  let expected,encoded;
  const modes=correctness?['node','sync','async']:['node','sidecar','sync','async'];
  const f={node:()=>revenue(...args()),sidecar:async()=>callNative(await sidecar.port(),'revenue',args()),sync:()=>JSON.parse(addon.revenueJson(serialize(args()))),async:async()=>JSON.parse(await addon.revenueJsonAsync(serialize(args())))};
  for(let i=-15;i<(correctness?3:60);i++)for(let k=0;k<modes.length;k++){
   const mode=modes[(i+15+k)%modes.length],childBefore=childCpu(),cpu=process.cpuUsage(),begin=performance.now();
   const value=mode==='sync'?f[mode]():await f[mode]();
   const ms=performance.now()-begin,d=process.cpuUsage(cpu),childMs=childCpu()-childBefore,sha256=hash(value);
   if(expected===undefined){expected=sha256;encoded=JSON.stringify(value);}assert.equal(sha256,expected);
   c.rows.push({i,mode,ms,cpuMs:(d.user+d.system)/1000+(mode==='sidecar'?childMs:0),parentCpuMs:(d.user+d.system)/1000,childCpuMs:childMs,sha256});
  }
  if(correctness)c.rows=c.rows.map(({i,mode,sha256})=>({i,mode,sha256}));
  c.expectedSha256=expected;
  if(!correctness){
   const b={node:async()=>JSON.parse(encoded),sidecar:async()=>callNative(await echoSidecar.port(),'echo',args()),sync:()=>JSON.parse(boundaryAddon.echo(serialize(args()))),async:async()=>JSON.parse(await boundaryAddon.echoAsync(serialize(args())))};
   // Node's application has no serialized boundary; its boundary is zero in the model.
   for(let i=-15;i<60;i++)for(let k=0;k<modes.length;k++){
    const mode=modes[(i+15+k)%modes.length],childBefore=childCpu(echoSidecar),cpu=process.cpuUsage(),begin=performance.now();
    const value=mode==='sync'?b[mode]():await b[mode]();
    const ms=performance.now()-begin,d=process.cpuUsage(cpu),childMs=childCpu(echoSidecar)-childBefore;assert.equal(hash(value),expected);
    c.boundary.push({i,mode,ms,cpuMs:(d.user+d.system)/1000+(mode==='sidecar'?childMs:0),childCpuMs:childMs});
   }
  }
  c.throttleAfter=throttle();c.end=new Date().toISOString();save();console.log(size,'verified');
 }
} catch(error){result.error=error.stack;save();throw error;}finally{sidecar?.stop();echoSidecar?.stop();}
