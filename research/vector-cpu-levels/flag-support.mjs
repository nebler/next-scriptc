import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
const out='/tmp/vector-cpu-levels';
writeFileSync(path.join(out,'flag-smoke.ts'),'console.log("ok");\n');
const rows=[];
for(const compiler of ['stock','patched'])for(const level of ['x86-64-v2','x86-64-v4','native']){
 const cli=compiler==='stock'?path.resolve('packages/next-scriptc/node_modules/.bin/scriptc'):path.resolve('research/int8-range-analysis/source-cli.sh');
 const env={...process.env,PATH:`/Users/noah/.local/share/zig-0.16.0:${process.env.PATH}`,SCRIPTC_SOURCE:'/Users/noah/code/scriptc-fork',SCRIPTC_NODE:process.execPath,SCRIPTC_CHECKER_SERVER:'0',SCRIPTC_TARGET:'x86_64-linux-musl',SCRIPTC_RUNTIME_PACK:path.join(out,`runtime-${compiler}`),NODE_OPTIONS:compiler==='patched'?`--require=${path.join(import.meta.dirname,'runtime-pack.cjs')}`:''};
 const args=['build',path.join(out,'flag-smoke.ts'),'--optimization','release','--strip','--no-keep-llvm','--target-cpu',level,'-o',path.join(out,`${compiler}-${level}-smoke`)];
 const r=spawnSync(cli,args,{env,encoding:'utf8',timeout:30000});
 rows.push({compiler,level,status:r.status,stdout:r.stdout,stderr:r.stderr});console.log(compiler,level,r.status);
}
writeFileSync(path.join(import.meta.dirname,'flag-support.json'),JSON.stringify(rows,null,2)+'\n');
