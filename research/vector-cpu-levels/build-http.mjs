// Cross-compile the real grouped Next entry, retaining both CPU policies.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..'),out='/tmp/vector-cpu-levels';
const cli=path.join(root,'research/int8-range-analysis/source-cli.sh');
const env={...process.env,PATH:`/Users/noah/.local/share/zig-0.16.0:${process.env.PATH}`,SCRIPTC_SOURCE:'/Users/noah/code/scriptc-fork',SCRIPTC_NODE:process.execPath,SCRIPTC_CHECKER_SERVER:'0',SCRIPTC_TARGET:'x86_64-linux-musl',SCRIPTC_CACHE_DIR:path.join(out,'http-cache'),SCRIPTC_RUNTIME_PACK:process.env.CPU_HTTP_RUNTIME || '/Users/noah/code/scriptc-fork-v4/packages/runtime-linux-x64-musl',NODE_OPTIONS:`--require=${path.join(import.meta.dirname,'runtime-pack.cjs')}`};
const sha=b=>createHash('sha256').update(b).digest('hex'),report=[];
for(const name of ['baseline','dispatch','functions']){
 const entry=name==='functions'?'examples/demo/.next/cache/scriptc-functions/entry.ts':'examples/demo/.next/scriptc/entry-0.ts';
 const output=path.join(out,`http-${name}`);
 const args=['build',path.join(root,entry),'--optimization','release','--strip','--no-keep-llvm','-o',output,...(name==='functions'?['--node-islands=off']:[]),...(name==='dispatch'?['--cpu-dispatch']:['--target-cpu','baseline'])];
 const start=performance.now();
 const logs=execFileSync(cli,args,{env,encoding:'utf8',maxBuffer:2**24,timeout:360000});
 writeFileSync(path.join(import.meta.dirname,`http-${name}-build.log`),logs);
 report.push({name,args,runtimePack:env.SCRIPTC_RUNTIME_PACK,buildMs:performance.now()-start,bytes:statSync(output).size,sha256:sha(readFileSync(output)),entrySha256:sha(readFileSync(entry))});
 writeFileSync(path.join(import.meta.dirname,'http-builds.json'),JSON.stringify(report,null,2)+'\n');console.log(report.at(-1));
}
