import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createDispatcher} from '../src/functions/promotion.mjs';
import {runtimeSnapshot} from '../src/runtime-snapshot.mjs';
import {coverageReport,formatReport} from '../src/report.mjs';
import {ciSummary} from '../src/report-runtime.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
test('snapshot is detached, aggregates only, includes mismatch and fallback reasons',async()=>{
 const secret='sensitive-input-never-export';
 const d=createDispatcher({mode:'native',native:()=>({fallback:true}),log:()=>{}});
 d.dispatch('f',x=>x,[secret]);
 const bucket=d.snapshot().f.buckets[0];
 assert.equal(bucket.lane,'native');assert.equal(bucket.decision.threshold,0.9);assert.equal(bucket.policy.samples,24);assert.equal(bucket.decision.votes,0);assert.equal(bucket.boundaryShare,null);
 assert.equal(bucket.fallbackReasons['native-declined'],1);
 const mismatch=createDispatcher({jsSamples:0,sampleEvery:1,nativeAsync:async()=>JSON.stringify('wrong'),log:()=>{}});
 for(let i=0;i<4;i++){mismatch.dispatch('m',x=>x,[secret]);await tick();}
 assert.equal(mismatch.snapshot().m.buckets[0].mismatches,1);assert.equal(mismatch.snapshot().m.buckets[0].lane,'settled');assert.equal(mismatch.snapshot().m.buckets[0].shadows,1);
 mismatch.panic(Error(secret));
 const json=JSON.stringify(runtimeSnapshot());assert.ok(!json.includes(secret));assert.ok(!json.includes('inputHash'));
 const snap=d.snapshot();snap.f.buckets[0].fallbackReasons['native-declined']=999;assert.equal(d.snapshot().f.buckets[0].fallbackReasons['native-declined'],1);
});
test('opt-in snapshots write periodically and on normal exit; off installs no exit listener',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'p2-snapshot-'));try{
 const module=new URL('../src/functions/promotion.mjs',import.meta.url).href,file=path.join(dir,'snapshot-%p.json');
 const script=`import {createDispatcher} from ${JSON.stringify(module)};const before=process.listenerCount('exit');const d=createDispatcher({mode:'js',log:()=>{}});d.dispatch('f',x=>x,['private-value']);if(!process.env.SCRIPTC_PROMOTE_SNAPSHOT&&before!==process.listenerCount('exit'))throw Error('listener');`;
 execFileSync(process.execPath,['--input-type=module','-e',script],{env:{...process.env,SCRIPTC_PROMOTE_SNAPSHOT:''}});
 const out=spawnSync(process.execPath,['--input-type=module','-e',script+`await new Promise(r=>setTimeout(r,150));`],{env:{...process.env,SCRIPTC_PROMOTE_SNAPSHOT:file,SCRIPTC_PROMOTE_SNAPSHOT_INTERVAL_MS:'100'}});assert.equal(out.status,0,out.stderr?.toString());
 const snapshot=JSON.parse(await readFile(file.replace('%p',String(out.pid))));assert.equal(snapshot.dispatchers[0].functions.f.calls,1);assert.ok(!JSON.stringify(snapshot).includes('private-value'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('runtime fixture merges function and route observations',async()=>{
 const root=new URL('./support/fixtures/report/next/',import.meta.url).pathname;
 const report=await coverageReport(root,{runtime:new URL('./support/fixtures/runtime/snapshot.json',import.meta.url).pathname});
 assert.equal(report.runtime.nativePercent,75);assert.equal(report.runtime.functionsRanNative,1);assert.match(formatReport(report),/75.0% of calls/);assert.match(formatReport(report),/not billing/);assert.ok(report.routes[0].runtime.some(f=>f.native===75));
});
test('CI baseline catches explicit and accepted regressions, CLI writes files and exits 2',async()=>{
 const root=new URL('./support/fixtures/report/next/',import.meta.url).pathname;
 const dir=await mkdtemp(path.join(os.tmpdir(),'p2-ci-'));try{
 const base=await coverageReport(root);const tiny=base.files.flatMap(f=>f.functions).find(f=>f.name==='tiny');tiny.status='explicit';tiny.explicit=true;tiny.extractionStatus='extracted';
 const file=path.join(dir,'base.json');await writeFile(file,JSON.stringify(base));
 const cli=new URL('../src/cli.mjs',import.meta.url).pathname;
 const result=spawnSync(process.execPath,[cli,'report',root,'--ci','--baseline',file,'--fail-on','regressed-explicit'],{cwd:dir,encoding:'utf8'});assert.equal(result.status,2,result.stderr);
 const report=JSON.parse(await readFile(path.join(dir,'scriptc-report.json')));assert.ok(report.ci.regressedExplicit.includes(tiny.id));assert.match(await readFile(path.join(dir,'scriptc-report.md'),'utf8'),/Promotion CI report/);
 assert.equal(ciSummary(base,base).newlyAccepted.length,0);
 const invalid=spawnSync(process.execPath,[cli,'report',root,'--ci','--fail-on','bogus'],{encoding:'utf8'});assert.equal(invalid.status,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('CI compile evidence and removed accepted functions are regressions',()=>{
 const row={id:'compute.ts#f',status:'accepted',explicit:true,extractionStatus:'extracted'};
 const report=functions=>({files:[{functions}]});
 const baseline=report([row]);
 const current=report([{...row,compileStatus:'blocked'}]);
 assert.deepEqual(ciSummary(current,baseline).regressedExplicit,[row.id]);
 assert.deepEqual(ciSummary(current,baseline).regressedAccepted,[row.id]);
 assert.deepEqual(ciSummary(report([]),baseline).regressedAccepted,[row.id]);
});

test('CI CLI consumes compiler and fuzz evidence before regression exit',async()=>{
 const root=new URL('./support/fixtures/report/next/',import.meta.url).pathname;
 const dir=await mkdtemp(path.join(os.tmpdir(),'p2-ci-build-'));try{
 const baseline=await coverageReport(root),fn=baseline.files.flatMap(f=>f.functions).find(f=>f.status==='accepted');
 await writeFile(dir+'/baseline.json',JSON.stringify(baseline));
 await writeFile(dir+'/build.json',JSON.stringify({version:1,functions:[{id:fn.id,status:'blocked'}]}));
 await writeFile(dir+'/fuzz.json',JSON.stringify([{id:fn.id,status:'passed'}]));
 const result=spawnSync(process.execPath,[new URL('../src/cli.mjs',import.meta.url).pathname,'report',root,'--ci','--baseline',dir+'/baseline.json','--build-results',dir+'/build.json','--fuzz-results',dir+'/fuzz.json','--fail-on','regressed-accepted'],{cwd:dir,encoding:'utf8'});
 assert.equal(result.status,2,result.stderr);const report=JSON.parse(await readFile(dir+'/scriptc-report.json'));
 assert.deepEqual(report.ci.regressedAccepted,[fn.id]);assert.equal(report.ci.fuzz[0].status,'passed');assert.equal(report.ci.counts.blocked,3);
 }finally{await rm(dir,{recursive:true,force:true});}
});
