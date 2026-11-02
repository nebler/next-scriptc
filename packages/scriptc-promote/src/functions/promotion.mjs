import {stabilityDefaults,decideLane} from './promotion-policy.mjs';
import {encodeArguments,decodeResult,canonicalResult,argumentTable} from './promotion-encodings.mjs';
import { createHash } from 'node:crypto';
import { serialize } from './json.mjs';
export function estimateSize(args){if(args.length===1&&typeof args[0]!=='string'&&!Array.isArray(args[0]))return 0;let size=0;for(const a of args)size+=typeof a==='string'?a.length:Array.isArray(a)?a.length:1;return Math.floor(Math.log2(Math.max(1,size)));}
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
export function createDispatcher({native, nativeAsync, nativeSample, cpuNow, policy:overrides={}, now=()=>performance.now(), log=console.log, jsSamples=20, sampleEvery=20, perMinute=50, maxPending=2, mode='auto', schemas={}, timing=false, onTiming=()=>{}, fallbackWindow=20, fallbackThreshold=0.5}={}){
 if(!Number.isInteger(fallbackWindow)||fallbackWindow<1||!(fallbackThreshold>=0&&fallbackThreshold<1))throw new Error('Invalid fallback policy');
 const policy={...stabilityDefaults,...overrides};
 if(!Number.isInteger(policy.samples)||policy.samples<1||!Number.isInteger(policy.required)||policy.required<=policy.samples/2||policy.required>policy.samples||!Number.isInteger(policy.coldSamples)||policy.coldSamples<0||!Number.isInteger(policy.recheckEvery)||policy.recheckEvery<1||!(policy.promoteRatio>0&&policy.promoteRatio<1&&policy.demoteRatio>1))throw new Error('Invalid promotion policy');
 function encode(id,args){return schemas[id]?encodeArguments(schemas[id],args):serialize(args);}
 function decode(id,output,input){return schemas[id]?decodeResult(schemas[id],output,argumentTable(input)):JSON.parse(output);}
 function unpack(id,output,encodeMs,input){
  if(!timing)return decode(id,output,input);
  const begin=now(),value=decode(id,output.value,input);
  onTiming({id,jsEncode:encodeMs,...output.timings,jsDecode:now()-begin});return value;
 }
 if(!nativeSample)cpuNow=undefined;
 const serviceNow=cpuNow??now;
 const functions=new Map();let pending=0,poisoned=false,shadows=[];
 const phase=(id,bucket,period)=>{let h=bucket;for(const c of id)h=(Math.imul(h,31)+c.charCodeAt(0))>>>0;return h%period;};
 const active=new Set();
 function state(id,args){let f=functions.get(id);if(!f){f={buckets:new Map(),shadows:[],calls:0,native:0,fallback:0};functions.set(id,f);}const bucket=estimateSize(args);let s=f.buckets.get(bucket);if(!s){s={state:poisoned?'demoted':'js',bucket,calls:0,js:[],times:[],verified:0,pairs:[],cold:0,epochs:0,atCall:null,nativeAttempts:0,nativeFallbacks:0,fallbackAttempts:0,fallbackCount:0,pending:false,nextSample:jsSamples+phase(id,bucket,sampleEvery),nextRecheck:policy.recheckEvery+phase(id,bucket,policy.recheckEvery)};f.buckets.set(bucket,s);}return {f,s};}
 function transition(id,s,to,extra={}){if(s.state===to)return;s.state=to;s.atCall=s.calls;log('next-scriptc '+JSON.stringify({fn:id,bucket:s.bucket,state:to,calls:s.calls,js:s.js.length?median(s.js):null,native:s.times.length?median(s.times):null,n:s.verified,...extra}));}
 // Disjoint windows count only actual native attempts, including shadows.
 function recordFallback(id,s,fallback){
  s.nativeAttempts++;s.nativeFallbacks+=Number(fallback);
  s.fallbackAttempts++;s.fallbackCount+=Number(fallback);
  if(s.fallbackAttempts===fallbackWindow){
   const rate=s.fallbackCount/fallbackWindow;
   if(rate>fallbackThreshold)transition(id,s,'demoted',{reason:'fallback rate',fallbackRate:rate,fallbackWindow});
   s.fallbackAttempts=0;s.fallbackCount=0;
  }
 }
 function panic(error){poisoned=true;for(const [id,f] of functions)for(const s of f.buckets.values())transition(id,s,'demoted',{reason:'panic',error:String(error)});}
 function shadow(id,args,result,f,s,jsMs,jsWallMs){
  s.nextSample=s.calls+sampleEvery+(sampleEvery>1?phase(id,s.bucket+s.verified,7):0);
  s.nextRecheck=s.calls+policy.recheckEvery+phase(id,s.bucket+s.verified,policy.recheckEvery);
  const time=now();f.shadows=f.shadows.filter(t=>time-t<60000);
  shadows=shadows.filter(t=>time-t<60000);
  // Least-served admission prevents call frequency and call order from owning
  // the rolling quota. Forget dormant participants after a minute.
  for(const bucket of active)if(time-bucket.requested>=60000)active.delete(bucket);
  const minimum=active.size?Math.min(...[...active].map(b=>b.served)):0;
  if(!active.has(s)){s.served??=minimum;active.add(s);}
  s.requested=time;
  if(s.pending||shadows.length>=perMinute||s.served>Math.min(...[...active].map(b=>b.served)))return;
  let input,expected,inputMs,inputWallMs;const encodeWallBegin=now(),encodeBegin=serviceNow();try{input=encode(id,args);inputMs=serviceNow()-encodeBegin;inputWallMs=now()-encodeWallBegin;}catch(e){f.fallback++;return;}
  try{expected=canonicalResult(result,schemas[id],argumentTable(input));}catch{f.fallback++;return;}
  f.shadows.push(time);shadows.push(time);s.served++;s.pending=true;pending++;
  // Start after the synchronous caller receives its JS answer. Capturing bytes
  // now isolates mutable caller arguments and results from the background job.
  setImmediate(async()=>{const begin=now();try{
   const sample=nativeSample?await nativeSample(id,input):null;
   const output=sample?sample.value:await nativeAsync(id,input);
   recordFallback(id,s,output?.fallback===true);
   if(output?.fallback===true){f.fallback++;return;}
   const decodeWallBegin=now(),decodeBegin=serviceNow(),parsed=unpack(id,output,inputMs,input);
   const decodeMs=serviceNow()-decodeBegin,decodeWallMs=now()-decodeWallBegin;
   // CPU pairs require both clocks. Never silently compare CPU with wall.
   const ms=sample?(cpuNow?sample.cpuMs:sample.elapsedMs)+inputMs+decodeMs:now()-begin+inputMs;
   if(canonicalResult(parsed,schemas[id],argumentTable(input))!==expected){transition(id,s,'demoted',{reason:'mismatch',inputHash:createHash('sha256').update(typeof input==='string'?input:serialize(input.map(v=>v instanceof Uint8Array?Array.from(v):v))).digest('hex')});return;}
   if(poisoned||s.state==='demoted')return;
   s.verified++;
   if(s.cold++<policy.coldSamples)return;
   if(!(Number.isFinite(ms)&&ms>=0&&Number.isFinite(jsMs)&&jsMs>0))return;
   s.metric=cpuNow?'thread-cpu':'wall';
   (s.wallPairs??=[]).push([jsWallMs,sample?sample.elapsedMs+inputWallMs+decodeWallMs:now()-begin+inputWallMs]);
   s.times.push(ms);s.js.push(jsMs);s.pairs.push([jsMs,ms]);
   if(s.pairs.length===policy.samples){
    const lane=s.state==='native'?'native':'js-final';
    const next=decideLane(s.pairs,lane,policy);
    s.lastDecision={js:s.js,native:s.times,wallPairs:s.wallPairs,metric:s.metric,state:next,atCall:s.calls,epoch:++s.epochs};
    transition(id,s,next,{epoch:s.epochs});
    s.pairs=[];s.times=[];s.js=[];s.wallPairs=[];
   }
  }catch(e){panic(e);}finally{pending--;s.pending=false;}});
 }
 function dispatch(id,js,args){let f=functions.get(id),s=f?.buckets.get(estimateSize(args));
  if(!s)({f,s}=state(id,args));
  // No logging, clocks, sample arrays or serialization on a settled JS call.
  // Keep call counts for diagnostics and the bounded periodic recheck.
  if(mode==='auto'&&s.state==='js-final'&&s.calls+1<s.nextRecheck){f.calls++;s.calls++;return js(...args);}
  f.calls++;s.calls++;if(f.calls%10000===0)log('next-scriptc '+JSON.stringify({fn:id,calls:f.calls,native:f.native,fallback:f.fallback}));
  const recheck=mode==='auto'&&s.calls>=s.nextRecheck;
  if(!poisoned&&(mode==='native'||s.state==='native')&&s.state!=='demoted'&&pending<maxPending&&!recheck){
   const begin=timing?now():0;let input,valid=true;try{input=encode(id,args);}catch{valid=false;f.fallback++;}
   if(valid)try{const encodeMs=timing?now()-begin:0;pending++;try{const output=native(id,input);recordFallback(id,s,output?.fallback===true);if(output?.fallback===true){f.fallback++;}else{const result=unpack(id,output,encodeMs,input);f.native++;return result;}}finally{pending--;}}catch(e){panic(e);}
  }else if(s.state==='native'&&!recheck)f.fallback++;
  if(mode==='auto'&&s.state==='js'&&s.calls>=jsSamples)transition(id,s,'shadow');
  const learning=s.state==='shadow';
  const due=!s.pending&&(!pending||cpuNow)&&mode==='auto'&&s.state!=='demoted'&&s.state!=='js'&&s.calls>=(learning?s.nextSample:s.nextRecheck);
  // Ordinary JS calls do no timing, allocation of samples, or serialization.
  const wallBegin=due?now():0,begin=due?serviceNow():0,result=js(...args);
  if(due)shadow(id,args,result,f,s,serviceNow()-begin,now()-wallBegin);
  return result;
 }
 return {dispatch,panic,get pending(){return pending;},snapshot:()=>Object.fromEntries([...functions].map(([id,f])=>[id,{calls:f.calls,native:f.native,fallback:f.fallback,buckets:[...f.buckets.values()]}]))};
}
