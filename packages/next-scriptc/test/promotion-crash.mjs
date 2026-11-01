import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
const runtime=new URL('../src/functions/promotion-runtime.mjs',import.meta.url).href;
test('segfault lease disables the same build, reset and new build recover',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'promotion-crash-'));
 try{
 const headers=process.env.NODE_HEADERS??path.join(os.homedir(),'Library/Caches/node-gyp/24.22.1/include/node');
 await writeFile(dir+'/crash.c',`#include <node_api.h>
#include <signal.h>
napi_value run(napi_env e,napi_callback_info i){raise(SIGSEGV);return 0;}
napi_value init(napi_env e,napi_value x){napi_value f;napi_create_function(e,"run",3,run,0,&f);napi_set_named_property(e,x,"run",f);return x;} NAPI_MODULE(NODE_GYP_MODULE_NAME,init)`);
 execFileSync('clang',['-bundle','-undefined','dynamic_lookup','-I'+headers,dir+'/crash.c','-o',dir+'/promotion.node']);
 await writeFile(dir+'/ids.json','["f"]');await writeFile(dir+'/encodings.json','{"functions":{"f":{"params":[],"result":"number"}}}');
 const script=`import {loadPromotion} from ${JSON.stringify(runtime)};const d=loadPromotion(${JSON.stringify(dir+'/promotion.node')},{mode:'native'});console.log(d.dispatch('f',()=>42,[]));`;
 const env={...process.env,NEXT_SCRIPTC_CRASH_DIR:dir+'/markers',NEXT_SCRIPTC_RESET_CRASH:'0'};
 const run=(extra,code=script)=>spawnSync(process.execPath,['--input-type=module','-e',code],{env:{...env,...extra},encoding:'utf8'});
 assert.equal(run().signal,'SIGSEGV');
 const disabled=run();assert.equal(disabled.status,0);assert.match(disabled.stderr,/promotion disabled/);assert.match(disabled.stdout,/42/);
 assert.equal(run({NEXT_SCRIPTC_RESET_CRASH:'1'}).signal,'SIGSEGV');
 // A metadata change represents another build and must try native again.
 await writeFile(dir+'/ids.json','["f"]\n');assert.equal(run().signal,'SIGSEGV');
 // Native reentry after the guard's exit handler must recreate the lease.
 await writeFile(dir+'/ids.json','["f"]\n\n');
 const exiting=script.replace("console.log(d.dispatch('f',()=>42,[]));","process.on('exit',()=>d.dispatch('f',()=>42,[]));");
 assert.equal(run({},exiting).signal,'SIGSEGV');assert.match(run().stderr,/promotion disabled/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

import {promotionCrashGuard} from '../src/functions/promotion-crash-guard.mjs';
import {readdir} from 'node:fs/promises';
test('live leases coexist and reused process identities fail closed',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'promotion-leases-'));
 try{
 for(const name of ['promotion.node','ids.json','encodings.json'])await writeFile(path.join(dir,name),name);
 const options={directory:dir+'/markers'};
 const a=promotionCrashGuard(dir+'/promotion.node',options);a.arm();
 const b=promotionCrashGuard(dir+'/promotion.node',options);assert.equal(b.disabled,false);b.arm();
 const build=(await readdir(options.directory))[0],leases=await readdir(path.join(options.directory,build));assert.equal(leases.length,2);
 await writeFile(path.join(options.directory,build,leases[0]),'another process birth');
 assert.equal(promotionCrashGuard(dir+'/promotion.node',options).disabled,true);
 assert.equal(promotionCrashGuard(dir+'/promotion.node',{...options,reset:true}).disabled,false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
