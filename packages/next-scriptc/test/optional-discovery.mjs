import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {promotionCandidates} from '../src/functions/promotion-discovery.mjs';
import {checkFunctionTypes} from '../src/functions/types.mjs';
import {buildPromotion} from '../src/functions/promotion-build.mjs';
import {loadPromotion} from '../src/functions/promotion-runtime.mjs';
import loader from '../src/functions/loader.mjs';
const ts=createRequire(new URL('../../../examples/demo/package.json',import.meta.url))('typescript');
test('stock optional boundaries and lowered bindings preserve JS values and keys',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'optional-boundaries-'));
 try{
 const file=path.join(dir,'route.ts');
 const text=`export function GET(a:number[]){return a.map(x=>x);}
 export function optional(x:{v?:string|null}){"use native";return {missing:x.v===undefined,nullable:x.v===null,keys:Object.keys(x),value:x.v??'missing'};}
 export function result(x:{v?:string|null}){"use native";return {v:x.v};}
 export function undef(x:number){"use native";return x?undefined:null;}
 export const arrow=({rows}: {rows:number[]})=>rows.map(x=>x+1);
 export function defaults([a,b=3]:number[], scale:number=2){return [a,b].map(x=>x*scale);}
 function hidden(a:number[]){return a.map(x=>x+2);}
 export async function caller(a:number[]){return hidden(a);}`;
 await writeFile(file,text);
 const modules=promotionCandidates(text,file,()=>{});
 assert.deepEqual(modules.map(m=>m.functions[0].name),['optional','result','undef','arrow','defaults','hidden']);
 const rejected=modules.filter(m=>['result','undef'].includes(m.functions[0].name));
 const program=ts.createProgram([file],{strict:true,target:ts.ScriptTarget.ESNext});for(const m of rejected)assert.throws(()=>checkFunctionTypes(ts,program,[m]),/undefined|optional/);
 for(const m of rejected)modules.splice(modules.indexOf(m),1);checkFunctionTypes(ts,program,modules);
 const original=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const exports={};new Function('exports',original)(exports);
 const wrapped=loader.call({resourcePath:file,getOptions:()=>({modules:{[file]:{...modules[0],functions:modules.flatMap(m=>m.functions)}},server:true,promotionFile:dir+'/promotion.node',promotionClient:'client'})},text);
 const calls=[];const transformed=ts.transpileModule(wrapped,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const out={};new Function('exports','require',transformed)(out,()=>({promote:(_file,id,js,args)=>{calls.push(id);return js(...args);}}));
 for(const [name,args] of [['optional',[{}]],['arrow',[{rows:[2,3]}]],['defaults',[[1]]],['defaults',[[1],null]],['caller',[[1]]]])assert.deepEqual(await out[name](...args),await exports[name](...args));
 assert.equal(out.defaults.length,exports.defaults.length);
 assert.ok(calls.includes(modules.find(m=>m.functions[0].name==='hidden').functions[0].id));
 await buildPromotion(modules.map(m=>({...m,forced:true})),dir+'/native');
 const d=loadPromotion(dir+'/native/promotion.node',{mode:'native',fallbackWindow:10000,log:()=>{},crashGuard:{directory:dir+'/markers'}});
 for(const name of ['optional']){
  const id=modules.find(m=>m.functions[0].name===name).functions[0].id;
  for(const x of [{},{v:undefined},{v:null},{v:'ok'}])assert.deepEqual(d.dispatch(id,exports[name],[x]),exports[name](x));
  assert.ok(d.snapshot()[id].native>0);assert.ok(d.snapshot()[id].fallback>0);
 }
 for(const [name,args] of [['arrow',[{rows:[1,3]}]],['defaults',[[1,2],3]],['defaults',[[1],3]]]){
  const id=modules.find(m=>m.functions[0].name===name).functions[0].id;
  assert.deepEqual(d.dispatch(id,exports[name],args),exports[name](...args));
 }
 assert.ok(Object.values(d.snapshot()).every(f=>f.buckets.every(b=>b.state!=='demoted')));
 assert.equal(JSON.stringify([undefined]),'[null]');assert.equal(JSON.stringify({v:undefined}),'{}');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('rest, effectful defaults and computed bindings fail closed',()=>{
 for(const params of ['...x:number[]','x:number=Date.now()','{[Date.now()]:x}:any','{...x}:{v:number}']){
 const logs=[];assert.deepEqual(promotionCandidates(`export function f(${params}){for(let i=0;i<1;i++){}return 1;}`,'/tmp/forms.ts',s=>logs.push(s)),[]);assert.equal(logs.length,1);
 }
});
test('route handler aliases are excluded while named sync helpers remain discoverable',()=>{
 const source=`function handler(a:number[]){return a.map(x=>x);} export {handler as GET}; const POST=handler;
 export function helper(a:number[]){return a.map(x=>x+1);}`;
 assert.deepEqual(promotionCandidates(source,'/tmp/route.ts',()=>{}).map(m=>m.functions[0].name),['helper']);
});
