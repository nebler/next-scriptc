import test from 'node:test';
import assert from 'node:assert/strict';
import {forward} from './forward.mjs';
const request=(path='/numeric',method='GET')=>new Request('http://local'+path,{method});
const local=()=>new Response('worker');
test('selected GET forwards; errors and timeout preserve Worker response',async()=>{
 for(const remote of [()=>{throw Error('unavailable');},()=>new Response('error',{status:503}),()=>new Promise(()=>{})]){
  const r=await forward(request(),{},local,remote);
  assert.equal(await r.text(),'worker');assert.equal(r.headers.get('x-co1-path'),'worker-fallback');
 }
 const r=await forward(request(),{},local,()=>new Response('node'));
 assert.equal(await r.text(),'node');assert.equal(r.headers.get('x-co1-path'),'node');
});
test('unlisted routes, explicit Worker and writes never forward',async()=>{
 for(const r of [request('/state'),request('/numeric?lane=worker'),request('/numeric','POST')]){
  const result=await forward(r,{},local,()=>{throw Error('must not be called');});
  assert.equal(await result.text(),'worker');assert.equal(result.headers.get('x-co1-path'),'worker');
 }
});
