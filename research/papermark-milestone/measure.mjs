// Harness only: upstream source is loaded in memory from the external pinned checkout.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import os from 'node:os';
import {loadPromotion} from '../../packages/next-scriptc/src/functions/promotion-runtime.mjs';
const require=createRequire(import.meta.url),ts=require('../../packages/next-scriptc/node_modules/typescript');
const root='/Users/noah/code/papermark-gate',base='/Users/noah/code/papermark-gate-slice/.pm1',out=new URL('./raw.json',import.meta.url);
const hash=s=>createHash('sha256').update(s).digest('hex');
function load(file,imports={}){const text=fs.readFileSync(file,'utf8');const js=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const mod={exports:{}};new Function('require','module','exports',js)(s=>{assert(Object.hasOwn(imports,s),'unexpected import '+s);return imports[s];},mod,mod.exports);return mod.exports;}
const playback=load(root+'/lib/video-analytics/playback.ts'),file=base+'/normal/promotion.node',id=JSON.parse(fs.readFileSync(new URL('./build.json',import.meta.url))).construction.find(x=>x.name==='documentViewDistribution').id;
const result={at:new Date().toISOString(),node:process.version,arch:process.arch,cpu:os.cpus()[0],cpuMax:fs.readFileSync('/sys/fs/cgroup/cpu.max','utf8'),affinity:fs.readFileSync('/proc/self/status','utf8').match(/Cpus_allowed_list:.*/)[0],transitions:[],windows:[],rows:[],stages:[]};
const auto=loadPromotion(file,{log:s=>result.transitions.push({s,at:new Date().toISOString()})});
globalThis[Symbol.for('next-scriptc.functions.promotion')]=new Map([[file,auto]]);
const wrappedModule=await import(base+'/wrapped.mjs'),wrapped=wrappedModule.documentViewDistribution,addon=require(file),clock=addon.threadCpuMs;
assert.equal(typeof clock,'function');
const sizes=[600,6000,60000],encoded=Object.fromEntries(sizes.map(n=>[n,JSON.stringify(Array.from({length:n},(_,i)=>({timestamp:new Date(1761955200000+i*10000).toISOString(),view_id:`v${Math.floor(i/60)}`,event_type:'played',start_time:i%60*10,end_time:i%60*10+10,playback_rate:1,volume:1,is_muted:0,is_focused:1,is_fullscreen:0})))]));
let n,distribution;
function handler(fn,module=playback){return load(root+'/pages/api/teams/[teamId]/documents/[id]/video-analytics.ts',{
'@/pages/api/auth/[...nextauth]':{authOptions:{}},'next-auth/next':{getServerSession:async()=>({user:{id:'u'}})},'@/lib/api/rbac/guard':{enforceDocumentMemberScope:async()=>false},'@/lib/prisma':{document:{findFirst:async()=>({versions:[{length:600}]})}},'@/lib/tinybird/pipes':{getVideoEventsByDocument:async()=>({data:JSON.parse(encoded[n])})},'@/lib/video-analytics/playback':{...module,documentViewDistribution:(...args)=>{const c=process.cpuUsage(),t=clock(),w=performance.now();const v=fn(...args);const d=process.cpuUsage(c);distribution={cpuMs:(d.user+d.system)/1000,threadMs:clock()-t,wallMs:performance.now()-w};return v;}}}).default;}
const handlers={off:handler(playback.documentViewDistribution),auto:handler(wrapped,wrappedModule)},res={status(c){assert.equal(c,200);return this;},json:JSON.stringify},req={method:'GET',query:{teamId:'t',id:'d'}};
const expected={};for(n of sizes){const output=await handlers.off(req,res);assert.equal(JSON.parse(output).overall.total_watch_time,n*10);expected[n]=output;}
result.expected=Object.fromEntries(sizes.map(n=>[n,{sha256:hash(expected[n]),bytes:Buffer.byteLength(expected[n])}]));
async function drain(){while(auto.pending)await new Promise(r=>setTimeout(r,1));}
async function measured(lane,size,section,i){n=size;const cpu=process.cpuUsage(),t=clock(),w=performance.now();const value=await handlers[lane](req,res);const caller=process.cpuUsage(cpu),callerThread=clock()-t,callerWall=performance.now()-w,dc=process.cpuUsage(),dw=performance.now(),dt=clock();await drain();const d=process.cpuUsage(dc);const row={section,i,n,lane,cpuMs:(caller.user+caller.system)/1000,threadMs:callerThread,wallMs:callerWall,drainCpuMs:(d.user+d.system)/1000,drainThreadMs:clock()-dt,drainWallMs:performance.now()-dw,distribution};assert.equal(value,expected[n]);row.sha256=hash(value);result.rows.push(row);}
const save=()=>fs.writeFileSync(out,JSON.stringify(result));
async function window(name){fs.writeFileSync(new URL('./window-request',import.meta.url),name);while(fs.existsSync(new URL('./window-request',import.meta.url)))await new Promise(r=>setTimeout(r,100));result.windows.push({name,at:new Date().toISOString(),containerLoad:os.loadavg(),host:fs.readFileSync(new URL('./host-check.json',import.meta.url),'utf8')});console.log('window',name);}
try{
 for(const size of sizes){await window('training-'+size);for(let i=0;i<540;i++){
 // Default quota is 50/minute per function. Pause between buckets rather than override it.
 for(const lane of (Math.floor(i/5)%2?['auto','off']:['off','auto']))await measured(lane,size,'training',i);
 }result['afterTraining'+size]=auto.snapshot();save();console.log('trained',size);if(size!==60000){save();await window('quota-wait-'+size);for(let j=0;j<3;j++)await new Promise(r=>setTimeout(r,21000));}}
 for(const size of sizes){await window('settled-'+size);for(let i=0;i<200;i++)for(const lane of (Math.floor(i/5)%2?['auto','off']:['off','auto']))await measured(lane,size,'settled',i);save();}
 await window('mixed');for(let i=0;i<600;i++){const size=i%10<7?600:i%10<9?6000:60000;for(const lane of (Math.floor(i/5)%2?['auto','off']:['off','auto']))await measured(lane,size,'mixed',i);}save();
 await window('stage-probe');let stages;const fixed=loadPromotion(base+'/timing/promotion.node',{mode:'native',onTiming:s=>stages=s,log:()=>{}});for(const size of sizes){n=size;const events=JSON.parse(encoded[n]);for(let i=-10;i<60;i++){stages=null;const value=fixed.dispatch(id,playback.documentViewDistribution,[events,600]);assert.deepEqual(value,playback.documentViewDistribution(events,600));if(i>=0){assert(stages);result.stages.push({n,...stages});}}}
 result.final=auto.snapshot();assert(Object.values(result.final).every(f=>f.buckets.every(b=>b.state!=='demoted')));result.throttle=fs.readFileSync('/sys/fs/cgroup/cpu.stat','utf8');
}catch(e){result.error=e.stack;throw e;}finally{save();}
