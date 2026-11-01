import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {scratch,args,hash,save} from './common.mjs';
if(!global.gc)throw new Error('Run with --expose-gc');
const a=createRequire(import.meta.url)(scratch+'/revenue-serialized.node');
const {revenue}=await import(scratch+'/stage/revenue-js.mjs');
const expected=hash(JSON.stringify(await revenue(...args(200000))));
const text=JSON.stringify(args(200000));const result={samples:[],verified:0,node:process.version};
for(const count of [100,1000,1000,1000]){
 for(let i=0;i<count;i++){assert.equal(hash(await a.revenueJsonAsync(text)),expected);result.verified++;}
 global.gc();result.samples.push({calls:result.verified,...process.memoryUsage()});await save('leak-check',result);console.log(result.samples.at(-1));
}
