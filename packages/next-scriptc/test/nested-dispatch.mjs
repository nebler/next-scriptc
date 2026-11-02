import test from 'node:test';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';
import {promotionCandidates} from '../src/functions/promotion-discovery.mjs';
import loader from '../src/functions/loader.mjs';
import {createDispatcher} from '../src/functions/promotion.mjs';
const tick=()=>new Promise(setImmediate);
test('candidate JS calls raw helpers while app calls dispatch, with aliases and shadowed names',async()=>{
 const text=`export function tiny(x:number):number {"use native";return x+1;}
 export function outer(a:number[]):number {let n=0;for(const x of a)n+=tiny(x)+tiny(x);return n;}
 export const arrow=(a:number[]):number=>a.reduce((n,x)=>n+tiny(x),0);
 export function app(x:number){return tiny(x);}
 function privateWeight(x:number):number {"use native";return x*2;}
 export function privateOuter(a:number[]):number {let n=0;for(const x of a)n+=privateWeight(x);return n;}
 export function shadowed(a:number[]):number {let n=0;for(const x of a){const tiny=2;n+=tiny*x;}return n;}
 export const named=function recurse(x:number):number {"use native";return x>0?recurse(x-1)+1:0;};`;
 const file='/tmp/d3.ts',rows=promotionCandidates(text,file,()=>{}),module={...rows[0],functions:rows.flatMap(r=>r.functions)};
 let code=loader.call({resourcePath:file,getOptions:()=>({modules:{[file]:module},server:true,promotionFile:'',promotionClient:'fake'})},text);
 code=code.replace(/^import .*\n/,'');
 const calls=[];globalThis.__d3Calls=calls;
 code=`function ${code.match(/(__scriptc_\w+_auto)\(/)[1]}(_f,id,js,args){globalThis.__d3Calls.push(id);return js(...args);}\n`+code;
 const m=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(code)).toString('base64'));
 assert.equal(m.outer([1,2,3]),18);assert.equal(calls.length,1);
 assert.equal(m.arrow([1,2]),5);assert.equal(calls.length,2);
 assert.equal(m.app(1),2);assert.equal(calls.length,3);assert.equal(calls[2],rows.find(r=>r.functions[0].name==='tiny').functions[0].id);
 assert.equal(m.privateOuter([1,2]),6);assert.equal(calls.length,4);
 assert.equal(m.shadowed([1,2]),6);assert.equal(calls.length,5);
 assert.equal(m.named(5),5);assert.equal(calls.length,6);
 assert.equal(m.privateWeight,undefined);
 delete globalThis.__d3Calls;
});
test('outer decides under nested helper load with a global rolling quota',async()=>{
 let clock=0,wall=0,launched=0;
 const d=createDispatcher({now:()=>wall,cpuNow:()=>clock,log:()=>{},native:()=> '2',nativeSample:async()=>{launched++;return {value:'2',elapsedMs:1,cpuMs:1};}});
 const helper=()=>d.dispatch('helper',()=>{clock+=10;return 2;},[2]);
 for(let i=0;i<1600;i++){
  d.dispatch('outer',()=>{for(let j=0;j<100;j++)helper();clock+=100;return 2;},[2]);await tick();
  // Advance a controlled minute after each epoch of requests; never relax quota.
  if(i===799){assert.ok(launched<=50);wall+=60001;}
 }
 assert.ok(launched<=100);
 assert.equal(d.snapshot().outer.buckets[0].state,'native');
 assert.equal(d.snapshot().outer.buckets[0].lastDecision.js.length,24);
});

import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
test('linked helper through a re-export calls raw JS, external import still dispatches',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'d3-linked-'));
 try{
  const texts={
   'helper.ts':'export function helper(x:number):number {"use native";return x+1;}',
   'barrel.ts':"export {helper as alias} from './helper';",
   'outer.ts':"import {alias as h} from './barrel'; export function outer(a:number[]):number {let n=0;for(const x of a)n+=h(x);return n;}"
  };
  for(const [name,text] of Object.entries(texts))await writeFile(path.join(dir,name),text);
  const rows=Object.entries(texts).flatMap(([name,text])=>promotionCandidates(text,path.join(dir,name),()=>{}));
  assert.equal(rows.length,2);
  const modules=Object.fromEntries(rows.map(r=>[r.source,r]));
  await writeFile(path.join(dir,'client.mjs'),'export const calls=[];export function promote(_f,id,js,args){calls.push(id);return js(...args);}');
  for(const r of rows){let code=loader.call({resourcePath:r.source,getOptions:()=>({modules,server:true,promotionClient:path.join(dir,'client.mjs'),promotionFile:''})},texts[path.basename(r.source)]);
   code=code.replace("from './barrel'", "from './barrel.mjs'").replaceAll(path.join(dir,'helper.ts'),path.join(dir,'helper.mjs'));
   await writeFile(r.source.replace('.ts','.mjs'),stripTypeScriptTypes(code));
  }
  await writeFile(path.join(dir,'barrel.mjs'),"export {helper as alias} from './helper.mjs';");
  const outer=await import(path.join(dir,'outer.mjs')),helper=await import(path.join(dir,'helper.mjs')),client=await import(path.join(dir,'client.mjs'));
  assert.equal(outer.outer([1,2]),5);assert.equal(client.calls.length,1);
  assert.equal(helper.helper(4),5);assert.equal(client.calls.length,2);
 }finally{await rm(dir,{recursive:true,force:true});}
});
