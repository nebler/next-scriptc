import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,mkdtemp,rm,writeFile,readdir,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

// Run against an installed copy of the example, outside the workspace. Serial installs
// keep disk use bounded. The build is part of the test, never a prebuilt fixture.
for(const framework of ['nuxt','tanstack'])test(`${framework}: production Node HTTP parity and verified shadow`,{
 skip:!process.env[`SCRIPTC_${framework.toUpperCase()}_APP`],timeout:180000
},async()=>{
 const root=process.env[`SCRIPTC_${framework.toUpperCase()}_APP`];
 execFileSync('npm',['run','build'],{cwd:root,stdio:'pipe',timeout:120000});
 for(const name of ['promotion.node','ids.json','encodings.json'])assert.ok((await readFile(path.join(root,'.output/server/scriptc-promotion',name))).length);
 const publicDir=path.join(root,'.output/public');
 for(const file of await readdir(publicDir,{recursive:true}))if(file.endsWith('.js'))
  assert.doesNotMatch(await readFile(path.join(publicDir,file),'utf8'),/loadPromotion|scriptc-promote:runtime|promotion\.node/);
 const server=path.join(root,'.output/relocated-server');
 await rm(server,{recursive:true,force:true});
 await rename(path.join(root,'.output/server'),server);
 const crash=await mkdtemp(path.join(tmpdir(),'scriptc-framework-'));
 async function serve(mode,port){
  let logs='';
  const child=spawn(process.execPath,[path.join(server,'index.mjs')],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),SCRIPTC_PROMOTE:mode,NEXT_SCRIPTC_CRASH_DIR:crash},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
  const url=`http://127.0.0.1:${port}/api/compute`;
  try{
   let ready=false;
   for(let i=0;i<200;i++){
    if(child.exitCode!==null)throw Error(logs);
    try{const res=await fetch(url);assert.equal(res.status,200);ready=true;break;}catch{await new Promise(r=>setTimeout(r,25));}
   }
   assert.ok(ready,logs);
   const bodies=[];
   for(let i=0;i<150;i++){
    const response=await fetch(url+'?n='+[0,1,10,100,1000,10000][i%6]);assert.equal(response.status,200);
    bodies.push(await response.text());await new Promise(r=>setTimeout(r,2));
   }
   const states=await (await fetch(url+'?state')).json();
   if(mode==='1'){
    assert.ok(states.length>0,logs);
    for(const state of states)for(const fn of Object.values(state)){
     assert.equal(fn.fallback,0);assert.ok(fn.buckets.some(b=>b.verified>=3),JSON.stringify({states,logs}));
    }
    assert.match(logs,/"state":"shadow"/);
    assert.doesNotMatch(logs,/promotion unavailable/);
   }else assert.deepEqual(states,[]);
   return {bodies,states};
  }finally{child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}
 }
 try{
  const js=await serve('0',framework==='nuxt'?4211:4213),promoted=await serve('1',framework==='nuxt'?4212:4214);
  assert.deepEqual(promoted.bodies,js.bodies);
  const result={framework,byteIdentical:true,relocated:true,clientIsolated:true,requests:js.bodies.length,states:promoted.states.map(state=>Object.fromEntries(Object.entries(state).map(([id,fn])=>[id,{calls:fn.calls,native:fn.native,fallback:fn.fallback,buckets:fn.buckets.map(({state,bucket,verified})=>({state,bucket,verified}))}])))};
  if(process.env.SCRIPTC_FRAMEWORK_RESULT)await writeFile(process.env.SCRIPTC_FRAMEWORK_RESULT,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
 }finally{await rm(crash,{recursive:true,force:true});}
});
