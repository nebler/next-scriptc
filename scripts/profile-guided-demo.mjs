import {spawn} from 'node:child_process';
import {writeFile,access,mkdtemp,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
// Build both examples first; see research/profile-guided-promotion.md.
const directory=await mkdtemp('/tmp/scriptc-profile-');
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(root+'/packages/scriptc-promote/src/report.mjs');
const preload=directory+'/preload.cjs';
await writeFile(preload,`const {Session}=require('node:inspector');const {writeFileSync}=require('node:fs');const s=new Session();s.connect();const post=(m)=>new Promise((r,j)=>s.post(m,(e,v)=>e?j(e):r(v)));let started=false;process.on('SIGUSR2',async()=>{if(!started){await post('Profiler.enable');await post('Profiler.start');started=true;writeFileSync(process.env.P3_CAPTURE+'.ready','');}else{const {profile}=await post('Profiler.stop');writeFileSync(process.env.P3_CAPTURE,JSON.stringify(profile));}});`);
for(const [app,port,count] of [['shared-native',3411,12],['demo',3412,30]]){
 const output=directory+'/'+app+'.cpuprofile';
 const child=spawn(process.execPath,['--require',preload,require.resolve('next/dist/bin/next',{paths:[root+'/examples/'+app]}),'start','-p',String(port)],{cwd:root+'/examples/'+app,env:{...process.env,P3_CAPTURE:output,...(app==='demo'?{NEXT_SCRIPTC_BASELINE:'node'}:{})},stdio:['ignore','pipe','pipe']});
 let failure;child.on('error',error=>{failure=error;});
 const check=()=>{if(failure)throw failure;if(child.exitCode!==null||child.signalCode!==null)throw Error(`${app} server exited before capture completed`);};
 const waitForFile=async file=>{const deadline=Date.now()+15000;for(;;){check();try{await access(file);return;}catch{}if(Date.now()>deadline)throw Error(`Timed out waiting for ${file}`);await new Promise(r=>setTimeout(r,30));}};
 child.stdout.on('data',d=>process.stdout.write(d));child.stderr.on('data',d=>process.stderr.write(d));
 try{
  for(let n=0;;n++){check();try{await fetch('http://localhost:'+port+'/api/hello',{signal:AbortSignal.timeout(5000)});break;}catch(e){if(n>100)throw e;await new Promise(r=>setTimeout(r,100));}}
  child.kill('SIGUSR2');await waitForFile(output+'.ready');
  for(let n=0;n<count;n++){
   const routes=app==='shared-native'?['/api/forecast']:['/api/primes?limit=3000000','/api/posts/reliable-webhooks','/api/search?q=desk&limit=7'];
   for(const route of routes){const response=await fetch('http://localhost:'+port+route,app==='shared-native'?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({trials:100000,seed:42,cash:500000,revenue:100000,costs:110000})}:{});await response.arrayBuffer();if(!response.ok)throw Error(route+' '+response.status);}
  }
  child.kill('SIGUSR2');await waitForFile(output);
  console.log('Captured',output);
 }finally{if(child.pid&&child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}}
}

await rm(preload);
console.log(`Profiles: ${directory}`);
