import {buildPromotion} from '../../packages/scriptc-promote/src/functions/promotion-build.mjs';
import {discoverPromotions} from '../../packages/scriptc-promote/src/functions/promotion-discovery.mjs';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import * as js from './cliffs.ts';
import assert from 'node:assert/strict';
const output='/tmp/d1b-cliffs';
const modules=await discoverPromotions(import.meta.dirname,output,{promotionSourceDir:'.',typescript:{implementation:createRequire(new URL('../../packages/scriptc-promote/package.json',import.meta.url))('typescript')}},()=>{});
const selected=modules.filter(m=>m.source.endsWith('/cliffs.ts'));
const built=await buildPromotion(selected,output,{report:console.log});
const addon=createRequire(import.meta.url)(output+'/promotion.node');
const rows=[];
for(const [index,m] of built.entries()){
 const name=m.functions[0].name,fn=js[name],native=n=>addon.run(index,[n]);
 const count=3600000,expected=fn(count);
 assert.equal(native(count),expected);
 for(let i=0;i<30;i++){fn(count);native(count);}
 const samples={js:[],native:[]};
 for(let i=0;i<51;i++)for(const lane of (i%2?['native','js']:['js','native'])){
  const begin=performance.now(),value=(lane==='js'?fn:native)(count);
  samples[lane].push(performance.now()-begin);assert.equal(value,expected);
 }
 const median=a=>[...a].sort((a,b)=>a-b)[25];
 rows.push({name,count,result:expected,jsMs:median(samples.js),nativeMs:median(samples.native),samples});
}
await writeFile(new URL('./cliffs.json',import.meta.url),JSON.stringify({node:process.version,rows},null,2)+'\n');
console.log(rows.map(({samples,...r})=>r));
