import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {spec} from './fixtures.mjs';
import {quantile} from '../vercel/io-client.mjs';
const prefix='research/benchmarks/realistic-io-hosted';
const pairs=await Promise.all([1,2,3].map(async i=>JSON.parse(await readFile(`${prefix}-pair-${i}.json`))));
const parity=await readFile('research/benchmarks/realistic-io-hosted-parity.txt','utf8');
assert(parity.includes('Deployed parity: 124/124 cases passed.'));
const parityCases=(parity.match(/^PASS /gm)??[]).length;assert.equal(parityCases,124);
const data={status:'running',pairs:[],cpu:[],parityCases,hostedParityRequests:parityCases*2};
let requests=0,redisModeled=5; // initial PING + Linux seed(3) + its LRANGE(1)
try {
 for(let i=0;i<3;i++)for(const d of pairs[i].deployments){
   assert.equal(d.first.digest,spec('orders-get').expected);let count=2,commands=d.seed.commands+1;
   if(i<2){count+=d.warm.dispatched+d.warm.warmup.dispatched;commands+=d.warm.dispatched+d.warm.warmup.dispatched;assert.equal(d.status,'complete');}
   else {
    count+=d.rows.length-1+1+d.redisRtt.length;commands+=d.redisRtt.length;
    for(const row of d.rows){
     assert.equal(row.status,'complete');
     if(row.workload!=='orders-get'){assert.equal(row.first.digest,spec(row.workload,0,'route-first').expected);commands+=row.workload==='payment'?4:3;}
     for(const [kind,phase] of [['sequential','c1'],['concurrent','c16']]) {
      const w=row[kind];assert.equal(w.status,'complete');
      for(const [window,label] of [[w,phase],[w.warmup,`${phase}-w`]]) {
       count+=window.dispatched;commands+=window.dispatched*(row.workload==='orders-get'?1:row.workload==='orders-post'?3:4);
       assert.equal(window.samples.length,window.dispatched);
       for(const sample of window.samples){assert.equal(sample.status,'complete');assert.equal(sample.digest,spec(row.workload,sample.index,label).expected);}
       for(const [key,q] of [['p50Ms',.5],['p95Ms',.95],['p99Ms',.99]])assert.equal(window[key],quantile(window.samples.map(s=>s.ms),q));
      }
     }
     count+=10;commands+=10*(row.workload==='orders-get'?1:row.workload==='orders-post'?3:4);
     let accepted=0;
     for(const a of row.cpu.attempts){count+=2+a.requests;commands+=a.requests*(row.workload==='orders-get'?1:row.workload==='orders-post'?3:4);
      if(a.before.body.instance!==a.after.body.instance){assert.equal(a.status,'discarded');continue;}
      assert.equal(a.status,'accepted');accepted++;
      const total=(a.after.body.cpu.user-a.before.body.cpu.user+a.after.body.cpu.system-a.before.body.cpu.system)/1000/a.requests;
      assert(Math.abs(total-a.cpuMsPerRequest)<1e-9);data.cpu.push({variant:d.variant,route:row.workload,attempt:a.attempt,msPerRequest:total});
     }
     assert.equal(row.cpu.status,accepted===3?'complete':'unavailable');
    }
    count+=d.openLoop.issued;assert.equal(d.openLoop.samples.length,840);assert.equal(d.openLoop.errors,0);
    const origins=[];
    for(const s of d.openLoop.samples){assert.equal(s.status,'complete');assert.equal(s.digest,spec(s.workload,s.index,'mixed').expected);commands+=s.workload==='orders-get'?1:s.workload==='orders-post'?3:4;origins.push(s.completedAtMs-s.scheduledMs-s.scheduledLatencyMs);}
    assert(Math.max(...origins)-Math.min(...origins)<1e-6,'scheduled metric must use actual body-drain timestamps');
    for(const [key,q]of[['p50Ms',.5],['p95Ms',.95],['p99Ms',.99]])assert.equal(d.openLoop.scheduledLatency[key],quantile(d.openLoop.samples.map(s=>s.scheduledLatencyMs),q));
   }
   assert.equal(count,d.requestsIssued);requests+=count;redisModeled+=commands;
   data.pairs.push({pair:i+1,variant:d.variant,requestsReconciled:count,redisModeledWithEvalInternals:commands});
 }
 data.errorQueries=[];
 for(let i=1;i<=3;i++)for(const variant of ['node','native']){
  const raw=(await readFile(`${prefix}-pair-${i}-${variant}-errors.jsonl`,'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(raw.filter(r=>r.type==='request').length,0);
  const summary=raw.find(r=>r.type==='summary');assert.equal(summary.recordsReturned,0);assert.equal(summary.pagination.hasMore,false);assert.deepEqual(summary.excludedIntervals,[]);
  data.errorQueries.push({pair:i,variant,summary});
 }
 const scope=['examples/demo/app','packages/next-scriptc','examples/demo/next.config.ts','examples/demo/package.json','pnpm-lock.yaml','examples/demo/bench/vercel/io-client.mjs','examples/demo/bench/vercel/io-run.mjs','examples/demo/bench/vercel/io-worker.mjs','examples/demo/bench/io/fixtures.mjs','examples/demo/bench/io/seed.mjs'];
 const diff=execFileSync('git',['diff','1ff6d90f0cf95d0a00efc0a2e96d3dd8c6a9c1d5','--',...scope],{encoding:'utf8'});assert.equal(diff,'');data.frozenMeasuredScope={commit:'1ff6d90f0cf95d0a00efc0a2e96d3dd8c6a9c1d5',paths:scope,diffEmpty:true};
 data.measuredFunctionAttempts=requests;data.totalFunctionAttempts=requests+248;data.modeledRedisBeforeHostedParityAndCleanup=redisModeled;data.status='complete';
} catch(error){data.status='failed';data.error=error.stack;process.exitCode=1;}
await writeFile('research/benchmarks/realistic-io-verification.json',JSON.stringify(data,null,2)+'\n');
console.log(JSON.stringify({status:data.status,requests:data.totalFunctionAttempts,redisModeled:data.modeledRedisBeforeHostedParityAndCleanup,error:data.error}));
