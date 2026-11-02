import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire,stripTypeScriptTypes} from 'node:module';
import {dependencyClosure} from '../src/functions/dependency-closure.mjs';
const ts=createRequire(import.meta.url)('typescript');
function fixture(run){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'reachability-'));const write=(name,text)=>{const file=path.join(dir,name);fs.writeFileSync(file,text);return file;};try{run(write,dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
const entry='import {twice} from "./helper"; export function rows(x:number[]){return x.map(v=>twice(v));}';
const helper='export function twice(n:number){return n*2;}';
const closure=(text,file)=>dependencyClosure(text,file,'rows',{ts});
test('unreachable calls, allocation, classes and clocks disappear in source and dependency',()=>fixture(write=>{
 for(const unrelated of ['const unused=f();','const unused=new Map();','class Unused { method(){return this;} }','const unused=Date.now();','const unused=()=>console.log(process.env);']){
  write('helper.ts',unrelated+helper);
  const text=unrelated+entry,file=write('entry.ts',text),result=closure(text,file);
  assert.doesNotMatch(result.native,/unused|Unused|Date|Map|console|process|f\(\)/);
  const js=new Function(stripTypeScriptTypes(result.native.replace(/export\s*\{[^}]*\};?/g,''))+';return rows;')();
  assert.deepEqual(js([1,2,3]),[2,4,6]);
 }
}));
test('reachable equivalents retain initialization and effect rejection',()=>fixture(write=>{
 for(const code of ['const value=f();export function twice(n:number){return value+n;}','const value=new Map();export function twice(n:number){return value.get(n);}','class Value {} export function twice(n:number){return new Value();}','export function twice(n:number){return Date.now()+n;}','export function twice(n:number){return new Map();}']){
  write('helper.ts',code);const file=write('entry.ts',entry);assert.throws(()=>closure(entry,file),/dependency closure/);
 }
}));
test('bare statements reject in source and every visited dependency',()=>fixture(write=>{
 for(const effect of ['console.log("effect");','if(true){Date.now();}','globalThis.x=1;','twice.changed=1;']){
  write('helper.ts',effect+helper);let file=write('entry.ts',entry);assert.throws(()=>closure(entry,file),/module initialization/);
  write('helper.ts',helper);file=write('entry.ts',entry+effect);assert.throws(()=>closure(entry+effect,file),/module initialization/);
 }
}));
test('diamond requests accumulate exports and transitively renamed helpers once',()=>fixture(write=>{
 write('leaf.ts','export const scale=2; export function a(n:number){return n*scale;} export function b(n:number){return n+3;} export const bad=Date.now();');
 write('left.ts','import {a} from "./leaf";export function left(n:number){return a(n);}');
 write('right.ts','import {b} from "./leaf";export function right(n:number){return b(n);}');
 const text='import {left} from "./left";import {right} from "./right";export function rows(x:number[]){return x.map(v=>left(v)+right(v));}',file=write('entry.ts',text),result=closure(text,file);
 assert.equal(result.dependencies.length,4);assert.doesNotMatch(result.native,/Date/);
 const js=new Function(stripTypeScriptTypes(result.native.replace(/export\s*\{[^}]*\};?/g,''))+';return rows;')();assert.deepEqual(js([1,2]),[6,9]);
}));
test('reachable import cycles reject, unreachable import cycles are dropped',()=>fixture(write=>{
 write('helper.ts','import {rows} from "./entry";export function twice(n:number){return rows([n])[0];}');
 const file=write('entry.ts',entry);assert.throws(()=>closure(entry,file),/module cycle/);
 write('helper.ts','import {rows} from "./entry";'+helper);assert.equal(closure(entry,file).dependencies.length,2);
}));
import vm from 'node:vm';
import {createDispatcher} from '../src/functions/promotion.mjs';
test('shadow rejects divergence from an excluded initializer that patches a prototype',async()=>{
 let original,native;
 fixture(write=>{
  const text='function patch(){Array.prototype.map=function(){return [99];};} const unused=patch(); export function rows(x:number[]){return x.map(v=>v*2);}';
  const file=write('entry.ts',text),result=closure(text,file);
  assert.doesNotMatch(result.native,/patch|prototype|unused/);
  const evaluate=code=>JSON.parse(vm.runInNewContext(stripTypeScriptTypes(code.replace(/export\s*\{[^}]*\};?/g,'').replace(/export\s+(?=function)/g,''))+';JSON.stringify(rows([1,2]));'));
  original=evaluate(text);native=evaluate(result.native);
 });
 assert.deepEqual(original,[99]);assert.deepEqual(native,[2,4]);
 let foreground=0;
 const dispatcher=createDispatcher({jsSamples:1,sampleEvery:1,log:()=>{},native:()=>{foreground++;return JSON.stringify(native);},nativeAsync:async()=>JSON.stringify(native)});
 assert.deepEqual(dispatcher.dispatch('rows',()=>original,[[1,2]]),original);
 await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(dispatcher.snapshot().rows.buckets[0].state,'demoted');assert.equal(foreground,0);
});
import {promotionCandidates} from '../src/functions/promotion-discovery.mjs';
test('automatic extraction prunes sibling declarators before traversing references',()=>fixture(write=>{
 write('helper.ts',helper);
 const text='import {twice} from "./helper";const scale=2, unused=Date.now();export function rows(x:number[]){return x.map(v=>twice(v)*scale);}';
 const file=write('entry.ts',text),candidates=promotionCandidates(text,file,()=>{},{ts});assert.equal(candidates.length,1);assert.doesNotMatch(candidates[0].native,/Date|unused/);
}));
test('imported bindings exported under aliases link to the final defining module',()=>fixture(write=>{
 write('leaf.ts',helper);
 write('helper.ts','import {twice as local} from "./leaf";export {local as twice};export const unused=Date.now();');
 const file=write('entry.ts',entry),result=closure(entry,file);
 const js=new Function(stripTypeScriptTypes(result.native.replace(/export\s*\{[^}]*\};?/g,''))+';return rows;')();assert.deepEqual(js([2,3]),[4,6]);
}));
test('the server-only marker is admitted; other side-effect imports still reject',()=>fixture(write=>{
 write('helper.ts','import "server-only";'+helper);
 let text='import "server-only";'+entry,file=write('entry.ts',text);
 const result=closure(text,file);assert.doesNotMatch(result.native,/server-only/);
 for(const other of ['import "./polyfill";','import "client-only";','import "server-only-extra";']){
  write('polyfill.ts','export {};');write('helper.ts',helper);
  text=other+entry;file=write('entry.ts',text);assert.throws(()=>closure(text,file),/side-effect import/);
  write('helper.ts',other+helper);file=write('entry.ts',entry);assert.throws(()=>closure(entry,file),/side-effect import/);
 }
}));
