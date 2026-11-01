import test from 'node:test';
import assert from 'node:assert/strict';
import {promotionCandidates} from '../src/functions/promotion-discovery.mjs';
import {createDispatcher,estimateSize} from '../src/functions/promotion.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
test('discovery screens sync exports, work, opt out, dependencies and purity',()=>{
 const logs=[];const rows=promotionCandidates(`
 export function sum(a:number[]):number {let n=0;for(const x of a)n+=x;return n;}
 export function time(a:number[]):number {for(const x of a){}return Date.now();}
 export function tiny(a:number):number{return a;}
 export function opted(a:number[]):number{"use js";return a.reduce((a,b)=>a+b,0);}
 export async function asyncFn(a:number[]):Promise<number>{return a.reduce((a,b)=>a+b,0);}
 `,'/tmp/promotion.ts',s=>logs.push(s));assert.deepEqual(rows.map(m=>m.functions[0].name),['sum']);assert.equal(logs.length,2);
 assert.notEqual(estimateSize(['x'.repeat(1000)]),estimateSize(['x'.repeat(200000)]));
});
function setup(extra={}){let t=0;return createDispatcher({jsSamples:2,policy:{samples:2,required:2,coldSamples:0},sampleEvery:1,now:()=>t++,log:()=>{},native:(_id,s)=>s,nativeAsync:async(_id,s)=>s,...extra});}
test('promotion and size isolation',async()=>{let t=0;const d=setup({now:()=>t,native:(_id,s)=>JSON.stringify(JSON.parse(s)[0]),nativeAsync:async(_id,s)=>{t+=1;return JSON.stringify(JSON.parse(s)[0]);}});const js=x=>{t+=10;return x;};
 for(let i=0;i<4;i++){assert.equal(d.dispatch('f',js,['hello']),'hello');await tick();await tick();}
 assert.equal(d.snapshot().f.buckets[0].state,'native');assert.equal(d.dispatch('f',js,['hello']),'hello');
 d.dispatch('f',js,['x'.repeat(1000)]);assert.equal(d.snapshot().f.buckets[1].state,'js');
});
test('mismatch never answers natively; panic demotes all',async()=>{let answered=0;const d=setup({native:()=>{answered++;return '99';},nativeAsync:async()=> '99'});
 for(let i=0;i<6;i++){assert.equal(d.dispatch('bad',x=>x,[2]),2);await tick();await tick();}
 assert.equal(d.snapshot().bad.buckets[0].state,'demoted');assert.equal(answered,0);d.dispatch('other',x=>x,[3]);d.panic(Error('poison'));assert.equal(d.snapshot().other.buckets[0].state,'demoted');
});
test('queue cap and shadow rate cap fall back without awaiting native',async()=>{let resolve;const d=setup({mode:'native',maxPending:0});assert.equal(d.dispatch('f',x=>x,[2]),2);
 const s=setup({nativeAsync:()=>new Promise(r=>resolve=r)});for(let i=0;i<10;i++)s.dispatch('f',x=>x,[2]);await tick();assert.equal(s.pending,1);resolve('2');await tick();await tick();assert.equal(s.pending,0);
});
test('slower native settles on js-final',async()=>{const d=setup();for(let i=0;i<8;i++){d.dispatch('f',x=>[x],[2]);await tick();await tick();}assert.equal(d.snapshot().f.buckets[0].state,'js-final');});

import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import loader from '../src/functions/loader.mjs';
import {buildPromotion} from '../src/functions/promotion-build.mjs';
test('loader preserves JS bodies for multiple candidates',()=>{
 const text='export function a(x:number[]):number {return x.reduce((a,b)=>a+b,0);}\nexport function b(x:number[]):number {let n=0;for(const v of x)n+=v;return n;}';
 const candidates=promotionCandidates(text,'/tmp/multi.ts',()=>{}),m=candidates[0];
 const out=loader.call({resourcePath:m.source,getOptions:()=>({modules:{[m.source]:{...m,functions:candidates.flatMap(m=>m.functions)}},server:true,promotionFile:'/tmp/promotion.node',promotionClient:'/tmp/client.mjs'})},text);
 assert.match(out,/return x.reduce/);assert.match(out,/for\(const v of x\)/);assert.equal((out.match(/return __scriptc_/g)||[]).length,2);
});
test('compile refusal is reported and leaves JS available',async()=>{
 const output=await mkdtemp(path.join(tmpdir(),'promotion-refusal-'));const previous=process.env.SCRIPTC_COMPILER;
 try{process.env.SCRIPTC_COMPILER='/usr/bin/false';const reports=[];
  const candidates=promotionCandidates('export function sum(x:number[]):number {let n=0;for(const v of x)n+=v;return n;}','/tmp/decl.ts',()=>{});
  assert.deepEqual(await buildPromotion(candidates,output,{report:x=>reports.push(x)}),[]);assert.match(reports[0],/not a candidate sum/);
  await assert.rejects(buildPromotion(candidates.map(m=>({...m,forced:true})),output,{report:()=>{}}));
 }finally{if(previous===undefined)delete process.env.SCRIPTC_COMPILER;else process.env.SCRIPTC_COMPILER=previous;await rm(output,{recursive:true,force:true});}
});
test('explicit sync hint bypasses work screen while use js opts out',()=>{
 const rows=promotionCandidates('export function hint(x:number):number {"use native";return x;}','/tmp/hint.ts',()=>{});assert.equal(rows[0].forced,true);
});

