// Adapter artifacts must come from `pnpm --filter shared-native build` first.
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import {forecast} from '../lib/forecast.ts';
import {encodeArguments,decodeResult,canonicalResult,argumentTable} from 'scriptc-promote/functions/promotion-encodings.mjs';
import {createRequire} from 'node:module';
const dir=new URL('../.next/scriptc-promotion/',import.meta.url);
const ids=JSON.parse(readFileSync(new URL('ids.json',dir)));
const schemas=JSON.parse(readFileSync(new URL('encodings.json',dir))).functions;
assert.equal(ids.length, 1);
const id=ids[0];
assert.ok(id, 'forecast must be compiled by the normal adapter');
const schema=schemas[id];
const addon=createRequire(import.meta.url)(fileURLToPath(new URL('promotion.node',dir)));
const native=input=>{const encoded=encodeArguments(schema,[input]);return decodeResult(schema,addon.run(ids.indexOf(id),encoded),argumentTable(encoded));};
const median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
const rows=[];
for(const trials of [1000,10000,100000]){
 const input={trials,seed:42,cash:250000,revenue:40000,costs:50000};
 assert.equal(canonicalResult(forecast(input),schema),canonicalResult(native(input),schema));
 for(let i=0;i<30;i++){forecast(input);native(input);}
 const js=[],nc=[];
 for(let i=0;i<51;i++){
  for(const lane of (i%2 ? ['native','js']:['js','native'])){
   const start=performance.now();(lane==='js'?forecast:native)(input);
   (lane==='js'?js:nc).push(performance.now()-start);
  }
 }
 rows.push({trials,inputBytes:Buffer.byteLength(JSON.stringify([input])),samples:51,jsMs:median(js),nativeMs:median(nc),ratio:median(nc)/median(js)});
}
console.log(JSON.stringify({node:process.version,rows},null,2));
if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify({node:process.version,rows},null,2)+'\n');
