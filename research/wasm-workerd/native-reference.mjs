// Optional local production-sidecar reference, deliberately separate from Worker timings.
import {readFile,writeFile} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {cases,stats} from './cases.mjs';
const root=path.resolve(import.meta.dirname,'../..'),scratch=root+'/.checks/wasm-workerd';
const compiler=process.env.SCRIPTC||'/Users/noah/code/next-scriptc/packages/next-scriptc/node_modules/scriptc/bin/scriptc.exe';
await writeFile(scratch+'/stage/native-entry.ts',`import {serveFunctions} from ${JSON.stringify(root+'/packages/next-scriptc/src/functions/serve.ts')};\nimport {revenue} from './revenue-js.ts';\nserveFunctions(async (id:string,body:string)=>{const a=JSON.parse(body) as [string,string,number,boolean];const value=await revenue(a[0],a[1],a[2],a[3]);return {value,encode:()=>JSON.stringify(value)};});\n`);
const compiled=spawnSync(compiler,['build',scratch+'/stage/native-entry.ts','-o',scratch+'/native-functions','--optimization','release','--strip','--no-keep-llvm','--node-islands=off'],{cwd:scratch,encoding:'utf8',env:{...process.env,SCRIPTC_CHECKER_SERVER:'0'},maxBuffer:8e6});
await writeFile(import.meta.dirname+'/logs/native-build.log',JSON.stringify({status:compiled.status})+'\n'+compiled.stdout+compiled.stderr);
if(compiled.status)throw new Error(compiled.stderr);
const child=spawn(scratch+'/native-functions',[],{env:{...process.env,PORT:'0',NEXT_SCRIPTC_PARENT:String(process.pid)},stdio:['ignore','pipe','pipe']});
const closed=new Promise(resolve=>child.on('close',resolve));let log='';child.stderr.on('data',b=>log+=b);
try {
 const port=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error(log)),30000);child.stdout.on('data',b=>{log+=b;const m=log.match(/127\.0\.0\.1:(\d+)/);if(m){clearTimeout(timeout);resolve(Number(m[1]));}});child.once('exit',()=>{clearTimeout(timeout);reject(new Error(log));});});
 const {callNative}=await import(root+'/packages/next-scriptc/src/functions/client.mjs');
 const result={node:process.version,warmups:30,samples:120,cases:[]};
 for(const spec of cases.filter(c=>c.kind==='revenue')) {
  const c={kind:spec.kind,size:spec.size,warmup:[],samples:[]};result.cases.push(c);
  const expected=(await readFile(import.meta.dirname+'/raw/revenue-'+spec.size+'-result.json','utf8')).trimEnd();
  for(let i=-30;i<120;i++) {
   const start=performance.now();const value=await callNative(port,'revenue',spec.args);const ms=performance.now()-start;
   const text=JSON.stringify(value);assert.equal(text,expected);const row={i,ms,sha256:createHash('sha256').update(text).digest('hex')};
   (i<0?c.warmup:c.samples).push(row);
  }
  c.wallMs=stats(c.samples.map(x=>x.ms));console.log('native',spec.size,c.wallMs);
  await writeFile(import.meta.dirname+'/raw/native.json',JSON.stringify(result,null,2)+'\n');
 }
} finally {child.kill('SIGTERM');await closed;await writeFile(import.meta.dirname+'/logs/native-server.log',log);}
