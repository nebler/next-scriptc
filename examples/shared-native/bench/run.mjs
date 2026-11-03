// Build the adapter first. Optional artifact directory and wasm file support D1b.
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {forecast as integerForecast} from '../lib/forecast.ts';
import {forecast as floatForecast} from '../../../research/shared-native-remeasure/forecast-float.ts';
import {encodeArguments,decodeResult,canonicalResult,argumentTable} from 'scriptc-promote/functions/promotion-encodings.mjs';
import {instantiate} from '../../../packages/next-scriptc/src/cloudflare/bridge.mjs';
const forecast=process.env.PRNG==='float'?floatForecast:integerForecast;
const dir=path.resolve(process.argv[3]??new URL('../.next/scriptc-promotion/',import.meta.url).pathname);
const ids=JSON.parse(readFileSync(path.join(dir,'ids.json')));
const schemas=JSON.parse(readFileSync(path.join(dir,'encodings.json'))).functions;
const id=createHash("sha256").update(path.resolve(import.meta.dirname,"../lib/forecast.ts")+"\0forecast").digest("hex").slice(0,20);
const index=ids.indexOf(id);
assert.ok(index>=0);
const schema=schemas[id];
const addon=createRequire(import.meta.url)(path.join(dir,'promotion.node'));
const native=input=>{const encoded=encodeArguments(schema,[input]);return decodeResult(schema,addon.run(index,encoded),argumentTable(encoded));};
const reactor=process.argv[4]?instantiate(await WebAssembly.compile(readFileSync(process.argv[4]))):null;
const lanes={js:forecast,native,...(reactor?{wasm:input=>JSON.parse(reactor.run(JSON.stringify([input])))}:{})};
const equal=(a,b)=>assert.equal(canonicalResult(a,schema),canonicalResult(b,schema));
const inputFor=(trials,seed=42)=>({trials,seed,cash:250000,revenue:40000,costs:50000});
// Give V8 type feedback before an OSR entry encounters the end of a large loop.
for(let i=0;i<100;i++)forecast(inputFor(10));
const parity=[];
for(const trials of [1000,10000,100000])for(const seed of [1,42,2147483648,4294967295]){
 const input=inputFor(trials,seed),expected=forecast(input);
 for(const lane of Object.values(lanes))equal(lane(input),expected);
 parity.push({trials,seed,result:expected});
}
const median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
const rows=[];
for(const trials of [1000,10000,100000]){
 const input=inputFor(trials),expected=forecast(input),names=Object.keys(lanes);
 for(let i=0;i<30;i++)for(const lane of Object.values(lanes))lane(input);
 const samples=Object.fromEntries(names.map(n=>[n,[]]));
 for(let i=0;i<51;i++)for(const name of (i%2?[...names].reverse():names)){
  const start=performance.now(),value=lanes[name](input),duration=performance.now()-start;
  equal(value,expected);samples[name].push(duration);
 }
 rows.push({trials,inputBytes:Buffer.byteLength(JSON.stringify([input])),samples:51,...Object.fromEntries(names.map(n=>[n+'Ms',median(samples[n])])),raw:samples});
}
const result={node:process.version,platform:process.platform,arch:process.arch,prng:process.env.PRNG??'integer',parity,rows};
console.log(JSON.stringify({...result,rows:rows.map(({raw,...r})=>r)},null,2));
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');
