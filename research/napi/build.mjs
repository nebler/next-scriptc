import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createRequire,stripTypeScriptTypes} from 'node:module';
import path from 'node:path';
export const root=path.resolve(import.meta.dirname,'../..');
export const scratch=root+'/.checks/napi';
export const compiler=process.env.SCRIPTC||'/Users/noah/code/next-scriptc/packages/next-scriptc/node_modules/scriptc/bin/scriptc.exe';
export const headers=process.env.NODE_HEADERS||'/Users/noah/Library/Caches/node-gyp/24.22.1/include/node';
export async function run(name,cmd,args,env={}) {
 const start=Date.now();const r=spawnSync(cmd,args,{cwd:scratch,env:{...process.env,SCRIPTC_CHECKER_SERVER:'0',...env},encoding:'utf8',maxBuffer:16e6});
 await writeFile(root+'/research/napi/logs/'+name+'.log',JSON.stringify({cmd,args,status:r.status,signal:r.signal,error:r.error?.message,ms:Date.now()-start})+'\n'+r.stdout+r.stderr);
 console.log(name,r.status,(r.stderr||r.stdout||'').slice(-1800));return r;
}
await mkdir(scratch+'/stage',{recursive:true});
await writeFile(scratch+'/stage/package.json','{"type":"module"}');
await writeFile(scratch+'/stage/tsconfig.json',JSON.stringify({compilerOptions:{strict:true,skipLibCheck:true,noEmit:true,allowImportingTsExtensions:true,target:'es2022',module:'nodenext',moduleResolution:'nodenext'}}));
let revenue=(await readFile(root+'/examples/demo/lib/revenue.ts','utf8')).replace('../app/api/analytics/revenue/events.ts','./events.ts');
await writeFile(scratch+'/stage/revenue-js.ts',revenue);
await writeFile(scratch+'/stage/revenue.ts',revenue.replace('export async function revenue','export function revenue'));
await writeFile(scratch+'/stage/revenue-fixtures.ts',(await readFile(root+'/examples/demo/lib/revenue-fixtures.ts','utf8')).replace('../app/api/analytics/revenue/events.ts','./events.ts'));
await writeFile(scratch+'/stage/events.ts',await readFile(root+'/examples/demo/app/api/analytics/revenue/events.ts'));
await writeFile(scratch+'/stage/json.ts',await readFile(root+'/packages/next-scriptc/src/functions/json.ts'));
// Strip types at BUILD time for a bundled-JS-like cold-start baseline.
for(const name of ['revenue-js','revenue-fixtures','events','json']) {
 const ts=(await readFile(scratch+'/stage/'+name+'.ts','utf8')).replace(/\.ts(['"])/g,'.mjs$1');
 await writeFile(scratch+'/stage/'+name+'.mjs',stripTypeScriptTypes(ts,{mode:'strip'}));
}
await writeFile(scratch+'/stage/client.mjs',(await readFile(root+'/packages/next-scriptc/src/functions/client.mjs','utf8')).replace('./json.ts','./json.mjs'));
await writeFile(scratch+'/stage/sidecar.mjs',await readFile(root+'/packages/next-scriptc/src/functions/sidecar.mjs'));
await writeFile(scratch+'/stage/entry.ts',`import {revenue} from './revenue.ts';\nimport {serialize} from './json.ts';\nexport function run(input:string):string {const a=JSON.parse(input) as [string,string,number,boolean];const value=revenue(a[0],a[1],a[2],a[3]);return serialize(value,true,()=>JSON.stringify(value));}\nexport function echo(input:string):string{return input;}\n`);
const serial=process.argv.includes('--serialized');
const variant=serial?'-serialized':'';
export const profile={profile_format:1,name:'revenue_napi',entry:'entry.ts',emission:'llvm',abi:{prefix:'rev_',init_symbol:'rev_init',sink_register_symbol:'rev_sink',collect_symbol:'rev_collect',localize_runtime:true,instance_per_thread:!serial},exports:[{export:'run',symbol:'rev_run',params:['string'],returns:'string'},{export:'echo',symbol:'rev_echo',params:['string'],returns:'string'}]};
await writeFile(scratch+'/stage/profile'+variant+'.json',JSON.stringify(profile,null,2)+'\n');
await writeFile(import.meta.dirname+'/raw/profile'+variant+'.json',JSON.stringify(profile,null,2)+'\n');
if(process.argv.includes('--linux')) {
 const pack=process.env.LINUX_PACK;
 if(!pack)throw new Error('Set LINUX_PACK to stock @scriptc/runtime-linux-x64-gnu@0.4.6');
 if((await run('linux'+variant+'-library',compiler,['build','--lib','--profile',scratch+'/stage/profile'+variant+'.json','-o',scratch+'/revenue-linux'+variant+'.lib.a'],{SCRIPTC_TARGET:'x86_64-linux-gnu.2.34',SCRIPTC_RUNTIME_PACK:pack})).status)process.exit(1);
 const args=['cc','-target','x86_64-linux-gnu.2.34','-O2',...(serial?['-DSERIALIZED_RUNTIME']:[]),'-fPIC','-shared','-I'+headers,root+'/research/napi/src/addon.c',scratch+'/revenue-linux'+variant+'.lib.a','-lm','-lpthread','-ldl','-Wl,--allow-shlib-undefined','-o',scratch+'/revenue-linux'+variant+'.node'];
 if((await run('linux'+variant+'-link','zig',args)).status)process.exit(1);
} else {
 if((await run('macos'+variant+'-library',compiler,['build','--lib','--profile',scratch+'/stage/profile'+variant+'.json','-o',scratch+'/revenue'+variant+'.lib.a'])).status)process.exit(1);
 if((await run('macos'+variant+'-link','clang',['-O2',...(serial?['-DSERIALIZED_RUNTIME']:[]),'-fPIC','-bundle','-undefined','dynamic_lookup','-I'+headers,root+'/research/napi/src/addon.c',scratch+'/revenue'+variant+'.lib.a','-o',scratch+'/revenue'+variant+'.node'])).status)process.exit(1);
 if(!process.argv.includes('--addon-only')) {
 await writeFile(scratch+'/stage/sidecar.ts',`import {serveFunctions} from ${JSON.stringify(root+'/packages/next-scriptc/src/functions/serve.ts')};\nimport {revenue} from './revenue-js.ts';\nserveFunctions(async (id:string,body:string)=>{const a=JSON.parse(body) as [string,string,number,boolean];const value=await revenue(a[0],a[1],a[2],a[3]);return {value,encode:()=>JSON.stringify(value)};});\n`);
 if((await run('sidecar-build',compiler,['build',scratch+'/stage/sidecar.ts','-o',scratch+'/functions','--optimization','release','--strip','--no-keep-llvm','--node-islands=off'])).status)process.exit(1);
 }
}
