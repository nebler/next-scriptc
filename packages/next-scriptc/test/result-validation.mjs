import test from 'node:test';
import assert from 'node:assert/strict';
import {stripTypeScriptTypes,createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {resultValidator} from '../src/functions/result-validator.mjs';
import {serialize,resultContainer} from '../src/functions/json.ts';
import {checkFunctionTypes} from '../src/functions/types.mjs';
import {signature} from '../src/functions/promotion-signature.mjs';
import {canonicalResult,encodeArguments,decodeResult} from '../src/functions/promotion-encodings.mjs';
const n={kind:'number'},s={kind:'string'};
const shape={kind:'object',fields:[['rows',{kind:'array',value:{kind:'object',fields:[['n',n],['s',s]]}}]]};
const validate=new Function('resultContainer',stripTypeScriptTypes(resultValidator(shape))+';return validateResult;')(resultContainer);
const encode=v=>validate(v)?JSON.stringify(v):serialize(v,true,()=>JSON.stringify(v),null,true);
test('generated visits preserve bytes, order, Unicode and large arrays',()=>{
 for(const v of [{rows:[]},{rows:Array.from({length:20000},(_,i)=>({n:i,s:'世界\ud800'}))},{extra:true,rows:[{n:1,s:'x',extra:'allowed'}]},JSON.parse('{"__proto__":{"polluted":true},"rows":[]}')])assert.equal(encode(v),serialize(v,true));
 assert.equal({}.polluted,undefined);
 const weird={kind:'object',fields:[['__proto__',n],['constructor',s]]};
 const f=new Function('resultContainer',stripTypeScriptTypes(resultValidator(weird))+';return validateResult;')(resultContainer);
 assert.equal(f(JSON.parse('{"__proto__":1,"constructor":"x"}')),true);
});
test('generated validation rejects malformed containers before invoking getters',()=>{
 let calls=0;
 const getter={get n(){calls++;return 1;},s:'x'};
 const cycle={rows:[]};cycle.rows.push(cycle);
 const base=()=>({rows:[{n:1,s:'x'}]});
 const values=[{rows:[getter]},cycle,{rows:[,]}, {rows:[{n:NaN,s:'x'}]}, {rows:new Uint8Array([1])}];
 for(const mutate of [v=>Object.defineProperty(v.rows[0],'hidden',{value:1}),v=>Object.defineProperty(v.rows,Symbol(),{value:1}),v=>Object.setPrototypeOf(v.rows[0],null),v=>Object.assign(v,{toJSON(){calls++;return 1;}}),v=>Object.setPrototypeOf(v.rows,null)]){const v=base();mutate(v);values.push(v);}
 for(const v of values)assert.throws(()=>encode(v));
 assert.equal(calls,0);
 let deep={};for(let i=0;i<20000;i++)deep={next:deep};
 assert.throws(()=>encode({rows:[],extra:deep}));
});
test('signed zero and byte results keep caller behavior',()=>{
 const schema={params:['number'],result:'number'};
 assert.ok(Object.is(decodeResult(schema,encodeArguments(schema,[-0])[0]),-0));
 assert.notEqual(canonicalResult(-0,schema),canonicalResult(0,schema));
 assert.equal(canonicalResult({x:-0},{result:'json'}),canonicalResult({x:0},{result:'json'}));
 assert.equal(encodeArguments({params:['json']},[{x:-0}])[0],'{"x":0}');
 const bytes=new Uint8Array([0,255]);
 const output=decodeResult({result:'bytes'},bytes);
 assert.deepEqual(output,bytes);assert.equal(Object.getPrototypeOf(output),Uint8Array.prototype);
 assert.deepEqual(Reflect.ownKeys(output),['0','1']);
});
test('application checker emits bounded shapes and retains generic fallback',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'result-types-'));
 try{
  const file=path.join(dir,'types.ts');await writeFile(file,'type Tree={children:Tree[]}; function f(){return {rows:[{n:1,s:"x"}],nullable:null as number|null};} function recursive(x:Tree){return x;} function dict(x:Record<string,number>){return x;}');
  const ts=createRequire(new URL('../../../examples/demo/package.json',import.meta.url))('typescript');
  const program=ts.createProgram([file],{strict:true,target:ts.ScriptTarget.ESNext});
  for(const name of ['f','recursive','dict']){
   const node=program.getSourceFile(file).statements.find(n=>n.name?.text===name);
   const fn={name,promotion:true,start:node.body.getStart(program.getSourceFile(file))};
   checkFunctionTypes(ts,program,[{source:file,functions:[fn]}]);
   if(name==='f'){assert.equal(fn.resultShape.kind,'object');assert.match(signature(fn,0,false,true).source,/validateResult0/);}
   else {assert.equal(fn.resultShape,null);assert.doesNotMatch(signature(fn,0).source,/function validateResult/);}
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('native generated validator round trips typed rows and survives signed zero',async()=>{
 const {buildPromotion}=await import('../src/functions/promotion-build.mjs');
 const dir=await mkdtemp(path.join(os.tmpdir(),'result-native-'));
 try{
  const fn={name:'rows',id:'rows',resultShape:shape,boundary:{params:['number','string'],result:'json'}};
  await buildPromotion([{forced:true,native:'export function rows(n:number,s:string){const rows:{n:number,s:string}[]=[];for(let i=0;i<10000;i++)rows.push({n,s});return {rows};}',functions:[fn]}],dir,{specializeResults:true});
  const addon=createRequire(import.meta.url)(path.join(dir,'promotion.node'));
  for(const async of [false,true]){
   const text=await addon[async?'runAsync':'run'](0,[42,'世界\0']);
   assert.equal(text,JSON.stringify({rows:Array.from({length:10000},()=>({n:42,s:'世界\0'}))}));
  }
  // A -0 inside a JSON result must not poison the instance.
  assert.equal(addon.run(0,[-0,'x']),JSON.stringify({rows:Array.from({length:10000},()=>({n:0,s:'x'}))}));
  assert.equal(JSON.parse(addon.run(0,[1,'y'])).rows.length,10000);
 }finally{await rm(dir,{recursive:true,force:true});}
});
