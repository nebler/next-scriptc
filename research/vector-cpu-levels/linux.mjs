// Exactly one VM. Prepare all artifacts first; caller supplies OIDC via env file.
import {execFileSync} from 'node:child_process';
import {Sandbox} from '@vercel/sandbox';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const dir=import.meta.dirname,art=process.env.CPU_ARTIFACTS || '/tmp/vector-cpu-levels';
const output=path.join(dir,'controller.json');
if(existsSync(output))throw new Error('Controller exists: do not allocate a second VM');
const sha=b=>createHash('sha256').update(b).digest('hex');
const names=['stock-baseline','stock-v3','stock-dispatch','patched-baseline','patched-v3','patched-dispatch','go-plain','go-v3','go-simd','go-binary','go-binary-v3'];
const files=names.map(name=>({path:name,content:readFileSync(path.join(art,name)),mode:0o755}));
files.push({path:'vectors.ts',content:readFileSync('examples/scout/vectors/vectors.ts')},{path:'worker.mjs',content:readFileSync(path.join(dir,'worker.mjs'))});
const http=existsSync(path.join(art,'http.tar.gz'));
if(http)files.push({path:'http.tar.gz',content:readFileSync(path.join(art,'http.tar.gz'))});
const report={sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),startedAt:new Date().toISOString(),status:'starting',vcpus:1,timeoutMs:330000,budgetVcpuHours:0.1,leaseVcpuHours:330000/3600000,marginMs:30000,files:Object.fromEntries(files.map(f=>[f.path,{sha256:sha(f.content),bytes:f.content.length}])),steps:[]};
const save=()=>writeFileSync(output,JSON.stringify(report,null,2)+'\n');
save();
const begin=Date.now();let sandbox;
async function step(label,script){
 const remaining=300000-(Date.now()-begin);if(remaining<1000)throw new Error('Budget deadline');
 const start=Date.now();const r=await sandbox.runCommand({cmd:'bash',args:['-lc',`set -euo pipefail\n${script}`],cwd:'/vercel/sandbox',stdout:process.stdout,stderr:process.stderr,signal:AbortSignal.timeout(remaining)});
 report.steps.push({label,exitCode:r.exitCode,elapsedMs:Date.now()-start});save();if(r.exitCode!==0)throw new Error(`${label}: ${r.exitCode}`);
}
try{
 sandbox=await Sandbox.create({image:'vercel/sandbox/node:24',region:'iad1',resources:{vcpus:1},timeout:330000,persistent:false,signal:AbortSignal.timeout(15000)});
 report.sandbox=sandbox.name;report.region=sandbox.region;save();console.log('Sandbox',sandbox.name);
 await sandbox.writeFiles(files,{signal:AbortSignal.timeout(30000)});
 await step('kernels, startup, forced fallback','node worker.mjs');
 const remaining=300000-(Date.now()-begin);
 if(http && remaining>65000)await step('HTTP sequential short protocol','tar -xzf http.tar.gz\ncd repo\nnpx -y pnpm@11.1.3 install --frozen-lockfile --reporter=silent\ncd ..\nnode http-worker.mjs');
 else report.httpSkipped=`${http?'Prepared':'No prepared'} HTTP; ${remaining} ms remaining, require >65000 ms`;
 report.status='complete';
}catch(e){report.status='failed';report.error=String(e);process.exitCode=1;console.error(e)}
finally{
 if(sandbox){
  for(const name of ['kernels.json','http.json'])try{const b=await sandbox.readFileToBuffer({path:name},{signal:AbortSignal.timeout(5000)});if(b)writeFileSync(path.join(dir,name),b)}catch(e){report[name+'DownloadError']=String(e)}
  try{const stopped=await sandbox.stop({signal:AbortSignal.timeout(10000)});report.stopped=true;report.activeCpuDurationMs=stopped.activeCpuDurationMs}catch(e){report.stopError=String(e);process.exitCode=1}
 }
 report.elapsedMs=Date.now()-begin;report.observedWallVcpuHours=report.elapsedMs/3600000;save();console.log(JSON.stringify(report));
}
