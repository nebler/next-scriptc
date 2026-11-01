import test from 'node:test';
import assert from 'node:assert/strict';
import {serialize} from '../src/functions/json.ts';
import {revenueCore} from '../../../examples/demo/lib/revenue-core.ts';
import {revenue} from '../../../examples/demo/lib/revenue.ts';
import {echo} from '../../../examples/demo/lib/native-example.ts';
import {revenueEventsJson} from '../../../examples/demo/app/api/analytics/revenue/events.ts';

test('demo result shapes retain exact canonical bytes',async()=>{
 const shared={n:-0};
 for(const value of [await echo('世界😀\0"\\\n\ud800'),revenueCore('2026-01-01','2026-01-31',revenueEventsJson(1000)),revenueCore('x','z','[]'),await revenue('2026-01-01','2026-01-31',5000,false),await revenue('2026-01-01','2026-01-31',5000,true),{a:shared,b:shared},[null,true,false,-0,Number.MIN_VALUE,Number.MAX_VALUE],{'2':'two','1':'one',z:'last'}]){
  let calls=0;
  assert.equal(serialize(value,true,()=>{calls++;return JSON.stringify(value);}),JSON.stringify(value));
  assert.equal(calls,1);
 }
});

test('descriptor-map symbol check rejects hidden and array symbols before encoding',()=>{
 for(const value of [{},[],{nested:{}},{nested:[]}]){
  const target=value.nested??value;
  Object.defineProperty(target,Symbol('hidden'),{value:1,enumerable:false});
  assert.throws(()=>serialize(value,true,()=>assert.fail('encoder ran')),/Symbol properties/);
 }
 let invoked=false;
 const getter={get x(){invoked=true;return 1;}};
 const cyclic={};cyclic.self=cyclic;
 const sparse=Array(1);sparse.extra=1;
 for(const value of [getter,{toJSON(){invoked=true;return 1;}},cyclic,sparse,{n:NaN},{n:Infinity},{n:-Infinity},Object.create(null),Object.defineProperty({},'x',{value:1}),Object.setPrototypeOf([],null)]){
  assert.throws(()=>serialize(value,true,()=>assert.fail('encoder ran')),/JSON/);
 }
 assert.equal(invoked,false);
});
