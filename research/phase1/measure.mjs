import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import os from 'node:os';
import {createDispatcher} from '../../packages/next-scriptc/src/functions/promotion.mjs';
import {loadPromotion} from '../../packages/next-scriptc/src/functions/promotion-runtime.mjs';
const base=process.cwd()+'/.checks/phase1';
const {revenueCore:js}=await import(base+'/core.mjs');
const {revenueEventsJson}=await import(base+'/events.mjs');
const sizes=[1000,5000,15000,200000],args=Object.fromEntries(sizes.map(n=>[n,['2026-01-01','2026-01-31',revenueEventsJson(n)]]));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex'),expected=Object.fromEntries(sizes.map(n=>[n,hash(js(...args[n]))]));
const result={at:new Date().toISOString(),node:process.version,arch:process.arch,kernel:os.release(),cpu:os.cpus()[0],expected,inputBytes:Object.fromEntries(sizes.map(n=>[n,Buffer.byteLength(args[n][2])])),cpuMax:readFileSync('/sys/fs/cgroup/cpu.max','utf8'),memoryMax:readFileSync('/sys/fs/cgroup/memory.max','utf8'),affinity:readFileSync('/proc/self/status','utf8').match(/Cpus_allowed_list:.*/)[0],throttleBefore:readFileSync('/sys/fs/cgroup/cpu.stat','utf8'),rows:[],warmups:[],training:[],stages:[],transitions:[]};
const out=process.argv[2],save=()=>writeFileSync(out,JSON.stringify(result)+'\n');
const id=mode=>JSON.parse(readFileSync(base+'/'+mode+'/ids.json'))[0];
const fixed={};for(const mode of ['old','new']){const d=loadPromotion(base+'/'+mode+'/promotion.node',{mode:'native',log:s=>result.transitions.push(s)});fixed[mode]=n=>d.dispatch(id(mode),js,mode==='old'?[args[n]]:args[n]);}
const native=createRequire(import.meta.url)(base+'/new/promotion.node');
result.shadowHashes=[];
const encoding=JSON.parse(readFileSync(base+'/new/encodings.json'));
const auto=createDispatcher({schemas:encoding.functions,log:s=>result.transitions.push(s),native:(_,input)=>native.run(0,input),nativeAsync:async(_,input)=>{const value=await native.runAsync(0,input);const n=sizes.find(n=>args[n][2].length===input[2].length);setImmediate(()=>{const sha256=hash(JSON.parse(value));assert.equal(sha256,expected[n]);result.shadowHashes.push({n,sha256});});return value;}});
const f={js:n=>js(...args[n]),...fixed,auto:n=>auto.dispatch(id('new'),js,args[n])};
const drain=async()=>{await new Promise(setImmediate);while(auto.pending)await new Promise(setImmediate);await new Promise(setImmediate);};
function timed(fn,n){const cpu=process.cpuUsage(),t=performance.now(),v=fn(n),ms=performance.now()-t,d=process.cpuUsage(cpu);assert.equal(hash(v),expected[n]);return {ms,cpuMs:(d.user+d.system)/1000,sha256:expected[n]};}
try{
 // Capture learning calls and asynchronous shadow costs; none enter steady-state cells.
 for(const n of sizes){const cpu=process.cpuUsage(),t=performance.now();for(let i=1;i<=120;i++){result.training.push({n,i,...timed(f.auto,n)});await drain();}const d=process.cpuUsage(cpu);result.training.push({n,total:true,wallMs:performance.now()-t,cpuMs:(d.user+d.system)/1000});}
 result.decisions=auto.snapshot();
 for(const n of sizes){for(let i=-15;i<60;i++)for(let k=0;k<4;k++){const mode=['js','old','new','auto'][(i+15+k)%4];const row={section:'bucket',n,i,mode,...timed(f[mode],n)};(i<0?result.warmups:result.rows).push(row);}save();console.log('bucket',n);}
 // Actual interleaved 600-call stream per mode: 420 / 120 / 60.
 const sequence=Array.from({length:600},(_,i)=>i%10<7?1000:i%10<9?5000:200000);
 for(let i=0;i<sequence.length;i++)for(let k=0;k<4;k++){const mode=['js','old','new','auto'][(i+k)%4],n=sequence[i];result.rows.push({section:'mixed',n,i,mode,...timed(f[mode],n)});}
 save();
 for(const mode of ['old','new']){let stage;const d=loadPromotion(base+'/'+mode+'-timing/promotion.node',{mode:'native',onTiming:s=>stage=s,log:s=>result.transitions.push(s)});for(const n of sizes)for(let i=-15;i<60;i++){stage=null;const row=timed(n=>d.dispatch(id(mode+'-timing'),js,mode==='old'?[args[n]]:args[n]),n);assert(stage);result.stages.push({mode,n,i,...row,stages:stage});}save();}
 result.final=auto.snapshot();result.throttleAfter=readFileSync('/sys/fs/cgroup/cpu.stat','utf8');
}catch(e){result.error=e.stack;throw e;}finally{save();}
