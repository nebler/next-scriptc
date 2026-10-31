import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const source='/Users/noah/code/scriptc-fork';
const files=['packages/cli/dist/main.js','packages/compiler/dist/backend/llvm/wrapping-sums.js','packages/compiler/src/backend/llvm/wrapping-sums.ts'];
const report={originalFork:source,commit:execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),diffSha256:sha(execFileSync('git',['-C',source,'diff','HEAD'])),files:Object.fromEntries(files.map(f=>[f,sha(readFileSync(`${source}/${f}`))])),packs:{},zig:execFileSync('/Users/noah/.local/share/zig-0.16.0/zig',['version'],{encoding:'utf8'}).trim()};
for(const [name,root] of Object.entries({stock:'/tmp/vector-cpu-levels/runtime-stock',patchedKernel:'/tmp/vector-cpu-levels/runtime-patched',patchedHTTP:'/Users/noah/code/scriptc-fork-v4/packages/runtime-linux-x64-musl'})){
 try{report.packs[name]={root,manifestSha256:sha(readFileSync(`${root}/runtime-pack.json`)),version:JSON.parse(readFileSync(`${root}/package.json`)).version}}catch(e){report.packs[name]={root,error:e.code}}
}
writeFileSync(new URL('runtime-provenance.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
