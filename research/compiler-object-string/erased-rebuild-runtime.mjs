import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=process.cwd(),pack=root+'/packages/runtime-darwin-arm64',manifest=pack+'/runtime-pack.json';
const p=JSON.parse(readFileSync(manifest));
const identity=execFileSync('clang',['--version'],{encoding:'utf8'}).split('\n')[0];
if(identity!==p.compiler.identity)throw Error(`clang differs from runtime pack: ${identity}; expected ${p.compiler.identity}`);
for(const name of ['release','dev']){
 for (const unit of ['scr_json.c','scr_js_object.c']) { const f=p.flavors[name],v=f.runtime_units.find(x=>x.source===unit).variants.find(x=>x.id==='default');
 const dest=pack+'/'+v.path;
 execFileSync('clang',['-target',p.target.llvm_triple,'-std=c11','-pthread','-fno-math-errno','-fno-strict-aliasing','-ffunction-sections','-fdata-sections','-falign-functions=64','-Wno-deprecated-declarations',f.optimization,...p.macros.executable.map(x=>'-D'+x),...v.defines.map(x=>'-D'+x),'-c',root+'/packages/runtime/src/'+unit,'-o',dest]);
 v.sha256=createHash('sha256').update(readFileSync(dest)).digest('hex');v.size=statSync(dest).size; }
}
writeFileSync(manifest,JSON.stringify(p,null,2)+'\n');
