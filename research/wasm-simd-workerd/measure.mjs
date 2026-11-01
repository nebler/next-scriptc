import {spawn,spawnSync} from 'node:child_process';import {readFile,writeFile,open} from 'node:fs/promises';import {loadavg} from 'node:os';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';import {setTimeout as delay} from 'node:timers/promises';import {stats} from '../wasm-workerd/cases.mjs';import {instantiate} from '../wasm-workerd/src/bridge.mjs';
const root=process.cwd(),s=root+'/.checks/wasm-workerd',out=root+'/research/wasm-simd-workerd',variants=(process.env.VARIANTS||'js,stock,scalar,simd').split(',');const node=process.env.MODE==='node',warmups=30,batches=6,batchSize=20;
const result={date:new Date().toISOString(),node:process.version,v8:process.versions.v8,mode:node?'node':'workerd',warmups,batches,batchSize,cases:[],loadBefore:loadavg()};const filename=out+'/raw/'+(node?'node':'workerd')+(process.env.SUFFIX||'')+'.json';const save=()=>writeFile(filename,JSON.stringify(result,null,2));
const cpu=pid=>{const r=spawnSync('python3',[root+'/research/wasm-workerd/cpu.py',String(pid)],{encoding:'utf8'});if(r.status)throw Error(r.stderr);return JSON.parse(r.stdout);};
const specs=(process.env.KINDS||'natural,imul,float,revenue').split(',').flatMap(kind=>(kind==='revenue'?[5000]:[20000,100000]).map(size=>({kind,size,args:kind==='revenue'?['2026-01-01','2026-01-31',size,false]:[size,Array.from({length:768},(_,i)=>((i*31+17)%255)-127)]})));
for(const spec of specs.filter(x=>!process.env.KIND||x.kind===process.env.KIND)){
 const c={kind:spec.kind,size:spec.size,warmup:[],samples:[],cpuBatches:[],meta:{},failures:[]};result.cases.push(c);const children={},apis={};let js,serialize;
 try{
 if(node){js=(await import(s+'/stage/'+spec.kind+'.ts'))[spec.kind];serialize=(await import(s+'/stage/json.ts')).serialize;for(const v of variants.slice(1))apis[v]=instantiate(new WebAssembly.Module(await readFile(s+'/'+spec.kind+'-'+v+'.wasm')));}
 else for(const [index,v] of variants.entries()){
 const port=19020+index,log=await open(out+'/logs/'+spec.kind+'-'+spec.size+'-'+v+(process.env.SUFFIX||'')+'.log','w');const child=spawn(s+'/node_modules/.bin/workerd',['serve',s+'/'+spec.kind+'-'+v+'.capnp','--socket-addr','http=127.0.0.1:'+port],{stdio:['ignore',log.fd,log.fd]});children[v]={child,port,log,closed:new Promise(resolve=>child.once('close',resolve))};
 for(let i=0;;i++){try{assert.equal((await fetch('http://127.0.0.1:'+port+'/health')).status,200);break;}catch(e){if(i>100||child.exitCode!==null)throw e;await delay(50);}}
 }
 const body=JSON.stringify(spec.args);
 const request=async v=>{const usage=node?process.cpuUsage():null,start=performance.now();let text;
 if(node){const a=JSON.parse(body);text=JSON.stringify(v==='js'?await js(...a):JSON.parse(apis[v].run(serialize(a))));}else {const r=await fetch('http://127.0.0.1:'+children[v].port+'/run',{method:'POST',body});text=await r.text();if(r.status!==200)throw Error(v+' '+r.status+' '+text);}
 const ms=performance.now()-start,used=node?process.cpuUsage(usage):null,hash=createHash('sha256').update(text).digest('hex');if(c.sha256)assert.equal(hash,c.sha256);else {c.sha256=hash;c.resultBytes=Buffer.byteLength(text);if(node){const ref=JSON.parse(await readFile(out+'/raw/'+(process.env.REFERENCE||'workerd.json'),'utf8')).cases.find(x=>x.kind===spec.kind&&x.size===spec.size);assert.equal(hash,ref.sha256);}else await writeFile(out+'/raw/'+spec.kind+'-'+spec.size+'-result.json',text+'\n');}return {variant:v,ms,sha256:hash,...(node?{cpuMs:(used.user+used.system)/1000}:{})};};
 const order=i=>{const n=((i%variants.length)+variants.length)%variants.length;return variants.slice(n).concat(variants.slice(0,n));};
 for(let i=0;i<warmups;i++)for(const v of order(i))c.warmup.push({i,...await request(v)});
 for(let batch=0;batch<batches;batch++)for(const v of order(batch)){
 const loadBefore=loadavg(),before=node?null:cpu(children[v].child.pid);for(let i=0;i<batchSize;i++)c.samples.push({batch,i,...await request(v)});const after=node?null:cpu(children[v].child.pid);if(!node)c.cpuBatches.push({batch,variant:v,before,after,cpuMs:(after.user_ns+after.system_ns-before.user_ns-before.system_ns)/1e6,requests:batchSize,loadBefore,loadAfter:loadavg()});await save();console.log(result.mode,spec.kind,spec.size,batch,v);
 }
 for(const v of variants){c.meta[v]=node?(apis[v]?{memoryBytes:apis[v].memoryBytes()}:{}):await (await fetch('http://127.0.0.1:'+children[v].port+'/meta')).json();c[v]={wallMs:stats(c.samples.filter(x=>x.variant===v).map(x=>x.ms)),cpuMs:stats(node?c.samples.filter(x=>x.variant===v).map(x=>x.cpuMs):c.cpuBatches.filter(x=>x.variant===v).map(x=>x.cpuMs/x.requests))};}
 }catch(e){c.failures.push(String(e.stack||e));console.error(e);}finally{for(const x of Object.values(children))x.child.kill('SIGTERM');for(const x of Object.values(children)){await x.closed;await x.log.close();}await save();}
}
result.loadAfter=loadavg();await save();

if(result.cases.some(c=>c.failures.length))process.exitCode=1;
