// Requires explicit approval for replacing the stopped Sandbox. Total cap unchanged.
import {checkpointStream} from './checkpoint.mjs';
import {Sandbox} from '@vercel/sandbox';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const dir=import.meta.dirname,art='/tmp/vector-cpu-levels';
const first=JSON.parse(readFileSync(path.join(dir,'controller.json')));
const output=path.join(dir,'final-attempt.json');
const prior=JSON.parse(readFileSync(path.join(dir,'replacement.json')));
const previousMs=first.elapsedMs+prior.elapsedMs;
if(existsSync(output)||!first.stopped||!prior.stopped||first.steps.length||prior.steps.length)throw new Error('Recovery only once, after stopped upload failure');
const lease=250000,margin=30000;
if(previousMs+lease+margin>360000)throw new Error('Combined 0.1 vCPU-hour cap');
const files=[{path:'kernels.tar.gz',content:readFileSync(path.join(art,'kernels.tar.gz'))},{path:'vectors.ts',content:readFileSync('examples/scout/vectors/vectors.ts')},{path:'worker.mjs',content:readFileSync(path.join(dir,'worker.mjs'))}];
const sha=b=>createHash('sha256').update(b).digest('hex');
const report={status:'creating approved replacement',sandbox:null,vcpus:1,leaseMs:lease,marginMs:margin,previousElapsedMs:previousMs,combinedReservationVcpuHours:(previousMs+lease+margin)/3600000,files:Object.fromEntries(files.map(f=>[f.path,sha(f.content)])),steps:[]};
const save=()=>writeFileSync(output,JSON.stringify(report,null,2)+'\n');save();
const begin=Date.now();let sandbox;
const stdout=checkpointStream(path.join(dir,'kernels-stream.json'));

const signal=()=>AbortSignal.timeout(Math.max(1,lease-20000-(Date.now()-begin)));
async function step(label,script){const start=Date.now();const r=await sandbox.runCommand({cmd:'bash',args:['-lc','set -euo pipefail\n'+script],cwd:sandbox.cwd,stdout,stderr:process.stderr,signal:signal()});report.steps.push({label,exitCode:r.exitCode,elapsedMs:Date.now()-start});save();if(r.exitCode!==0)throw new Error(`${label}: ${r.exitCode}`)}
try{
 sandbox=await Sandbox.create({image:'vercel/sandbox/node:24',region:'iad1',resources:{vcpus:1},timeout:lease,persistent:false,signal:AbortSignal.timeout(15000)});
 report.sandbox=sandbox.name;report.replaces=[first.sandbox,prior.sandbox];report.cwd=sandbox.cwd;save();
 await sandbox.writeFiles(files,{signal:signal()});
 await step('verify SDK cwd and commands','pwd\ntest -d .\ncommand -v tar\nnode --version\ntar -xzf kernels.tar.gz\ntest -x ./patched-baseline\ntest -f vectors.ts');
 await step('kernels, startup, fallback','node worker.mjs');
 const remaining=lease-20000-(Date.now()-begin);
 report.kernelFinishedAfterMs=Date.now()-begin;save();
 if(remaining>85000){
  const httpBytes=readFileSync(path.join(art,'http.tar.gz'));report.httpUpload={bytes:httpBytes.length,sha256:sha(httpBytes)};save();
  await sandbox.writeFiles([{path:'http.tar.gz',content:httpBytes}],{signal:signal()});
  await step('HTTP short protocol','tar -xzf http.tar.gz\ncd repo\nnpx -y pnpm@11.1.3 install --frozen-lockfile --reporter=silent\ncd ..\nnode http-worker.mjs');
 }else report.httpSkipped=`${remaining} ms left; require >85000 including transfer/install`;
 report.status='complete';
}catch(e){report.status='failed';report.error=String(e);console.error(e);process.exitCode=1}
finally{
 if(sandbox){
  for(const name of ['kernels.json','http.json'])try{const b=await sandbox.readFileToBuffer({path:name,cwd:sandbox.cwd},{signal:AbortSignal.timeout(5000)});if(b)writeFileSync(path.join(dir,name),b)}catch(e){report[name+'DownloadError']=String(e)}
  try{const stopped=await sandbox.stop({signal:AbortSignal.timeout(10000)});report.stopped=true;report.activeCpuDurationMs=stopped.activeCpuDurationMs}catch(e){report.stopError=String(e);process.exitCode=1}
 }
 if(!existsSync(path.join(dir,'kernels.json'))&&existsSync(path.join(dir,'kernels-stream.json')))writeFileSync(path.join(dir,'kernels.json'),readFileSync(path.join(dir,'kernels-stream.json')));
 report.elapsedMs=Date.now()-begin;report.combinedWallVcpuHours=(previousMs+report.elapsedMs)/3600000;save();console.log(JSON.stringify(report));
}