import {decideLane,stabilityDefaults} from '../src/functions/promotion-policy.mjs';
import {simulate} from '../../../research/dispatcher-stability-sim.mjs';
test('M2 empirical seeded simulations converge with scheduling bias removed',()=>{
 const rows=simulate(1000);
 for(const row of rows){assert.ok(row.newWrong<=10,JSON.stringify(row));assert.ok(row.stressWrong<=10,JSON.stringify(row));}
 assert.ok(rows.reduce((n,r)=>n+r.oldWrong,0)>rows.reduce((n,r)=>n+r.newWrong,0));
});
test('sign confidence, effect margin and hysteresis use complete disjoint epochs',()=>{
 const p=stabilityDefaults;
 assert.equal(decideLane(Array(23).fill([10,1]),'js-final'),'js-final');
 assert.equal(decideLane([...Array(18).fill([10,1]),...Array(6).fill([10,20])],'js-final'),'js-final');
 assert.equal(decideLane(Array(24).fill([10,9.1]),'js-final'),'js-final');
 assert.equal(decideLane(Array(24).fill([10,10.4]),'native'),'native');
 assert.equal(decideLane(Array(24).fill([10,10.6]),'native'),'js-final');
 assert.equal(decideLane(Array(p.samples).fill([10,8]),'js-final'),'native');
});
test('cold discard, scheduling exclusion, periodic correction and mismatch safety',async()=>{
 let clock=0,cost=1,bad=false;
 const d=createDispatcher({now:()=>clock,log:()=>{},jsSamples:1,sampleEvery:1,perMinute:1000,
  policy:{samples:4,required:4,coldSamples:2,recheckEvery:1},
  native:()=>{throw Error('recheck should answer JS');},
  nativeSample:async()=>{clock+=100;return {value:bad?'99':'2',elapsedMs:cost};}});
 const lane=()=>d.snapshot().f.buckets[0].state;
 const calls=async n=>{for(let i=0;i<n;i++){assert.equal(d.dispatch('f',()=>{clock+=10;return 2;},[2]),2);await tick();}};
 cost=100;await calls(2);assert.equal(lane(),'shadow');
 cost=1;await calls(4);assert.equal(lane(),'native');
 cost=20;await calls(4);assert.equal(lane(),'js-final');
 cost=1;await calls(4);assert.equal(lane(),'native');
 const state=d.snapshot().f.buckets[0];assert.equal(state.epochs,3);assert.equal(state.lastDecision.js.length,4);assert.equal(state.pairs.length,0);assert.equal(d.snapshot().f.fallback,0);
 bad=true;await calls(1);assert.equal(lane(),'demoted');
});
test('ordinary JS routing has zero clock and encoding work; shadow caps remain bounded',async()=>{
 let clocks=0,samples=0,clock=0;
 const d=createDispatcher({now:()=>{clocks++;return clock;},log:()=>{},nativeSample:async()=>{samples++;return {value:'2',elapsedMs:2};}});
 for(let i=0;i<19;i++)d.dispatch('f',()=>2,[2]);
 assert.equal(clocks,0);
 for(let i=19;i<6000;i++){d.dispatch('f',()=>{clock+=0.01;return 2;},[2]);await tick();}
 assert.equal(samples,50);
 const before=clocks;d.dispatch('f',()=>2,[2]);assert.equal(clocks,before);
 clock+=60000;
 for(let i=0;i<200;i++){d.dispatch('f',()=>{clock+=0.01;return 2;},[2]);await tick();}
 assert.equal(samples,51);
});

