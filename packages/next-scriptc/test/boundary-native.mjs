import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire,stripTypeScriptTypes} from 'node:module';
import {writeFile,readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {buildBoundary,fixture,scratch} from '../../../research/boundary-build.mjs';
import {encodeArguments,decodeResult,canonicalResult} from '../src/functions/promotion-encodings.mjs';
import {loadPromotion} from '../src/functions/promotion-runtime.mjs';

test('host addon typed ABI round trips sync/async, timing and canonical shadow parity',async()=>{
 await mkdir(scratch,{recursive:true});
 await writeFile(path.join(scratch,'reference.mjs'),stripTypeScriptTypes(fixture));
 const js=await import(path.join(scratch,'reference.mjs'));
 for(const timing of [false,true]){
  const {output,modules}=await buildBoundary(undefined,timing),addon=createRequire(import.meta.url)(path.join(output,'promotion.node'));
  const cases=[['世界😀\0"\\',-0,true,null,{x:2},[3]], [new Uint8Array([0,255,3]).subarray(1)],[-0],[true],[null],[{x:'世界\0'}]];
  for(const [i,m] of modules.entries()){
   const fn=m.functions[0],schema=fn.boundary,expected=canonicalResult(js[fn.name](...cases[i]),schema);
   for(const async of [false,true]){
    const output=await addon[async?'runAsync':'run'](i,encodeArguments(schema,cases[i]));
    const value=decodeResult(schema,timing?output.value:output);
    assert.equal(canonicalResult(value,schema),expected);
    if(timing){assert.deepEqual(Object.keys(output.timings),['nativeInputCopy','nativeDecode','compute','nativeEncode','copyBack']);for(const ms of Object.values(output.timings))assert.ok(Number.isFinite(ms)&&ms>=0);}
   }
  }
  for(const text of ['', 'x"\\\n'.repeat(500000)]){
   const args=[text,42,false,null,{x:2},[3]],schema=modules[0].functions[0].boundary;
   const output=addon.run(0,encodeArguments(schema,args));assert.equal(decodeResult(schema,timing?output.value:output),js.mixed(...args));
  }
  const samples=[],dispatcher=loadPromotion(path.join(output,'promotion.node'),{mode:'native',log:()=>{},onTiming:s=>samples.push(s)});
  const fn=modules[0].functions[0];assert.equal(dispatcher.dispatch(fn.id,js.mixed,cases[0]),js.mixed(...cases[0]));
  assert.equal(samples.length,timing?1:0);
  assert.throws(()=>addon.run(999,[]));assert.throws(()=>addon.run(0,[]));assert.throws(()=>addon.run(2,['bad']));
  const generated=await readFile(path.join(output,'entry.ts'),'utf8');assert.equal(generated.includes('boundaryStage'),timing);
 }
});
