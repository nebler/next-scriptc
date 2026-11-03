import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire,stripTypeScriptTypes} from 'node:module';
import {promotionCandidates} from '../src/functions/promotion-discovery.mjs';
import {literalArithmetic} from '../src/functions/module-initialization.mjs';
import {babelModules} from '../src/babel.mjs';
const ts=createRequire(import.meta.url)('typescript');
function discover(text){const dir=fs.mkdtempSync('/tmp/b1c-test-');try{const file=dir+'/entry.ts';fs.writeFileSync(file,text);return promotionCandidates(text,file,()=>{},{ts}).find(m=>m.functions[0].name==='rows');}finally{fs.rmSync(dir,{recursive:true,force:true});}}
const run=text=>new Function(stripTypeScriptTypes(text.replace(/export\s*\{[^}]*\};?/g,''))+';return rows;')();
test('fresh reverse preserves element provenance and borrowed graphs reject',()=>{
 const m=discover('export function rows(x:number[]){const a=x.map(v=>v+1);a.reverse();return a;}');assert.ok(m);assert.deepEqual(run(m.native)([1,2]),[3,2]);
 for(const body of ['const a=x;a.reverse();return a.map(v=>v.n);','const a=x.slice();a.reverse();for(const v of a)v.n++;return a.map(v=>v.n);','let a=x.map(v=>({n:v.n}));if(x.length)a=x;a.reverse();return a.map(v=>v.n);'])assert.equal(discover(`export function rows(x:{n:number}[]){${body}}`),undefined);
});
test('literal arithmetic folds only finite numeric syntax',()=>{
 for(const init of ['2*3','2**3+1','(2+3)*4']){
  const source=`const n=${init};export function rows(x:number[]){return x.map(v=>v+n);}`;const m=discover(source);assert.ok(m);assert.deepEqual(run(m.native)([1,2]),[1+Function('return '+init)(),2+Function('return '+init)()]);
 }
 const m=discover('const table={n:2*3};export function rows(x:number[]){return x.map(v=>v+table.n);}');assert.ok(m);assert.deepEqual(run(m.native)([1]),[7]);
 for(const init of ['1/0','0/0','-0','0*-1','2**1024','"2"+3','Math.max(2,3)','unknownValue+1']){const ast=babelModules.parser().parseExpression(init);assert.equal(literalArithmetic(ast),undefined,init);}
 assert.equal(discover('export const table={n:2*3};export function rows(x:number[]){return x.map(v=>v+table.n);}'),undefined);
});
test('unused hoisted default function reads are inert; calls and TDZ reads reject',()=>{
 assert.ok(discover('class Other{}export default Other;export function rows(x:number[]){return x.map(v=>v+1);}'));
 assert.equal(discover('export default Later;class Later{}export function rows(x:number[]){return x.map(v=>v+1);}'),undefined);
 assert.ok(discover('function other(){return 2;}export default other;export function rows(x:number[]){return x.map(v=>v+1);}'));
 for(const prefix of ['export default Math.random();','export default later;const later=1;','export default missing;','const table={n:2};export default table;'])assert.equal(discover(prefix+'export function rows(x:number[]){return x.map(v=>v+1);}'),undefined);
});
test('old alias mutation and externally mutable captures stay refused',()=>{
 for(const source of [
  'export function rows(x:number[]){const a=x;a.push(9);return a.map(v=>v+1);}',
  'export function rows(x:{n:number}[]){const a=x;for(const v of a)v.n++;return a.map(v=>v.n);}',
  'export const table={n:2};export function rows(x:number[]){return x.map(v=>v+table.n);}',
  'const table={n:2};function mutate(){table.n=4;}export function rows(x:number[]){return x.map(v=>v+table.n);}',
  'const table={get n(){return 2;}};export function rows(x:number[]){return x.map(v=>v+table.n);}',
  'const table=[1,2];export function rows(x:number[]){return x.map(v=>table.includes(v)?1:0);}',
  'const table={a:2,b:3};export function rows(x:("a"|"b")[]){return x.map(v=>table[v]);}',
 ])assert.equal(discover(source),undefined,source);
});
import {buildPromotion} from '../src/functions/promotion-build.mjs';
import {loadPromotion} from '../src/functions/promotion-runtime.mjs';
import {checkFunctionTypes} from '../src/functions/types.mjs';
test('restored reverse and arithmetic agree through the native ABI',async()=>{
 const dir=fs.mkdtempSync('/tmp/b1c-native-');try{
  const text='const table={n:2*3};export function rows(x:number[]){const a=x.map(v=>v+table.n);a.reverse();return a;}',file=dir+'/entry.ts';fs.writeFileSync(file,text);
  const modules=promotionCandidates(text,file,()=>{},{ts});assert.equal(modules.length,1);checkFunctionTypes(ts,ts.createProgram([file],{strict:true,types:[]}),modules);
  assert.equal((await buildPromotion(modules,dir+'/out')).length,1);
  const d=loadPromotion(dir+'/out/promotion.node',{mode:'native',log:()=>{},crashGuard:{directory:dir+'/markers'}}),id=modules[0].functions[0].id;
  const js=x=>x.map(v=>v+6).reverse();for(const x of [[],[1,2],[-1,0,1]]){const original=[...x];assert.deepEqual(d.dispatch(id,js,[x]),js(x));assert.deepEqual(x,original);}assert.equal(d.snapshot()[id].native,3);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('borrowed mutation and stale captures have observable JS counterexamples',()=>{
 const input=[{n:1}],js=x=>{const a=x;for(const v of a)v.n++;return a.map(v=>v.n);};
 const decoded=structuredClone(input);assert.deepEqual(js(decoded),[2]);assert.equal(input[0].n,1);js(input);assert.equal(input[0].n,2);
 const table={n:2},folded=2;table.n=9;assert.equal([1].map(v=>v+table.n)[0],10);assert.equal([1].map(v=>v+folded)[0],3);
});