import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
test('sample addon ABI works with owner thread, sync/async and stage timing',async t=>{
 const headers=[process.env.NODE_INCLUDE_DIR,'/opt/homebrew/include/node','/usr/local/include/node','/usr/include/node'].find(p=>p&&existsSync(path.join(p,'node_api.h')));
 if(!headers){t.skip('Node C headers unavailable');return;}
 const dir=await mkdtemp(path.join(tmpdir(),'promotion-sample-'));
 try{
  const source=(await readFile(new URL('../src/functions/promotion-addon.c',import.meta.url),'utf8')).replace('/* TABLE */',`
   void rev_init(void){} void rev_collect(void){}
   void rev_sink(void (*cb)(void *,const uint8_t *,size_t,uint64_t),void *ctx){(void)cb;(void)ctx;}
   int32_t rev_callbacks(const char *s,void (*cb)(void),void *ctx){(void)s;(void)cb;(void)ctx;return 0;}
   static void invoke(Job *j){j->number=j->inputs[0].number+1;}
   static void (*entries[])(Job *)={invoke};static const Schema schemas[]={{1,{1},1}};
  `);
  const file=path.join(dir,'stub.c');await writeFile(file,source);
  for(const timing of [false,true]){
   const output=path.join(dir,`stub-${timing}.node`);
   execFileSync('cc',[...(process.platform==='darwin'?['-bundle','-undefined','dynamic_lookup']:['-shared','-fPIC']),'-pthread','-DSERIALIZED_RUNTIME',...(timing?['-DBOUNDARY_TIMING']:[]),'-I',headers,file,'-o',output]);
   const addon=createRequire(import.meta.url)(output);
   assert.equal(timing?addon.run(0,[2]).value:addon.run(0,[2]),3);
   const async=await addon.runAsync(0,[4]);assert.equal(timing?async.value:async,5);
   const sample=await addon.runShadow(0,[6]);assert.equal(timing?sample.value.value:sample.value,7);
   assert.ok(Number.isFinite(sample.elapsedMs)&&sample.elapsedMs>=0);
   assert.ok(Number.isFinite(sample.cpuMs)&&sample.cpuMs>=0);
   const cpu=addon.threadCpuMs();assert.ok(Number.isFinite(cpu));assert.ok(addon.threadCpuMs()>=cpu);
   if(timing)assert.ok(sample.value.timings);
   assert.throws(()=>addon.runShadow(0,['invalid']));
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('fresh array chains may be sorted; opaque and aliased containers stay rejected',()=>{
 const source=`
 export function fresh(a:number[]):number[] {return Array.from(a).map(x=>x+1).sort((a,b)=>a-b);}
 export function alias(a:number[]):number[] {return a.sort((a,b)=>a-b);}
 const shared:number[]=[];
 function opaque(){return shared;}
 export function unsafe(a:number[]):number[] {for(const x of a){}return opaque().sort();}
 `;
 const logs=[];
 assert.deepEqual(promotionCandidates(source,'/tmp/fresh.ts',s=>logs.push(s)).map(m=>m.functions[0].name),['fresh']);
 assert.equal(logs.length,2);assert.ok(logs.every(s=>s.includes('nonlocal mutation')));
 const shadowed='export function f(Array:{from:(a:number[])=>number[]}, a:number[]):number[] {return Array.from(a).sort();}';
 assert.deepEqual(promotionCandidates(shadowed,'/tmp/shadow.ts',()=>{}),[]);
});

import {finishFunctions} from '../src/functions/build.mjs';
test('promotion artifacts survive Next cleanup in cache and publish at build completion',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'promotion-finish-'));
 try{
  const cache=path.join(dir,'cache/scriptc-promotion');await (await import('node:fs/promises')).mkdir(cache,{recursive:true});
  for(const name of ['promotion.node','ids.json','encodings.json'])await writeFile(path.join(cache,name),name);
  await finishFunctions(dir,dir,'fixture');
  for(const name of ['promotion.node','ids.json','encodings.json'])assert.equal(await readFile(path.join(dir,'scriptc-promotion',name),'utf8'),name);
  await rm(cache,{recursive:true});await finishFunctions(dir,dir,'fixture');
  assert.equal(existsSync(path.join(dir,'scriptc-promotion')),false);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('fallback windows demote only their bucket and function, even in native mode',()=>{
 let attempts=0;
 const d=setup({mode:'native',fallbackWindow:4,native:()=>{attempts++;return {fallback:true};}});
 for(let i=0;i<12;i++)assert.equal(d.dispatch('f',x=>x,[2]),2);
 assert.equal(attempts,4);assert.equal(d.snapshot().f.buckets[0].state,'demoted');
 d.dispatch('f',x=>x,['x'.repeat(1000)]);d.dispatch('g',x=>x,[2]);
 assert.equal(attempts,6);assert.equal(d.snapshot().f.buckets[1].state,'js');
 assert.equal(d.snapshot().g.buckets[0].state,'js');
});
test('shadow fallback attempts count, never verify, and stop after demotion',async()=>{
 let attempts=0;
 const d=setup({fallbackWindow:4,nativeAsync:async()=>{attempts++;return {fallback:true};}});
 for(let i=0;i<12;i++){d.dispatch('f',x=>x,[2]);await tick();await tick();}
 const s=d.snapshot().f.buckets[0];assert.equal(attempts,4);assert.equal(s.state,'demoted');assert.equal(s.verified,0);assert.equal(s.nativeFallbacks,4);
});
test('fallback threshold is strict and windows reset after mixed successes',()=>{
 let i=0;
 const d=setup({mode:'native',fallbackWindow:4,native:()=>++i%2?{fallback:true}:'2'});
 for(let j=0;j<12;j++)assert.equal(d.dispatch('f',x=>x,[2]),2);
 const s=d.snapshot().f.buckets[0];assert.notEqual(s.state,'demoted');assert.equal(s.nativeAttempts,12);assert.equal(s.nativeFallbacks,6);assert.equal(s.fallbackAttempts,0);
});

test('thread CPU pairs reject contention bias without changing D1 policy',async()=>{
 async function model(cpuMetric){
  let wall=0,cpu=0;
  const d=createDispatcher({now:()=>wall,cpuNow:cpuMetric?()=>cpu:undefined,log:()=>{},perMinute:1000,
   nativeSample:async()=>{wall+=85;return {value:'2',elapsedMs:85,cpuMs:30};}});
  // 15/24 wall pairs clear the margin, reproducing the failed M3 vote.
  for(let i=1;i<=520;i++){
   d.dispatch('f',()=>{const cost=i/20%24<15?103:70;wall+=cost;cpu+=60;return 2;},[2]);await tick();
  }
  return d.snapshot().f.buckets[0];
 }
 const old=await model(false),fixed=await model(true);
 assert.equal(old.state,'js-final');assert.equal(fixed.state,'native');
 assert.equal(fixed.lastDecision.metric,'thread-cpu');
 assert.equal(fixed.lastDecision.native.length,24);
 assert.ok(fixed.lastDecision.native.every(n=>n===30));
 assert.ok(fixed.lastDecision.js.every(n=>n===60));
 assert.ok(fixed.lastDecision.wallPairs.every(p=>p[1]===85));
});

test('JS calls during a pending shadow never become sample pairs',async()=>{
 let resolve,clocks=0;
 const d=setup({jsSamples:1,nativeSample:()=>new Promise(r=>resolve=r),now:()=>++clocks});
 d.dispatch('f',()=>2,[2]);await tick();const before=clocks;
 for(let i=0;i<10;i++)d.dispatch('f',()=>2,[2]);
 assert.equal(clocks,before);assert.equal(d.pending,1);
 resolve({value:'2',elapsedMs:1});await tick();assert.equal(d.snapshot().f.buckets[0].pairs.length,1);
});

test('CPU pairs include caller encode/decode costs and skip invalid CPU samples',async()=>{
 let cpu=0,wall=0,valid=false;
 const d=setup({cpuNow:()=>++cpu,now:()=>++wall,nativeSample:async()=>({value:'2',cpuMs:valid?30:NaN,elapsedMs:1000})});
 for(let i=0;i<3;i++){d.dispatch('f',()=>{cpu+=100;return 2;},[2]);await tick();}
 assert.equal(d.snapshot().f.buckets[0].pairs.length,0);
 valid=true;
 for(let i=0;i<2;i++){d.dispatch('f',()=>{cpu+=100;return 2;},[2]);await tick();}
 const decision=d.snapshot().f.buckets[0].lastDecision;
 assert.equal(decision.state,'native');assert.ok(decision.native.every(n=>n===32));
 assert.ok(decision.js.every(n=>n===101));assert.ok(decision.wallPairs.every(p=>p[1]>1000));
});
