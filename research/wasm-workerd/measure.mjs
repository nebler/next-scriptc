import {spawn,spawnSync} from 'node:child_process';
import {readFile,writeFile,open} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {cases,stats} from './cases.mjs';
const root=path.resolve(import.meta.dirname,'../..'),scratch=root+'/.checks/wasm-workerd';
const out=process.env.BENCH_OUT||import.meta.dirname+'/raw/workerd.json';
const warmups=Number(process.env.WARMUPS||30),batches=Number(process.env.BATCHES||6),batchSize=Number(process.env.BATCH_SIZE||20);
const result={date:new Date().toISOString(),node:process.version,platform:process.platform,arch:process.arch,warmups,batches,batchSize,cases:[],loadBefore:spawnSync('ps',['-Ao','pid,ppid,pcpu,comm','-r'],{encoding:'utf8'}).stdout.split('\n').slice(0,16)};
const cpu=pid=>{const r=spawnSync('python3',[import.meta.dirname+'/cpu.py',String(pid)],{encoding:'utf8'});if(r.status)throw new Error(r.stderr);return JSON.parse(r.stdout);};
const save=()=>writeFile(out,JSON.stringify(result,null,2)+'\n');
for(const spec of cases.filter(x=>!process.env.KIND||x.kind===process.env.KIND)) {
 const c={...spec,warmup:[],samples:[],cpuBatches:[],meta:{},failures:[]};delete c.args;result.cases.push(c);await save();
 const children={};
 try {
  for(const [variant,port] of [['js',18990],['wasm',18991]]) {
   const log=await open(import.meta.dirname+'/logs/'+spec.kind+'-'+spec.size+'-'+variant+'.log','w');
   const child=spawn(scratch+'/node_modules/.bin/workerd',['serve',scratch+'/'+spec.kind+'-'+variant+'.capnp','--socket-addr','http=127.0.0.1:'+port],{stdio:['ignore',log.fd,log.fd]});
   children[variant]={child,port,log,closed:new Promise(resolve=>child.once('close',resolve))};
   for(let tries=0;;tries++) {try {const r=await fetch('http://127.0.0.1:'+port+'/health');assert.equal(r.status,200);break;}catch(e){if(tries>=100||child.exitCode!==null)throw e;await delay(50);}}
  }
  const request=async variant=>{
   const start=performance.now();
   const response=await fetch('http://127.0.0.1:'+children[variant].port+'/run',{method:'POST',body:JSON.stringify(spec.args)});
   const text=await response.text();const ms=performance.now()-start;
   if(response.status!==200)throw new Error(variant+' HTTP '+response.status+' '+text);
   const hash=createHash('sha256').update(text).digest('hex');
   if(c.sha256)assert.equal(hash,c.sha256,'complete result JSON differs');else {c.sha256=hash;c.resultBytes=Buffer.byteLength(text);await writeFile(import.meta.dirname+'/raw/'+spec.kind+'-'+spec.size+'-result.json',text+'\n');}
   return {variant,ms,sha256:hash};
  };
  for(let i=0;i<warmups;i++)for(const variant of i%2?['wasm','js']:['js','wasm'])c.warmup.push({i,...await request(variant)});
  for(let batch=0;batch<batches;batch++) {
   for(const variant of batch%2?['wasm','js']:['js','wasm']) {
    const before=cpu(children[variant].child.pid);const start=performance.now();
    for(let i=0;i<batchSize;i++)c.samples.push({batch,i,...await request(variant)});
    const elapsedMs=performance.now()-start;const after=cpu(children[variant].child.pid);
    c.cpuBatches.push({batch,variant,pid:children[variant].child.pid,before,after,elapsedMs,cpuMs:(after.user_ns+after.system_ns-before.user_ns-before.system_ns)/1e6,requests:batchSize});
    await save();console.log(spec.kind,spec.size,variant,'batch',batch,'CPU ms/request',(c.cpuBatches.at(-1).cpuMs/batchSize).toFixed(3));
   }
  }
  for(const variant of ['js','wasm']) {
   c.meta[variant]=await (await fetch('http://127.0.0.1:'+children[variant].port+'/meta')).json();
   c[variant]={wallMs:stats(c.samples.filter(x=>x.variant===variant).map(x=>x.ms)),cpuMsPerRequest:stats(c.cpuBatches.filter(x=>x.variant===variant).map(x=>x.cpuMs/x.requests))};
  }
  c.cpuSpeedup=c.js.cpuMsPerRequest.mean/c.wasm.cpuMsPerRequest.mean;
 }catch(e){c.failures.push({message:String(e.stack||e)});console.error(e);}
 finally {for(const {child} of Object.values(children))child.kill('SIGTERM');for(const {closed,log} of Object.values(children)){await closed;await log.close();}await save();}
}
result.loadAfter=spawnSync('ps',['-Ao','pid,ppid,pcpu,comm','-r'],{encoding:'utf8'}).stdout.split('\n').slice(0,16);await save();
