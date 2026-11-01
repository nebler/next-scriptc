import { createHash } from 'node:crypto';
import { serialize } from './json.ts';
export function estimateSize(args){let size=0;for(const a of args)size+=typeof a==='string'?a.length:Array.isArray(a)?a.length:1;return Math.floor(Math.log2(Math.max(1,size)));}
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
export function createDispatcher({native, nativeAsync, now=()=>performance.now(), log=console.log, jsSamples=20, matches=5, sampleEvery=20, perMinute=50, maxPending=2, mode='auto'}={}){
 const functions=new Map();let pending=0,poisoned=false;
 function state(id,args){let f=functions.get(id);if(!f){f={buckets:new Map(),shadows:[],calls:0,native:0,fallback:0};functions.set(id,f);}const bucket=estimateSize(args);let s=f.buckets.get(bucket);if(!s){s={state:poisoned?'demoted':'js',bucket,calls:0,js:[],times:[],verified:0,atCall:null};f.buckets.set(bucket,s);}return {f,s};}
 function transition(id,s,to,extra={}){if(s.state===to)return;s.state=to;s.atCall=s.calls;log('next-scriptc '+JSON.stringify({fn:id,bucket:s.bucket,state:to,calls:s.calls,js:s.js.length?median(s.js):null,native:s.times.length?median(s.times):null,n:s.verified,...extra}));}
 function panic(error){poisoned=true;for(const [id,f] of functions)for(const s of f.buckets.values())transition(id,s,'demoted',{reason:'panic',error:String(error)});}
 function shadow(id,args,result,f,s){
  const time=now();f.shadows=f.shadows.filter(t=>time-t<60000);
  if(pending||f.shadows.length>=perMinute)return;
  let input,expected,inputMs;const encodeBegin=now();try{input=serialize(args);inputMs=now()-encodeBegin;expected=serialize(result,true);}catch(e){transition(id,s,'demoted',{reason:'invalid JSON'});return;}
  f.shadows.push(time);pending++;
  // Start after the synchronous caller receives its JS answer. Capturing bytes
  // now isolates mutable caller arguments and results from the background job.
  setImmediate(async()=>{const begin=now();try{
   const output=await nativeAsync(id,input);const parsed=JSON.parse(output),ms=now()-begin+inputMs;
   if(serialize(parsed,true)!==expected){transition(id,s,'demoted',{reason:'mismatch',inputHash:createHash('sha256').update(input).digest('hex')});return;}
   if(poisoned||s.state==='demoted')return;
   s.times.push(ms);if(s.times.length>60)s.times.shift();s.verified++;
   if(s.state==='shadow'&&s.verified>=matches)transition(id,s,median(s.times)<0.9*median(s.js)?'native':'js-final');
  }catch(e){panic(e);}finally{pending--;}});
 }
 function dispatch(id,js,args){const {f,s}=state(id,args);f.calls++;s.calls++;if(f.calls%10000===0)log('next-scriptc '+JSON.stringify({fn:id,calls:f.calls,native:f.native,fallback:f.fallback}));
  if(!poisoned&&(mode==='native'||s.state==='native')&&s.state!=='demoted'&&pending<maxPending){
   if(mode==='auto'&&s.calls%1000===0){const result=js(...args);shadow(id,args,result,f,s);return result;}
   try{const input=serialize(args);pending++;try{const result=JSON.parse(native(id,input));f.native++;return result;}finally{pending--;}}catch(e){panic(e);}
  }else if(s.state==='native')f.fallback++;
  const timed=mode==='auto'&&(s.state==='js'||s.state==='shadow');const begin=timed?now():0;const result=js(...args);
  if(timed){s.js.push(now()-begin);if(s.js.length>60)s.js.shift();if(s.state==='js'&&s.js.length>=jsSamples)transition(id,s,'shadow');
   if(s.state==='shadow'&&s.calls%sampleEvery===0)shadow(id,args,result,f,s);}
  return result;
 }
 return {dispatch,panic,get pending(){return pending;},snapshot:()=>Object.fromEntries([...functions].map(([id,f])=>[id,{calls:f.calls,native:f.native,fallback:f.fallback,buckets:[...f.buckets.values()]}]))};
}
