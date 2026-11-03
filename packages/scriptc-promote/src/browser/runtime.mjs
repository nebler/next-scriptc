import {encodeArguments, decodeResult, canonicalResult, argumentTable} from '../functions/promotion-encodings.mjs';
import {instantiate} from './bridge.mjs';
const states = new Map();
export function browserSnapshot() {return [...states].map(([id,s])=>({id,...s.snapshot()}));}
// No Node imports. No work during SSR; fetch/compilation starts on the first call.
export function createBrowserDispatcher(entries, load = async url => {
 const response=await fetch(url);if(!response.ok)throw Error('Wasm unavailable');
 return instantiate(await WebAssembly.compile(await response.arrayBuffer()));
}) {
 const records=new Map();
 for(const [id,entry] of Object.entries(entries)) {
  const s={ready:false,disabled:false,lane:'js',checks:0,mismatches:0,fallbacks:0,wasmCalls:0,buckets:new Map(),promise:null,reactor:null};
  s.snapshot=()=>({ready:s.ready,disabled:s.disabled,lane:s.lane,checks:s.checks,mismatches:s.mismatches,fallbacks:s.fallbacks,wasmCalls:s.wasmCalls});
  records.set(id,{entry,s});states.set(id,s);
 }
 const disable=s=>{s.disabled=true;s.ready=false;s.reactor=null;s.fallbacks++;};
 return {
  snapshot:id=>records.get(id)?.s.snapshot(),
  dispatch(_file,id,js,args) {
   const record=records.get(id);if(!record)return js(...args);
   const {entry,s}=record;s.lane='js';
   if(!entry.buckets.length)return js(...args);
   if(!s.promise&&!s.disabled) s.promise=Promise.resolve().then(()=>load(entry.url)).then(reactor=>{if(!s.disabled){s.reactor=reactor;s.ready=true;}}).catch(()=>disable(s));
   if(!s.ready||s.disabled)return js(...args);
   let encoded,size,bucket;
   try {
    // Validate before reading the configured size field or serializing input.
    encoded=encodeArguments(entry.schema,args);
    let value=args;for(const key of entry.sizePath)value=value[key];
    size=value;if(!Number.isFinite(size)||size<0)return js(...args);
    bucket=Math.floor(Math.log2(Math.max(1,size)));
   }catch{return js(...args);}
   if(!entry.buckets.includes(bucket))return js(...args);
   let result;
   try {const text=s.reactor.run(JSON.stringify(args));result=decodeResult(entry.schema,entry.schema.result==='json'?text:JSON.parse(text),argumentTable(encoded));}
   catch {disable(s);return js(...args);}
   const n=(s.buckets.get(bucket)||0)+1;s.buckets.set(bucket,n);
   if(n<=3||n%32===0) {
    const reference=js(...args);s.checks++;
    try {if(canonicalResult(result,entry.schema)!==canonicalResult(reference,entry.schema)){s.mismatches++;disable(s);return reference;}}
    catch {s.mismatches++;disable(s);return reference;}
   }
   s.lane='wasm';s.wasmCalls++;return result;
  }
 };
}
