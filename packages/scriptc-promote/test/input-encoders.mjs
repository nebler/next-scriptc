import test from 'node:test';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import * as old from './support/legacy-encodings.mjs';
import * as next from '../src/functions/promotion-encodings.mjs';
const number={kind:'number'},string={kind:'string'};
const row={kind:'object',fields:[['amount',number],['label',string],['yes',{kind:'boolean'}],['nil',{kind:'nullable',value:number}]]};
const schema={params:['json','number'],result:'json',opaque:{inputs:[{kind:'array',value:row},number],result:{kind:'handle'}}};
let seed=20935;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
const result=(api,s,args)=>{try{return {value:api.encodeArguments(s,args)};}catch{return {reject:true};}};
test('generated projection matches legacy bytes and rejection on seeded inputs',()=>{
 const strings=['','"\\\b\f\n\r\t','世界😀','\u0000\u001f','\u2028\u2029','\ud800','\udfff'];
 for(let i=0;i<2000;i++){
  const values=Array.from({length:1+Math.floor(rand()*8)},()=>({amount:rand()<.1?-0:rand()*1e8,label:strings[Math.floor(rand()*strings.length)],yes:rand()<.5,nil:rand()<.5?null:rand(),extra:()=>0}));
  const v=values[0];switch(i%25){
   case 0:Object.defineProperty(v,'amount',{get(){throw Error('getter invoked');}});break;
   case 1:Object.setPrototypeOf(v,{});break;
   case 2:delete values[0];break;
   case 3:values[Symbol('x')]=1;break;
   case 4:Object.setPrototypeOf(values,null);break;
   case 5:v.amount=NaN;break;
   case 6:v.amount=Infinity;break;
   case 7:v.amount=-Infinity;break;
   case 8:v.amount=undefined;break;
   case 9:delete v.label;break;
   case 10:v[Symbol('ignored projection')]=1;break;
   case 11:Object.defineProperty(v,'amount',{value:3,enumerable:false});break;
   case 12:Object.defineProperty(values,'0',{get(){throw Error('array getter invoked');}});break;
   case 13:values.extra=1;break;
   case 14:Object.setPrototypeOf(v,null);break;
   case 15:v.yes=1;break;
   case 16:v.label=Symbol('x');break;
   case 17:v.nil=undefined;break;
   case 18:v.amount=1n;break;
   case 19:v.label=new String('x');break;
   case 20:values[0]=null;break;
   case 21:Object.defineProperty(v,'yes',{set(_v){throw Error('setter');}});break;
   case 22:v.amount=values;break;
   case 23:Object.defineProperty(values,'0',{value:v,enumerable:false});break;
  }
  assert.deepEqual(result(next,schema,[values,2]),result(old,schema,[values,2]),'case '+i);
 }
 for(const key of ['__proto__','constructor','prototype','toJSON']){
  const s={params:['json'],result:'json',opaque:{inputs:[{kind:'object',fields:[[key,number]]}],result:number}};
  assert.deepEqual(result(next,s,[{[key]:1}]),result(old,s,[{[key]:1}]));
 }
 const indices={params:['json'],result:'json',opaque:{inputs:[{kind:'object',fields:[['z',number],['2',number],['1',number]]}],result:number}};
 assert.deepEqual(result(next,indices,[{z:1,1:2,2:3}]),result(old,indices,[{z:1,1:2,2:3}]));
});
test('H1/H2 handle identity, snapshots and present undefined match legacy',()=>{
 const s={params:['json'],result:'json',opaque:{inputs:[{kind:'array',value:{kind:'object',original:true,fields:[['__scriptcOriginal',{kind:'handle'}],['amount',number],['token',{kind:'handle'}]]}}],result:{kind:'handle'}}};
 const v={amount:-0,token:undefined};
 const a=next.encodeArguments(s,[[v,v]]),b=old.encodeArguments(s,[[v,v]]);
 assert.deepEqual(a,b);assert.deepEqual(next.argumentTable(a),old.argumentTable(b));
 assert.equal(next.decodeResult(s,'0',next.argumentTable(a)),v);
 v.amount=2;assert.equal(a[0],b[0]);
});

test('integer field order retains handle capture order and no-eval uses the walker',()=>{
 const s={params:['json'],result:'json',opaque:{inputs:[{kind:'object',fields:[['z',{kind:'handle'}],['2',{kind:'handle'}],['1',{kind:'handle'}]]}],result:{kind:'handle'}}};
 const v={z:{},2:{},1:{}},a=next.encodeArguments(s,[v]),b=old.encodeArguments(s,[v]);
 assert.deepEqual(a,b);assert.deepEqual(next.argumentTable(a),old.argumentTable(b));
 const url=new URL('../src/functions/promotion-encodings.mjs',import.meta.url).href;
 const code=`import {encodeArguments} from ${JSON.stringify(url)};const s=${JSON.stringify(schema)};console.log(encodeArguments(s,[[{amount:1,label:'x',yes:true,nil:null}],2])[0]);`;
 const child=spawnSync(process.execPath,['--disallow-code-generation-from-strings','--input-type=module','-e',code],{encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);assert.equal(child.stdout.trim(),'[{"amount":1,"label":"x","yes":true,"nil":null}]');
});
