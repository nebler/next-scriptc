import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,symlink,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {discoverPromotions} from '../src/functions/promotion-discovery.mjs';
import {buildPromotion} from '../src/functions/promotion-build.mjs';
import {loadPromotion} from '../src/functions/promotion-runtime.mjs';
const require=createRequire(import.meta.url);
test('non-strict callers use strict closure types and invalid inputs fall back per call',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'nonstrict-'));
 try{
 await mkdir(dir+'/node_modules');await symlink(path.dirname(require.resolve('typescript/package.json',{paths:[process.cwd()]})),dir+'/node_modules/typescript');
 await writeFile(dir+'/tsconfig.json',JSON.stringify({compilerOptions:{strictNullChecks:false}}));
 const text=`export function scalars(n:number,b:boolean,s:string){"use native";return {n:n===null?11:n===undefined?12:n,b:b===null?'null':b===undefined?'undefined':String(b),s:s===null?'null':s===undefined?'undefined':s};}
 export function rows(x:{n:number;s:string}[]){return x.map(v=>({n:v.n,s:v.s}));}
 export function nullable(x:{n:number|null}){"use native";return {n:x.n};}
 export function label(x:{s:string}){"use native";return x.s;}
 export function flag(x:{b:boolean}){for(let i=0;i<1;i++){}return x.b;}
 export function invalid(x:{n?:number}){return [x].map(v=>v.n.toFixed());}
 export function inferred(){"use native";return null;}`;
 await writeFile(dir+'/f.ts',text);const logs=[];
 const modules=await discoverPromotions(dir,dir+'/dist',{},s=>logs.push(s));
 assert.deepEqual(modules.map(m=>m.functions[0].name),['scalars','rows','nullable','label','inferred']);
 assert.ok(logs.some(s=>/strict closure: TS/.test(s)));
 assert.ok(logs.some(s=>/per-call fallback result ABI/.test(s)));
 assert.deepEqual(modules[0].functions[0].boundary.params,['number','boolean','string']);
 assert.equal(modules.at(-1).functions[0].boundary.result,'null');
 const ts=require(require.resolve('typescript',{paths:[dir]})),exports={};new Function('exports',ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exports);
 const built=await buildPromotion(modules.map(m=>({...m,forced:true})),dir+'/dist',{catchFallback:false});assert.equal(built.length,modules.length);
 const d=loadPromotion(dir+'/dist/promotion.node',{mode:'native',fallbackWindow:10000,log:()=>{},crashGuard:{directory:dir+'/markers'}});
 for(const m of modules){const fn=m.functions[0];const good=fn.name==='scalars'?[2,true,'ok']:fn.name==='rows'?[[{n:2,s:'ok'}]]:fn.name==='nullable'?[{n:null}]:fn.name==='label'?[{s:'ok'}]:[];
  const cases=[good];if(fn.name==='scalars')for(let i=0;i<3;i++)for(const value of [null,undefined,{},[],i===0?'2':i===1?1:false])cases.push(good.map((v,j)=>i===j?value:v));
  if(fn.name==='label')for(const value of [null,undefined,42,false])cases.push([{s:value}]);
  if(fn.name==='rows')for(const key of ['n','s'])for(const value of [null,undefined,false,key==='n'?'wrong':42])cases.push([[{n:2,s:'ok',[key]:value}]]);
  for(const args of cases){const before=d.snapshot()[fn.id]?.fallback??0;const actual=d.dispatch(fn.id,exports[fn.name],args);assert.deepEqual(actual,exports[fn.name](...args));if(args!==good)assert.equal(d.snapshot()[fn.id].fallback,before+1);}
  assert.ok(d.snapshot()[fn.id].native>0);
 }
 }finally{await rm(dir,{recursive:true,force:true});}
});
