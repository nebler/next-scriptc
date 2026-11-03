import test from 'node:test';
import assert from 'node:assert/strict';
import {inputShapes,synthesize} from '../src/functions/promotion-inputs.mjs';
import {variants,inputCases,shrink,fuzzFunction,applyFuzzResults,fuzzOptions} from '../src/functions/promotion-fuzz.mjs';
import {encodeArguments,canonicalResult} from '../src/functions/promotion-encodings.mjs';
const number={kind:'number'},string={kind:'string'};
test('shared synthesis covers unions, tuples, optional fields and records',()=>{
 const m={native:'export function f(n:number, x:{a?:string;b:number[]}, r:Record<string,number>, t:[string,number]):number{return n;}'};
 const shapes=inputShapes(m,{name:'f'});assert.equal(shapes[0].kind,'number');assert.equal(shapes[1].fields[0][2],true);assert.equal(shapes[2].index.kind,'number');assert.equal(shapes[3].kind,'tuple');assert.equal(synthesize(m,{name:'f'})[0],32);
 const cases=variants(shapes[1]);assert.ok(cases.some(v=>!Object.hasOwn(v,'a')));assert.ok(cases.some(v=>Object.hasOwn(v,'a')&&v.a===undefined));assert.ok(cases.some(v=>v.a===null));
 assert.deepEqual(Object.keys(variants(shapes[2]).at(-2)),['2','10','01','a','á','á']);
});
test('edge corpus and seeded generation',()=>{
 const n=variants(number);for(const x of [-0,NaN,Infinity,-Infinity,2147483648,Number.MAX_SAFE_INTEGER+1])assert.ok(n.some(v=>Object.is(v,x)));
 const s=variants(string);assert.ok(s.includes('😀'));assert.ok(s.includes('\ud800'));assert.ok(s.some(v=>v.length>=65536));
 const a=[...inputCases([number,string],{seed:42,maxCases:100})];assert.deepEqual(a,[...inputCases([number,string],{seed:42,maxCases:100})]);assert.notDeepEqual(a,[...inputCases([number,string],{seed:43,maxCases:100})]);
 assert.ok(variants({kind:'array',value:{kind:'array',value:number}}).some(v=>v.length===0));
});
test('shrinks array and number failures within bounds',()=>{
 assert.deepEqual(shrink([[8,9,10]],a=>a[0].some(n=>n>0)),[[1]]);
 assert.deepEqual(shrink([4096],a=>a[0]>=1),[1]);
});
test('fake native mismatch minimizes, demotes automatic and rejects forced',()=>{
 const schema={params:['number'],result:'number'};
 const run=()=>fuzzFunction({js:x=>x,native:([x])=>x+1,schema,shapes:[number]},{seed:9,budgetMs:1000,maxCases:100});
 const r=run();assert.equal(r.status,'mismatch');assert.equal(r.input,'[ 0 ]');assert.equal(r.js,'0');assert.equal(r.native,'1');assert.deepEqual({...r,elapsedMs:0},{...run(),elapsedMs:0});
 const m={source:'fixture.ts',originalText:'\nexport function f() {}',functions:[{name:'f',start:1}]},logs=[];
 assert.deepEqual(applyFuzzResults([m],[r],m=>logs.push(m)),[]);assert.match(logs[0],/fixture.ts:2/);assert.match(logs[0],/demoted to JS/);
 assert.throws(()=>applyFuzzResults([{...m,forced:true}],[r]),/Explicit use native verification failed/);
});
test('dispatcher exclusions are counted, never sent to native',()=>{
 let calls=0;const r=fuzzFunction({js:x=>x,native:([x])=>{calls++;return x;},schema:{params:['number'],result:'number'},shapes:[number]},{budgetMs:1000,maxCases:22});
 assert.equal(r.status,'passed');assert.equal(r.rejected,3);assert.equal(calls,19);
 assert.throws(()=>fuzzOptions({budgetMs:0}),/Invalid/);
});
test('numeric JSON contract and native fallback gating',()=>{
 const scalar={params:['number'],result:'number'};
 assert.equal(canonicalResult(-0,scalar),'-0');assert.equal(canonicalResult([-0]),'[0]');assert.throws(()=>canonicalResult(NaN),/JSON/);assert.throws(()=>encodeArguments(scalar,[Infinity]),/finite/);
 assert.equal(canonicalResult({'10':1,'2':2,b:3,a:4}),'{"2":2,"10":1,"b":3,"a":4}');
 assert.equal(canonicalResult([1e-7,1e21]),'[1e-7,1e+21]');
 const r=fuzzFunction({js:x=>x,native:()=>({fallback:true}),schema:scalar,shapes:[number]},{budgetMs:1000,maxCases:5});
 assert.equal(applyFuzzResults([{functions:[{name:'f'}]}],[r],()=>{}).length,0);
});
test('shared build removes divergent native lane, rebuilds IDs, and fails explicit', {timeout:180000},async()=>{
 const {mkdtemp,readFile,rm}=await import('node:fs/promises'),{buildPromotion}=await import('../src/functions/promotion-build.mjs');
 const dir=await mkdtemp('/tmp/scriptc-fuzz-build-test-');
 const fixture=(name,bug=false)=>({source:name+'.ts',native:'export function '+name+'(n:number):number{return n'+(bug?'+1':'')+';}',referenceNative:'export function '+name+'(n:number):number{return n;}',functions:[{name,id:name,params:['n'],boundary:{params:['number'],result:'number'}}]});
 try{
  const bad=fixture('bad',true),good=fixture('good'),logs=[];
  const kept=await buildPromotion([bad,good],dir,{fuzz:{seed:2,budgetMs:1000,maxCases:30},report:m=>logs.push(m)});
  assert.deepEqual(kept,[good]);assert.deepEqual(JSON.parse(await readFile(dir+'/ids.json')),['good']);assert.ok(logs.some(s=>s.includes('demoted to JS')));
  await assert.rejects(buildPromotion([{...bad,forced:true}],dir,{fuzz:{budgetMs:1000}}),/Explicit use native verification failed/);
  await assert.rejects(readFile(dir+'/promotion.node'),{code:'ENOENT'});
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('specialized type drives generation while reference retains original closure',()=>{
 const m={native:'export function f(n:number):number{return n;}',referenceNative:'export function f<T>(n:T):T{return n;}'};
 assert.equal(inputShapes(m,{name:'f',specialization:{}})[0].kind,'number');
});
test('opaque schema provides bounded representatives for unknown handles',()=>{
 const m={native:'export function f(n:unknown):unknown{return n;}'};
 assert.equal(inputShapes(m,{name:'f',boundary:{opaque:{inputs:[{kind:'handle'}]}}})[0].kind,'handle');
});
test('Next CLI delegates fuzz with deterministic settings', {timeout:30000},async()=>{
 const {mkdtemp,writeFile,readFile,rm}=await import('node:fs/promises'),{execFile}=await import('node:child_process'),{promisify}=await import('node:util');
 const dir=await mkdtemp('/tmp/scriptc-fuzz-cli-test-');
 try{
  await writeFile(dir+'/compute.ts','export function compute(n:number):number{"use native";return n;}');
  await writeFile(dir+'/tsconfig.json','{"compilerOptions":{"strict":true}}');
  await promisify(execFile)(process.execPath,[new URL('../../next-scriptc/src/cli.mjs',import.meta.url).pathname,'fuzz',dir,'--seed','17','--max-cases','1','--budget-ms','1000','--json',dir+'/result.json'],{timeout:25000});
  const result=JSON.parse(await readFile(dir+'/result.json'));assert.equal(result.results[0].status,'passed');assert.equal(result.results[0].seed,17);assert.equal(result.results[0].cases,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
