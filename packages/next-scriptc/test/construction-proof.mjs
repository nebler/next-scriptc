import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {createRequire,stripTypeScriptTypes} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import {constructionProof} from '../src/functions/construction-proof.mjs';
import {signature} from '../src/functions/promotion-signature.mjs';
import {buildPromotion} from '../src/functions/promotion-build.mjs';
import {createDispatcher} from '../src/functions/promotion.mjs';
import {encodeArguments} from '../src/functions/promotion-encodings.mjs';
const source='function copy(v:{n:number,s:string}){return {n:v.n,s:v.s};} export function rows(x:{n:number,s:string}[]){const a=x.map(v=>copy(v));return {a,alias:a,input:x};}';
const boundary={params:['json'],result:'json'};
test('whole closure allowlist rejects adversarial construction and keeps strict wrapper',()=>{
 const bodies=[
 'Object.defineProperty(x,"hidden",{value:1});return x',
 'Object.defineProperties(x,{n:{get(){return 1}}});return x',
 'Object.setPrototypeOf(x,null);return x',
 'return Object.assign(x,{get n(){return 1}})',
 'return Object.create(null)', 'return Reflect.ownKeys(x)', 'return new Proxy(x,{})',
 'return Symbol("x")','return {get n(){return 1}}','return {set n(v:number){}}',
 'class C {n=1};return new C()', 'return {__proto__:x}', 'return {["__proto__"]:x}',
 'const k="__proto__";return {[k]:x}', 'delete x.n;return x',
 'const a=[1];a.length=4;return a','const a=[1];a[5]=2;return a',
 'const a=[1];a.push(a);return a', 'return new Array(5)','return Array(5)',
 'return Array.from({length:5})','return [,1]','return [...x]', 'return {...x}',
 'const y:any=x;return y','const y:unknown=x;return y','return x as {n:number}',
 'return x!','return <{n:number}>x','return Function("return 1")()',
 'return eval("x")','return this','return arguments','return {toJSON(){return 1}}',
 'return {toJSON:1}', 'return x.toJSON','return new Map()', 'return new Set()',
 'return new Date()','return /x/','return new RegExp("x")','return new Uint8Array(4)',
 'return {n:Infinity}','return {n:NaN}',
 'return {s:"\\ud800"}','return x["n"]',
 'return x.n.toString()',  'return f(x)',
 'return x.constructor', 'return {constructor:1}',
 'return x < x', 'const y=x.missing;return y', 'return x.map(v=>v)',
 ];
 for(const body of bodies){
  const proof=constructionProof(`export function f(x:{n:number}){${body}}`);
  assert.equal(proof.eligible,false,body);
  assert.match(signature({boundary,constructionProof:proof},0,false,true).source,/serialize\(value,true/);
 }
 for(const extra of ['function evil(x:any){return x}','function evil(){return new Date()}','const x={n:1};'])assert.equal(constructionProof(source+extra).eligible,false,extra);
 assert.equal(constructionProof(source).eligible,true);
 for(const body of ['const a:{}[]=x.map(v=>a);return a','const a:{}[]=x.map(v=>b);const b:{}[]=[];return a'])assert.equal(constructionProof('export function f(x:number[]){'+body+'}').eligible,false,body);
 assert.equal(constructionProof('function a(x:number):number{return b(x)} function b(x:number):number{return a(x)} export function f(x:number){return {n:a(x)}}').eligible,false);
 assert.equal(constructionProof('function a(x:number[]):number[]{return x.map(v=>a(x)[0])} export function f(x:number[]){return a(x)}').eligible,false);
 const fn={boundary,constructionProof:constructionProof(source)};
 assert.match(signature(fn,0).source,/serialize\(value,true/);
 assert.doesNotMatch(signature(fn,0,false,true).source,/serialize\(value,true/);
});
test('screened native results match bytes and survive adversarial boundary data',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'construction-native-'));
 try{
  const fn={name:'rows',id:'rows',boundary};
  await buildPromotion([{native:source,forced:true,functions:[fn]}],dir,{constructionResults:true,report:()=>{}});
  assert.equal(fn.constructionProof.eligible,true);
  assert.doesNotMatch(await readFile(path.join(dir,'entry.ts'),'utf8'),/serialize\(value,true/);
  const addon=createRequire(import.meta.url)(path.join(dir,'promotion.node'));
  assert.equal(JSON.parse(await readFile(path.join(dir,'construction-report.json'),'utf8'))[0].enabled,true);
  const js=new Function(stripTypeScriptTypes(source.replace('export ',''))+';return rows;')();
  let nested={};for(let i=0;i<128;i++)nested={next:nested};
  const cases=[[],[JSON.parse('{"n":1,"s":"keys","__proto__":{"x":1},"toJSON":3,"0":"zero"}')],[{n:1,s:'nested extra',nested}],[{n:-0,s:'世界😀\0'}],[{n:Number.MAX_VALUE,s:'a"\\\n'}],Array.from({length:20000},(_,i)=>({n:i,s:'é'})),[{n:1,s:'\ud800'}]];
  for(const rows of cases){
   const args=encodeArguments(boundary,[rows]);
   const expected=JSON.stringify(js(...args.map(JSON.parse)));
   for(const method of ['run','runAsync'])assert.equal(await addon[method](0,args),expected);
  }
  // Invalid numeric/cyclic/deep inputs are refused before entering native code.
  const cyclic=[];cyclic.push(cyclic);
  let deep={};for(let i=0;i<20000;i++)deep={next:deep};
  for(const x of [[{n:NaN,s:'x'}],[{n:Infinity,s:'x'}],cyclic,deep])assert.throws(()=>encodeArguments(boundary,[x]));
  const dispatcher=createDispatcher({native:(_,args)=>addon.run(0,args),nativeAsync:(_,args)=>addon.runAsync(0,args),schemas:{rows:boundary},jsSamples:1,sampleEvery:1,log:()=>{}});
  dispatcher.dispatch('rows',js,[[{n:-0,s:'shadow😀'}]]);
  while(dispatcher.pending)await new Promise(resolve=>setTimeout(resolve,1));
  assert.equal(dispatcher.snapshot().rows.buckets[0].verified,1);
  assert.equal(encodeArguments({params:['string']},['good'])[0],'good');
  assert.throws(()=>encodeArguments({params:['string']},['\ud800']));
  assert.equal(JSON.parse(addon.run(0,encodeArguments(boundary,[[{n:2,s:'alive'}]]))).a[0].s,'alive');
 }finally{await rm(dir,{recursive:true,force:true});}
});
