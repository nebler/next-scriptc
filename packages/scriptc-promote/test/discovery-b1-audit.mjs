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
 for(const prefix of ['export default Math.random();','export default later;const later=1;','export default missing;','declare class Declared{}export default Declared;','const table={n:2};export default table;'])assert.equal(discover(prefix+'export function rows(x:number[]){return x.map(v=>v+1);}'),undefined);
});
test('old alias mutation and externally mutable captures stay refused',()=>{
 for(const source of [
  'export function rows(x:number[]){const a=x;a.push(9);return a.map(v=>v+1);}',
  'export function rows(x:{n:number}[]){const a=x;for(const v of a)v.n++;return a.map(v=>v.n);}',
  'const table={n:2};function init(){table.n=9;return 0;}export default init();export function rows(x:number[]){return x.map(v=>v+table.n);}',
  'export const table={n:2};export function rows(x:number[]){return x.map(v=>v+table.n);}',
  'const table={n:2};function mutate(){table.n=4;}export function rows(x:number[]){return x.map(v=>v+table.n);}',
  'const table={n:2};function change(){table.n=9;return 0;}const setup=change();const n=table.n;export function rows(x:number[]){return x.map(v=>v+n);}',
  'const table={r:/x/g};export function advance(){table.r.test("x");}export function rows(x:string[]){return x.map(v=>table.r.test(v));}',
  'const table={get n(){return 2;}};export function rows(x:number[]){return x.map(v=>v+table.n);}',
  'const table={a:2,b:3};export function rows(x:("a"|"b")[]){return x.map(v=>table[v]);}',
 ])assert.equal(discover(source),undefined,source);
});
import {buildPromotion} from '../src/functions/promotion-build.mjs';
import {loadPromotion} from '../src/functions/promotion-runtime.mjs';
import {checkFunctionTypes} from '../src/functions/types.mjs';
test('restored reverse and arithmetic agree through the native ABI',async()=>{
 const dir=fs.mkdtempSync('/tmp/b1c-native-');try{
  const text='const base={n:2*3};const table={...base};export function rows(x:number[]){const a=x.map(v=>v+table.n);a.reverse();return a;}',file=dir+'/entry.ts';fs.writeFileSync(file,text);
  const modules=promotionCandidates(text,file,()=>{},{ts});assert.equal(modules.length,1);checkFunctionTypes(ts,ts.createProgram([file],{strict:true,types:[],target:ts.ScriptTarget.ES2022}),modules);
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
test('construction and replay limits retain B1 refusals',()=>{
 for(const text of [
  'class Fault extends Error{};export function rows(x:string[]){return x.map(v=>{try{if(v==="bad")throw new Fault("bad");return v.length;}catch{return -1;}});}',
  'const table={n:2};export function rows(x:number[]){const y=new Set(x);return x.map(v=>v+table.n+y.size);}',
  'const table={n:2};export function rows(x:number[]){return x.map(v=>v+table.n).concat(x);}',
  'const table={n:2};export function rows(x:number[]){let s:number;s=0;for(const v of x)s+=v;return s+table.n;}',
 ])assert.equal(discover(text),undefined,text);
});
test('private scalar array reads are copied only after the original reference audit',()=>{
 for(const expr of ['table.includes(v)','table.some(n=>n===v)','table.some((n,i)=>n+i===v)']){
  const m=discover(`const table=[2,4];export function rows(x:number[]){return x.map(v=>${expr});}`);assert.ok(m,expr);assert.doesNotMatch(m.native,/const.*table/);assert.deepEqual(run(m.native)([1,2,4]),[1,2,4].map(v=>expr.includes('n+i')?[2,4].some((n,i)=>n+i===v):[2,4].includes(v)));
 }
 for(const prefix of [
  'export const table=[2,4];',
  'const table=[2,4];function change(){table.push(8);}',
  'const table=[2,4];function leak(){return table;}',
  'const table=[2,4];function alias(){const a=table;return a.length;}',
 ])assert.equal(discover(prefix+'export function rows(x:number[]){return x.map(v=>table.includes(v));}'),undefined);
 for(const expr of ['table.some((v,i,a)=>{a.push(8);return true;})','table.some((...args)=>true)','table.some(function(v){return true;})','table.some(v=>true,1)','table.includes(...x)','table.some'])assert.equal(discover(`const table=[2,4];export function rows(x:number[]){return x.map(v=>${expr});}`),undefined,expr);
 assert.equal(discover('const table=[{n:2}];export function rows(x:number[]){return x.map(v=>table.some(n=>n.n===v));}'),undefined);
});
test('array callbacks preserve borrowed children and receiver provenance',()=>{
 const m=discover('export function rows(x:{n:number}[]){const out:number[]=[];x.forEach(v=>out.push(v.n));return out;}');assert.ok(m);assert.deepEqual(run(m.native)([{n:2},{n:4}]),[2,4]);
 for(const method of ['some','forEach'])for(const body of ['v.n++;return true;','let a=v;if(v.n)a={n:0};a.n++;return true;'])assert.equal(discover(`export function rows(x:{n:number}[]){const out:number[]=[];x.${method}(v=>{${body}});return x.map(v=>v.n);}`),undefined);
 for(const method of ['some','forEach'])assert.equal(discover(`export function rows(x:number[]){const out:number[]=[];x.${method}((v,i,a)=>{a.push(7);return true;});return out;}`),undefined);
});
test('restored scalar table reads and borrowed-array iteration agree through native ABI',async()=>{
 const dir=fs.mkdtempSync('/tmp/b1c-array-native-');try{
  const text='const zeros=[-0,0];const table=[2,4];export function has(x:number[]){return x.map(v=>table.includes(v));}export function matches(x:number[]){return x.map(v=>table.some(n=>n===v));}export function copies(x:{n:number}[]){const out:number[]=[];x.forEach(v=>out.push(v.n));return out;}export function prefix(x:number[]){const out:number[]=[];x.some(v=>{out.push(v);return v===4;});return out;}export function negativeZero(x:number[]){return x.map(v=>zeros.some(n=>1/n<0));}',file=dir+'/entry.ts';fs.writeFileSync(file,text);
  const modules=promotionCandidates(text,file,()=>{},{ts});assert.equal(modules.length,5);checkFunctionTypes(ts,ts.createProgram([file],{strict:true,types:[],target:ts.ScriptTarget.ES2022}),modules);assert.equal((await buildPromotion(modules,dir+'/out')).length,5);
  const d=loadPromotion(dir+'/out/promotion.node',{mode:'native',log:()=>{},crashGuard:{directory:dir+'/markers'}});
  for(const m of modules){const f=m.functions[0],js=f.name==='negativeZero'?x=>x.map(v=>true):f.name==='copies'?x=>x.map(v=>v.n):f.name==='prefix'?x=>{const out=[];x.some(v=>{out.push(v);return v===4;});return out;}:x=>x.map(v=>[2,4].includes(v));for(const values of [[],[1,2,4],[4,4,-1]]){const input=f.name==='copies'?values.map(n=>({n})):values;const saved=structuredClone(input);assert.deepEqual(d.dispatch(f.id,js,[input]),js(input));assert.deepEqual(input,saved);}assert.equal(d.snapshot()[f.id].native,3);}
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('default binding reads cannot hide early calls or mutable function metadata',()=>{
 for(const text of [
  'class Marker{static value=rows([1]);}export default Marker;const bias=2;export function rows(x:number[]){return x.map(v=>v+bias);}',
  'const early=rows([1]);function Holder(){}export default Holder;const bias=2;export function rows(x:number[]){return x.map(v=>v+bias);}',
  'declare const bias=2;class Marker{}export default Marker;export function rows(x:number[]){return x.map(v=>v+bias);}',
  'import {Base} from "./other";class Marker extends Base{}export default Marker;export function rows(x:number[]){return x.map(v=>v+1);}',
  'function helper(){return 2;}export function mutate(){Object.defineProperty(helper,"name",{value:"changed"});}class Marker{}export default Marker;export function rows(x:string[]){return x.map(v=>v+helper.name);}',
 ])assert.equal(discover(text),undefined,text);
 const text='class Marker extends Error{value=rows([1]);}export default Marker;export function rows(x:number[]){return x.map(v=>v+1);}';assert.ok(discover(text));
});
test('extended proofs keep early captured reads and reflective helper changes refused',()=>{
 for(const text of [
  'const early=rows([1]);const bias=2*3;export function rows(x:number[]){return x.map(v=>v+bias);}',
  'const early=rows([1]);const table=[1,2];export function rows(x:number[]){return x.map(v=>table.some(n=>n===v));}',
  'const early=rows([1]);const bias=2;export function rows(x:number[]){const a=x.map(v=>v+bias);a.reverse();return a;}',
  'function value(n:number){return n+1;}export function mutate(){eval("value=(n)=>n+9");}export function rows(x:number[]){const out:number[]=[];x.forEach(v=>out.push(value(v)));return out;}',
 ])assert.equal(discover(text),undefined,text);
 assert.ok(discover('const early=rows([1]);const unused=2;export function rows(x:number[]){const out:number[]=[];x.forEach(v=>out.push(v+1));return out;}'));
});
test('private scalar object snapshots fold only literal, nonescaping data',()=>{
 const m=discover('const base={n:2};const table={...base,m:3};export function rows(x:number[]){return x.map(v=>v+table.n+table.m);}');assert.ok(m);assert.deepEqual(run(m.native)([1,2]),[6,7]);
 for(const base of ['export const base={n:2};','const base={get n(){return 2;}};','const base={n:{v:2}};','const base={n:2};function change(){base.n=3;}'])assert.equal(discover(base+'const table={...base,m:3};export function rows(x:number[]){return x.map(v=>v+table.n);}'),undefined);
 assert.equal(discover('const base={n:2};const early=rows([1]);const table={...base};export function rows(x:number[]){return x.map(v=>v+table.n);}'),undefined);
});
test('a destructured graph binding cannot be folded as the whole initializer',()=>{
 assert.equal(discover('const {n}:any={n:"a"};export function rows(x:string[]):string[]{return x.map(v=>n.n+v);}'),undefined);
});
