import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
export const root=path.resolve(import.meta.dirname,'../..');
export const scratch=path.join(root,'.checks/wasm-workerd');
const resolveCompiler=()=>{const req=createRequire(root+'/packages/next-scriptc/package.json');const pkg=req.resolve('scriptc/package.json');return path.resolve(path.dirname(pkg),req('scriptc/package.json').bin.scriptc);};
export const compiler=process.env.SCRIPTC || (()=>{try{return resolveCompiler();}catch{return '/Users/noah/code/next-scriptc/packages/next-scriptc/node_modules/scriptc/bin/scriptc.exe';}})();
if(!existsSync(compiler))throw new Error('Set SCRIPTC to the stock scriptc 0.4.6 executable');
await mkdir(scratch+'/stage',{recursive:true});
await writeFile(scratch+'/stage/package.json','{"type":"module"}');
await writeFile(scratch+'/stage/tsconfig.json',JSON.stringify({compilerOptions:{strict:true,skipLibCheck:true,noEmit:true,allowImportingTsExtensions:true,target:'es2022',module:'nodenext',moduleResolution:'nodenext'}}));
const demo=root+'/examples/demo';
let revenue=await readFile(demo+'/lib/revenue.ts','utf8');
revenue=revenue.replace('../app/api/analytics/revenue/events.ts','./events.ts');
let fixture=await readFile(demo+'/lib/revenue-fixtures.ts','utf8');
fixture=fixture.replace('../app/api/analytics/revenue/events.ts','./events.ts');
await writeFile(scratch+'/stage/revenue.ts',revenue);
await writeFile(scratch+'/stage/revenue-fixtures.ts',fixture);
await writeFile(scratch+'/stage/events.ts',await readFile(demo+'/app/api/analytics/revenue/events.ts'));
function profile(name,entry,exports){return {profile_format:1,name,entry,emission:'llvm',abi:{prefix:'bench_',init_symbol:'bench_init',sink_register_symbol:'bench_sink',collect_symbol:'bench_collect'},exports};}
export function build(name,p){
 const file=scratch+'/stage/'+name+'.json';
 const args=['build','--lib','--profile',file,'-o',scratch+'/'+name+'.wasm'];
 return writeFile(file,JSON.stringify(p,null,2)).then(()=>{
  const start=Date.now();const r=spawnSync(compiler,args,{cwd:scratch,env:{...process.env,SCRIPTC_TARGET:'wasm32-wasi',SCRIPTC_CHECKER_SERVER:'0',ZIG_GLOBAL_CACHE_DIR:scratch+'/zig-cache',ZIG_LOCAL_CACHE_DIR:scratch+'/zig-local'},encoding:'utf8',maxBuffer:16e6});
  return writeFile(root+'/research/wasm-workerd/logs/'+name+'.log',JSON.stringify({compiler,args,status:r.status,signal:r.signal,ms:Date.now()-start,error:r.error?.message})+'\n'+r.stdout+r.stderr).then(()=>{console.log(name,r.status,(r.stderr||r.stdout).slice(-4000));return r.status});
 });
}
await build('unchanged',profile('unchanged','revenue.ts',[{export:'revenue',symbol:'bench_revenue',params:['string','string','f64','bool'],returns:'string'}]));
// Keep a separately named feasibility adaptation. No application sources change.
await writeFile(scratch+'/stage/revenue.ts',revenue.replace('export async function revenue','export function revenue'));
await writeFile(scratch+'/stage/entry.ts',`import {revenue} from './revenue.ts';\nexport function run(input:string):string {const a=JSON.parse(input) as [string,string,number,boolean];return JSON.stringify(revenue(a[0],a[1],a[2],a[3]));}\n`);
if(await build('sync-original-fixture',profile('sync_original_fixture','entry.ts',[{export:'run',symbol:'bench_run',params:['string'],returns:'string'}])))throw new Error('Synchronous revenue feasibility build failed');
await writeFile(scratch+'/stage/json.ts',await readFile(root+'/packages/next-scriptc/src/functions/json.ts'));
for(const kind of ['revenue','regex','vector']) {
 if(kind!=='revenue') await writeFile(scratch+'/stage/'+kind+'.ts',await readFile(import.meta.dirname+'/src/'+kind+'.ts'));
 const tuple=kind==='revenue'?'[string,string,number,boolean]':kind==='vector'?'[number,number[]]':'[number]';
 const call=kind==='revenue'?'revenue(a[0],a[1],a[2],a[3])':kind==='vector'?'vector(a[0],a[1])':'regex(a[0])';
 const entry=`import {${kind}} from './${kind}.ts';\nimport {serialize} from './json.ts';\nexport function run(input:string):string {const a=JSON.parse(input) as ${tuple};const value=${call};return serialize(value,true,()=>JSON.stringify(value));}\n`;
 await writeFile(scratch+'/stage/'+kind+'-entry.ts',entry);
 if(await build(kind,profile(kind,kind+'-entry.ts',[{export:'run',symbol:'bench_run',params:['string'],returns:'string'}])))throw new Error(kind+' build failed');
}
