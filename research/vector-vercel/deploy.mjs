// Uses the established prebuilt preview protocol. Never writes project settings.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {serverEnv} from '../../examples/demo/bench/config.mjs';
import {client,fixture,sample,variants,save,load} from './common.mjs';
const kind=process.argv[2];
assert(['node','stock','patched','fallback'].includes(kind));
const project=JSON.parse(readFileSync('.vercel/project.json'));
assert.equal(project.projectName,'next-scriptc');
const run=(...args)=>JSON.parse(execFileSync('vercel',args,{encoding:'utf8',stdio:['ignore','pipe','inherit']}));
assert(run('api',`/v6/deployments?projectId=${project.projectId}&limit=1`).deployments?.length);
execFileSync(process.execPath,['examples/demo/bench/vercel/startup-deploy.mjs','check-traces'],{stdio:'inherit'});
const count=kind==='fallback'?1:3;
for(let round=1;round<=count;round++) {
 const name=`${kind}-${round}`;
 try {load(name);throw new Error('Refusing duplicate deployment label '+name);} catch(e) {if(e.code!=='ENOENT')throw e;}
 const args=['deploy','--prebuilt','--regions','iad1','--environment','preview','--force','--json'];
 for(const [key,value] of Object.entries({...serverEnv,VECTOR_VERCEL_TIMING:'1',...(['patched','fallback'].includes(kind)?{VECTOR_DISPATCH_ADDRESS:String(load('patched-audit').address)}:{}),...(kind==='fallback'?{SCRIPTC_CPU_LEVEL:'baseline'}:{})})) args.push('--env',`${key}=${value}`);
 const accepted=run(...args),d=accepted.deployment??accepted,url=`https://${d.url.replace(/^https:\/\//,'')}`;
 const row={kind,round,url,id:d.id,acceptedAt:new Date().toISOString(),first:[],status:'accepted'};
 save(name,row); // identity survives any later failure
 const info=run('inspect',url,'--json');
 assert.notEqual(info.target,'production');assert.equal(info.readyState,'READY');
 const functions=new Map();
 for(const b of info.builds??[])for(const item of b.output??[]) if(item.lambda) {
  const l=item.lambda,k=l.functionName;
  if(!functions.has(k))functions.set(k,{functionName:k,runtime:l.runtime,size:item.size,config:l,paths:[]});
  functions.get(k).paths.push(item.path);
 }
 assert(functions.size>0&&functions.size<=12,'Function count outside Hobby limits');
 row.deployed={id:info.id,url:info.url,readyState:info.readyState,target:info.target,createdAt:info.createdAt,regions:info.regions,functions:[...functions.values()].map(({config,...f})=>({...f,configuration:Object.fromEntries(Object.entries(config).filter(([k])=>['architecture','memory','maxDuration','regions','runtime'].includes(k)))}))};
 row.status='ready';save(name,row);
 const vs=variants(kind,url);
 for(const v of vs) {
  const pool=client.agent(url,1);
  try {const r=await client.request(url,{...fixture,path:v.path},pool);row.first.push({...v,...sample(r)});save(name,row);} finally {pool.destroy();}
 }
 row.diagnostics=[];
 for(const v of vs.filter((v,i,a)=>a.findIndex(w=>w.diagnostic===v.diagnostic)===i)){
  const pool=client.agent(url,1);
  try {row.diagnostics.push({variant:v.variant,...await client.request(url,{path:v.diagnostic,diagnostic:true,responseType:'application/json'},pool)});save(name,row);}finally{pool.destroy();}
 }
 row.status='complete';save(name,row);console.log(JSON.stringify({name,url,id:row.id,functions:functions.size,first:row.first.map(x=>({variant:x.variant,e2eMs:x.e2eMs,computeMs:x.computeMs}))}));
}
