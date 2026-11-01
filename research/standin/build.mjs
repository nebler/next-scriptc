// Cross-build with the same stock compiler and C shim as A1/A2. No patched compiler.
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {stripTypeScriptTypes} from 'node:module';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..'),s=root+'/.checks/standin';
const compiler=process.env.SCRIPTC||'/Users/noah/code/next-scriptc/packages/next-scriptc/node_modules/scriptc/bin/scriptc.exe';
const headers=process.env.NODE_HEADERS||'/Users/noah/Library/Caches/node-gyp/24.22.1/include/node';
await mkdir(s+'/stage',{recursive:true});
for(const [name,file] of Object.entries({'revenue-js':'examples/demo/lib/revenue.ts','revenue-fixtures':'examples/demo/lib/revenue-fixtures.ts',events:'examples/demo/app/api/analytics/revenue/events.ts',json:'packages/next-scriptc/src/functions/json.ts'})){
 const ts=(await readFile(root+'/'+file,'utf8')).replaceAll('../app/api/analytics/revenue/events.ts','./events.ts');
 await writeFile(s+'/stage/'+name+'.ts',ts);await writeFile(s+'/stage/'+name+'.mjs',stripTypeScriptTypes(ts.replace(/\.ts(['"])/g,'.mjs$1'),{mode:'strip'}));
}
await writeFile(s+'/stage/revenue.ts',(await readFile(s+'/stage/revenue-js.ts','utf8')).replace('export async function revenue','export function revenue'));
for(const name of ['client','sidecar'])await writeFile(s+'/stage/'+name+'.mjs',(await readFile(root+'/packages/next-scriptc/src/functions/'+name+'.mjs','utf8')).replace('./json.ts','./json.mjs'));
await writeFile(s+'/stage/package.json','{"type":"module"}');
await writeFile(s+'/stage/tsconfig.json',JSON.stringify({compilerOptions:{strict:true,skipLibCheck:true,noEmit:true,allowImportingTsExtensions:true,target:'es2022',module:'nodenext',moduleResolution:'nodenext'}}));
await writeFile(s+'/stage/entry.ts',`import {revenue} from './revenue.ts';\nimport {serialize} from './json.ts';\nexport function run(input:string):string {const a=JSON.parse(input) as [string,string,number,boolean];const value=revenue(a[0],a[1],a[2],a[3]);return serialize(value,true,()=>JSON.stringify(value));}\nexport function echo(input:string):string{return input;}\n`);
await copyFile(root+'/research/napi/raw/profile-serialized.json',s+'/stage/profile.json');
// Preserve A2's revenue dispatcher exactly. Boundary probes use a separate binary.
await writeFile(s+'/stage/sidecar.ts',`import {serveFunctions} from ${JSON.stringify(root+'/packages/next-scriptc/src/functions/serve.ts')};\nimport {revenue} from './revenue-js.ts';\nserveFunctions(async (id:string,body:string)=>{const a=JSON.parse(body) as [string,string,number,boolean];const value=await revenue(a[0],a[1],a[2],a[3]);return {value,encode:()=>JSON.stringify(value)};});\n`);
await writeFile(s+'/stage/echo-sidecar.ts',`import {serveFunctions} from './serve.ts';\nimport {revenue} from './revenue-js.ts';\ntype Result={from:string,to:string,events:number,revenueCents:number,daily:{day:string,region:string,revenueCents:number,units:number,events:number}[],timings:{parseMs:number,aggregateMs:number}|null};\nconst cache=new Map<number,Result>();\nserveFunctions(async (id:string,body:string)=>{const a=JSON.parse(body) as [string,string,number,boolean];let value=cache.get(a[2]);if(!value){value=await revenue(a[0],a[1],a[2],a[3]);cache.set(a[2],value);}const output=value;return {value:output,encode:()=>JSON.stringify(output)};});\n`);
// Same-shaped no-op retains native validation and result encoding, not just copies.
await writeFile(s+'/stage/boundary-entry.ts',`import {revenue} from './revenue.ts';\nimport {serialize} from './json.ts';\ntype Result={from:string,to:string,events:number,revenueCents:number,daily:{day:string,region:string,revenueCents:number,units:number,events:number}[],timings:{parseMs:number,aggregateMs:number}|null};\nconst cache=new Map<number,Result>();\nexport function echo(input:string):string {const a=JSON.parse(input) as [string,string,number,boolean];let value=cache.get(a[2]);if(!value){value=revenue(a[0],a[1],a[2],a[3]);cache.set(a[2],value);}const output=value;return serialize(output,true,()=>JSON.stringify(output));}\nexport function run(input:string):string{return echo(input); }\n`);
const boundaryProfile=JSON.parse(await readFile(s+'/stage/profile.json'));boundaryProfile.entry='boundary-entry.ts';
await writeFile(s+'/stage/boundary-profile.json',JSON.stringify(boundaryProfile));
const artifacts=[];
for(const arch of ['arm64','x64']){
 const target=arch==='arm64'?'aarch64-linux-gnu.2.34':'x86_64-linux-gnu.2.34',pack=s+'/'+arch+'/package';
 const env={...process.env,SCRIPTC_CHECKER_SERVER:'0',SCRIPTC_TARGET:target,SCRIPTC_RUNTIME_PACK:pack};
 const run=(cmd,args)=>{const out=execFileSync(cmd,args,{env,encoding:'utf8',maxBuffer:16e6});process.stdout.write(out);};
 run(compiler,['build','--lib','--profile',s+'/stage/profile.json','-o',s+'/'+arch+'/revenue.lib.a']);
 run('zig',['cc','-target',target,'-O2','-DSERIALIZED_RUNTIME','-fPIC','-shared','-I'+headers,root+'/research/napi/src/addon.c',s+'/'+arch+'/revenue.lib.a','-lm','-lpthread','-ldl','-Wl,--allow-shlib-undefined','-o',s+'/'+arch+'/revenue.node']);
 if(arch==='arm64')run(compiler,['build',s+'/stage/sidecar.ts','-o',s+'/'+arch+'/functions','--optimization','release','--strip','--no-keep-llvm','--node-islands=off']);
 if(arch==='arm64')run(compiler,['build',s+'/stage/echo-sidecar.ts','-o',s+'/'+arch+'/echo-functions','--optimization','release','--strip','--no-keep-llvm','--node-islands=off']);
 if(arch==='arm64'){
  run(compiler,['build','--lib','--profile',s+'/stage/boundary-profile.json','-o',s+'/'+arch+'/boundary.lib.a']);
  run('zig',['cc','-target',target,'-O2','-DSERIALIZED_RUNTIME','-fPIC','-shared','-I'+headers,root+'/research/napi/src/addon.c',s+'/'+arch+'/boundary.lib.a','-lm','-lpthread','-ldl','-Wl,--allow-shlib-undefined','-o',s+'/'+arch+'/boundary.node']);
 }
 for(const file of arch==='arm64'?['functions','echo-functions','revenue.node','boundary.node']:['revenue.node']){const b=await readFile(s+'/'+arch+'/'+file);artifacts.push({arch,file,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});}
}
await writeFile(root+'/research/standin/raw/artifacts.json',JSON.stringify({compiler,compilerSha256:createHash('sha256').update(await readFile(compiler)).digest('hex'),scriptc:'0.4.6',runtimePackVersion:'0.4.6',runtimeABI:47,nodeHeaders:'24.22.1',targetGLIBC:'2.34',zig:execFileSync('zig',['version'],{encoding:'utf8'}).trim(),artifacts},null,2));
