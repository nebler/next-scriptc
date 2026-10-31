// Run with Node 24 --env-file=/Users/noah/code/next-scriptc/.env.local.
// Only public source/binary fixtures are uploaded; credentials stay in caller.
import { Sandbox } from '@vercel/sandbox';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const dir = import.meta.dirname;
const source = readFileSync(path.join(dir,'vectors.ts'));
const goSource = readFileSync(path.join(dir,'vectors.go'));
const go = process.env.VECTOR_GO || '/opt/homebrew/bin/go';
execFileSync(go,['build','-o',path.join(dir,'.artifacts/vectors-go-linux'),path.join(dir,'vectors.go')], {env:{...process.env,GOOS:'linux',GOARCH:'amd64',CGO_ENABLED:'0'}});
const started = Date.now();
// Hard lease: 1 * 170 seconds < 0.05 vCPU-hours including preparation.
const sandbox = await Sandbox.create({ image:'vercel/sandbox/node:24',resources:{vcpus:1},timeout:170000,persistent:false });
const provenance = {sandbox:sandbox.name,image:'vercel/sandbox/node:24',vcpus:1,timeoutMs:170000,maxVcpuHours:170/3600,sourceSha256:createHash('sha256').update(source).digest('hex'),goSourceSha256:createHash('sha256').update(goSource).digest('hex'),startedAt:new Date(started).toISOString(),steps:[]};
async function step(label,script,sudo=false) {
 const r=await sandbox.runCommand({cmd:'bash',args:['-lc',`set -euo pipefail\n${script}`],cwd:sandbox.cwd,sudo,stdout:process.stdout,stderr:process.stderr,signal:AbortSignal.timeout(145000)});
 provenance.steps.push({label,exitCode:r.exitCode});
 if(r.exitCode!==0)throw new Error(`${label}: ${r.exitCode}`);
}
try {
 console.log(`Sandbox ${sandbox.name}; hard lease 170s / ${provenance.maxVcpuHours} vCPU-hours`);
 await sandbox.writeFiles([{path:'vectors.ts',content:source},{path:'vectors.go',content:goSource},{path:'vectors-go',content:readFileSync(path.join(dir,'.artifacts/vectors-go-linux')),mode:0o755}]);
 await step('tools',`if ! command -v clang >/dev/null || ! test -x /usr/bin/time; then
 if command -v dnf >/dev/null; then dnf install -y -q clang time; else apt-get update -qq && apt-get install -y -qq clang time; fi
 fi`,true);
 await step('compile',`npm install --no-audit --no-fund --silent scriptc@0.4.6
 find node_modules -type f \\( -name tsc-ts -o -name tsc -o -name scriptc-comptime \\) -exec chmod +x {} +
 SCRIPTC_CHECKER_SERVER=0 node_modules/.bin/scriptc build vectors.ts --optimization release --no-keep-llvm -o vectors-release
 SCRIPTC_CHECKER_SERVER=0 node_modules/.bin/scriptc build vectors.ts --optimization speed --no-keep-llvm -o vectors-speed`);
 await step('measure',`node --version > versions.txt
 uname -a >> versions.txt
 lscpu >> versions.txt
 node_modules/.bin/scriptc --version >> versions.txt
 : > results.ndjson
 for kind in float int8 int8-i32 binary; do
  for runtime in node release speed go; do
   if [ "$runtime" = node ]; then cmd="node vectors.ts"; else cmd="./vectors-$runtime"; fi
   /usr/bin/time -v -o "rss-$kind-$runtime.txt" $cmd "$kind" 100000 768 30 10 >> results.ndjson
  done
 done
 /usr/bin/time -v -o rss-binary-go-plain.txt ./vectors-go binary-plain 100000 768 30 10 >> results.ndjson`);
 const raw=await sandbox.readFileToBuffer({path:'results.ndjson'});
 const lines=raw.toString().trim().split('\n').map(JSON.parse);
 const runtimes=['node','release','speed','go'];
 const runs=[];
 for(let index=0;index<lines.length;index++){
  const value=lines[index]; const runtime=index===16?'go-plain':runtimes[index%4];
  const rssFile=index===16?'rss-binary-go-plain.txt':`rss-${value.kind}-${runtime}.txt`;
  const rss=(await sandbox.readFileToBuffer({path:rssFile})).toString();
  runs.push({...value,runtime,peakRssBytes:Number(rss.match(/Maximum resident set size \(kbytes\): (\d+)/)[1])*1024});
 }
 for(const kind of ['float','int8','int8-i32','binary']){
  const group=runs.filter(r=>r.kind===kind || (kind==='binary' && r.kind==='binary-plain'));
  for(const r of group) if(JSON.stringify(r.ids)!==JSON.stringify(group[0].ids)||JSON.stringify(r.scores)!==JSON.stringify(group[0].scores))throw new Error(`parity ${kind}`);
 }
 writeFileSync(path.join(dir,'linux-results.json'),JSON.stringify({provenance,versions:(await sandbox.readFileToBuffer({path:'versions.txt'})).toString(),runs},null,2)+'\n');
 provenance.status='complete';
} catch(error) {provenance.status='failed';provenance.error=String(error);process.exitCode=1;console.error(error)}
finally {
 try { const stopped=await sandbox.stop({signal:AbortSignal.timeout(15000)});provenance.stopped=true;provenance.activeCpuDurationMs=stopped.activeCpuDurationMs }
 catch(error){provenance.stopError=String(error);process.exitCode=1}
 provenance.elapsedMs=Date.now()-started;
 writeFileSync(path.join(dir,'linux-provenance.json'),JSON.stringify(provenance,null,2)+'\n');
 console.log(JSON.stringify(provenance));
}
