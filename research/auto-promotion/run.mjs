import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {parseEnv} from 'node:util';
import assert from 'node:assert/strict';
import path from 'node:path';
const cwd=path.resolve(import.meta.dirname,'../../.checks/auto-promotion'),raw=process.env.AUTO_RAW??import.meta.dirname+'/raw';
const api='/v1/projects/prj_loKFn5UhqXo1q4KesfMY8SZjQzEu',team='?teamId=team_9rYDB0tDX0ClFOCXmxrMd48y';
const secret=parseEnv(readFileSync('/Users/noah/code/next-scriptc/.env.local','utf8')).VERCEL_AUTOMATION_BYPASS_SECRET;assert(secret);
const save=(n,v)=>writeFileSync(raw+'/'+n+'.json',JSON.stringify(v,null,2));
const cli=args=>execFileSync('vercel',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','inherit'],timeout:180000});
const lifecycle=[];let attempted=false,paused=false;
const event=(action,extra={})=>{lifecycle.push({action,at:new Date().toISOString(),...extra});save('lifecycle',lifecycle);};
function pause(){if(!attempted||paused)return;event('pause-request');cli(['api','-X','POST',api+'/pause'+team]);event('pause-completed');
 let status=execFileSync('curl',['-s','-o','/dev/null','-w','%{http_code}','https://next-scriptc.vercel.app/api/hello'],{encoding:'utf8'});
 for(let retry=0;status!=='503'&&retry<5;retry++){cli(['api','-X','POST',api+'/pause'+team]);status=execFileSync('curl',['-s','-o','/dev/null','-w','%{http_code}','https://next-scriptc.vercel.app/api/hello'],{encoding:'utf8'});}
 const project=JSON.parse(cli(['api',api+team]));save('pause-confirmation',{at:new Date().toISOString(),httpStatus:status,paused:project.paused});assert.equal(status,'503');assert.equal(project.paused,true);paused=true;
}
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{try{pause();}finally{process.exit(1);}});
assert(!existsSync(raw+'/lifecycle.json'));
try{
 cli(['project','inspect','--non-interactive']);
 const inspection=JSON.parse(cli(['api',api+team]));save('project-inspect',{id:inspection.id,name:inspection.name,paused:inspection.paused});
 assert.equal(inspection.id,'prj_loKFn5UhqXo1q4KesfMY8SZjQzEu');assert.equal(inspection.name,'next-scriptc');
 attempted=true;event('unpause-request');cli(['api','-X','POST',api+'/unpause'+team]);event('unpause-completed');
 const deployment=JSON.parse(cli(['deploy','--prebuilt','--regions','iad1','--environment','preview','--yes','--json']));save('deployment',deployment);
 const d=deployment.deployment??deployment,url='https://'+d.url.replace(/^https:\/\//,'');
 const info=JSON.parse(cli(['inspect',url,'--json']));save('inspection',info);assert.equal(info.readyState,'READY');assert.notEqual(info.target,'production');
 const begin=performance.now();const response=await fetch(url+'/bench',{headers:{'x-vercel-protection-bypass':secret},redirect:'error',signal:AbortSignal.timeout(240000)});
 const body=await response.text();let result;try{result=JSON.parse(body);}catch{result={body};}
 save('measurement',{url,status:response.status,wallMs:performance.now()-begin,headers:Object.fromEntries([...response.headers].filter(([k])=>['x-vercel-id','server-timing'].includes(k))),result});assert.equal(response.status,200);assert.equal(result.region,'iad1');event('last-measurement');
}catch(e){save('failure',{error:e.stack,at:new Date().toISOString()});console.error(e);process.exitCode=1;}finally{pause();}
