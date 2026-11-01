import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeArguments,decodeResult,canonicalResult} from '../src/functions/promotion-encodings.mjs';
import {signature} from '../src/functions/promotion-signature.mjs';
import {createDispatcher} from '../src/functions/promotion.mjs';
const schema={params:['string','number','boolean','null','json','json'],result:'string'};
test('per-type encoding preserves UTF-8, NUL, empty and large strings without JSON wrapping',()=>{
 for(const s of ['', 'é世界😀\0end', 'x"\\\n'.repeat(500000)]){
  const encoded=encodeArguments(schema,[s,1,true,null,{x:2},[3]]);
  assert.deepEqual(encoded,[s,1,true,null,'{"x":2}','[3]']);
  assert.equal(Buffer.from(encoded[0]).toString('utf8'),s);
  assert.equal(decodeResult(schema,s),s);
 }
 assert.throws(()=>encodeArguments(schema,['\ud800',1,true,null,{},[]]));
});
test('strict number rules, shape validation and canonical bytes',()=>{
 const n={params:['number'],result:'number'};
 for(const value of [0,-0,Number.MIN_VALUE,Number.MAX_VALUE,2**53,1.2345]){
  assert.equal(canonicalResult(decodeResult(n,encodeArguments(n,[value])[0])),JSON.stringify(value));
 }
 for(const value of [NaN,Infinity,-Infinity,'1',undefined])assert.throws(()=>encodeArguments(n,[value]));
 assert.throws(()=>decodeResult(n,NaN));assert.throws(()=>encodeArguments(n,[]));
 const j={params:['json'],result:'json'};
 for(const value of [[,1],{get x(){throw Error('getter invoked');}},new Date(),{x:undefined},{x:NaN}])assert.throws(()=>encodeArguments(j,[value]));
 const cyclic={};cyclic.x=cyclic;assert.throws(()=>encodeArguments(j,[cyclic]));
 assert.deepEqual(decodeResult(j,encodeArguments(j,[{x:['世界',null]}])[0]),{x:['世界',null]});
 assert.notEqual(canonicalResult({a:1,b:2}),canonicalResult({b:2,a:1}));
});
test('Uint8Array snapshots raw bytes including offset views; other views refused',()=>{
 const b={params:['bytes'],result:'bytes'},a=new Uint8Array([9,0,255,8]).subarray(1,3),encoded=encodeArguments(b,[a])[0];
 a.fill(7);assert.deepEqual([...encoded],[0,255]);
 assert.equal(canonicalResult(decodeResult(b,encoded),b),'[0,255]');
 for(const a of [new Uint16Array(2),Buffer.alloc(2),Object.assign(new Uint8Array(2),{extra:1})])assert.throws(()=>encodeArguments(b,[a]));
});
test('generated signatures are mixed ABI and timing-free unless opted in',()=>{
 const fn={boundary:schema};const s=signature(fn,0);
 assert.deepEqual(s.profile.params,['string','f64','bool','bool','string','string']);
 assert.equal(s.profile.returns,'string');assert.doesNotMatch(s.source,/boundaryStage/);
 assert.match(signature(fn,0,true).source,/boundaryStage\(2\)/);
 assert.throws(()=>signature({},0));
});
const tick=()=>new Promise(r=>setImmediate(r));
test('mixed raw shadow verification compares canonical result bytes and captures arguments',async()=>{
 let release,seen;
 const d=createDispatcher({schemas:{f:schema},jsSamples:1,sampleEvery:1,matches:1,log:()=>{},nativeAsync:(_id,input)=>{seen=input;return new Promise(r=>release=r);}});
 const args=['世界\0',1,true,null,{x:2},[3]];
 assert.equal(d.dispatch('f',()=> 'answer',args),'answer');args[4].x=100;
 await tick();assert.equal(seen[4],'{"x":2}');release('different');await tick();
 assert.equal(d.snapshot().f.buckets[0].state,'demoted');
});
test('stage hooks are opt-in and expose all seven stages',()=>{
 let clock=0;const samples=[];const timings={nativeInputCopy:1,nativeDecode:2,compute:3,nativeEncode:4,copyBack:5};
 const d=createDispatcher({mode:'native',schemas:{f:schema},timing:true,now:()=>clock++,onTiming:x=>samples.push(x),native:()=>({value:'ok',timings})});
 assert.equal(d.dispatch('f',()=>'', ['x',1,true,null,{},[]]),'ok');
 assert.deepEqual(samples,[{id:'f',jsEncode:1,...timings,jsDecode:1}]);
 const off=createDispatcher({mode:'native',schemas:{f:schema},now:()=>{throw Error('clock on off path');},native:()=> 'ok'});
 assert.equal(off.dispatch('f',()=>'', ['x',1,true,null,{},[]]),'ok');
});
test('undefined arguments skip one shadow without demoting later representable calls',async()=>{
 let calls=0;const d=createDispatcher({schemas:{f:{params:['json'],result:'json'}},jsSamples:1,sampleEvery:1,log:()=>{},nativeAsync:async()=>{calls++;return '{"value":1}';}});
 const js=x=>({value:x.v??1});
 assert.deepEqual(d.dispatch('f',js,[{v:undefined}]),{value:1});await tick();
 assert.equal(calls,0);assert.equal(d.snapshot().f.buckets[0].state,'shadow');
 d.dispatch('f',js,[{}]);await tick();await tick();
 assert.equal(calls,1);assert.equal(d.snapshot().f.buckets[0].verified,1);
});
