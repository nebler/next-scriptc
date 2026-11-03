// Temporarily select a source, build through the normal adapter, then restore it.
// Run without another build/dev process in this worktree.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const variant=process.argv[2];
if(!['float','integer'].includes(variant))throw Error('Expected float or integer');
const root=path.resolve(import.meta.dirname,'../..');
const source=path.join(root,'examples/shared-native/lib/forecast.ts');
const config=path.join(root,'examples/shared-native/next.config.mjs');
const original=await readFile(source,'utf8'),settings=await readFile(config,'utf8');
try{
 if(variant==='float')await writeFile(source,await readFile(new URL('./forecast-float.ts',import.meta.url)));
 // An uncalibrated build emits wasm with no browser buckets enabled.
 await writeFile(config,settings.replace(/key:'[a-f0-9]+',/,''));
 execFileSync('pnpm',['--filter','shared-native','build'],{cwd:root,stdio:'inherit'});
 const out=`/tmp/d1b-${variant}-adapter`;
 await mkdir(out,{recursive:true});
 for(const name of ['promotion.node','ids.json','encodings.json'])await copyFile(path.join(root,'examples/shared-native/.next/scriptc-promotion',name),path.join(out,name));
 execFileSync(process.execPath,['research/browser-wasm/build.mjs',`/tmp/d1b-${variant}-wasm`],{cwd:root,stdio:'inherit'});
}finally{
 await writeFile(source,original);await writeFile(config,settings);
}
// .next now contains the selected variant. Rebuild before serving the final demo.
