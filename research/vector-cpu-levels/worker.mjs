// Linux kernel measurements. Fixed order reversed in round two, no parallel work.
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
const n=Number(process.env.CPU_N||100000),d=Number(process.env.CPU_D||768),iterations=Number(process.env.CPU_ITERATIONS||10),warmup=Number(process.env.CPU_WARMUP||5),startupRounds=Number(process.env.CPU_STARTUPS||30);
const natives=['stock-baseline','stock-v3','stock-dispatch','patched-baseline','patched-v3','patched-dispatch'];
const report={node:process.version,cpuinfo:readFileSync('/proc/cpuinfo','utf8'),cpuMax:readFileSync('/sys/fs/cgroup/cpu.max','utf8'),method:{rounds:2,warmup,iterations,n,d,floatTolerance:'1e-10 + 1e-12*abs(reference)',order:'user-prioritized phases: patched natural+Go+Node; binary; remaining kernels. Within each phase round 1 reverses round 0'},runs:[],startup:[],fallback:[]};
const save=()=>writeFileSync('kernels.json',JSON.stringify(report,null,2)+'\n');
console.log('META '+JSON.stringify({...report,runs:undefined,startup:undefined,fallback:undefined}));
const reference=new Map();
function run(command,args,env={}) {
 const start=performance.now();
 const r=spawnSync(command,args,{encoding:'utf8',env:{...process.env,...env},timeout:25000,maxBuffer:2**22});
 if(r.status!==0)throw new Error(`${command}: ${r.error || r.stderr}`);
 return {processMs:performance.now()-start,...JSON.parse(r.stdout)};
}
function check(data,kind){
 const key=kind.startsWith('int8')?'int8':kind,prior=reference.get(key);let maxScoreError=0;
 if(prior){if(JSON.stringify(data.ids)!==JSON.stringify(prior.ids))throw new Error(`ids ${kind}`);
  for(let i=0;i<10;i++){const err=Math.abs(data.scores[i]-prior.scores[i]);maxScoreError=Math.max(maxScoreError,err);if(err>(kind==='float'?1e-10+1e-12*Math.abs(prior.scores[i]):0))throw new Error(`scores ${kind}`);}
 }else reference.set(key,data);
 return maxScoreError;
}
const cases=[];
{
 for(const kind of ['int8-i32','int8-imul','float','binary']){
  cases.push({runtime:'node',kind,cmd:process.execPath,args:['vectors.ts',kind]});
  for(const runtime of natives)cases.push({runtime,kind,cmd:`./${runtime}`,args:[kind]});
  // The shared Go scout has int8/float SIMD; binary uses the original bits.OnesCount32 control.
  if(kind==='binary'){
   for(const runtime of ['go-binary','go-binary-v3'])cases.push({runtime,kind,cmd:`./${runtime}`,args:[kind]});
  }else for(const runtime of ['go-plain','go-v3','go-simd'])cases.push({runtime,kind,cmd:`./${runtime}`,args:[kind==='float'?'float':'int8',runtime==='go-simd'?'simd':'plain']});
 }
}
for(const phase of ['natural-priority','binary','remaining'])for(let round=0;round<2;round++){
 const selected=cases.filter(c=>(c.kind==='int8-i32'&&!c.runtime.startsWith('stock')?'natural-priority':c.kind==='binary'?'binary':'remaining')===phase);
 for(const c of round?selected.reverse():selected){
  const data=run(c.cmd,[...c.args,String(n),String(d),String(iterations),String(warmup)]);
  const maxScoreError=check(data,c.kind);
  const entry={runtime:c.runtime,mode:c.kind,round,maxScoreError,...data};report.runs.push(entry);save();console.log('ROW '+JSON.stringify(entry));
  console.log(`${round} ${c.runtime} ${c.kind}: ${data.medianMs.toFixed(3)} ms`);
 }
}
// Small input fresh execs isolate exec/runtime/init overhead from the 77 MB corpus.
for(let round=0;round<startupRounds;round++)for(const runtime of round%2?[...natives].reverse():natives){
 const data=run(`./${runtime}`,['int8-i32','10','32','1','0']);
 const entry={runtime,round,processMs:data.processMs};report.startup.push(entry);save();console.log('START '+JSON.stringify(entry));
}
// On this v3 host explicitly exercise both copies; all modes must retain parity.
for(const runtime of ['stock-dispatch','patched-dispatch'])for(const level of ['baseline','x86-64-v3'])for(const kind of ['int8-i32','int8-imul','float','binary']){
 const data=run(`./${runtime}`,[kind,String(n),String(d),'3','1'],{SCRIPTC_CPU_LEVEL:level});
 const entry={runtime,level,mode:kind,maxScoreError:check(data,kind),...data};report.fallback.push(entry);save();console.log('FALLBACK '+JSON.stringify(entry));
}
report.status='complete';save();console.log('DONE');
