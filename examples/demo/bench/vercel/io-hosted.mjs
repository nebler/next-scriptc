// One-shot registered three-pair controller; no automatic workload reruns.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../../../..'), prefix='research/benchmarks/realistic-io-hosted';
if(existsSync(`${prefix}-provenance.json`)) throw new Error('Retain the existing run; no restart/duplicate previews');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const commit=git('rev-parse','HEAD');
const files=git('ls-files').split('\n').filter((f)=>!f.startsWith('research/benchmarks/'));
const fingerprint=()=>{const h=createHash('sha256');for(const f of files)h.update(f).update('\0').update(readFileSync(f));return h.digest('hex');};
const sourceSha256=fingerprint();
const data={status:'running',sourceCommit:commit,sourceSha256,startedAt:new Date().toISOString(),deployments:[]};
const ledgerFile='research/benchmarks/realistic-io-cost.json';
if(existsSync(ledgerFile))throw new Error('Review existing cost ledger before a new controller');
// Conservative allowance includes seed, Linux validation, parity and cleanup.
writeFileSync(ledgerFile,JSON.stringify({previews:0,runs:[],sandboxVcpuHoursReserved:0,invocationsReserved:500,redisCommandsReserved:2000,notes:['500 HTTP / 2000 Redis reserved for validation and cleanup; one earlier Upstash PING included']},null,2)+'\n');
const save=()=>writeFileSync(`${prefix}-provenance.json`,JSON.stringify(data,null,2)+'\n');
save();
try {
  for(let pair=1;pair<=3;pair++) {
    const order=pair%2?['node','native']:['native','node']; const urls={};
    for(const variant of order) {
      if(fingerprint()!==sourceSha256||git('rev-parse','HEAD')!==commit)throw new Error('Frozen source changed');
      const ledger=JSON.parse(readFileSync(ledgerFile));if(ledger.previews>=10)throw new Error('Preview budget exhausted');
      const env={...process.env,NEXT_SCRIPTC_BASELINE:variant==='node'?'node':'',NEXT_SCRIPTC_DEMO_GROUPS:'vercel',SCRIPTC_CHECKER_SERVER:'0'};
      // Build/upload immediately through the required common helper. Accepted
      // identity survives inspect failures and is never silently replaced.
      try {execFileSync(process.execPath,['examples/demo/bench/vercel/deploy.mjs'],{cwd:root,env,stdio:['ignore','pipe','pipe'],maxBuffer:32*1024*1024});}
      catch(error) {
        writeFileSync(`${prefix}-pair-${pair}-${variant}-deploy-error.txt`,error.stderr??String(error));
        if(existsSync(`.vercel/${variant}-accepted.json`)) {
          const accepted=JSON.parse(readFileSync(`.vercel/${variant}-accepted.json`));
          if(accepted.sourceCommit===commit&&!data.deployments.some((d)=>d.id===accepted.id)){ledger.previews++;data.deployments.push({pair,variant,...accepted,status:'inspect/build failed; not measured'});}
        }
        writeFileSync(ledgerFile,JSON.stringify(ledger,null,2)+'\n');save();throw new Error(`${variant} preview failed; inspect saved evidence`);
      }
      const metadata=JSON.parse(readFileSync(`.vercel/${variant}-deployment.json`));
      if(metadata.sourceCommit!==commit)throw new Error('Source commit mismatch');
      urls[variant]=`https://${metadata.deployed.url}`;
      ledger.previews++;writeFileSync(ledgerFile,JSON.stringify(ledger,null,2)+'\n');
      writeFileSync(`${prefix}-pair-${pair}-${variant}-deployment.json`,JSON.stringify(metadata,null,2)+'\n');
      const record={pair,variant,id:metadata.deployed.id,url:urls[variant]};data.deployments.push(record);save();
      if(variant==='native') {
        const owner=metadata.functions.find((f)=>f.runtime==='executable');const binary=path.join(root,'.vercel/output/functions',owner.owner,'executable');
        const hash=createHash('sha256').update(readFileSync(binary)).digest('hex');record.artifactSha256=hash;
        if(data.artifactSha256&&data.artifactSha256!==hash)throw new Error('Native binary differs between pairs');
        if(!data.artifactSha256) {
          // Outside-preview probe preserves first-HTTP ordering on immutable URLs.
          execFileSync(process.execPath,['examples/demo/bench/io/seed.mjs','--reset'],{cwd:root,env,stdio:'ignore'});
          const args=['run','--rm','--platform','linux/amd64','-v',`${binary}:/work/executable:ro`,'-v',`${root}/examples/demo/bench/vercel/io-linux-worker.mjs:/work/worker.mjs:ro`];
          for(const key of ['KV_REST_API_URL','KV_REST_API_TOKEN','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN','DEMO_JWT_NOW','DEMO_JWT_SECRET']) if(env[key])args.push('-e',key);
          args.push('node:24-alpine','node','/work/worker.mjs');
          const raw=execFileSync('docker',args,{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000});
          writeFileSync(`${prefix}-linux.json`,raw);const result=JSON.parse(raw);if(result.status!=='complete')throw new Error('Linux musl/Redis TLS validation failed');
          data.artifactSha256=hash;
        }
      }
      const sizes=execFileSync('python3',['examples/demo/bench/vercel/function-sizes.py',`io-${pair}-${variant}`,'.vercel/output',root,`${prefix}-pair-${pair}-${variant}-deployment.json`]);
      writeFileSync(`${prefix}-pair-${pair}-${variant}-sizes.json`,sizes);save();
    }
    const args=['examples/demo/bench/vercel/io-run.mjs','--node',urls.node,'--native',urls.native,'--mode',pair===3?'full':'cold','--fresh','--output',`${prefix}-pair-${pair}`];
    if(pair%2===0)args.push('--native-first');
    execFileSync(process.execPath,args,{cwd:root,env:{...process.env,IO_ALLOW_RESET:'1'},stdio:'inherit',timeout:270000});
    if(fingerprint()!==sourceSha256)throw new Error('Source changed during measurement');
  }
  data.status='complete';
} catch(error){data.status='failed';data.error=error.message;process.exitCode=1;console.error(error.message);}
finally {data.finishedAt=new Date().toISOString();save();}
