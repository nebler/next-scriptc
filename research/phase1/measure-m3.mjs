import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import os from 'node:os';
import {createDispatcher} from '../../packages/next-scriptc/src/functions/promotion.mjs';
import {loadPromotion} from '../../packages/next-scriptc/src/functions/promotion-runtime.mjs';
const base=process.cwd()+'/.checks/phase1',out=process.argv[2];
const {revenueCore:js}=await import(base+'/core.mjs');
const {revenueEventsJson}=await import(base+'/events.mjs');
const sizes=[1000,5000,15000,200000],args=Object.fromEntries(sizes.map(n=>[n,['2026-01-01','2026-01-31',revenueEventsJson(n)]]));
const bytes=x=>JSON.stringify(x),hash=x=>createHash('sha256').update(bytes(x)).digest('hex');
const expected=Object.fromEntries(sizes.map(n=>[n,bytes(js(...args[n]))]));
const read=p=>readFileSync(p,'utf8');
const result={at:new Date().toISOString(),node:process.version,arch:process.arch,kernel:os.release(),cpu:os.cpus()[0],expected:Object.fromEntries(sizes.map(n=>[n,hash(js(...args[n]))])),cpuMax:read('/sys/fs/cgroup/cpu.max'),affinity:read('/proc/self/status').match(/Cpus_allowed_list:.*/)[0],throttleBefore:read('/sys/fs/cgroup/cpu.stat'),rows:[],warmups:[],training:[],stages:[],transitions:[],shadowHashes:[],overhead:[]};
const save=()=>writeFileSync(out,JSON.stringify(result)+'\n');
const f={js:n=>js(...args[n])},autos={},starts={};
for(const mode of ['new','construction']){
 const report=JSON.parse(read(base+'/'+mode+'/construction-report.json'));result[mode+'Report']=report;
 if(mode==='construction')assert(report.some(r=>r.name==='revenueCore'&&r.eligible&&r.enabled));
 const id=JSON.parse(read(base+'/'+mode+'/ids.json'))[0];
 const fixed=loadPromotion(base+'/'+mode+'/promotion.node',{mode:'native',log:s=>result.transitions.push(s)});f['native-'+mode]=n=>fixed.dispatch(id,js,args[n]);
 const addon=createRequire(import.meta.url)(base+'/'+mode+'/promotion.node');starts[mode]=[];
 const auto=createDispatcher({cpuNow:addon.threadCpuMs,schemas:JSON.parse(read(base+'/'+mode+'/encodings.json')).functions,log:s=>result.transitions.push({mode,s}),native:(_,input)=>addon.run(0,input),nativeSample:async(_,input)=>{
  starts[mode].push(performance.now());const sample=await addon.runShadow(0,input);assert(!sample.value?.fallback);const n=sizes.find(n=>args[n][2].length===input[2].length);assert.equal(sample.value,expected[n]);result.shadowHashes.push({mode,n,cpuMs:sample.cpuMs,elapsedMs:sample.elapsedMs,sha256:result.expected[n]});return sample;
 }});autos[mode]=auto;f['auto-'+mode]=n=>auto.dispatch(id,js,args[n]);
}
const modes=Object.keys(f),rotate=i=>modes.map((_,k)=>modes[(i+k)%modes.length]);
const drain=async()=>{await new Promise(setImmediate);while(Object.values(autos).some(a=>a.pending))await new Promise(setImmediate);};
function timed(fn,n){const cpu=process.cpuUsage(),t=performance.now(),v=fn(n),ms=performance.now()-t,d=process.cpuUsage(cpu);assert.equal(bytes(v),expected[n]);return {ms,cpuMs:(d.user+d.system)/1000,sha256:result.expected[n]};}
async function measured(mode,n){
 const row=timed(f[mode],n),cpu=process.cpuUsage(),t=performance.now();
 if(mode.startsWith('auto-'))await drain();
 const d=process.cpuUsage(cpu);return {...row,shadowCpuMs:(d.user+d.system)/1000,drainWallMs:performance.now()-t};
}
try{
 for(const n of sizes){const cpu=process.cpuUsage(),t=performance.now();for(let i=1;i<=540;i++){
  // Preserve the actual per-function 50/minute cap while obtaining 26 pairs per bucket.
  if(i%20===0)for(const mode of Object.keys(autos)){const a=starts[mode].filter(t=>performance.now()-t<60000);if(a.length>=50)await new Promise(r=>setTimeout(r,Math.max(1,60001-performance.now()+a[0])));}
  for(const mode of (i%2?['new','construction']:['construction','new'])){result.training.push({mode,n,i,...timed(f['auto-'+mode],n)});await drain();}
 }const d=process.cpuUsage(cpu);result.training.push({n,total:true,wallMs:performance.now()-t,cpuMs:(d.user+d.system)/1000});save();console.log('trained',n);}
 result.decisions=Object.fromEntries(Object.entries(autos).map(([k,a])=>[k,a.snapshot()]));
 for(const n of sizes){for(let i=-15;i<60;i++){for(const mode of rotate(i+15)){const row={section:'bucket',n,i,mode,...await measured(mode,n)};(i<0?result.warmups:result.rows).push(row);}await drain();}save();console.log('bucket',n);}
 const sequence=Array.from({length:600},(_,i)=>i%10<7?1000:i%10<9?5000:200000);
 for(let i=0;i<sequence.length;i++){for(const mode of rotate(i))result.rows.push({section:'mixed',n:sequence[i],i,mode,...await measured(mode,sequence[i])});await drain();}save();
 for(const mode of ['new','construction']){let stage;const dir=base+'/'+mode+'-timing',id=JSON.parse(read(dir+'/ids.json'))[0],d=loadPromotion(dir+'/promotion.node',{mode:'native',onTiming:s=>stage=s,log:()=>{}});for(const n of sizes)for(let i=-15;i<60;i++){stage=null;const row=timed(n=>d.dispatch(id,js,args[n]),n);assert(stage);result.stages.push({mode,n,i,...row,stages:stage});}save();}
 // Paired batched constant-function probe; no workload compute or per-call clock noise.
 const d=createDispatcher({mode:'js',log:()=>{}}),a=[1],noop=x=>x;
 for(let i=-10;i<100;i++){const count=10000,order=i%2?['direct','dispatcher']:['dispatcher','direct'];for(const mode of order){const cpu=process.cpuUsage(),t=performance.now();let value;for(let j=0;j<count;j++)value=mode==='direct'?noop(...a):d.dispatch('probe',noop,a);const ms=(performance.now()-t)/count,u=process.cpuUsage(cpu);assert.equal(value,1);if(i>=0)result.overhead.push({i,mode,ms,cpuMs:(u.user+u.system)/1000/count});}}
 result.final=Object.fromEntries(Object.entries(autos).map(([k,a])=>[k,a.snapshot()]));result.throttleAfter=read('/sys/fs/cgroup/cpu.stat');
}catch(e){result.error=e.stack;throw e;}finally{save();}
