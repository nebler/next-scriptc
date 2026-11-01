import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..'), scratch=root+'/.checks/napi-vercel', stage=scratch+'/stage';
await mkdir(stage,{recursive:true});
for(const [name,file] of Object.entries({'revenue-js':'examples/demo/lib/revenue.ts','revenue-fixtures':'examples/demo/lib/revenue-fixtures.ts',events:'examples/demo/app/api/analytics/revenue/events.ts',json:'packages/next-scriptc/src/functions/json.ts'})){
 const ts=(await readFile(root+'/'+file,'utf8')).replaceAll('../app/api/analytics/revenue/events.ts','./events.ts');
 await writeFile(stage+'/'+name+'.ts',ts);
 await writeFile(stage+'/'+name+'.mjs',stripTypeScriptTypes(ts.replace(/\.ts(['"])/g,'.mjs$1'),{mode:'strip'}));
}
await writeFile(stage+'/package.json','{"type":"module"}');
await writeFile(stage+'/tsconfig.json',JSON.stringify({compilerOptions:{strict:true,skipLibCheck:true,noEmit:true,allowImportingTsExtensions:true,target:'es2022',module:'nodenext',moduleResolution:'nodenext'}}));
await writeFile(stage+'/client.mjs',(await readFile(root+'/packages/next-scriptc/src/functions/client.mjs','utf8')).replace('./json.ts','./json.mjs'));
await copyFile(root+'/packages/next-scriptc/src/functions/sidecar.mjs',stage+'/sidecar.mjs');
await writeFile(stage+'/sidecar.ts',`import {serveFunctions} from ${JSON.stringify(root+'/packages/next-scriptc/src/functions/serve.ts')};\nimport {revenue} from './revenue-js.ts';\nserveFunctions(async (id:string,body:string)=>{const a=JSON.parse(body) as [string,string,number,boolean];const value=await revenue(a[0],a[1],a[2],a[3]);return {value,encode:()=>JSON.stringify(value)};});\n`);
const compiler=process.env.SCRIPTC||'/Users/noah/code/next-scriptc/packages/next-scriptc/node_modules/scriptc/bin/scriptc.exe';
const args=['build',stage+'/sidecar.ts','-o',scratch+'/functions','--optimization','release','--strip','--no-keep-llvm','--node-islands=off'];
const log=execFileSync(compiler,args,{env:{...process.env,SCRIPTC_CHECKER_SERVER:'0',SCRIPTC_TARGET:'x86_64-linux-gnu.2.34',SCRIPTC_RUNTIME_PACK:scratch+'/package'},encoding:'utf8'});
await writeFile(import.meta.dirname+'/raw/build.log',log);
const addon=process.env.A1_ADDON||'/Users/noah/.t3/worktrees/next-scriptc/t3-467c8da0/.checks/napi/revenue-linux-serialized.node';
const bytes=await readFile(addon);const hash=createHash('sha256').update(bytes).digest('hex');
if(hash!=='9f579716b498a7c74ad0f4e7d6c09a357062d3c4656be54cc9c74a69c81771c8')throw Error('A1 hash mismatch');
await copyFile(addon,scratch+'/revenue.node');
await writeFile(import.meta.dirname+'/raw/artifacts.json',JSON.stringify({compiler,args,scriptc:'0.4.6',pack:JSON.parse(await readFile(scratch+'/package/package.json')),addon:{sha256:hash,bytes:bytes.length},sidecarSha256:createHash('sha256').update(await readFile(scratch+'/functions')).digest('hex')},null,2));
console.log('Prepared exact A1 addon and Linux sidecar');
