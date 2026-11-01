import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const root=process.cwd(), s=root+'/.checks/wasm-workerd', out=root+'/research/wasm-simd-workerd';
const compiler=process.env.SCRIPTC||'/Users/noah/code/next-scriptc/packages/next-scriptc/node_modules/scriptc/bin/scriptc.exe';
await mkdir(out+'/logs',{recursive:true});await mkdir(out+'/raw',{recursive:true});
function run(cmd,args,env={}){const r=spawnSync(cmd,args,{cwd:s,env:{...process.env,ZIG_GLOBAL_CACHE_DIR:s+'/zig-cache',ZIG_LOCAL_CACHE_DIR:s+'/zig-local',...env},encoding:'utf8',maxBuffer:20e6});return {cmd,args,status:r.status,stdout:r.stdout,stderr:r.stderr};}
// --emit-ir adds typed IR JSON; the library build also retains its unoptimized .lib.ll.
let base=await readFile(root+'/research/wasm-workerd/src/vector.ts','utf8');
for(const kind of (process.env.KINDS||'natural,imul,float,revenue').split(',')){
 let source=base;
 if(kind==='imul')source=source.replace('corpus[base+j]*embedding[j]','Math.imul(corpus[base+j],embedding[j])');
 if(kind==='float')source=source.replaceAll('Int8Array','Float32Array').replace('value[i]=((state>>>0)%255)-127','value[i]=(((state>>>0)%255)-127)/128').replace('embedding[j]=x','embedding[j]=x/128').replaceAll('Int32Array','Float64Array').replace('(sum+corpus[base+j]*embedding[j])|0','sum+corpus[base+j]*embedding[j]');
 if(kind==='revenue')source=await readFile(s+'/stage/revenue.ts','utf8');
 else source=source.replace('export function vector','export function '+kind);
 await writeFile(s+'/stage/'+kind+'.ts',source);
 const tuple=kind==='revenue'?'[string,string,number,boolean]':'[number,number[]]';
 const call=kind==='revenue'?'revenue(a[0],a[1],a[2],a[3])':`${kind}(a[0],a[1])`;
 await writeFile(s+'/stage/'+kind+'-entry.ts',`import {${kind}} from './${kind}.ts';import {serialize} from './json.ts';export function run(input:string):string {const a=JSON.parse(input) as ${tuple};const value=${call};return serialize(value,true,()=>JSON.stringify(value));}`);
 const profile={profile_format:1,name:kind,entry:kind+'-entry.ts',emission:'llvm',abi:{prefix:'bench_',init_symbol:'bench_init',sink_register_symbol:'bench_sink',collect_symbol:'bench_collect'},exports:[{export:'run',symbol:'bench_run',params:['string'],returns:'string'}]};
 await writeFile(s+'/stage/'+kind+'.json',JSON.stringify(profile,null,2));
 await rm(s+'/'+kind+'-entry.lib.ll',{force:true});
 let r=run(compiler,['build','--emit-ir','--lib','--profile',s+'/stage/'+kind+'.json','-o',s+'/'+kind+'-stock.wasm'],{SCRIPTC_TARGET:'wasm32-wasi',SCRIPTC_CHECKER_SERVER:'0',SCRIPTC_LINKER:s+'/linker.sh',SCRIPTC_LINK_LOG:s+'/link-'+kind+'.txt'});
 await writeFile(out+'/logs/'+kind+'-stock.json',JSON.stringify(r,null,2));if(r.status&&kind!=='patched')throw Error(JSON.stringify(r));
 const recipe=(await readFile(s+'/link-'+(kind==='patched'?'natural':kind)+'.txt','utf8')).trim().split('\n');
 for(const variant of ['scalar','simd']){
 const flags=variant==='simd'?['-msimd128']:['-mno-simd128'];
 r=run('zig',['cc','--target=wasm32-wasi','-O3',...flags,'-c',s+'/'+kind+'-entry.lib.ll','-o',s+'/'+kind+'.o']);
 await writeFile(out+'/logs/'+kind+'-'+variant+'-compile.json',JSON.stringify(r,null,2));if(r.status)throw Error(JSON.stringify(r));
 let args=recipe.map(x=>x.endsWith('/program.o')?s+'/'+kind+'.o':x.includes('/runtime/artifacts/')?s+'/node_modules/@scriptc/runtime-wasm32-wasi/artifacts/'+x.split('/runtime/artifacts/')[1]:x.endsWith('/output.wasm')?s+'/'+kind+'-'+variant+'.wasm':x);
 r=run('zig',['cc',...flags,...args]);await writeFile(out+'/logs/'+kind+'-'+variant+'-link.json',JSON.stringify(r,null,2));if(r.status)throw Error(JSON.stringify(r));
 }
 console.log('built',kind);
}
