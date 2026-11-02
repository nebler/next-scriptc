import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,symlink,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {discoverPromotions} from '../src/functions/promotion-discovery.mjs';
import {buildPromotion} from '../src/functions/promotion-build.mjs';
import {loadPromotion} from '../src/functions/promotion-runtime.mjs';
const require=createRequire(import.meta.url);
const specializedFixture=await readFile(new URL('../../../examples/demo/lib/call-site-specialization.ts',import.meta.url),'utf8');
test('private fresh JSON call sites specialize and shape mismatches fall back without poisoning',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'specialization-'));
 try{
 await mkdir(dir+'/node_modules');await symlink(path.dirname(require.resolve('typescript/package.json',{paths:[process.cwd()]})),dir+'/node_modules/typescript');
 await writeFile(dir+'/tsconfig.json',JSON.stringify({compilerOptions:{strict:true}}));
 await writeFile(dir+'/f.ts',specializedFixture);
 const logs=[],modules=await discoverPromotions(dir,dir+'/dist',{},s=>logs.push(s));
 assert.deepEqual(modules.map(m=>m.functions[0].name),['generic','broad','loose','scalarValue','scalar'],logs.join('\n'));
 assert.equal(modules[0].functions[0].specialization.calls,2);
 const ts=require(require.resolve('typescript',{paths:[dir]}));
 const js=new Function(ts.transpileModule(specializedFixture.replace('export function caller','function caller'),{compilerOptions:{target:ts.ScriptTarget.ESNext}}).outputText+';return {generic,broad,loose,scalarValue,scalar};')();
 await buildPromotion(modules.map(m=>({...m,forced:true})),dir+'/dist',{catchFallback:false});
 const d=loadPromotion(dir+'/dist/promotion.node',{mode:'native',fallbackWindow:10000,log:()=>{},crashGuard:{directory:dir+'/markers'}});
 for(const m of modules){const fn=m.functions[0];
  if(fn.name==='scalarValue'){
   for(const value of [-0,1,null,undefined,'wrong'])assert.deepEqual(d.dispatch(fn.id,js.scalarValue,[value]),value);
   assert.ok(d.snapshot()[fn.id].native>=2);assert.equal(d.snapshot()[fn.id].fallback,3);continue;
  }
  const good=[[{n:2}]];
  for(const args of [good,[[{n:'wrong'}]],[[{}]],[[{n:undefined}]],[[{n:null}]],[[new Date()]],[[Object.create({n:2})]],[[{get n(){return 3;}}]],[[{n:0}]]]){
   const before=d.snapshot()[fn.id]?.fallback??0;
   assert.deepEqual(d.dispatch(fn.id,js[fn.name],args),js[fn.name](...args));
   if(args!==good&&args[0][0].n!==0)assert.equal(d.snapshot()[fn.id].fallback,before+1);
   const native=d.snapshot()[fn.id].native;d.dispatch(fn.id,js[fn.name],good);assert.equal(d.snapshot()[fn.id].native,native+1);
  }
 }
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('specialization rejects unseen callers, escapes, disagreeing shapes and nonliteral origins',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'specialization-negative-'));
 try{
 await mkdir(dir+'/node_modules');await symlink(path.dirname(require.resolve('typescript/package.json',{paths:[process.cwd()]})),dir+'/node_modules/typescript');
 await writeFile(dir+'/tsconfig.json','{"compilerOptions":{"strict":true}}');
 const cases=[
 'function f<T>(x:T[]){return x.map(v=>({v}));} export function caller(){f([1]);return {f};}',
 'function f<T>(x:T[]){return x.map(v=>({v}));} export function caller(){eval("f([new Date()])");return f([1]);}',
 'function f<T>(x:T[]){return x.map(v=>({v}));} export function caller(){return f.call(null,[1]);}',
 'export function f<T>(x:T[]){return x.map(v=>({v}));} export function caller(){return f([1]);}',
 'function f<T>(x:T[]){return x.map(v=>({v}));} export {f as renamed}; export function caller(){return f([1]);}',
 'function f<T>(x:T[]){return x.map(v=>({v}));} export default f; export function caller(){return f([1]);}',
 'function f<T>(x:T[]){return x.map(v=>({v}));} export function caller(){const alias=f;return alias([1]);}',
 'function f<T>(x:T[]){return x.map(v=>({v}));} export function caller(){f([1]);return f(["s"]);}',
 'function f<T>(x:T[]){return x.map(v=>({v}));} export function call(x:number[]){return f(x);}',
 'function f<T>(x:T[]){return x.map(v=>({v}));} export function caller(){return f([new Date()]);}',
 'function f<T>(x:T[]){return x.map(v=>({v}));} export function caller(){return f([{get n(){return 1;}}]);}',
 'function f<T>(x:T[]){return x.map(v=>({v}));} export function caller(){return f([{__proto__:{n:1}}]);}',
 ];
 for(const text of cases){await writeFile(dir+'/f.ts',text);const logs=[];const found=await discoverPromotions(dir,dir+'/dist',{},s=>logs.push(s));assert.ok(!found.some(m=>m.functions[0].name==='f'),text+'\n'+logs.join('\n'));assert.ok(logs.length);}
 }finally{await rm(dir,{recursive:true,force:true});}
});
