import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {checkFunctionTypes} from '../src/functions/types.mjs';
import {signature} from '../src/functions/promotion-signature.mjs';
import {canonicalResult,encodeArguments,decodeResult} from '../src/functions/promotion-encodings.mjs';
const shape={kind:'object',fields:[['rows',{kind:'array',value:{kind:'object',fields:[['n',{kind:'number'}],['s',{kind:'string'}]]}}]]};
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
   if(name==='f'){assert.equal(fn.resultShape.kind,'object');assert.doesNotMatch(signature(fn,0).source,/validateResult0/);}
   else {assert.equal(fn.resultShape,null);assert.doesNotMatch(signature(fn,0).source,/function validateResult/);}
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('native strict validator round trips typed rows and survives signed zero',async()=>{
 const {buildPromotion}=await import('../src/functions/promotion-build.mjs');
 const dir=await mkdtemp(path.join(os.tmpdir(),'result-native-'));
 try{
  const fn={name:'rows',id:'rows',resultShape:shape,boundary:{params:['number','string'],result:'json'}};
  await buildPromotion([{forced:true,native:'export function rows(n:number,s:string){const rows:{n:number,s:string}[]=[];for(let i=0;i<10000;i++)rows.push({n,s});return {rows};}',functions:[fn]}],dir,{});
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
