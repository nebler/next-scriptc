import {constructionProof} from '../src/functions/construction-proof.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire,stripTypeScriptTypes} from 'node:module';
import {dependencyClosure} from '../src/functions/dependency-closure.mjs';
import {promotionCandidates} from '../src/functions/promotion-discovery.mjs';
const ts=createRequire(import.meta.url)('typescript');
function fixture(run){const dir=fs.mkdtempSync('/tmp/b1-proof-');const write=(name,text)=>{const file=path.join(dir,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);return file;};try{run(write,dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
const close=(text,file)=>dependencyClosure(text,file,'rows',{ts});
const evaluate=text=>new Function(stripTypeScriptTypes(text.replace(/export\s*\{[^}]*\};?/g,''))+';return rows;')();
test('Node condition flags reject unmodeled runtime branches without vetoing erased types',()=>fixture((write,dir)=>{
 write('node_modules/conditional/package.json',JSON.stringify({name:'conditional',type:'module',exports:{'b1-custom':'./custom.mjs',node:'./node.mjs'}}));
 write('node_modules/conditional/custom.mjs','export function factor(){return 3;}');write('node_modules/conditional/node.mjs','export function factor(){return 2;}');
 const text="import {factor} from 'conditional';export function rows(x:number[]){return x.map(v=>v*factor());}",file=write('entry.ts',text);
 const script=`import fs from 'node:fs';import {pathToFileURL} from 'node:url';import {dependencyClosure} from ${JSON.stringify(new URL('../src/functions/dependency-closure.mjs',import.meta.url).href)};const file=${JSON.stringify(file)};const js=(await import(pathToFileURL(file))).rows([1]);let refusal='accepted';try{dependencyClosure(fs.readFileSync(file,'utf8'),file,'rows');}catch(error){refusal=error.message;}console.log(JSON.stringify({js,refusal}));`;
 for(const flags of [['--conditions=b1-custom'],['-C','b1-custom']]){const result=JSON.parse(execFileSync(process.execPath,[...flags,'--input-type=module','-e',script],{encoding:'utf8'}));assert.deepEqual(result.js,[3]);assert.match(result.refusal,/unknown active package export conditions from Node flags/);}
 const previous=process.env.NODE_OPTIONS;try{
  process.env.NODE_OPTIONS='--conditions="b1-custom"';assert.throws(()=>close(text,file),/unknown active package export conditions from Node flags/);
  write('types.d.ts','export interface Row{n:number}');const types="import type {Row} from './types';export function rows(x:Row[]){return x.map(v=>v.n);}";assert.ok(close(types,write('types-entry.ts',types)).native);
 }finally{if(previous===undefined)delete process.env.NODE_OPTIONS;else process.env.NODE_OPTIONS=previous;}
}));
test('declaration metadata never runs module initialization proofs',()=>fixture(write=>{
 for(const ext of ['ts','cts','mts'])for(const kind of ['type ','']){
  write(`shape.d.${ext}`,'declare function unused():void; export = unused; export interface Row {n:number}');
  const text=`import ${kind}{Row} from './shape.d.${ext}';export function rows(x:Row[]){return x.map(v=>v.n+1);}`,file=write('entry.ts',text);
  assert.deepEqual(evaluate(close(text,file).native)([{n:2}]),[3]);
 }
}));
test('a type-only visit cannot hide runtime effects when the module is subsequently requested as a value',()=>fixture(write=>{
 write('helper.ts','console.log("effect");export interface Row {n:number} export function value(n:number){return n*2;}');
 const types="import type {Row} from './helper';export function rows(x:Row[]){return x.map(v=>v.n);}";
 assert.deepEqual(evaluate(close(types,write('entry.ts',types)).native)([{n:2}]),[2]);
 const mixed="import type {Row} from './helper';import {value} from './helper';export function rows(x:Row[]){return x.map(v=>value(v.n));}";
 assert.throws(()=>close(mixed,write('entry.ts',mixed)),/module initialization/);
 write('helper.d.ts','export declare function value(n:number):number;');write('helper.ts','console.log("effect");export interface Row {n:number} export function value(n:number){return n*2;}');
 assert.throws(()=>close(mixed,write('entry.ts',mixed)),/module initialization/);
}));
test('conditional exports prove only the selected node/import runtime implementation',()=>fixture(write=>{
 write('node_modules/probe/package.json',JSON.stringify({name:'probe',type:'module',exports:{'.':{browser:'./browser.js',svelte:'./browser.js',node:{import:'./server.ts',require:'./require.cjs'},default:'./browser.js'}}}));
 write('node_modules/probe/server.ts','export function value(n:number){return n*2;}');write('node_modules/probe/browser.js','console.log("effect");export function value(n){return n*99;}');write('node_modules/probe/require.cjs','module.exports={};');
 const text="import {value} from 'probe';export function rows(x:number[]){return x.map(v=>value(v));}",file=write('entry.ts',text),result=close(text,file);
 assert.deepEqual(evaluate(result.native)([2,3]),[4,6]);assert.ok(result.dependencies.some(d=>d.file.endsWith('server.ts')));assert.ok(!result.dependencies.some(d=>d.file.endsWith('browser.js')));
 write('node_modules/probe/server.ts','console.log("effect");export function value(n:number){return n*2;}');assert.throws(()=>close(text,file),/module initialization/);
}));
test('decorator dialect follows tsconfig; undecorated functions survive and decorated values reject',()=>fixture(write=>{
 for(const legacy of [true,false]){
  write('tsconfig.json',JSON.stringify({compilerOptions:{strict:true,experimentalDecorators:legacy}}));
  const prefix=legacy?'declare function dec(...a: any[]):any; @dec class C { @dec method(@dec x:number){} }':'declare function dec(...a: any[]):any; @dec class C { @dec method(x:number){} }';
  const text=prefix+' export function rows(x:number[]){return x.map(v=>v*2);}',file=write('entry.ts',text);
  assert.equal(promotionCandidates(text,file,()=>{},{ts,options:{experimentalDecorators:legacy}}).length,1);
  const captured='declare function dec(...a:any[]):any; @dec class Utility { static twice(n:number){return n*2;} } export function rows(x:number[]){return x.map(v=>Utility.twice(v));}';
  assert.equal(promotionCandidates(captured,write('entry.ts',captured),()=>{},{ts,options:{experimentalDecorators:legacy}}).length,0);
  const bad=prefix+' export function rows(x:number[]){return x.map(v=>new C());}';assert.throws(()=>close(bad,write('entry.ts',bad)),/decorated class|unsupported/);
 }
}));
test('inert default exports and private frozen tables admit only literal scalar reads',()=>fixture(write=>{
 const text="import {value} from './helper';export function rows(x:number[]){return x.map(v=>value(v));}",file=write('entry.ts',text);
 write('helper.ts','export default {unused:2};const table=Object.freeze({n:3});export function value(n:number){return n+table.n;}');
 assert.deepEqual(evaluate(close(text,file).native)([1,2]),[4,5]);
 for(const helper of ['export default effect();export function value(n:number){return n;}','const table=Object.freeze({n:effect()});export function value(n:number){return n+table.n;}','const table=Object.freeze({n:3});function mutate(){table.n=4;}export function value(n:number){return n+table.n;}','export const table=Object.freeze({n:3});export function value(n:number){return n+table.n;}']){write('helper.ts',helper);assert.throws(()=>close(text,file));}
}));
test('fresh helper arguments are mutable while borrowed aliases and shallow-copy children reject',()=>fixture(write=>{
 const helper='function fill(x:{n:number}){x.n+=2;return x;}';
 const text=helper+'export function rows(x:number[]){return x.map(v=>fill({n:v}));}',file=write('entry.ts',text),messages=[];
 const modules=promotionCandidates(text,file,m=>messages.push(m),{ts});assert.equal(modules.length,1,messages.join('\n'));assert.deepEqual(evaluate(modules[0].native)([1,2]),[{n:3},{n:4}]);
 for(const body of ['return x.map(v=>fill(v));','const alias=x;return alias.map(v=>fill(v));','const copy=x.map(v=>v);return copy.map(v=>fill(v));']){
  const bad=helper+`export function rows(x:{n:number}[]){${body}}`;assert.equal(promotionCandidates(bad,write('entry.ts',bad),()=>{},{ts}).length,0);
 }
}));
import {checkFunctionTypes} from '../src/functions/types.mjs';
import {buildPromotion} from '../src/functions/promotion-build.mjs';
import {loadPromotion} from '../src/functions/promotion-runtime.mjs';
test('checked numeric array reads compile and replay undefined reads through JS',async()=>{
 const dir=fs.mkdtempSync('/tmp/b1-native-');try{
  const text='export const rows=(x:number[],i:number)=>{let sum=0;for(const v of x)sum+=v;return sum+x[i];};',file=path.join(dir,'entry.ts');fs.writeFileSync(file,text);
  const modules=promotionCandidates(text,file,console.log,{ts});assert.equal(modules.length,1);assert.equal(modules[0].requiresFallback,true);
  checkFunctionTypes(ts,ts.createProgram([file],{strict:true,types:[]}),modules);
  assert.equal((await buildPromotion(modules,path.join(dir,'out'),{catchFallback:false})).length,1);
  const d=loadPromotion(path.join(dir,'out/promotion.node'),{mode:'native',log:()=>{},crashGuard:{directory:path.join(dir,'markers')}}),id=modules[0].functions[0].id;
  let calls=0;const js=(x,i)=>{calls++;let sum=0;for(const v of x)sum+=v;return sum+x[i];};
  for(const i of [0,1,2,-1,0.5,99,0]){const expected=js([2,3],i);const before=calls;assert.equal(d.dispatch(id,js,[[2,3],i]),expected);assert.equal(calls-before,i===0||i===1?0:1);}
  assert.equal(d.snapshot()[id].fallback,4);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('active unknown conditions and borrowed direct mutations remain rejected',()=>fixture(write=>{
 const text='export function rows(x:{n:number}[]){const alias=x;for(const v of alias)v.n++;return 1;}',file=write('entry.ts',text);
 assert.equal(promotionCandidates(text,file,()=>{},{ts}).length,0);
 const sorted='export function rows(x:number[]){const alias=x;alias.sort((a,b)=>a-b);return 1;}';assert.equal(promotionCandidates(sorted,write('entry.ts',sorted),()=>{},{ts}).length,0);
 write('helper.ts','export function value(n:number){return n;}');
 const imported="import {value} from './helper';export function rows(x:number[]){return x.map(v=>value(v));}";
 assert.throws(()=>dependencyClosure(imported,write('entry.ts',imported),'rows',{ts,options:{customConditions:['unknown-loader']}}),/unsupported active package export condition/);
 const caught='export function rows(x:number[],i:number){try{for(const v of x){}return x[i];}catch(e){return 7;}}';const modules=promotionCandidates(caught,write('entry.ts',caught),()=>{},{ts});
 if(modules.length){assert.equal(constructionProof(modules[0].native,ts).eligible,false);assert.doesNotMatch(modules[0].native,/__scriptc_checked_index/);}
}));
test('fresh builtin array containers retain borrowed-child provenance',()=>fixture(write=>{
 for(const init of ['x.slice()','Array.from(x)','Array.of(3,1,2)']){
  const text=`export function rows(x:number[]){const copy=${init};copy.sort((a,b)=>a-b);return copy;}`,file=write('entry.ts',text),messages=[];
  const modules=promotionCandidates(text,file,m=>messages.push(m),{ts});assert.equal(modules.length,1,messages.join('\n'));assert.deepEqual(evaluate(modules[0].native)([3,1,2]),[1,2,3]);
 }
 const bad='export function rows(x:{n:number}[]){const copy=x.slice();for(const v of copy)v.n++;return 1;}';assert.equal(promotionCandidates(bad,write('entry.ts',bad),()=>{},{ts}).length,0);
}));
test('native mutation of fresh helper values and copied arrays preserves inputs',async()=>{
 const dir=fs.mkdtempSync('/tmp/b1-fresh-native-');try{
  const text='function make(n:number){return {n:n};} function mutate(x:{n:number}){x.n+=2;return x;} export function rows(a:number[]){return a.map(v=>mutate(make(v)).n);} export const sorted=(a:number[])=>{const copy=a.slice();copy.sort((a,b)=>a-b);return copy;};',file=path.join(dir,'entry.ts');fs.writeFileSync(file,text);
  const modules=promotionCandidates(text,file,()=>{},{ts}).filter(m=>['rows','sorted'].includes(m.functions[0].name));assert.equal(modules.length,2);
  checkFunctionTypes(ts,ts.createProgram([file],{strict:true,types:[]}),modules);
  assert.equal((await buildPromotion(modules,path.join(dir,'out'))).length,2);
  const d=loadPromotion(path.join(dir,'out/promotion.node'),{mode:'native',log:()=>{},crashGuard:{directory:path.join(dir,'markers')}});
  for(const m of modules){const fn=m.functions[0],js=fn.name==='rows'?a=>a.map(n=>n+2):a=>a.slice().sort((a,b)=>a-b);
   for(const input of [[],[3,1,2],[-2,0,2,2]]){const saved=[...input];assert.deepEqual(d.dispatch(fn.id,js,[input]),js(input));assert.deepEqual(input,saved);}
   assert.equal(d.snapshot()[fn.id].native,3);assert.equal(d.snapshot()[fn.id].fallback,0);
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
import {lowerCheckedIndexes} from '../src/functions/checked-index.mjs';
test('fixed-bound proofs require the actual unshadowed typed-array constructor',()=>{
 const loop='let sum=0;for(let i=0;i<4;i++)sum+=a[i];return sum;';
 const direct=lowerCheckedIndexes(`export function f(){const a=new Int32Array(4);${loop}}`,ts);
 assert.equal(direct.requiresFallback,false);assert.match(direct.native,/a\[i\]!/);
 const alias=lowerCheckedIndexes(`const Allocate=Int32Array;export function f(){const a=new Allocate(4);${loop}}`,ts);
 assert.equal(alias.requiresFallback,true);assert.doesNotMatch(alias.native,/a\[i\]!/);
});
import {viteRuntimeConditionSets,nextRuntimeConditionSets} from '../src/functions/resolution-conditions.mjs';
test('known SSR conditions select the runtime branch; unresolved build contexts reject ambiguity',()=>fixture(write=>{
 write('node_modules/conditional/package.json',JSON.stringify({name:'conditional',exports:{svelte:'./ssr.ts',require:'./require.ts',default:'./node.ts'}}));
 for(const [file,n] of [['ssr',3],['require',4],['node',2]])write(`node_modules/conditional/${file}.ts`,`export function value(n:number){return n*${n};}`);
 const text="import {value} from 'conditional';export function rows(x:number[]){return x.map(v=>value(v));}",file=write('entry.ts',text);
 const resolve=sets=>dependencyClosure(text,file,'rows',{ts,runtimeConditionSets:sets});
 assert.deepEqual(evaluate(resolve(viteRuntimeConditionSets({ssr:{noExternal:true,resolve:{conditions:['svelte','node']}}})).native)([2]),[6]);
 assert.deepEqual(evaluate(resolve([{mode:'require',conditions:['node']}]).native)([2]),[8]);
 assert.throws(()=>resolve(viteRuntimeConditionSets({ssr:{resolve:{conditions:['svelte','node']}}})),/ambiguous active package export conditions/);
 assert.throws(()=>resolve(nextRuntimeConditionSets()),/ambiguous active package export conditions/);
 write('node_modules/conditional/package.json',JSON.stringify({name:'conditional',exports:{browser:'./ssr.ts',node:'./node.ts',default:'./node.ts'}}));
 assert.deepEqual(evaluate(resolve(nextRuntimeConditionSets()).native)([2]),[4]);
}));
test('unknown runtime conditions cannot veto erased type-only imports',()=>fixture(write=>{
 write('shape.d.ts','export interface Row {n:number}');const text="import type {Row} from './shape';export function rows(x:Row[]){return x.map(v=>v.n);}";
 assert.deepEqual(evaluate(dependencyClosure(text,write('entry.ts',text),'rows',{ts,unsupportedResolver:true,options:{customConditions:['unknown-loader']}}).native)([{n:2}]),[2]);
}));
test('Node default conditions include module-sync and reject unresolved addon graphs',()=>fixture(write=>{
 write('node_modules/modern/package.json',JSON.stringify({name:'modern',exports:{'module-sync':'./sync.ts',default:'./fallback.ts'}}));
 write('node_modules/modern/sync.ts','export function value(n:number){return n*3;}');write('node_modules/modern/fallback.ts','export function value(n:number){return n*2;}');
 const text="import {value} from 'modern';export function rows(x:number[]){return x.map(v=>value(v));}",file=write('entry.ts',text);
 assert.deepEqual(evaluate(close(text,file).native)([2]),[6]);
 write('node_modules/modern/package.json',JSON.stringify({name:'modern',exports:{'node-addons':'./missing.node',default:'./fallback.ts'}}));
 assert.throws(()=>close(text,file),/unresolved runtime import/);
}));
test('bundled legacy module/main ambiguity remains rejected',()=>fixture(write=>{
 write('node_modules/legacy/package.json',JSON.stringify({name:'legacy',module:'./esm.ts',main:'./main.ts'}));
 write('node_modules/legacy/esm.ts','export function value(n:number){return n*3;}');write('node_modules/legacy/main.ts','export function value(n:number){return n*2;}');
 const text="import {value} from 'legacy';export function rows(x:number[]){return x.map(v=>value(v));}",file=write('entry.ts',text);
 assert.throws(()=>dependencyClosure(text,file,'rows',{ts,runtimeConditionSets:viteRuntimeConditionSets({ssr:{noExternal:true}})}),/ambiguous bundled package main\/module/);
}));
test('a missing first active export cannot silently fall through to default',()=>fixture(write=>{
 write('node_modules/absent/package.json',JSON.stringify({name:'absent',exports:{import:'./missing.js',default:'./fallback.ts'}}));
 write('node_modules/absent/fallback.ts','export function value(n:number){return n*2;}');
 const text="import {value} from 'absent';export function rows(x:number[]){return x.map(v=>value(v));}",file=write('entry.ts',text);
 assert.throws(()=>close(text,file),/selected export target differs from resolver fallback/);
}));
test('source-only modules apply the same inert-default rule',()=>fixture(write=>{
 for(const expression of ['-1','{n:-1, method(){return 2;}}','/safe/']){const text=`export default ${expression};export function rows(x:number[]){return x.map(v=>v*2);}`;assert.equal(promotionCandidates(text,write('entry.ts',text),()=>{},{ts}).length,1);}
 const text='function effect(){return 1;} export default effect();export function rows(x:number[]){return x.map(v=>v*2);}';assert.equal(promotionCandidates(text,write('entry.ts',text),()=>{},{ts}).length,0);
}));
test('runtime selection skips a types source entry and checks package imports mappings',()=>fixture(write=>{
 write('node_modules/typed/package.json',JSON.stringify({name:'typed',exports:{types:'./types.ts',default:'./actual.js'}}));
 write('node_modules/typed/types.ts','export function value(){return 99;}');write('node_modules/typed/actual.js','export function value(){return 3;}');
 const text="import {value} from 'typed';export function rows(x:number[]){return x.map(v=>v*value());}",file=write('entry.ts',text);
 assert.deepEqual(evaluate(close(text,file).native)([2]),[6]);
 write('package.json',JSON.stringify({imports:{'#value':{node:'./absent.ts',default:'./fallback.ts'}}}));write('fallback.ts','export function value(){return 99;}');
 const missing="import {value} from '#value';export function rows(x:number[]){return x.map(v=>v*value());}";assert.throws(()=>close(missing,write('entry.ts',missing)),/selected export target differs from resolver fallback/);
}));
test('source-only captures use M1 initialization proofs and M2 table folding',()=>fixture(write=>{
 const good='const table=Object.freeze({n:2});export function rows(x:number[]){return x.map(v=>v+table.n);}';
 const modules=promotionCandidates(good,write('entry.ts',good),()=>{},{ts});assert.equal(modules.length,1);assert.doesNotMatch(modules[0].native,/freeze|table/);assert.deepEqual(evaluate(modules[0].native)([2]),[4]);
 for(const setup of ['export const table={n:2} as const;','export const table={n:2};','const table=Object.freeze({n:2});export {table};']){const text=setup+'export function rows(x:number[]){return x.map(v=>v+table.n);}';assert.equal(promotionCandidates(text,write('entry.ts',text),()=>{},{ts}).length,0);}
 const bare="import './setup';export function rows(x:number[]){return x.map(v=>v*2);}";assert.equal(promotionCandidates(bare,write('entry.ts',bare),()=>{},{ts}).length,0);
}));
test('captured scalar constants and native clz32 preserve fresh-mutation semantics',async()=>{
 const dir=fs.mkdtempSync('/tmp/b1-scalar-native-');try{
  const text='const offset=2;export function rows(input:number[]){const copy=input.map(n=>({v:Math.clz32(n)}));for(const row of copy)row.v+=offset;return copy.map(row=>row.v);}',file=path.join(dir,'entry.ts');fs.writeFileSync(file,text);
  const modules=promotionCandidates(text,file,console.log,{ts});assert.equal(modules.length,1);checkFunctionTypes(ts,ts.createProgram([file],{strict:true,target:ts.ScriptTarget.ESNext,types:[]}),modules);
  assert.equal((await buildPromotion(modules,path.join(dir,'out'))).length,1);
  const d=loadPromotion(path.join(dir,'out/promotion.node'),{mode:'native',log:()=>{},crashGuard:{directory:path.join(dir,'markers')}}),fn=modules[0].functions[0];
  const input=[0,-0,1,-1,2,2**31,2**32-1,2**32,2**53-1,Number.MAX_VALUE,Number.MIN_VALUE,1.5,-1.5],js=a=>a.map(n=>Math.clz32(n)+2);
  assert.deepEqual(d.dispatch(fn.id,js,[input]),js(input));assert.equal(d.snapshot()[fn.id].native,1);assert.equal(d.snapshot()[fn.id].fallback,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('private literal tables and arrow closures share the proven module path',()=>fixture(write=>{
 const text='const table={n:3};export const rows=(x:number[])=>x.map(v=>v+table.n);';const modules=promotionCandidates(text,write('entry.ts',text),()=>{},{ts});assert.equal(modules.length,1);assert.match(modules[0].native,/function rows/);assert.deepEqual(evaluate(modules[0].native)([2]),[5]);
 const reflection='export const rows=(x:number[])=>{let n=0;for(const v of x)n+=v;return typeof rows.prototype;}';const candidates=promotionCandidates(reflection,write('entry.ts',reflection),()=>{},{ts});if(candidates.length)assert.match(candidates[0].native,/const rows/);
}));
test('fresh typed-array writes preserve invalid-index JS semantics without replay',async()=>{
 const dir=fs.mkdtempSync('/tmp/b1-typed-writes-');try{
  const text='export function rows(index:number):number{const data=new Float64Array(2);data[index]=9;let sum=0;for(const value of data)sum+=value;return sum;}',file=path.join(dir,'entry.ts');fs.writeFileSync(file,text);
  const modules=promotionCandidates(text,file,console.log,{ts});assert.equal(modules.length,1);checkFunctionTypes(ts,ts.createProgram([file],{strict:true,target:ts.ScriptTarget.ESNext,types:[]}),modules);
  assert.equal((await buildPromotion(modules,path.join(dir,'out'),{catchFallback:false})).length,1);
  const d=loadPromotion(path.join(dir,'out/promotion.node'),{mode:'native',log:()=>{},crashGuard:{directory:path.join(dir,'markers')}}),id=modules[0].functions[0].id,js=evaluate(text.replace('export function','function'));
  const indices=[-(2**32),-1,-0,0,0.5,1,2,99,2**32+1,Number.MAX_SAFE_INTEGER];
  for(const index of indices)assert.equal(d.dispatch(id,js,[index]),js(index));
  assert.equal(d.snapshot()[id].native,indices.length);assert.equal(d.snapshot()[id].fallback,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
