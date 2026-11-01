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
function setup(extra={}){let t=0;return createDispatcher({jsSamples:2,matches:2,sampleEvery:1,now:()=>t++,log:()=>{},native:(_id,s)=>s,nativeAsync:async(_id,s)=>s,...extra});}
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
