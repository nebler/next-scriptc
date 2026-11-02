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
   if(fn.boundary.opaque)assert.equal(d.dispatch(fn.id,js[fn.name],args)[0].value,args[0][0]);
   if(!fn.boundary.opaque&&args!==good&&args[0][0].n!==0)assert.equal(d.snapshot()[fn.id].fallback,before+1);
   const native=d.snapshot()[fn.id].native;d.dispatch(fn.id,js[fn.name],good);assert.equal(d.snapshot()[fn.id].native,native+1);
  }
 }
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('specialization chooses visible call types and rejects only missing or disagreeing evidence',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'specialization-negative-'));
 try{
 await mkdir(dir+'/node_modules');await symlink(path.dirname(require.resolve('typescript/package.json',{paths:[process.cwd()]})),dir+'/node_modules/typescript');
 await writeFile(dir+'/tsconfig.json','{"compilerOptions":{"strict":true}}');
 const rejected=[
 'export function f<T>(x:T[]){return x.map(v=>({v}));}',
 'function f<T>(x:T[]){return x.map(v=>({v}));} export function caller(){f([1]);return f(["s"]);}',
 'function f<T>(x:T[]){return x.map(v=>({v}));} export function caller(){return f(...[[1]] as [number[]]);}',
 'function f<T>(x:T[]){return x.map(v=>({v}));} export function caller(){return f([new Date()]);}',
 ];
 const accepted=[
 'export function f<T>(x:T[]){return x.map(v=>({v}));} export function caller(){return f([1]);}',
 'function f<T>(x:T[]){return x.map(v=>({v}));} export function call(x:number[]){return f(x);}',
 'function f<T>(x:T[]){return x.map(v=>({v}));} export {f as renamed}; export function caller(){return f([{n:1}]);}',
 ];
 for(const [text,want] of [...rejected.map(t=>[t,false]),...accepted.map(t=>[t,true])]){await writeFile(dir+'/f.ts',text);const logs=[];const found=await discoverPromotions(dir,dir+'/dist',{},s=>logs.push(s));assert.equal(found.some(m=>m.functions[0].name==='f'),want,text+'\n'+logs.join('\n'));}
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('an exported specialization falls back for unseen callers with other shapes',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'specialization-unseen-'));
 try{
 await mkdir(dir+'/node_modules');await symlink(path.dirname(require.resolve('typescript/package.json',{paths:[process.cwd()]})),dir+'/node_modules/typescript');
 await writeFile(dir+'/tsconfig.json','{"compilerOptions":{"strict":true}}');
 const text='export function f<T>(x:T[]){return x.map(v=>({v}));} export function caller(xs:{n:number}[]){return f(xs);}';
 await writeFile(dir+'/f.ts',text);
 const logs=[],modules=(await discoverPromotions(dir,dir+'/dist',{},s=>logs.push(s))).filter(m=>m.functions[0].name==='f');
 assert.equal(modules.length,1,logs.join('\n'));
 const ts=require(require.resolve('typescript',{paths:[dir]}));
 const js=new Function(ts.transpileModule(text.replaceAll('export ',''),{compilerOptions:{target:ts.ScriptTarget.ESNext}}).outputText+';return {f};')();
 await buildPromotion(modules.map(m=>({...m,forced:true})),dir+'/dist',{catchFallback:false});
 const d=loadPromotion(dir+'/dist/promotion.node',{mode:'native',fallbackWindow:10000,log:()=>{},crashGuard:{directory:dir+'/markers'}});
 const id=modules[0].functions[0].id,good=[[{n:2}]];
 const unseen=[[['s']],[[1,2]],[[{n:'x'}]],[[{n:1,extra:'kept'}]],[[{n:1,d:new Date()}]],[[{n:1,toJSON(){return {n:9};}}]],[[new (class{constructor(){this.n=1;}})()]],[[new Map()]],[[{n:-0}]],[[]]];
 for(const args of unseen){
  // JSON boundaries canonicalize -0 to 0 (the existing convention), so compare canonical JSON.
  assert.equal(JSON.stringify(d.dispatch(id,js.f,args)),JSON.stringify(js.f(...args)),String(args));
  const native=d.snapshot()[id].native;d.dispatch(id,js.f,good);assert.equal(d.snapshot()[id].native,native+1);
 }
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('imported call sites in other modules choose the specialization',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'specialization-imported-'));
 try{
 await mkdir(dir+'/node_modules');await symlink(path.dirname(require.resolve('typescript/package.json',{paths:[process.cwd()]})),dir+'/node_modules/typescript');
 await writeFile(dir+'/tsconfig.json','{"compilerOptions":{"strict":true,"module":"esnext","moduleResolution":"bundler"}}');
 await writeFile(dir+'/f.ts','export function f<T>(x:T[]){return x.map(v=>({v}));}');
 await writeFile(dir+'/caller.ts','import {f as g} from "./f"; export function caller(xs:{n:number}[]){return g(xs);}');
 const logs=[],found=await discoverPromotions(dir,dir+'/dist',{},s=>logs.push(s));
 const m=found.find(m=>m.functions[0].name==='f');
 assert.ok(m,logs.join('\n'));assert.deepEqual(m.functions[0].specialization.params,['{ n: number; }[]']);
 }finally{await rm(dir,{recursive:true,force:true});}
});
