// Follow-up: precompile on Mac using Zig and @scriptc/runtime-linux-x64-gnu 0.4.6.
// Combined leases use measured first elapsed wall time + this hard 50s timeout.
import {execFileSync} from 'node:child_process';
import { Sandbox } from '@vercel/sandbox';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const dir=import.meta.dirname;
const before=JSON.parse(readFileSync(path.join(dir,'linux-provenance.json')));
if(!before.stopped || before.elapsedMs+50000 > 180000) throw new Error('combined 0.05 vCPU-hour budget');
execFileSync(process.env.VECTOR_GO || '/opt/homebrew/bin/go',['build','-o',path.join(dir,'.artifacts/rss-linux'),path.join(dir,'rss.go')],{env:{...process.env,GOOS:'linux',GOARCH:'amd64',CGO_ENABLED:'0'}});
const source=readFileSync(path.join(dir,'vectors.ts'));
const binaries=['release','speed','go'];
const files=binaries.map(runtime=>({path:`vectors-${runtime}`,content:readFileSync(path.join(dir,'.artifacts',runtime==='go'?'vectors-go-linux':`vectors-linux-${runtime}`)),mode:0o755}));
files.push({path:'vectors.ts',content:source},{path:'rss',content:readFileSync(path.join(dir,'.artifacts/rss-linux')),mode:0o755});
const started=Date.now();
const sandbox=await Sandbox.create({image:'vercel/sandbox/node:24',resources:{vcpus:1},timeout:50000,persistent:false});
const provenance={sandbox:sandbox.name,vcpus:1,timeoutMs:50000,sourceSha256:createHash('sha256').update(source).digest('hex'),binarySha256:Object.fromEntries(files.filter(f=>f.path!=='vectors.ts').map(f=>[f.path,createHash('sha256').update(f.content).digest('hex')])),previousElapsedMs:before.elapsedMs,combinedAllocatedVcpuHoursUpperBound:(before.elapsedMs+50000)/3600000};
try{
 console.log(`Sandbox ${sandbox.name}; combined allocation ceiling ${provenance.combinedAllocatedVcpuHoursUpperBound}`);
 await sandbox.writeFiles(files);
 const r=await sandbox.runCommand({cmd:'bash',cwd:sandbox.cwd,args:['-lc',`set -euo pipefail
 node --version > versions.txt
 uname -a >> versions.txt
 grep 'model name' /proc/cpuinfo >> versions.txt
 : > results.ndjson
 for runtime in node release speed go; do
  if [ "$runtime" = node ]; then cmd="node vectors.ts"; else cmd="./vectors-$runtime"; fi
  ./rss $cmd int8-imul 100000 768 30 10 >> results.ndjson
 done
 `],stdout:process.stdout,stderr:process.stderr,signal:AbortSignal.timeout(40000)});
 if(r.exitCode!==0)throw new Error(`measure ${r.exitCode}`);
 const runs=(await sandbox.readFileToBuffer({path:'results.ndjson'})).toString().trim().split('\n').map((line,index)=>({...JSON.parse(line),runtime:['node','release','speed','go'][index]}));
 for(const r of runs)if(JSON.stringify(r.ids)!==JSON.stringify(runs[0].ids)||JSON.stringify(r.scores)!==JSON.stringify(runs[0].scores))throw new Error('parity');
 const versions=(await sandbox.readFileToBuffer({path:'versions.txt'})).toString();
 writeFileSync(path.join(dir,'linux-imul-results.json'),JSON.stringify({provenance,versions,runs},null,2)+'\n');
 provenance.status='complete';
} catch(error){provenance.status='failed';provenance.error=String(error);console.error(error);process.exitCode=1}
finally{
 try{const stopped=await sandbox.stop({signal:AbortSignal.timeout(10000)});provenance.stopped=true;provenance.activeCpuDurationMs=stopped.activeCpuDurationMs}catch(error){provenance.stopError=String(error);process.exitCode=1}
 provenance.elapsedMs=Date.now()-started;
 provenance.combinedActualWallHours=(before.elapsedMs+provenance.elapsedMs)/3600000;
 writeFileSync(path.join(dir,'linux-imul-provenance.json'),JSON.stringify(provenance,null,2)+'\n');
 console.log(JSON.stringify(provenance));
}
