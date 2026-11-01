// Local-only S1 measurement preparation. Timings require the explicit "measure" command.
import {readFile,writeFile,mkdir,copyFile,statfs,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=process.cwd(),scratch=root+'/.checks/wasm-vectorization-measure',out=process.env.W2_OUTPUT||root+'/research/wasm-vectorization/pending';
const fork=process.env.SCRIPTC_FIXED_SOURCE||'/Users/noah/code/scriptc-wt/wasm-counted-globals';
const stock=process.env.SCRIPTC||'/Users/noah/code/next-scriptc/packages/next-scriptc/node_modules/scriptc/bin/scriptc.exe';
const mode=process.argv[2];
const variants=['js','scalar','fixed','simd'],kinds=['imul','natural','float','sum','search'];
function run(cmd,args,env={}) {const r=spawnSync(cmd,args,{cwd:scratch,encoding:'utf8',maxBuffer:20e6,env:{...process.env,ZIG_GLOBAL_CACHE_DIR:scratch+'/zig-cache',ZIG_LOCAL_CACHE_DIR:scratch+'/zig-local',...env}});return {status:r.status,stdout:r.stdout,stderr:r.stderr,cmd,args};}
function checked(r){if(r.status!==0)throw Error(JSON.stringify(r));return r;}
async function disk(){const s=await statfs(root);if(s.bavail*s.bsize<6*1024**3)throw Error('Stop: less than 6 GiB free');}
if(!['prepare','verify','measure'].includes(mode))throw Error('Use prepare, verify, or measure');
await disk();await mkdir(scratch+'/stage',{recursive:true});await mkdir(out+'/raw',{recursive:true});await mkdir(out+'/logs',{recursive:true});
if(mode==='prepare'){
 await writeFile(scratch+'/package.json',JSON.stringify({type:'module',dependencies:{'@scriptc/runtime-wasm32-wasi':'0.4.6',workerd:'1.20261031.1',esbuild:'0.28.2',wabt:'1.0.39'}}));
 checked(run('npm',['install','--no-audit','--no-fund']));await disk();
 await writeFile(scratch+'/stage/tsconfig.json',JSON.stringify({compilerOptions:{strict:true,skipLibCheck:true,noEmit:true,allowImportingTsExtensions:true,target:'es2022',module:'nodenext',moduleResolution:'nodenext'}}));
 await copyFile(root+'/packages/next-scriptc/src/functions/json.ts',scratch+'/stage/json.ts');
 let cli=await readFile(fork+'/packages/cli/src/main.ts','utf8');cli=cli.replace('"@scriptc/compiler"',JSON.stringify(fork+'/packages/compiler/src/index.ts')).replace('"./command.js"',JSON.stringify(fork+'/packages/cli/src/command.ts')).replace('join(here, "..", "package.json")',JSON.stringify(fork+'/packages/cli/package.json'));
 await writeFile(scratch+'/fixed-cli.mts',cli);
 await writeFile(scratch+'/linker.sh','#!/bin/sh\nprintf \'%s\\n\' "$@" > "$SCRIPTC_LINK_LOG"\nexec zig cc "$@"\n',{mode:0o755});
 const req=createRequire(scratch+'/package.json'),esbuild=req('esbuild');const artifacts=[],builds=[];
 for(const kind of kinds){
  let src;
  if(kind==='search')src=(await readFile(root+'/research/wasm-workerd/src/vector.ts','utf8')).replace('export function vector','export function search').replace('corpus[base+j]*embedding[j]','Math.imul(corpus[base+j],embedding[j])');
  else {const typ=kind==='float'?'Float32Array':kind==='sum'?'Int32Array':'Int8Array',expr=kind==='imul'?'(sum+Math.imul(a[i],b[i]))|0':kind==='natural'?'(sum+a[i]*b[i])|0':kind==='float'?'sum+a[i]*b[i]':'(sum+a[i])|0';src=`const dimensions=768;export function ${kind}(n:number,_values:number[]):number {const a=new ${typ}(dimensions),b=new ${typ}(dimensions);for(let i=0;i<a.length;i++){a[i]=(i*31%255)-127;b[i]=(i*17%255)-127;}let total=0;for(let row=0;row<n;row++){let sum=0;for(let i=0;i<dimensions;i++)sum=${expr};total+=sum;}return total;}`;}
  await writeFile(scratch+'/stage/'+kind+'.ts',src);
  await writeFile(scratch+'/stage/'+kind+'-entry.ts',`import {${kind}} from './${kind}.ts';export function run(input:string):string {const a=JSON.parse(input) as [number,number[]];return JSON.stringify(${kind}(a[0],a[1]));}`);
  await writeFile(scratch+'/stage/'+kind+'.json',JSON.stringify({profile_format:1,name:kind,entry:kind+'-entry.ts',emission:'llvm',abi:{prefix:'bench_',init_symbol:'bench_init',sink_register_symbol:'bench_sink',collect_symbol:'bench_collect'},exports:[{export:'run',symbol:'bench_run',params:['string'],returns:'string'}]}));
  const profile=scratch+'/stage/'+kind+'.json',ir=scratch+'/'+kind+'-entry.lib.ll';
  const env={SCRIPTC_TARGET:'wasm32-wasi',SCRIPTC_CHECKER_SERVER:'0',SCRIPTC_RUNTIME_PACK:scratch+'/node_modules/@scriptc/runtime-wasm32-wasi',SCRIPTC_LINKER:scratch+'/linker.sh',SCRIPTC_LINK_LOG:scratch+'/recipe.txt'};
  checked(run(stock,['build','--emit-ir','--lib','--profile',profile,'-o',scratch+'/baseline.wasm'],env));const baseline=await readFile(ir);const recipe=(await readFile(scratch+'/recipe.txt','utf8')).trim().split('\n');
  await rm(ir);const fixed=run(fork+'/node_modules/.bin/tsx',[scratch+'/fixed-cli.mts','build','--emit-ir','--lib','--profile',profile,'-o',scratch+'/unused.wasm'],env);builds.push({kind,fixed});
  // The source CLI can fail stock runtime-pack resolution after retaining IR (S1).
  const fixedIR=await readFile(ir);if(fixed.status && !fixed.stderr.includes('SC3003'))throw Error(JSON.stringify(fixed));
  for(const v of variants.slice(1)){
   await writeFile(scratch+'/input.ll',v==='scalar'?baseline:fixedIR);const flags=v==='simd'?['-msimd128']:['-mno-simd128'];checked(run('zig',['cc','--target=wasm32-wasi','-O3',...flags,'-c',scratch+'/input.ll','-o',scratch+'/program.o']));
   const args=recipe.map(x=>x.endsWith('/program.o')?scratch+'/program.o':x.includes('/runtime/artifacts/')?scratch+'/node_modules/@scriptc/runtime-wasm32-wasi/artifacts/'+x.split('/runtime/artifacts/')[1]:x.endsWith('/output.wasm')?scratch+'/'+kind+'-'+v+'.wasm':x);checked(run('zig',['cc',...flags,...args]));
   const bytes=await readFile(scratch+'/'+kind+'-'+v+'.wasm');artifacts.push({kind,variant:v,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  for(const v of variants){const name=kind+'-'+v,entry=`import {serialize} from './json.ts';${v==='js'?`import {${kind}} from './${kind}.ts';`:`import module from 'bench.wasm';import {instantiate} from '${root}/research/wasm-workerd/src/bridge.mjs';`}let api;export default {async fetch(request){const url=new URL(request.url);if(url.pathname==='/health')return new Response('ready');if(url.pathname==='/meta')return Response.json({memoryBytes:api?.memoryBytes(),calls:api?.calls});const args=JSON.parse(await request.text());const value=${v==='js'?`${kind}(...args)`:`JSON.parse((api ||= instantiate(module)).run(serialize(args)))`};return Response.json(value);}};`;
   await writeFile(scratch+'/stage/worker-'+name+'.ts',entry);await esbuild.build({entryPoints:[scratch+'/stage/worker-'+name+'.ts'],outfile:scratch+'/'+name+'.mjs',bundle:true,format:'esm',platform:'browser',external:['bench.wasm'],define:{'process.env.NEXT_SCRIPTC_STARTUP_TIMING':'""'},plugins:[{name:'perf',setup(b){b.onResolve({filter:/^node:perf_hooks$/},()=>({path:'perf',namespace:'perf'}));b.onLoad({filter:/.*/,namespace:'perf'},()=>({contents:'export const performance=globalThis.performance;',loader:'js'}));}}]});
   await writeFile(scratch+'/'+name+'.capnp',`using Workerd = import "./node_modules/workerd/workerd.capnp";const config :Workerd.Config = (services=[(name="main",worker=(modules=[(name="worker.mjs",esModule=embed "${name}.mjs")${v==='js'?'':`,(name="bench.wasm",wasm=embed "${name}.wasm")`}],compatibilityDate="2026-10-31"))],sockets=[(name="http",address="127.0.0.1:8799",http=(),service="main")]);`);
  }
 }
 await writeFile(out+'/raw/builds.json',JSON.stringify(builds,null,2));await writeFile(out+'/raw/artifacts.json',JSON.stringify(artifacts,null,2));
 let engine=await readFile(root+'/research/wasm-simd-workerd/measure.mjs','utf8');engine=engine.replace("root+'/.checks/wasm-workerd'",JSON.stringify(scratch)).replace("root+'/research/wasm-simd-workerd'",JSON.stringify(out)).replace("'js,stock,scalar,simd'","'js,scalar,fixed,simd'").replace("'natural,imul,float,revenue'","'imul,natural,float,sum,search'").replace("(kind==='revenue'?[5000]:[20000,100000])","[20000]");
 engine=engine.replaceAll("'../wasm-workerd/", "'"+root+"/research/wasm-workerd/");await writeFile(scratch+'/measure.mjs',engine);
 console.log('Prepared. Run verify before measure. No timings collected.');
}else if(mode==='verify'){
 const {instantiate}=await import('../wasm-workerd/src/bridge.mjs');const records=[];
 for(const kind of kinds){const js=(await import(scratch+'/stage/'+kind+'.ts'))[kind];const args=[kind==='search'?20:3,Array.from({length:768},(_,i)=>((i*31+17)%255)-127)],expected=JSON.stringify(js(...args));for(const v of variants.slice(1)){const api=instantiate(new WebAssembly.Module(await readFile(scratch+'/'+kind+'-'+v+'.wasm')));const actual=api.run(JSON.stringify(args));if(actual!==expected)throw Error(kind+' '+v+' mismatch');records.push({kind,variant:v,sha256:createHash('sha256').update(actual).digest('hex')});}}
 await writeFile(out+'/raw/correctness.json',JSON.stringify(records,null,2));console.log('All SHA-256 checks passed (non-timed).');
}else {const r=spawnSync(process.execPath,[scratch+'/measure.mjs'],{cwd:root,stdio:'inherit',env:process.env});if(r.status!==0)throw Error('Measurement failed');}
