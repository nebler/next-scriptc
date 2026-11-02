import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {lowerOpaqueHandles} from '../src/functions/opaque-handles.mjs';
import {constructionProof,strictClosureProgram} from '../src/functions/construction-proof.mjs';
import {checkFunctionTypes} from '../src/functions/types.mjs';
import {discoverPromotions} from '../src/functions/promotion-discovery.mjs';
import {buildPromotion} from '../src/functions/promotion-build.mjs';
import {loadPromotion} from '../src/functions/promotion-runtime.mjs';
import {encodeArguments,decodeResult,canonicalResult,argumentTable} from '../src/functions/promotion-encodings.mjs';
const ts=createRequire(import.meta.url)('typescript');
const source='export function rows(x:{n:number;date:Date;value:unknown}[]){return x.map(v=>({n:v.n+1,date:v.date,value:v.value,original:v}));}';
function moduleFor(text=source){const lower=lowerOpaqueHandles(text,'rows',ts);const strict=strictClosureProgram(lower.native,ts);const declaration=strict.source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text==='rows');const fn={name:'rows',id:'rows',promotion:true,opaqueInputs:lower.inputs,start:declaration.body.getStart(strict.source)};checkFunctionTypes(ts,strict.program,[{source:strict.source.fileName,functions:[fn]}]);fn.constructionProof=constructionProof(lower.native,ts);return {native:lower.native,functions:[fn],forced:true};}
test('opaque classification admits copies, rejects whole-value inspections',()=>{
 assert.deepEqual(lowerOpaqueHandles(source,'rows',ts).classification.map(x=>x.kind),['read','passthrough-only','passthrough-only','passthrough-only']);
 for(const expr of ['v.date===v.date','v.date.setTime(0)','({...v.date})','Object.keys(v.date)','v.date.getTime()','(v.date.extra=1)','Object.is(v.date,v.date)']){
  assert.throws(()=>lowerOpaqueHandles(`export function rows(x:{date:Date}[]){return x.map(v=>({date:v.date,read:${expr}}));}`,'rows',ts),/also read/);
 }
 const m=moduleFor('export function rows(x:{date:Date}[]){return x.map(v=>{const b={date:v.date};return {date:b.date,same:b.date===b.date};});}');
 assert.equal(m.functions[0].constructionProof.eligible,false);
 for(const text of [
 'export function rows(x:{value:any}[]){return x.map(v=>{const b:{h:number}={h:v.value};return b.h+1;});}',
 'function inspect(b:{h:number}){return b.h+1;} export function rows(x:{value:unknown}[]){return x.map(v=>{const b={h:v.value};return inspect(b);});}',
 ])assert.equal(moduleFor(text).functions[0].constructionProof.eligible,false);
 assert.equal(moduleFor().functions[0].constructionProof.eligible,true);
 const direct=lowerOpaqueHandles('export function rows(x:Date){const a=x;return a;}','rows',ts);assert.equal(direct.inputs[0].kind,'handle');
 const loop=lowerOpaqueHandles('export function rows(x:{date:Date}[]){for(const v of x){return {date:v.date};}return null;}','rows',ts);assert.ok(loop.inputs);
 const push=moduleFor('export function rows(x:{date:Date}[]){const a=[];for(const v of x)a.push(v.date);return a;}');assert.equal(push.functions[0].constructionProof.eligible,true);
});
test('call tables preserve arbitrary references, reject fabricated and foreign handles',()=>{
 const aliasSchema=moduleFor('export function rows(x:{read:{n:number};value:unknown}){return {n:x.read.n+1,value:x.value};}').functions[0].boundary;const alias={n:2};assert.ok(encodeArguments(aliasSchema,[{read:alias,value:alias}]));
 const schema=moduleFor().functions[0].boundary,date=new Date(),value=new (class Value {})();
 const args=encodeArguments(schema,[[{n:1,date,value}]]),table=argumentTable(args);
 const output=JSON.stringify([{n:2,date:1,value:2,original:0}]);const result=decodeResult(schema,output,table);
 assert.equal(result[0].date,date);assert.equal(result[0].value,value);
 assert.equal(canonicalResult(result,schema,table),canonicalResult([{n:2,date,value,original:table[0]}],schema,table));
 assert.throws(()=>decodeResult(schema,output));assert.throws(()=>decodeResult(schema,'[{"n":2,"date":0,"value":1,"extra":true}]',table));assert.throws(()=>decodeResult(schema,'[{"n":2,"date":99,"value":1}]',table));
 assert.throws(()=>canonicalResult([{n:2,date:new Date(),value}],schema,table));
});
test('real addon preserves Dates and identity, shadows decoded results, differential seed 20935',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'opaque-handles-'));
 try{
 fs.mkdirSync(path.join(dir,'node_modules'));fs.symlinkSync(path.dirname(createRequire(import.meta.url).resolve('typescript/package.json')),path.join(dir,'node_modules/typescript'));
 fs.writeFileSync(path.join(dir,'types.ts'),'export interface Row {n:number;date:Date;value:unknown}');
 fs.writeFileSync(path.join(dir,'input.ts'),"import type {Row} from './types';\n"+source.replace('{n:number;date:Date;value:unknown}[]','Row[]'));fs.writeFileSync(path.join(dir,'tsconfig.json'),JSON.stringify({compilerOptions:{strict:true}}));
 const logs=[],discovered=await discoverPromotions(dir,path.join(dir,'out'),{},s=>logs.push(s));assert.equal(discovered.length,1,logs.join('\n'));
 const m=discovered[0];m.functions[0].id='rows';assert.equal((await buildPromotion([m],dir)).length,1);
 const d=loadPromotion(path.join(dir,'promotion.node'),{mode:'native',log:()=>{},crashGuard:{directory:path.join(dir,'markers')}});
 const js=x=>x.map(v=>({n:v.n+1,date:v.date,value:v.value,original:v}));
 let seed=20935;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
 for(let i=0;i<100;i++){
  const instance=new (class Value {})(),date=new Date(random()),cycle={};cycle.self=cycle;const shared=[instance,undefined,null,Symbol('borrowed'),()=>42,1n,cycle][random()%7];const rows=Array.from({length:random()%12},()=>({n:random()%10000,date,value:shared}));
  const expected=js(rows),actual=d.dispatch('rows',js,[rows]);assert.deepEqual(actual,expected);
  actual.forEach((r,j)=>{assert.equal(r.date,date);assert.equal(r.value,shared);assert.equal(r.original,rows[j]);});
 }
 assert.equal(d.snapshot().rows.native,100);
 const shadow=loadPromotion(path.join(dir,'promotion.node'),{jsSamples:1,sampleEvery:1,log:()=>{},crashGuard:{directory:path.join(dir,'markers')}});
 const input=[{n:3,date:new Date(),value:Object.create({custom:true})}];shadow.dispatch('rows',js,[input]);
 while(shadow.pending)await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(shadow.snapshot().rows.buckets[0].verified,1);
 const bad=loadPromotion(path.join(dir,'promotion.node'),{jsSamples:1,sampleEvery:1,log:()=>{},crashGuard:{directory:path.join(dir,'markers')}});
 bad.dispatch('rows',x=>x.map(v=>({n:999,date:v.date,value:v.value,original:v})),[input]);
 while(bad.pending)await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(bad.snapshot().rows.buckets[0].state,'demoted');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('read-and-pass projections keep handles at the same position and validate own data reads',()=>{
 const m=moduleFor('export function rows(x:{n:number;date:Date}[]){return x.map(v=>{const alias=v;return {n:alias.n+1,alias};});}');
 assert.equal(m.functions[0].constructionProof.eligible,true);
 const schema=m.functions[0].boundary,v={n:4,date:new Date()};
 const encoded=encodeArguments(schema,[[v,v]]),table=argumentTable(encoded),projection=JSON.parse(encoded[0]);
 assert.deepEqual(projection,[{__scriptcOriginal:0,n:4},{__scriptcOriginal:0,n:4}]);
 assert.equal(decodeResult(schema,'[{"n":5,"alias":0}]',table)[0].alias,v);
 let calls=0;assert.throws(()=>encodeArguments(schema,[[{get n(){calls++;return 4;}}]]),/own data/);assert.equal(calls,0);
 assert.throws(()=>encodeArguments(schema,[[Object.assign(Object.create({n:4}),{date:new Date()})]]));
 for(const expr of ['v===v','Object.keys(v)','Object.entries(v)','({...v})','("n" in v)','(v.n=5)','inspect(v)']){
  assert.throws(()=>lowerOpaqueHandles(`function inspect(v:{n:number}){return v.n;} export function rows(x:{n:number}[]){return x.map(v=>({original:v,n:v.n,bad:${expr}}));}`,'rows',ts),/also read/);
 }
 assert.throws(()=>lowerOpaqueHandles('export function rows(x:{n:number;child:object}[]){return x.map(v=>({original:v,n:v.n,same:v.child===v.child}));}', 'rows',ts),/also read/);
 const hidden=moduleFor('export function rows(x:{n:number}[]){return x.map(v=>{const b={original:v};return {original:b.original,n:v.n,same:b.original===b.original};});}');
 assert.equal(hidden.functions[0].constructionProof.eligible,false);
});
