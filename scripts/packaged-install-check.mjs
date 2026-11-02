#!/usr/bin/env node
// Real packed install; serial builds; no Vercel CLI, credentials, or API.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp, mkdir, readFile, writeFile, rm, realpath, readdir, lstat, cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import net from 'node:net';
assert(Number(process.versions.node.split('.')[0])>=24,'Node >=24 required');
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const temporary=await realpath(await mkdtemp(path.join(tmpdir(),'next-scriptc-install-')));
assert(!temporary.startsWith(repo+path.sep));
// Do not inherit compiler overrides, NODE_PATH, or hosted adapter settings.
const env={...process.env,NEXT_TELEMETRY_DISABLED:'1',NEXT_ENABLE_ADAPTER:'1',NODE_OPTIONS:'',NODE_PATH:''};
for(const key of ['SCRIPTC_COMPILER','NEXT_SCRIPTC_VERCEL','NEXT_ADAPTER_PATH','LINUX_PACK'])delete env[key];
async function run(command,args,cwd=temporary,extra={}){
 let output='';const child=spawn(command,args,{cwd,env:{...env,...extra},stdio:['ignore','pipe','pipe'],timeout:600000});
 child.stdout.on('data',b=>{output+=b;process.stdout.write(b);});child.stderr.on('data',b=>{output+=b;process.stderr.write(b);});
 const [code,signal]=await once(child,'exit');assert.equal(code,0,`${command} failed (${signal}): ${output}`);return output;
}
const write=async(file,text)=>{await mkdir(path.dirname(file),{recursive:true});await writeFile(file,text);};
const app=path.join(temporary,'app');
const report={node:process.version,checks:[]};
try{
 await run('pnpm',['pack','--pack-destination',temporary],path.join(repo,'packages/scriptc-promote'));
 await run('pnpm',['pack','--pack-destination',temporary],path.join(repo,'packages/next-scriptc'));
 const tarballs=await readdir(temporary);
 const tarball=tarballs.find(f=>f.startsWith('next-scriptc-')&&f.endsWith('.tgz'));
 const coreTarball=tarballs.find(f=>f.startsWith('scriptc-promote-')&&f.endsWith('.tgz'));
 await write(path.join(app,'package.json'),JSON.stringify({private:true,type:'module',allowScripts:{scriptc:true},dependencies:{'next-scriptc':`file:../${tarball}`,'scriptc-promote':`file:../${coreTarball}`,next:'16.4.3',react:'19.3.0','react-dom':'19.3.0',typescript:'5.9.3','@types/node':'24.10.0','@types/react':'19.2.2'}}));
 await run('npm',['install','--no-audit','--no-fund','--foreground-scripts'],app);
 const require=createRequire(path.join(app,'package.json'));
 const adapter=path.dirname(require.resolve('next-scriptc'));
 assert((await realpath(adapter)).startsWith(app+path.sep));
 assert((await realpath(require.resolve('typescript'))).startsWith(app+path.sep));
 // npm tarball installs must contain no links back to a workspace.
 async function noRepoLinks(dir){for(const e of await readdir(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isSymbolicLink())assert(!(await realpath(f)).startsWith(repo+path.sep),f);else if(e.isDirectory())await noRepoLinks(f);}}
 await noRepoLinks(path.join(app,'node_modules'));
 await write(path.join(app,'tsconfig.json'),JSON.stringify({compilerOptions:{strict:true,target:'ES2022',module:'esnext',moduleResolution:'bundler',esModuleInterop:true,skipLibCheck:true},include:['**/*.ts']}));
 await write(path.join(app,'lib/helper.mjs'),'export const factor=2;export function twice(){return factor;}\n');
 await write(path.join(app,'lib/helper.d.mts'),'export function twice():number;\n');
 await write(path.join(app,'lib/kernels.ts'),`import {twice} from './helper.mjs';
export function loop(x:{n:number}[]){let total=0;for(const row of x)total+=row.n;return {total};}
export function imported(x:number[]){return x.map(v=>v*twice());}
export function optional(x:{n:number,extra?:number}[]){return x.map(v=>({n:v.n+(v.extra??0)}));}
export function destructured({values}:{values:number[]}){let total=0;for(const n of values)total+=n;return {total};}
`);
 await write(path.join(app,'pages/api/check.js'),`import {loop,imported,optional,destructured} from '../../lib/kernels';
export default function handler(req,res){
if(req.method==='GET'){res.json([...globalThis[Symbol.for('next-scriptc.functions.promotion')].values()][0].snapshot());return;}
const x=req.body;const which=Number(req.query.fn);const result=which===0?loop(x.rows):which===1?imported(x.values):which===2?optional(x.rows):which===3?destructured({values:x.values}):[loop(x.rows),imported(x.values),optional(x.rows),destructured({values:x.values})];res.status(200).json(result);}
`);
 await write(path.join(app,'next.config.mjs'),`import {withScriptc} from 'next-scriptc';
export default withScriptc({experimental:{cpus:2}}, {nativePromotion:process.env.CHECK_PROMOTION==='1'?'auto':'off'});
`);
 const next=require.resolve('next/dist/bin/next');
 const payloads=[{rows:[],values:[]},{rows:[{n:1},{n:2,extra:4}],values:[1,2,3]},{rows:[{n:-0,extra:0},{n:3.25}],values:[-3,0,4.5]}];
 async function serve(extra,expected){
  const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(r=>socket.close(r));
  let logs='';const child=spawn(process.execPath,[next,'start','-p',String(port)],{cwd:app,env:{...env,...extra,NEXT_SCRIPTC_CRASH_DIR:path.join(temporary,'crashes')},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',b=>{logs+=b;});child.stderr.on('data',b=>{logs+=b;});
  try{
   for(let i=0;i<200&&!logs.includes('Ready in');i++){assert(child.exitCode===null,logs);await new Promise(r=>setTimeout(r,100));}assert.match(logs,/Ready in/);
   const bytes=[];
   // Same bucket per function and spaced requests let asynchronous shadows finish.
   for(let i=0;i<(expected?280:payloads.length);i++){
    const fn=Math.floor(i/70);const index=expected?1:i%payloads.length;const response=await fetch(`http://127.0.0.1:${port}/api/check${expected?'?fn='+fn:''}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payloads[index])});assert.equal(response.status,200);const body=await response.text();
    if(expected)assert.equal(body,JSON.stringify(JSON.parse(expected[index])[fn]));else bytes.push(body);
    if(expected)await new Promise(r=>setTimeout(r,15));
   }
   if(expected){assert.doesNotMatch(logs,/promotion unavailable|demoted|TypeScript checker unavailable/);assert.match(logs,/"state":"shadow"/);const crashes=await readdir(path.join(temporary,'crashes'));assert(crashes.length>0,'crash guard initialized');const snapshots=await (await fetch(`http://127.0.0.1:${port}/api/check`)).json();assert(Object.keys(snapshots).length>=4);for(const fn of Object.values(snapshots))assert(fn.buckets.some(b=>b.verified>0),'verified native shadow');report.dispatcher=logs;report.snapshots=snapshots;}
   return bytes;
  }finally{if(child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await exited;}}
 }
 await run(process.execPath,[next,'build','--webpack'],app,{CHECK_PROMOTION:'0'});
 const expected=await serve({CHECK_PROMOTION:'0'});
 await rm(path.join(app,'.next'),{recursive:true,force:true});
 const build=await run(process.execPath,[next,'build','--webpack'],app,{CHECK_PROMOTION:'1'});
 assert.doesNotMatch(build,/TypeScript checker unavailable/);
 const cache=path.join(app,'.next/cache/scriptc-promotion');
 const construction=JSON.parse(await readFile(path.join(cache,'construction-report.json')));
 report.typescript={path:require.resolve('typescript'),version:require('typescript').version};report.construction=construction;
 const dependencies=JSON.parse(await readFile(path.join(cache,'dependency-report.json')));
 for(const name of ['loop','imported','optional','destructured'])assert(construction.some(r=>r.name===name),`discovery: ${name}`);
 assert(construction.every(r=>r.reason!=='TypeScript checker unavailable'));
 assert(construction.some(r=>r.eligible),'construction proof executed successfully');
 assert(dependencies.some(r=>r.functions.includes('imported')&&r.dependencies.some(d=>d.file?.endsWith('helper.mjs')||d.path?.endsWith('helper.mjs'))),'ESM dependency closure');
 report.dependencies=dependencies;
 const ids=JSON.parse(await readFile(path.join(app,'.next/scriptc-promotion/ids.json')));assert.equal(ids.length,construction.length,'all discovered functions compiled');
 assert((await lstat(path.join(app,'.next/scriptc-promotion/promotion.node'))).size>0);
 await serve({CHECK_PROMOTION:'1'},expected);
 report.checks.push('packed install, app checker, discovery, ESM closure, construction, retained addon, crash guard, shadow, HTTP byte parity');
 // A local output adapter replaces only the hosting service's output emitter.
 // The real Next cleanup and next-scriptc modifyConfig/onBuildComplete run.
 const fixture=path.join(app,'local-output-adapter.mjs');
 await write(fixture,`import {mkdir,writeFile,cp} from 'node:fs/promises';import path from 'node:path';
export default {name:'offline-output',modifyConfig(c){return c;},async onBuildComplete({distDir,projectDir}){
 for(const [name,runtime,source] of [['promoted','nodejs24.x','next-scriptc.functions.promotion'],['plain','nodejs24.x','plain'],['edge','edge','next-scriptc.functions.promotion']]){
 const owner=path.join(distDir,'output/functions',name+'.func');await mkdir(owner,{recursive:true});await writeFile(path.join(owner,'handler.js'),source);await writeFile(path.join(owner,'.vc-config.json'),JSON.stringify({runtime,handler:'handler.js',filePathMap:{'handler.js':'handler.js'}}));}
 await mkdir(path.join(projectDir,'.vercel/output'),{recursive:true});await cp(path.join(distDir,'output'),path.join(projectDir,'.vercel/output'),{recursive:true});
}};
`);
 await rm(path.join(app,'.next'),{recursive:true,force:true});
 await run(process.execPath,[next,'build','--webpack'],app,{CHECK_PROMOTION:'1',NEXT_SCRIPTC_VERCEL:path.join(app,'.vercel/scriptc-build'),NEXT_ADAPTER_PATH:fixture});
 const linux=await readFile(path.join(app,'.next/scriptc-promotion/promotion.node'));
 assert.equal(linux.subarray(0,4).toString('hex'),'7f454c46');assert.equal(linux.readUInt16LE(18),62,'ELF x86-64');report.linux={format:'ELF',machine:62,target:'linux-x64-gnu'};
 const owner=path.join(app,'.next/output/functions/promoted.func/.next/scriptc-promotion');
 for(const name of ['promotion.node','ids.json','encodings.json'])assert.deepEqual(await readFile(path.join(owner,name)),await readFile(path.join(app,'.next/scriptc-promotion',name)));
 for(const name of ['plain','edge'])await assert.rejects(lstat(path.join(app,`.next/output/functions/${name}.func/.next/scriptc-promotion`)),{code:'ENOENT'});
 // Vercel CLI's final copy is a filesystem operation, reproduced locally.
 await rm(path.join(app,'.vercel/output'),{recursive:true,force:true});await cp(path.join(app,'.next/output'),path.join(app,'.vercel/output'),{recursive:true});
 assert.deepEqual(await readFile(path.join(app,'.vercel/output/functions/promoted.func/.next/scriptc-promotion/promotion.node')),linux);
 report.checks.push('offline Vercel lifecycle: Zig linux-x64-gnu ELF retained in function output, plain/edge excluded');
 console.log(JSON.stringify(report,null,2));
 if(process.env.PACKAGED_CHECK_REPORT)await writeFile(path.resolve(process.env.PACKAGED_CHECK_REPORT),JSON.stringify(report,null,2)+'\n');
}finally{await rm(temporary,{recursive:true,force:true});}
