import test from 'node:test';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes} from 'node:module';
import {signature} from '../src/functions/promotion-signature.mjs';
import {inputCases} from '../src/functions/promotion-fuzz.mjs';
const shape={kind:'array',value:{kind:'object',fields:[['n',{kind:'number'}]]}};
const fn={name:'f',boundary:{params:['json','json'],result:'number'},constructionProof:{eligible:true,guards:{f:[{index:0,shape},{index:1,shape}]}}};
test('guarded entry parses once per input and retains checked parameter conversion',()=>{
 const s=signature(fn,0,false,true,false).source;
 assert.equal((s.match(/JSON.parse\(p0\)/g)??[]).length,1);
 assert.equal((s.match(/JSON.parse\(p1\)/g)??[]).length,1);
 assert.match(s,/constructionInput0_0\(parsed0\)/);
 assert.match(s,/const a0=parsed0 as Parameters<typeof f0>\[0\]/);
 assert.ok(s.indexOf('constructionInput0_0(parsed0)')<s.indexOf('JSON.parse(p1)'));
 const normal=signature(fn,0).source;
 assert.match(normal,/JSON.parse\(p0\) as Parameters<typeof f0>\[0\]/);
 assert.doesNotMatch(normal,/constructionInput/);
});
test('guard checks raw parsed value, with unchanged rejection and short circuit semantics',()=>{
 const source=signature(fn,0,false,true,false).source.replace('export function run0','function run0');
 const run=new Function('f0','serialize',stripTypeScriptTypes(source)+';return run0;')((a,b)=>a.reduce((s,r)=>s+r.n,0)+b.reduce((s,r)=>s+r.n,0),()=>{});
 for(const [arg] of inputCases([shape],{seed:20935,maxCases:128})){
  const text=JSON.stringify(arg);const parsed=JSON.parse(text);
  const valid=parsed.every(r=>typeof r.n==='number'&&Number.isFinite(r.n));
  assert.ok(Object.is(run(text,'[]'),valid?parsed.reduce((s,r)=>s+r.n,0):NaN));
 }
 for(const text of ['null','{}','[null]','[{"n":"1"}]','[{}]','[{"n":1e400}]'])assert.ok(Number.isNaN(run(text,'not json')));
 assert.throws(()=>run('not json','[]'),SyntaxError);
 assert.equal(run('[{"n":1,"extra":2,"n":3}]','[]'),3);
});
import {constructionDecode} from '../src/functions/promotion-decode.mjs';
test('string parse sites reuse preflight with the same checked cast and original string',()=>{
 const f={...fn,boundary:{params:['string'],result:'number'},constructionProof:{...fn.constructionProof,guards:{f:[{index:0,shape}]}}};
 const text='export function f(text:string){const rows=JSON.parse(text) as {n:number}[];let sum=0;for(const r of rows)sum+=r.n;return sum+text.length;}';
 const lowered=constructionDecode(text,f,true);assert.doesNotMatch(lowered,/JSON.parse/);assert.match(lowered,/_scriptcDecoded/);
 const source=signature(f,0,false,true,false).source;assert.match(source,/f0\(a0,parsed0\)/);
 const f0=new Function(stripTypeScriptTypes(lowered.replace('export function','function'))+';return f;')();
 const run=new Function('f0','serialize',stripTypeScriptTypes(source.replace('export function','function'))+';return run0;')(f0,()=>{});
 for(const [arg] of inputCases([shape],{seed:20935,maxCases:128})){
  const text=JSON.stringify(arg),r=JSON.parse(text);if(r.every(x=>typeof x.n==='number'&&Number.isFinite(x.n)))assert.equal(run(text),r.reduce((s,x)=>s+x.n,0)+text.length);else assert.ok(Number.isNaN(run(text)));
 }
 assert.equal(constructionDecode(text,f,false),text);assert.deepEqual(f.decodedInputs,[]);
});
import {buildPromotion} from '../src/functions/promotion-build.mjs';
import {fuzzFunction} from '../src/functions/promotion-fuzz.mjs';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
test('stock native guarded string decode agrees with JS on T1 edges', {timeout:180000},async()=>{
 const dir=await mkdtemp('/tmp/scriptc-decode-test-');
 try{
  const native='export function sum(text:string):number{const rows=JSON.parse(text) as {n:number}[];let sum=0;for(const row of rows)sum+=row.n;return sum;}';
  const fn={name:'sum',id:'sum',boundary:{params:['string'],result:'number'}};
  const built=await buildPromotion([{native,functions:[fn]}],dir,{catchFallback:false});assert.equal(built.length,1);
  const entry=await readFile(dir+'/entry.ts','utf8'),module=await readFile(dir+'/module-0.ts','utf8');
  assert.equal((entry.match(/JSON.parse/g)??[]).length,1);assert.doesNotMatch(module,/JSON.parse/);
  const addon=createRequire(import.meta.url)(dir+'/promotion.node');
  const js=new Function(stripTypeScriptTypes(native.replace('export function','function'))+';return sum;')();
  const r=fuzzFunction({js,native:a=>addon.run(0,a),schema:{...fn.boundary,parseInputs:[0]},shapes:[{kind:'string'}]},{seed:20935,budgetMs:10000,maxCases:128});assert.equal(r.status,'passed',JSON.stringify(r));
  for(const text of ['null','{}','[null]','[{}]','[{"n":"1"}]','[{"n":1e400}]'])assert.equal(addon.run(0,[text]).fallback,true);
  assert.equal(addon.run(0,['[{"n":1,"extra":true,"n":3}]']),3);
  for(const [rows] of inputCases([shape],{seed:20935,maxCases:128})){
   const text=JSON.stringify(rows),parsed=JSON.parse(text);if(parsed.every(x=>typeof x.n==='number'&&Number.isFinite(x.n)))assert.equal(addon.run(0,[text]),js(text));else assert.equal(addon.run(0,[text]).fallback,true);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('repeated and conditional parse sites keep their allocation semantics',()=>{
 for(const text of ['export function f(text:string){const a=JSON.parse(text) as number[];const b=JSON.parse(text) as number[];return a===b;}', 'export function f(text:string){if(text.length>0){const a=JSON.parse(text) as number[];return a.length;}return 0;}']){
  const f={...fn,boundary:{params:['string'],result:'number'},constructionProof:{...fn.constructionProof,guards:{f:[{index:0,shape}]}}};
  assert.match(constructionDecode(text,f,true),/JSON.parse/);assert.deepEqual(f.decodedInputs,[]);
 }
});
