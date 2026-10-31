// Prepare on the Mac before allocating the one Linux VM. Never rebuild the fork.
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,statSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
const out=process.env.CPU_ARTIFACTS || '/tmp/vector-cpu-levels';
mkdirSync(out,{recursive:true});
const source=process.env.SCRIPTC_SOURCE || '/Users/noah/code/scriptc-fork';
const sha=b=>createHash('sha256').update(b).digest('hex');
const env={...process.env,PATH:`/Users/noah/.local/share/zig-0.16.0:${process.env.PATH}`,SCRIPTC_SOURCE:source,SCRIPTC_NODE:process.execPath,SCRIPTC_CHECKER_SERVER:'0',SCRIPTC_TARGET:'x86_64-linux-musl',SCRIPTC_CACHE_DIR:path.join(out,'cache')};
const report={timestamp:new Date().toISOString(),node:process.version,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),forkCommit:execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),forkDiffSha256:sha(execFileSync('git',['-C',source,'diff','HEAD'])),sourceSha256:sha(readFileSync('examples/scout/vectors/vectors.ts')),builds:[]};
for(const compiler of (process.env.CPU_COMPILERS || 'stock,patched').split(',')) for(const level of ['baseline','v3','dispatch']) {
 const cli=compiler==='stock'?path.join(root,'packages/next-scriptc/node_modules/.bin/scriptc'):path.join(root,'research/int8-range-analysis/source-cli.sh');
 const name=`${compiler}-${level}`,binary=path.join(out,name);
 const args=['build',path.join(root,'examples/scout/vectors/vectors.ts'),'--optimization','release','--strip','--keep-llvm','-o',binary,...(level==='dispatch'?['--cpu-dispatch']:['--target-cpu',level==='v3'?'x86-64-v3':'baseline'])];
 const begin=performance.now();
 const r=spawnSync(cli,args,{env:{...env,NODE_OPTIONS:compiler==='patched'?`--require=${path.join(import.meta.dirname,'runtime-pack.cjs')}`:'',SCRIPTC_RUNTIME_PACK:path.join(out,`runtime-${compiler}`)},encoding:'utf8',timeout:180000,maxBuffer:2**24});
 writeFileSync(path.join(import.meta.dirname,`${name}-build.log`),r.stdout+r.stderr);
 const entry={name,args,status:r.status,error:r.error?.message,buildMs:performance.now()-begin};
 if(r.status===0)Object.assign(entry,{bytes:statSync(binary).size,sha256:sha(readFileSync(binary)),file:execFileSync('file',[binary],{encoding:'utf8'}).trim()});
 report.builds.push(entry);writeFileSync(path.join(import.meta.dirname,'builds.json'),JSON.stringify(report,null,2)+'\n');
 console.log(entry);
 if(r.status!==0)throw new Error(`${name}: ${r.stderr}`);
}
