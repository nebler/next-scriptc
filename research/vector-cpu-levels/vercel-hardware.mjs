// One preview of the existing test project. No production, domains or settings.
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,existsSync,copyFileSync} from 'node:fs';
import path from 'node:path';
const out=import.meta.dirname;
const evidence=path.join(out,'vercel-hardware.json');
if(existsSync(evidence))throw new Error('Preview already attempted; never deploy twice');
const temp='/tmp/vector-cpu-levels/hardware-preview';
const run=(args,options={})=>execFileSync('vercel',args,{cwd:temp,encoding:'utf8',maxBuffer:2**22,...options});
mkdirSync(path.join(temp,'.vercel/output/functions/api/heavy/diagnostics.func'),{recursive:true});
const project=JSON.parse(readFileSync('/Users/noah/code/next-scriptc/.vercel/project.json'));
if(project.projectName!=='next-scriptc')throw new Error('Unexpected project');
writeFileSync(path.join(temp,'.vercel/project.json'),JSON.stringify(project));
const report={startedAt:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),project,previewAttempts:0};
const save=()=>writeFileSync(evidence,JSON.stringify(report,null,2)+'\n');
const config={version:3,regions:['iad1']};
writeFileSync(path.join(temp,'.vercel/output/config.json'),JSON.stringify(config));
const fn=path.join(temp,'.vercel/output/functions/api/heavy/diagnostics.func');
const fnConfig={runtime:'nodejs24.x',handler:'index.mjs',launcherType:'Nodejs',architecture:'x86_64',regions:['iad1'],memory:2048,maxDuration:30};
writeFileSync(path.join(fn,'.vc-config.json'),JSON.stringify(fnConfig));
const handler=`import {readFileSync} from 'node:fs';\nimport os from 'node:os';\nexport default function handler(req,res){res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json');res.end(JSON.stringify({region:process.env.VERCEL_REGION,arch:process.arch,node:process.version,model:os.cpus()[0]?.model,cpuinfo:readFileSync('/proc/cpuinfo','utf8')}));}\n`;
writeFileSync(path.join(fn,'index.mjs'),handler);
report.config=config;report.functionConfig=fnConfig;report.handler=handler;
try{
 const selected=JSON.parse(run(['project','inspect','--non-interactive','--json']));
 if(!JSON.stringify(selected).includes(project.projectId))throw new Error('Project identity mismatch');
 const recent=JSON.parse(run(['api',`/v6/deployments?projectId=${project.projectId}&limit=1`]));
 if(!recent.deployments?.length)throw new Error('No prior deployment; refuse possible production promotion');
 report.previewAttempts=1;report.args=['deploy','--prebuilt','--regions','iad1','--environment','preview','--force','--json'];save();
 const response=JSON.parse(run(report.args,{stdio:['ignore','pipe','inherit']}));
 const accepted=response.deployment??response;
 report.accepted={id:accepted.id,url:accepted.url};save();
 const url=accepted.url.startsWith('https://')?accepted.url:`https://${accepted.url}`;
 const info=JSON.parse(run(['inspect',url,'--json']));
 report.deployment={id:info.id,target:info.target,readyState:info.readyState,url:info.url,regions:info.regions};save();
 if(info.target==='production'||info.readyState!=='READY')throw new Error('Not a READY preview');
 report.responses=[];
 for(let i=0;i<3;i++){
  const body=run(['curl',`${url}/api/heavy/diagnostics`,'--','-sS','-D',path.join(temp,'headers.txt')]);
  report.responses.push({at:new Date().toISOString(),headers:readFileSync(path.join(temp,'headers.txt'),'utf8'),body:JSON.parse(body)});save();
 }
 report.status='complete';
}catch(e){report.status='failed';report.error=String(e);process.exitCode=1;console.error(e)}finally{save()}
