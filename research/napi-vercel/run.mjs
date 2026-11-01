import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..'),cwd=root+'/.checks/napi-vercel',raw=import.meta.dirname+'/raw';
const api='/v1/projects/prj_loKFn5UhqXo1q4KesfMY8SZjQzEu/',team='?teamId=team_9rYDB0tDX0ClFOCXmxrMd48y';
const secret=parseEnv(readFileSync('/Users/noah/code/next-scriptc/.env.local','utf8')).VERCEL_AUTOMATION_BYPASS_SECRET;assert(secret);
const save=(name,value)=>writeFileSync(raw+'/'+name+'.json',JSON.stringify(value,null,2)+'\n');
const cli=args=>execFileSync('vercel',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','inherit'],timeout:180000});
const lifecycle={events:[]};let attempted=false,paused=false;
function event(action,extra={}){lifecycle.events.push({action,at:new Date().toISOString(),...extra});save('lifecycle',lifecycle);}
function pause(){if(!attempted||paused)return;event('pause-request');cli(['api','-X','POST',api+'pause'+team]);event('pause-completed');let status=execFileSync('curl',['-s','-o','/dev/null','-w','%{http_code}','https://next-scriptc.vercel.app/api/hello'],{encoding:'utf8',timeout:30000});event('production-check',{httpStatus:status});if(status!=='503'){cli(['api','-X','POST',api+'pause'+team]);status=execFileSync('curl',['-s','-o','/dev/null','-w','%{http_code}','https://next-scriptc.vercel.app/api/hello'],{encoding:'utf8',timeout:30000});event('production-recheck',{httpStatus:status});}assert.equal(status,'503');paused=true;}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{try{pause();}finally{process.exit(1);}});
const expected=Object.fromEntries([1000,5000,15000,200000].map(size=>[size,createHash('sha256').update(readFileSync(root+'/research/napi/raw/revenue-'+size+'-result.json','utf8').trimEnd()).digest('hex')]));
assert(!existsSync(raw+'/lifecycle.json'),'refuse overwrite');
try{
 attempted=true;event('unpause-request');cli(['api','-X','POST',api+'unpause'+team]);event('unpause-completed');
 for(let pair=1;pair<=2;pair++){
  const deployment=JSON.parse(cli(['deploy','--prebuilt','--regions','iad1','--environment','preview','--yes','--json']));save('deployment-'+pair,deployment);
  const d=deployment.deployment??deployment,url='https://'+d.url.replace(/^https:\/\//,'');
  const info=JSON.parse(cli(['inspect',url,'--json']));save('inspection-'+pair,info);assert.equal(info.readyState,'READY');assert.notEqual(info.target,'production');
  console.log('Preview',pair,d.id,url);
  async function request(name,size){
   const begin=performance.now();const response=await fetch(url+'/'+name+'?size='+size,{headers:{'x-vercel-protection-bypass':secret},redirect:'error',signal:AbortSignal.timeout(240000)});const body=await response.text();
   const record={url:url+'/'+name+'?size='+size,wallMs:performance.now()-begin,status:response.status,headers:Object.fromEntries([...response.headers].filter(([key])=>['x-vercel-id','server-timing','x-vercel-cache','cache-control'].includes(key)))};
   try{record.result=JSON.parse(body);}catch{record.body=body;}save(pair+'-'+name+'-'+size,record);
   assert.equal(response.status,200);assert.equal(record.result.node.split('.')[0],'v24');assert.equal(record.result.arch,'x64');assert.equal(record.result.region,'iad1');assert.match(record.headers['x-vercel-id'],/::iad1::/);
   if(name==='bench'){for(const row of record.result.rows)assert.equal(row.sha256,expected[size]);console.log(pair,name,size,'verified',record.result.instance);}
   else assert.equal(record.result.cold.sha256,expected[size]);
   return record;
  }
  const coldInstances=[];
  for(const mode of (pair===1?['node','sidecar','sync','async']:['async','sync','sidecar','node']))coldInstances.push((await request('cold-'+mode,5000)).result.instance);
  assert.equal(new Set(coldInstances).size,4,'cold Functions must have independent modules and instances');
  if(pair===1)for(const size of [1000,5000,15000,200000])await request('bench',size);
 }
 event('last-measurement');
}catch(error){save('failure',{at:new Date().toISOString(),error:error.stack});console.error(error);process.exitCode=1;}finally{pause();}
