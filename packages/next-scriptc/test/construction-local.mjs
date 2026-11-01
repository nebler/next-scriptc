import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {constructionProof} from '../src/functions/construction-proof.mjs';
import {buildPromotion} from '../src/functions/promotion-build.mjs';
import {encodeArguments} from '../src/functions/promotion-encodings.mjs';
import {createDispatcher} from '../src/functions/promotion.mjs';
const proof=body=>constructionProof(`export function f(x:{n:number}[]){${body}}`);
test('local mutation tracks aliases, density, cycles, opaque escape and keys',()=>{
 for(const body of [
  'const a:number[]=[];for(let i=0;i<3;i++)a.push(i*i);return a',
  'const a={n:0};const b=a;b.n+=3;return a',
  'const m=new Map<string,number>();for(const v of x)m.set("x",v.n);return Array.from(m.values()).sort((a,b)=>a-b)',
  'const s=new Set<number>();s.add(3);return Array.from(s.values())',
  'const o={x:1,y:2};return Object.values(o)',
  'let sum=0;for(const v of x)sum+=Math.sqrt(v.n);return {sum,s:`sum=${sum}`}',
 ])assert.equal(proof(body).eligible,true,body);
 for(const body of [
  'const a=x;a.push({n:1});return a',
  'const a=x;for(const v of a)v.n++;return {n:1}',
  'const a:number[]=[];a[5]=1;return a',
  'const a:number[]=[];a[a.length]=1;return a',
  'const m:{}=new Map();return {m}',
  'const m=new Map<string,number>();const o={length:m};return o.length',
  'const a:{child?:object}={};a.child=a;return a',
  'const key="__proto__";const o={};o[key]={};return o',
  'const o={};return {["constructor"]:o}',
  'const s=new Set<{}>();s.add(new Map());return Array.from(s.entries()).map(([k,v])=>k)',
  'const m=new Map<{},number>();m.set(new Map(),1);const out:{}[]=[];m.forEach((v,k)=>out.push(k));return out',
  'const a:{}[]=[new Map()];const b=a.map((v,i,all)=>all);return b',
  'const a:{}[][]=[[new Map()]];return a.map(([v])=>v)',
  'const o={get n(){return 1}};return o',
  'const y=JSON.parse("{}");return y as {n:number}',
  'return x.map((v={get n(){return 1}})=>v)',
  'return x.map(({n=Object.defineProperty({},"x",{value:1})})=>n)',
  'const a=x;const m=new Map<string,{n:number}[]>();m.set("x",a);m.get("x")?.push({n:1});return {n:1}',
 ])assert.equal(proof(body).eligible,false,body);
});
test('guarded parse cannot hide behind another exported helper',()=>{assert.equal(constructionProof('export function h(x:string){const v=JSON.parse(x) as {n:number};return {n:v.n};} export function f(x:string){return h(x);}').eligible,false);});
const settle=async d=>{while(d.pending)await new Promise(r=>setTimeout(r,1));};
test('fallback status skips shadows and answers native calls without demoting other functions',async()=>{
 const schema={params:['number'],result:'json'};
 const d=createDispatcher({schemas:{f:schema},native:()=>({fallback:true}),nativeSample:async()=>({value:{fallback:true},elapsedMs:1}),jsSamples:1,sampleEvery:1,log:()=>{}});
 assert.deepEqual(d.dispatch('f',n=>({n}),[2]),{n:2});await settle(d);
 let state=d.snapshot().f;assert.equal(state.fallback,1);assert.equal(state.buckets[0].state,'shadow');assert.equal(state.buckets[0].verified,0);
 const n=createDispatcher({mode:'native',schemas:{f:schema,g:schema},native:(_id,[v])=>v===1?{fallback:true}:JSON.stringify({n:v}),log:()=>{}});
 assert.deepEqual(n.dispatch('f',v=>({n:v}),[1]),{n:1});
 assert.deepEqual(n.dispatch('f',v=>({n:v}),[2]),{n:2});
 state=n.snapshot().f;assert.equal(state.fallback,1);assert.equal(state.native,1);assert.ok(state.buckets.every(b=>b.state!=='demoted'));
 // A JS exception after a fallback must not enter the native panic catch.
 assert.throws(()=>n.dispatch('f',()=>{throw Error('JS failure');},[1]),/JS failure/);
 assert.deepEqual(n.dispatch('g',v=>({n:v}),[2]),{n:2});
 let clock=0;
 const auto=createDispatcher({now:()=>clock,schemas:{f:schema},jsSamples:1,sampleEvery:1,policy:{samples:1,required:1,coldSamples:0},nativeSample:async()=>({value:'{"n":1}',elapsedMs:0}),native:(_id,[v])=>v===1?{fallback:true}:JSON.stringify({n:v}),log:()=>{}});
 const js=v=>{clock+=100;return {n:v};};
 auto.dispatch('f',js,[1]);await settle(auto);assert.equal(auto.snapshot().f.buckets[0].state,'native');
 assert.deepEqual(auto.dispatch('f',js,[1]),{n:1});assert.equal(auto.snapshot().f.buckets[0].state,'native');
 assert.deepEqual(auto.dispatch('f',js,[2]),{n:2});assert.equal(auto.snapshot().f.native,1);assert.equal(auto.snapshot().f.fallback,1);
});
test('native arithmetic fallback leaves the same instance usable, sync, async and timed',async()=>{
 for(const timing of [false,true]){
 const dir=await mkdtemp(path.join(os.tmpdir(),'construction-v2-'));
 try{
  const source='export function f(n:number){if(n===-1)return {a:[-0]};const a:number[]=[];a.push(n*n);a.push(n/n);a.push(-n);return {a};}';
  const fn={id:'f',name:'f',boundary:{params:['number'],result:'json'}};
  await buildPromotion([{native:source,forced:true,functions:[fn]}],dir,{constructionResults:true,timing,report:()=>{}});
  assert.equal(fn.constructionProof.eligible,true);
  const addon=createRequire(import.meta.url)(path.join(dir,'promotion.node'));
  for(const method of ['run','runAsync']){
   for(const n of [0,Number.MAX_VALUE])assert.deepEqual(await addon[method](0,[n]),{fallback:true});
   const good=await addon[method](0,[2]);assert.equal(timing?good.value:good,'{"a":[4,1,-2]}');
   const zero=await addon[method](0,[-1]);assert.equal(timing?zero.value:zero,'{"a":[0]}');
   const negative=await addon[method](0,[-0]);assert.deepEqual(negative,{fallback:true});
  }
  const d=createDispatcher({mode:'native',timing,schemas:{f:fn.boundary},native:(_id,a)=>addon.run(0,a),log:()=>{}});
  const js=n=>({a:[n*n,n/n,-n]});
  assert.deepEqual(d.dispatch('f',js,[0]),js(0));assert.deepEqual(d.dispatch('f',js,[2]),js(2));assert.equal(d.snapshot().f.native,1);
 }finally{await rm(dir,{recursive:true,force:true});}
 }
});
test('asserted parse is checked dynamically before typed reads, including undefined',async()=>{
 let coercions=0;assert.throws(()=>encodeArguments({params:['string'],parseInputs:[0]},[{toString(){coercions++;return '{}';}}]));assert.equal(coercions,0);
 const dir=await mkdtemp(path.join(os.tmpdir(),'construction-parse-'));
 try{
 const source='export function f(x:string){const v=JSON.parse(x) as {n:number; s:string};return {n:v.n,s:v.s};}';
 const fn={name:'f',id:'f',boundary:{params:['string'],result:'json'}};
 await buildPromotion([{native:source,forced:true,functions:[fn]}],dir,{constructionResults:true,report:()=>{}});
 const addon=createRequire(import.meta.url)(path.join(dir,'promotion.node'));
 for(const input of ['{}','{"n":1}','{"n":null,"s":"a"}','{"n":"1","s":"a"}'])assert.deepEqual(addon.run(0,[input]),{fallback:true});
 assert.equal(addon.run(0,['{"n":1,"s":"alive"}']),' {"n":1,"s":"alive"}'.trim());
 const {loadPromotion}=await import('../src/functions/promotion-runtime.mjs');
 const d=loadPromotion(dir+'/promotion.node',{mode:'native',log:()=>{}});
 const js=x=>{const v=JSON.parse(x);return {n:v.n,s:v.s};};
 assert.deepEqual(d.dispatch('f',js,['{}']),{n:undefined,s:undefined});
 assert.throws(()=>d.dispatch('f',js,['{']),SyntaxError);
 assert.deepEqual(d.dispatch('f',js,['{"n":3,"s":"ok"}']),{n:3,s:'ok'});
 assert.ok(d.snapshot().f.buckets.every(b=>b.state!=='demoted'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('non-finite JS shadow results skip verification without demotion',async()=>{
 const d=createDispatcher({schemas:{f:{params:['number'],result:'json'}},nativeSample:async()=>{throw Error('invalid sample must be skipped');},jsSamples:1,sampleEvery:1,log:()=>{}});
 assert.deepEqual(d.dispatch('f',n=>({n:n/n}),[0]),{n:NaN});await settle(d);
 assert.equal(d.snapshot().f.buckets[0].state,'shadow');assert.equal(d.snapshot().f.buckets[0].verified,0);assert.equal(d.snapshot().f.fallback,1);
});
test('native scalar arithmetic uses the same fallback status',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'construction-scalar-'));
 try{
 const fn={name:'f',id:'f',boundary:{params:['number'],result:'number'}};
 await buildPromotion([{native:'export function f(n:number){return n*n;}',forced:true,functions:[fn]}],dir,{constructionResults:true,report:()=>{}});
 const addon=createRequire(import.meta.url)(dir+'/promotion.node');assert.deepEqual(addon.run(0,[Number.MAX_VALUE]),{fallback:true});assert.equal(addon.run(0,[2]),4);
 }finally{await rm(dir,{recursive:true,force:true});}
});
