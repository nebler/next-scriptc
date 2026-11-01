import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {instantiate} from './src/bridge.mjs';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..'),scratch=root+'/.checks/wasm-workerd';
const compiler=process.env.SCRIPTC||'/Users/noah/code/next-scriptc/packages/next-scriptc/node_modules/scriptc/bin/scriptc.exe';
const base=JSON.parse(await readFile(scratch+'/stage/revenue.json','utf8'));
const probes=[];
for(const [name,entry,exp,params] of [
 ['object-abi','revenue.ts','revenue',['string','string','f64','bool']],
 ['reachable-async','async-entry.ts','run',['string']],
]) {
 if(name==='reachable-async') {
  await writeFile(scratch+'/stage/async-revenue.ts',(await readFile(scratch+'/stage/revenue.ts','utf8')).replace('export function revenue','export async function revenue'));
  await writeFile(scratch+'/stage/async-entry.ts',"import {revenue} from './async-revenue.ts';\nexport function run(input:string):string {return JSON.stringify(revenue('2026-01-01','2026-01-31',5000,false));}\n");
 }
 const profile={...base,name,entry,exports:[{export:exp,symbol:'bench_run',params,returns:'string'}]};
 const file=scratch+'/stage/'+name+'.json';await writeFile(file,JSON.stringify(profile,null,2));
 const args=['build','--lib','--profile',file,'-o',scratch+'/'+name+'.wasm'];
 const r=spawnSync(compiler,args,{cwd:scratch,env:{...process.env,SCRIPTC_TARGET:'wasm32-wasi',SCRIPTC_CHECKER_SERVER:'0',ZIG_GLOBAL_CACHE_DIR:scratch+'/zig-cache',ZIG_LOCAL_CACHE_DIR:scratch+'/zig-local'},encoding:'utf8'});
 await writeFile(import.meta.dirname+'/logs/'+name+'.log',JSON.stringify({args,status:r.status})+'\n'+r.stdout+r.stderr);
 probes.push({name,status:r.status,diagnostics:r.stderr||r.stdout});
}
const module=new WebAssembly.Module(await readFile(scratch+'/revenue.wasm'));
try {new WebAssembly.Instance(module,{});probes.push({name:'no-wasi-imports',unexpectedSuccess:true});}catch(e){probes.push({name:'no-wasi-imports',error:String(e)});}
const api=instantiate(module);
const {revenue}=await import(scratch+'/stage/revenue-js.ts');
for(const from of ['2026-01-01','😀','é\u0000漢字']) {
 const args=[from,'2026-01-31',5000,false];
 const expected=JSON.stringify(await revenue(...args));
 const actual=api.run(JSON.stringify(args));assert.equal(actual,expected);
 probes.push({name:'utf8-json-boundary',from,exactMatch:true});
}
await writeFile(import.meta.dirname+'/raw/abi-probes.json',JSON.stringify(probes,null,2)+'\n');
console.log(probes);
