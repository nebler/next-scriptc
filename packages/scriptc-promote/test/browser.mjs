import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserDispatcher} from '../src/browser/runtime.mjs';
const entry={url:'/missing.wasm',schema:{params:['number'],result:'number'},sizePath:[0],buckets:[10]};
const js=n=>n*2;
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('browser starts with JS, caches async load, checks buckets and periodically verifies',async()=>{
 let loads=0;const d=createBrowserDispatcher({f:entry},async()=>{loads++;return {run:s=>JSON.stringify(JSON.parse(s)[0]*2)};});
 assert.equal(d.dispatch('', 'f',js,[1024]),2048);assert.equal(d.snapshot('f').lane,'js');await tick();
 for(let i=0;i<33;i++)assert.equal(d.dispatch('','f',js,[1024]),2048);
 assert.equal(loads,1);assert.equal(d.snapshot('f').lane,'wasm');assert.equal(d.snapshot('f').checks,4);
 assert.equal(d.dispatch('','f',js,[8]),16);assert.equal(d.snapshot('f').lane,'js');
});
for(const reason of ['missing','instantiate','trap','mismatch'])test('browser permanent JS after '+reason,async()=>{
 let calls=0;const d=createBrowserDispatcher({f:entry},async()=>{calls++;if(['missing','instantiate'].includes(reason))throw Error(reason);return {run:()=>{if(reason==='trap')throw Error('trap');return '0';}};});
 assert.equal(d.dispatch('','f',js,[1024]),2048);await tick();
 for(let i=0;i<5;i++)assert.equal(d.dispatch('','f',js,[1024]),2048);
 assert.equal(calls,1);assert.equal(d.snapshot('f').disabled,true);assert.equal(d.snapshot('f').lane,'js');assert.equal(d.snapshot('f').fallbacks,1);
 assert.equal(d.snapshot('f').mismatches,reason==='mismatch'?1:0);
});
test('browser refuses invalid boundary without poisoning reactor',async()=>{
 const d=createBrowserDispatcher({f:entry},async()=>({run:s=>String(JSON.parse(s)[0]*2)}));d.dispatch('','f',js,[1024]);await tick();assert.ok(Number.isNaN(d.dispatch('','f',js,[NaN])));assert.equal(d.snapshot('f').disabled,false);
});
