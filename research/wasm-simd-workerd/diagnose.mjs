import {readFile,writeFile} from 'node:fs/promises';import {spawnSync} from 'node:child_process';import {createRequire} from 'node:module';const s=process.cwd()+'/.checks/wasm-workerd',out='research/wasm-simd-workerd',req=createRequire(s+'/package.json'),wabt=await req('wabt')();const r={};
for(const kind of (process.env.KINDS||'natural,imul,float,revenue').split(',')){
 const recipe=JSON.parse(await readFile(out+'/logs/'+kind+'-simd-link.json','utf8'));let args=recipe.args.filter(x=>x!=='-Wl,--strip-debug').map(x=>x===s+'/'+kind+'-simd.wasm'?s+'/'+kind+'-named.wasm':x);let p=spawnSync('zig',args,{encoding:'utf8'});if(p.status)throw Error(p.stderr);
 const m=wabt.readWasm(await readFile(s+'/'+kind+'-named.wasm'),{readDebugNames:true});m.generateNames();m.applyNames();const wat=m.toText({foldExprs:false});let fn='';const functions={};for(const line of wat.split('\n')){if(line.startsWith('  (func '))fn=line.trim();if(/\b(v128|[if]\d+x\d+)\./.test(line))functions[fn]=(functions[fn]||0)+1;}m.destroy();
 p=spawnSync('zig',['cc','--target=wasm32-wasi','-O3','-msimd128','-Rpass=loop-vectorize','-Rpass-missed=loop-vectorize','-Rpass-analysis=loop-vectorize','-S','-emit-llvm',s+'/'+kind+'-entry.lib.ll','-o',s+'/'+kind+'-optimized.ll'],{encoding:'utf8'});
 const llvm=await readFile(s+'/'+kind+'-optimized.ll','utf8');const vectorFunctions={};for(const match of llvm.matchAll(/^define .*?^}/gms)){const text=match[0];if(/<\d+ x/.test(text))vectorFunctions[text.split('\n')[0]]=text.split('\n').filter(x=>/<\d+ x/.test(x)).length;}
 r[kind]={simdFunctions:functions,vectorIRFunctions:vectorFunctions,remarks:p.stderr,status:p.status};
}
await writeFile(out+'/raw/diagnostics'+(process.env.SUFFIX||'')+'.json',JSON.stringify(r,null,2));console.log(r);
