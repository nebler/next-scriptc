import {inspect} from 'node:util';
import {encodeArguments,decodeResult,canonicalResult,argumentTable} from './promotion-encodings.mjs';
import {baseValue} from './promotion-inputs.mjs';
export const numberEdges=[0,-0,1,-1,NaN,Infinity,-Infinity,Number.MAX_SAFE_INTEGER-1,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER+1,-2147483649,-2147483648,2147483647,2147483648,4294967295,4294967296,Number.MIN_VALUE,Number.MAX_VALUE,1e-7,1e21,0.1];
export const stringEdges=['','a','0','01','10','é','e\u0301','😀','\ud800','\udfff','\u0000','a'.repeat(65536),'[]','{}','null','[0]','[1,-1,0]','{"n":1,"s":"😀"}','{"2":2,"10":1,"01":3}','{"a":1,"a":2}'];
export function randomSource(seed=1){let n=seed>>>0;return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
export function variants(s){
 const base=()=>baseValue(s);
 switch(s.kind){
 case 'handle':return [null,undefined,{},[],new Date(0),'handle',-0];
 case 'nullable':return [null,...variants(s.value)];
 case 'number':return numberEdges;
 case 'string':return stringEdges;
 case 'boolean':return [false,true];
 case 'literal':case 'null':case 'undefined':return [base()];
 case 'bytes':return [new Uint8Array(),new Uint8Array([0,255,128]),new Uint8Array(1024)];
 case 'union':return s.values.flatMap(variants);
 case 'array':return [[],...variants(s.value).map(v=>[v]),Array.from({length:64},()=>baseValue(s.value))];
 case 'tuple':return [base(),...s.values.flatMap((v,i)=>variants(v).map(x=>s.values.map((t,j)=>j===i?x:baseValue(t))))];
 case 'object':{
  const out=[base()];
  for(const [k,v,optional] of s.fields){for(const x of variants(v))out.push({...base(),[k]:x});if(optional){const absent=base();delete absent[k];out.push(absent,{...base(),[k]:undefined},{...base(),[k]:null});}}
  if(s.index){const value=baseValue(s.index);out.push(Object.assign(base(),{'2':value,'10':value,'01':value,'a':value,'á':value,'a\u0301':value}));}
  out.push(Object.fromEntries(Object.entries(base()).reverse()));return out;
 }
 default:throw Error('Unsupported shape '+s.kind);
 }
}
export function* inputCases(shapes,{seed=1,maxCases=256}={}){
 const base=shapes.map(baseValue),edges=shapes.map(variants),random=randomSource(seed);let count=0;
 yield base;count++;
 for(let i=0;i<edges.length;i++)for(const v of edges[i]){if(count++>=maxCases)return;yield base.map((x,j)=>j===i?v:structuredClone(x));}
 while(count++<maxCases)yield edges.map(v=>structuredClone(v[Math.floor(random()*v.length)]));
}
function* reductions(v){
 if(typeof v==='number'){if(!Object.is(v,0))yield 0;if(Math.abs(v)>1){yield Math.sign(v);yield Math.trunc(v/2);}}
 else if(typeof v==='string'){if(v.length){yield '';yield v.slice(0,Math.floor(v.length/2));yield v.slice(0,1);try{for(const reduced of reductions(JSON.parse(v)))yield JSON.stringify(reduced);}catch{}}}
 else if(Array.isArray(v)){if(v.length){yield [];yield v.slice(0,Math.floor(v.length/2));if(v.length>1)yield v.slice(Math.floor(v.length/2));for(let i=0;i<v.length;i++)for(const x of reductions(v[i]))yield v.map((y,j)=>i===j?x:y);}}
 else if(v&&Object.getPrototypeOf(v)===Object.prototype){for(const k of Object.keys(v)){const copy={...v};delete copy[k];yield copy;for(const x of reductions(v[k]))yield {...v,[k]:x};}}
}
export function shrink(args,fails,{maxSteps=128,deadline=Infinity}={}){
 let current=structuredClone(args),steps=0;const seen=new Set([inspect(current,{depth:null})]);
 outer:while(steps<maxSteps&&performance.now()<deadline){for(let i=0;i<current.length;i++)for(const v of reductions(current[i])){
  if(++steps>maxSteps||performance.now()>=deadline)break outer;
  const next=current.map((x,j)=>i===j?v:x),key=inspect(next,{depth:null});if(seen.has(key))continue;seen.add(key);
  if(fails(next)){current=next;continue outer;}
 }break;}return current;
}
export function fuzzFunction({js,native,schema,shapes},{seed=1,budgetMs=100,maxCases=256}={}){
 const start=performance.now(),deadline=start+budgetMs;let cases=0,rejected=0,fallbacks=0,throws=0;
 function compare(args){
  let encoded;try{encoded=encodeArguments(schema,args);}catch{return {status:'rejected'};}
  const table=argumentTable(encoded);let expected;
  try{expected=canonicalResult(js(...args),schema,table);}catch{return {status:'js-uncomparable'};}
  try{const raw=native(encoded);if(raw?.fallback)return {status:'fallback'};const actual=canonicalResult(decodeResult(schema,raw,table),schema,table);return {status:actual===expected?'equal':'mismatch',js:expected,native:actual};}
  catch(e){return {status:'mismatch',js:expected,native:'throws: '+e.message};}
 }
 for(const args of inputCases(shapes,{seed,maxCases})){
  if(performance.now()>=deadline)break;
  cases++;const result=compare(args);
  if(result.status==='rejected')rejected++;if(result.status==='fallback')fallbacks++;if(result.status==='js-uncomparable')throws++;
  if(result.status==='mismatch'){
   const minimal=shrink(args,a=>compare(a).status==='mismatch',{deadline});
   return {seed,cases,rejected,fallbacks,throws,input:inspect(minimal,{depth:null,maxStringLength:70000,maxArrayLength:256}),...compare(minimal),elapsedMs:performance.now()-start};
  }
 }
 return {status:cases>rejected+fallbacks+throws?'passed':'inconclusive',seed,cases,rejected,fallbacks,throws,elapsedMs:performance.now()-start};
}
export function fuzzMessage(module,result){const fn=module.functions[0],line=(module.originalText??'').slice(0,fn.start??0).split('\n').length;return '[scriptc-promote] fuzz '+module.source+':'+line+' '+fn.name+': '+result.status+'; seed='+result.seed+'\ninput: '+(result.input??'unavailable')+'\nJS: '+(result.js??'unavailable')+'\nnative: '+(result.native??result.reason??'unavailable');}
export function applyFuzzResults(modules,results,report=console.log){return modules.filter((m,i)=>{const r=results[i];if(r.status==='passed'&&r.cases>r.rejected+r.fallbacks+r.throws)return true;const message=fuzzMessage(m,r);if(m.forced)throw Error(message+'\nExplicit use native verification failed');report(message+'\nAutomatic promotion demoted to JS');return false;});}
export function fuzzOptions(value={}){const o={seed:1,budgetMs:100,maxCases:256,...value};for(const k of ['seed','budgetMs','maxCases'])if(!Number.isSafeInteger(o[k])||o[k]<(k==='seed'?0:1))throw Error('Invalid fuzz '+k);return o;}
