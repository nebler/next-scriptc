import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,rm,readdir,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
const repo=path.resolve(import.meta.dirname,'../../..');
async function run(command,args,cwd){
 let output='';const child=spawn(command,args,{cwd,env:process.env,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 const code=await new Promise(r=>child.once('exit',r));assert.equal(code,0,output);return output;
}
async function port(){const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const p=server.address().port;await new Promise(r=>server.close(r));return p;}
async function serve(root,framework,mode){
 const p=await port();let output='';
 const entry=framework==='astro'?'relocated/server/entry.mjs':'node_modules/@react-router/serve/bin.js';
 const args=framework==='astro'?[]:['relocated/server/index.js'];
 const child=spawn(process.execPath,['--import',path.join(root,'inspect.mjs'),entry,...args],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:String(p),SCRIPTC_PROMOTE:mode,NEXT_SCRIPTC_CRASH_DIR:path.join(root,'leases')},stdio:['ignore','pipe','pipe','ipc']});
 child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 const url=`http://127.0.0.1:${p}`;
 try{
  let ready=false;for(let i=0;i<200;i++){try{const response=await fetch(url+'/compute?n=1');if(response.ok){ready=true;break;}}catch{}if(child.exitCode!==null)throw Error(output);await new Promise(r=>setTimeout(r,50));}assert.ok(ready,output);
  const bodies=[];for(let i=0;i<120;i++){const response=await fetch(url+'/compute?n='+[0,1,10,100,1000,10000][i%6],{method:framework==='react-router'&&i%2?'POST':'GET'});assert.equal(response.status,200,output);bodies.push(await response.text());await new Promise(r=>setTimeout(r,3));}
  // Offset helper samples from the nested page loader's samples. Otherwise
  // the shared shadow queue can always select the inner function first.
  const extra=await fetch(url+'/compute?n=1');assert.equal(extra.status,200,output);bodies.push(await extra.text());
  await new Promise(r=>setTimeout(r,3));
  // Reachability also admits React Router's page loader beside its JSX component.
  // Exercise it enough to verify its own shadow bucket.
  let html;
  for(let i=0;i<120;i++){const page=await fetch(url+(framework==='astro'?'/':'/page'));assert.equal(page.status,200,output);html=await page.text();await new Promise(r=>setTimeout(r,3));}
  await new Promise(r=>setTimeout(r,100));const states=await new Promise(r=>{child.once('message',r);child.send('snapshot');});
  assert.doesNotMatch(output,/promotion unavailable/);
  return {bodies,html,states,transitions:output.split('\n').filter(l=>l.startsWith('next-scriptc '))};
 }finally{child.kill('SIGTERM');if(child.exitCode===null)await new Promise(r=>child.once('exit',r));}
}
for(const framework of ['astro','react-router'])test(`${framework}: production Node HTTP parity, client isolation and verified shadow`,{timeout:360000},async()=>{
 const root=await mkdtemp(path.join(tmpdir(),`scriptc-${framework}-`));
 try{
  // Install a fresh fixture; copied pnpm links can trigger dependency prepare scripts.
  await cp(path.join(repo,'examples',framework+'-demo'),root,{recursive:true,filter:source=>path.basename(source)!=='node_modules'});
  const manifest=JSON.parse(await readFile(path.join(root,'package.json')));manifest.dependencies['scriptc-promote']='file:'+path.join(repo,'packages/scriptc-promote');await writeFile(path.join(root,'package.json'),JSON.stringify(manifest));
  await run('npm',['install','--ignore-scripts','--legacy-peer-deps','--no-audit','--no-fund'],root);
  await writeFile(path.join(root,'inspect.mjs'),`process.on('message',()=>process.send([...globalThis[Symbol.for('scriptc-promote.dispatchers')]??[]].map(([,d])=>d.snapshot())));process.once('SIGTERM',()=>process.exit(0));`);
  const buildOutput=await run('npm',['run','build'],root);console.log(buildOutput);
  const out=framework==='astro'?'dist':'build';await rename(path.join(root,out),path.join(root,'relocated'));
  for(const artifact of ['promotion.node','ids.json','encodings.json'])assert.ok((await readFile(path.join(root,'relocated/server/scriptc-promotion',artifact))).length);
  const clientFiles=await readdir(path.join(root,'relocated/client'),{recursive:true});assert.ok(!clientFiles.some(file=>file.includes('scriptc-promotion')));
  for(const file of clientFiles)if(/\.(js|mjs)$/.test(file))assert.doesNotMatch(await readFile(path.join(root,'relocated/client',file),'utf8'),/loadPromotion|promotion\.node|scriptc-promote:runtime/);
  const disabled=await serve(root,framework,'0'),enabled=await serve(root,framework,'1');
  assert.deepEqual(enabled.bodies,disabled.bodies);assert.deepEqual(disabled.states,[]);
  const functions=enabled.states.flatMap(s=>Object.values(s));assert.ok(functions.length>0);
  for(const fn of functions){assert.equal(fn.fallback,0);for(const bucket of fn.buckets){assert.equal(bucket.nativeFallbacks,0);assert.equal(bucket.fallbackCount,0);}assert.ok(fn.buckets.some(b=>b.state==='shadow'&&b.verified>0),JSON.stringify(fn));}
  const states=enabled.states.map(instance=>Object.fromEntries(Object.entries(instance).map(([id,fn])=>[id,{calls:fn.calls,native:fn.native,fallback:fn.fallback,buckets:fn.buckets.map(b=>({bucket:b.bucket,state:b.state,verified:b.verified,nativeFallbacks:b.nativeFallbacks,fallbackCount:b.fallbackCount}))}])));
  const result={framework,requests:enabled.bodies.length+120,byteIdentical:true,states,transitions:enabled.transitions};
  console.log(JSON.stringify(result));
  if(process.env.SCRIPTC_FRAMEWORK_EVIDENCE)await writeFile(path.join(repo,'research',`framework-${framework}-parity.json`),JSON.stringify(result,null,2)+'\n');
 }finally{await rm(root,{recursive:true,force:true});}
});
