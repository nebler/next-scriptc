// node --env-file=/absolute/path/to/.env.local examples/scout/resize/sandbox.mjs
// One 1-vCPU VM, hard 180s lifetime => at most 0.05 allocated vCPU-hours.
// No credentials enter the VM. Go is cross-built locally with the same toolchain.
import { Sandbox } from '@vercel/sandbox';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const dir=import.meta.dirname;
mkdirSync(path.join(dir,'.artifacts'),{recursive:true});
const go=process.env.REPRO_GO ?? '/opt/homebrew/bin/go';
const goVersion=execFileSync(go,['version'],{encoding:'utf8'}).trim();
execFileSync(go,['build','-o','.artifacts/go-linux','.'],{cwd:dir,env:{...process.env,GOOS:'linux',GOARCH:'amd64',CGO_ENABLED:'0'}});
const files=['kernel.ts','bench.ts','run.mjs','main.go','go.mod','go.sum'];
const sources=Object.fromEntries(files.map(f=>[f,createHash('sha256').update(readFileSync(path.join(dir,f))).digest('hex')]));
const start=Date.now();
const vm=await Sandbox.create({image:'vercel/sandbox/node:24',resources:{vcpus:1},timeout:180000,persistent:false});
const provenance={startedAt:new Date(start).toISOString(),name:vm.name,image:'vercel/sandbox/node:24',vcpus:1,timeoutMs:180000,maxVcpuHours:0.05,sources,goVersion,goCrossBuild:'GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build',steps:[]};
console.log(`Sandbox ${vm.name}; max 0.05 vCPU-hours`);
const abort=new AbortController();
const timer=setTimeout(()=>abort.abort(new Error('160s command deadline')),160000); timer.unref();
async function step(label,script,sudo=false){
 const before=Date.now();
 const r=await vm.runCommand({cmd:'bash',args:['-lc','set -euo pipefail\n'+script],cwd:vm.cwd,sudo,signal:abort.signal,stdout:process.stdout,stderr:process.stderr});
 provenance.steps.push({label,elapsedMs:Date.now()-before,exitCode:r.exitCode});
 if(r.exitCode!==0)throw new Error(label+': '+r.exitCode);
}
try {
 await vm.writeFiles([...files.map(f=>({path:`repo/examples/scout/resize/${f}`,content:readFileSync(path.join(dir,f))})),
  {path:'repo/examples/scout/resize/.artifacts/go',content:readFileSync(path.join(dir,'.artifacts/go-linux')),mode:0o755},
  {path:'repo/packages/next-scriptc/package.json',content:Buffer.from('{"private":true,"dependencies":{"scriptc":"0.4.6"}}')}]);
 await step('system tools',`if ! command -v clang >/dev/null || ! test -x /usr/bin/time; then apt-get update -qq && apt-get install -y -qq clang time; fi\nnode --version\nclang --version\nlscpu | head -20`,true);
 await step('compiler install',`cd repo/packages/next-scriptc\nnpm install --no-audit --no-fund --silent\nfind node_modules -type f \\( -name tsc-ts -o -name tsc -o -name scriptc-comptime \\) -exec chmod +x {} +`);
 await step('compile release and speed',`cd repo\nfor mode in release speed; do SCRIPTC_CHECKER_SERVER=0 packages/next-scriptc/node_modules/.bin/scriptc build examples/scout/resize/bench.ts --optimization "$mode" --node-islands=off --keep-llvm -o examples/scout/resize/.artifacts/"$mode"; done`);
 await step('largest kernel matrix',`cd repo\nSCOUT_GO_VERSION='${goVersion} (cross-compiled linux/amd64)' node examples/scout/resize/run.mjs --skip-build --largest --rounds 1 --output examples/scout/resize/linux-results.json`);
 provenance.status='complete';
} catch(e) { provenance.status='failed'; provenance.error=e.stack; process.exitCode=1; console.error(e.message); }
finally {
 clearTimeout(timer);
 try {
  const result=await vm.readFileToBuffer({path:'repo/examples/scout/resize/linux-results.json'},{signal:AbortSignal.timeout(5000)});
  if(result)writeFileSync(path.join(dir,'linux-results.json'),result); else provenance.missingResults=true;
 } catch(e) {provenance.downloadError=e.message;}
 try {const stopped=await vm.stop({signal:AbortSignal.timeout(10000)});provenance.stopped=true;provenance.activeCpuDurationMs=stopped.activeCpuDurationMs;}
 catch(e){provenance.stopError=e.message;process.exitCode=1;}
 provenance.elapsedMs=Date.now()-start;provenance.allocatedVcpuHoursUpperBound=Math.min(provenance.elapsedMs,180000)/3600000;
 writeFileSync(path.join(dir,'linux-provenance.json'),JSON.stringify(provenance,null,2)+'\n');
 console.log(JSON.stringify(provenance,null,2));
}
