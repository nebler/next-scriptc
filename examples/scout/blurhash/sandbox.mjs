// Prebuild locally to keep VM lifetime <=115 seconds on one vCPU (<0.05 h).
// node --env-file=.env.local examples/scout/blurhash/sandbox.mjs
import { Sandbox } from '@vercel/sandbox';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const dir=import.meta.dirname;
const files=['blurhash.ts','run.mjs','rss/main.go','main.go','go.mod','go.sum'];
const binaries=['release','speed','go','rss'];
const uploads=[];
for(const name of files) uploads.push({path:`scout/${name}`,content:await readFile(path.join(dir,name))});
for(const name of binaries) uploads.push({path:`scout/bin-${name}`,content:await readFile(`/tmp/scout-blurhash-linux-${name}`),mode:0o755});
const provenance={image:'vercel/sandbox/node:24',vcpus:1,timeoutMs:115000,maxVcpuHours:115/3600,priorSandboxElapsedMs:55455,totalMaxVcpuHours:(115000+55455)/3600000,
 parentCommit:execFileSync('git',['rev-parse','HEAD']).toString().trim(),
 goVersion:execFileSync('/opt/homebrew/bin/go',['version']).toString().trim(),
 scriptcVersion:'0.4.6',nativeTarget:'x86_64-linux-musl',goTarget:'linux/amd64 CGO_ENABLED=0',
 sources:uploads.map(f=>({path:f.path,sha256:createHash('sha256').update(f.content).digest('hex')})),status:'starting'};
let sandbox;
const started=Date.now();
try {
 sandbox=await Sandbox.create({image:provenance.image,resources:{vcpus:1},timeout:115000,persistent:false});
 provenance.sandbox=sandbox.name;
 console.log(`Sandbox ${sandbox.name}; 1 vCPU; hard ceiling ${(115/3600).toFixed(5)} vCPU-hours`);
 await sandbox.writeFiles(uploads);
 const command=await sandbox.runCommand({cmd:'bash',cwd:sandbox.cwd,args:['-lc',`set -euo pipefail
uname -a
lscpu | head -20
node --version
command -v node
test -x scout/bin-rss
chmod +x scout/bin-*
BLURHASH_RSS_HELPER="$PWD/scout/bin-rss" BLURHASH_SIZES=2048 BLURHASH_ITERATIONS=30 BLURHASH_WARMUP=5 BLURHASH_BIN_PREFIX="$PWD/scout/bin" node scout/run.mjs "$PWD/scout/results.json"
`],stdout:process.stdout,stderr:process.stderr,signal:AbortSignal.timeout(100000)});
 provenance.exitCode=command.exitCode;
 provenance.stdout=await command.stdout();provenance.stderr=await command.stderr();
 const result=await sandbox.readFileToBuffer({path:'scout/results.json'});
 if(result) await writeFile(path.join(dir,'linux-results.json'),result);
 if(command.exitCode!==0 || !result) throw new Error(`Linux run failed: exit ${command.exitCode}, results ${!!result}`);
 provenance.status='complete';
} catch(error) { provenance.status='failed';provenance.error=String(error);process.exitCode=1;console.error(error); }
finally {
 if(sandbox) { try {const stop=await sandbox.stop({signal:AbortSignal.timeout(15000)});provenance.stopped=true;provenance.activeCpuDurationMs=stop.activeCpuDurationMs;} catch(error){provenance.stopError=String(error);process.exitCode=1;} }
 provenance.elapsedMs=Date.now()-started;
 provenance.allocatedVcpuHoursUpperBound=Math.min(provenance.elapsedMs,115000)/3600000;
 await writeFile(path.join(dir,'linux-provenance.json'),JSON.stringify(provenance,null,2)+'\n');
 console.log(`Stopped: ${provenance.stopped}; status ${provenance.status}; elapsed ${provenance.elapsedMs} ms`);
}
