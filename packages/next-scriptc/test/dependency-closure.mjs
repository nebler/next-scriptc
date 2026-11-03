import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {dependencyClosure,assertDependencyHashes} from '../src/functions/dependency-closure.mjs';
import {promotionCandidates} from '../src/functions/promotion-discovery.mjs';
function fixture(run){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dependency-closure-'));try{return run(dir,(name,text)=>{const f=path.join(dir,name);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,text);return f;});}finally{fs.rmSync(dir,{recursive:true,force:true});}}
test('runtime app imports flatten with collision-free helpers and hashes',()=>fixture((dir,write)=>{
 write('helper.ts','export const scale=2;export function twice(n:number){return n*scale;}');
 const text='import {twice as helper} from "./helper";export function rows(x:number[]){return x.map(v=>helper(v));}',file=write('entry.ts',text);
 const result=dependencyClosure(text,file,'rows');assert.doesNotMatch(result.native,/import /);assert.equal(result.dependencies.length,2);assert.match(result.dependencies[0].hash,/^[a-f0-9]{64}$/);assert.equal(promotionCandidates(text,file).length,1);
}));
test('package exports and main resolve runtime JavaScript instead of declarations',()=>fixture((dir,write)=>{
 write('node_modules/tiny/package.json',JSON.stringify({name:'tiny',version:'1.2.3',type:'module',main:'index.js',exports:{types:'./index.d.ts',import:'./index.js',require:'./wrong.cjs'},types:'index.d.ts'}));
 write('node_modules/tiny/index.d.ts','export declare function twice(n:number):number;');
 write('node_modules/tiny/index.js','export function twice(){return 2;}');
 write('node_modules/tiny/wrong.cjs','throw new Error("wrong condition");');
 const text='import {twice} from "tiny";export function rows(x:number[]){return x.map(v=>twice()*v);}',file=write('entry.ts',text);
 const result=dependencyClosure(text,file,'rows');assert.equal(promotionCandidates(text,file).length,1);assert.equal(result.dependencies[0].package.version,'1.2.3');assert.doesNotMatch(result.native,/require|exports\./);
 assert.throws(()=>dependencyClosure(text,file,'rows',{unsupportedResolver:true}),/custom application resolver/);
 write('node_modules/tiny/package.json',JSON.stringify({name:'tiny',version:'1.2.3',type:'module',exports:{node:'./index.js',default:'./index.js'}}));
 assert.match(dependencyClosure(text,file,'rows').native,/twice/);
 write('node_modules/tiny/index.js','console.log("effect");export function twice(){return 2;}');
 assert.throws(()=>dependencyClosure(text,file,'rows'),/module initialization/);
 fs.rmSync(path.join(dir,'node_modules/tiny/index.js'));
 assert.throws(()=>dependencyClosure(text,file,'rows'),/unresolved runtime import/);
}));
test('reachable initialization, state, dynamic access and cycles fail closed',()=>fixture((dir,write)=>{
 const entry='import {twice} from "./helper";export function rows(x:number[]){return x.map(v=>twice(v));}',file=write('entry.ts',entry);
 for(const code of ['const {fn}=require("dynamic");export function twice(n:number){return fn(n);}', 'let cache=0;export function twice(n:number){return ++cache+n;}', 'export function twice(n:number){return Function("return 2")()*n;}', 'export function twice(n:number){return ({get x(){return n}}).x;}', 'import "./entry";export function twice(n:number){return n*2;}']){write('helper.ts',code);assert.throws(()=>dependencyClosure(entry,file,'rows'),/dependency closure/);}
}));
import {createRequire,stripTypeScriptTypes} from 'node:module';
import {buildPromotion} from '../src/functions/promotion-build.mjs';
import {loadPromotion} from '../src/functions/promotion-runtime.mjs';
import {checkFunctionTypes} from '../src/functions/types.mjs';
const ts=createRequire(new URL('../../../examples/demo/package.json',import.meta.url))('typescript');
test('flattened app closure compiles and forced-native bytes match original JS',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'closure-native-'));
 try{
  const helper='export function label(s:string){return `field:${s}`;}',file=path.join(dir,'entry.ts');
  fs.writeFileSync(path.join(dir,'helper.ts'),helper);
  const text='import {label} from "./helper";export function rows(x:{s:string}[]){return x.map(v=>({s:label(v.s)}));}';fs.writeFileSync(file,text);
  const modules=promotionCandidates(text,file);assert.equal(modules.length,1);
  checkFunctionTypes(ts,ts.createProgram([file],{strict:true,types:[]}),modules);
  const out=path.join(dir,'out');assert.equal((await buildPromotion(modules,out)).length,1);
  const d=loadPromotion(path.join(out,'promotion.node'),{mode:'native',log:()=>{},crashGuard:{directory:path.join(dir,'markers')}});
  const js=new Function(stripTypeScriptTypes(helper.replace('export ',''))+';return x=>x.map(v=>({s:label(v.s)}));')();
  const fn=modules[0].functions[0];
  for(const s of ['','comma,','quote"','line\nfeed','=formula','世界😀']){const input=[{s}];assert.equal(JSON.stringify(d.dispatch(fn.id,js,[input])),JSON.stringify(js(input)));}
  assert.equal(d.snapshot()[fn.id].native,6);
  const report=JSON.parse(fs.readFileSync(path.join(out,'dependency-report.json')));assert.equal(report[0].dependencies.length,2);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('TS paths follow the application options; unused imports are audited',()=>fixture((dir,write)=>{
 write('helpers/value.ts','export function value(n:number){return n*2;}');
 const text='import {value} from "@helpers/value";export function rows(x:number[]){return x.map(v=>value(v));}',file=write('entry.ts',text);
 assert.equal(dependencyClosure(text,file,'rows',{ts,options:{baseUrl:dir,paths:{'@helpers/*':['helpers/*']}}}).dependencies.length,2);
 write('unused.ts','console.log("side effect");');
 const bad='import "./unused";'+text.replace('@helpers/value','./helpers/value');
 assert.throws(()=>dependencyClosure(bad,file,'rows'),/module initialization/);
 write('node_modules/cjs/package.json','{"main":"index.cjs"}');write('node_modules/cjs/index.cjs','function value(){return 2;} exports.value=value;');
 assert.throws(()=>dependencyClosure(text.replace('@helpers/value','cjs'),file,'rows'),/CommonJS/);
}));

test('dependency content and manifest changes invalidate the build',()=>fixture((dir,write)=>{
 write('package.json','{"name":"fixture","version":"1.0.0"}');
 const helper=write('helper.ts','export function value(n:number){return n*2;}');
 const text='import {value} from "./helper";export function rows(x:number[]){return x.map(v=>value(v));}',file=write('entry.ts',text);
 const closure=dependencyClosure(text,file,'rows');assertDependencyHashes(closure);
 write('package.json','{"name":"fixture","version":"2.0.0"}');assert.throws(()=>assertDependencyHashes(closure),/manifest changed/);
 write('package.json','{"name":"fixture","version":"1.0.0"}');fs.appendFileSync(helper,'\n');assert.throws(()=>assertDependencyHashes(closure),/closure changed/);
}));

import {withFunctions} from '../src/functions/config.mjs';
test('bundler configuration retains every grouped closure dependency',()=>{
 const source='/tmp/closure-group.ts',base={source,hash:'abc',promotion:true,functions:[]};
 const config=withFunctions({},[{...base,dependencies:[{file:'/tmp/one.ts'}]},{...base,dependencies:[{file:'/tmp/two.ts'}]}],0,process.cwd(),'/tmp/promotion.node');
 const options=config.turbopack.rules['*'][0].loaders[0].options;
 assert.deepEqual(options.modules[source].dependencies.map(d=>d.file),['/tmp/one.ts','/tmp/two.ts']);
});
