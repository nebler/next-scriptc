import {readFileSync,writeFileSync,statSync,copyFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=process.cwd(),pack=root+'/packages/runtime-darwin-arm64',manifest=pack+'/runtime-pack.json';
const p=JSON.parse(readFileSync(manifest));
for(const name of ['release','dev']){
 const f=p.flavors[name],v=f.runtime_units.find(x=>x.source==='scr_json.c').variants.find(x=>x.id==='default');
 const dest=pack+'/'+v.path;copyFileSync(dest,`/tmp/nsc-c1-${name}-scr_json-original.o`);
 execFileSync('clang',['-target',p.target.llvm_triple,'-std=c11','-pthread','-fno-math-errno','-fno-strict-aliasing','-ffunction-sections','-fdata-sections','-falign-functions=64','-Wno-deprecated-declarations',f.optimization,...p.macros.executable.map(x=>'-D'+x),...v.defines.map(x=>'-D'+x),'-c',root+'/packages/runtime/src/scr_json.c','-o',dest]);
 v.sha256=createHash('sha256').update(readFileSync(dest)).digest('hex');v.size=statSync(dest).size;
}
writeFileSync(manifest,JSON.stringify(p,null,2)+'\n');
