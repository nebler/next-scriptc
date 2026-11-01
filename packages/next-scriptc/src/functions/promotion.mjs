import {stabilityDefaults,decideLane} from './promotion-policy.mjs';
import {encodeArguments,decodeResult,canonicalResult} from './promotion-encodings.mjs';
import { createHash } from 'node:crypto';
import { serialize } from './json.ts';
export function estimateSize(args){let size=0;for(const a of args)size+=typeof a==='string'?a.length:Array.isArray(a)?a.length:1;return Math.floor(Math.log2(Math.max(1,size)));}
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
export function createDispatcher({native, nativeAsync, nativeSample, policy:overrides={}, now=()=>performance.now(), log=console.log, jsSamples=20, sampleEvery=20, perMinute=50, maxPending=2, mode='auto', schemas={}, timing=false, onTiming=()=>{}}={}){
 const policy={...stabilityDefaults,...overrides};
 if(!Number.isInteger(policy.samples)||policy.samples<1||!Number.isInteger(policy.required)||policy.required<=policy.samples/2||policy.required>policy.samples||!Number.isInteger(policy.coldSamples)||policy.coldSamples<0||!Number.isInteger(policy.recheckEvery)||policy.recheckEvery<1||!(policy.promoteRatio>0&&policy.promoteRatio<1&&policy.demoteRatio>1))throw new Error('Invalid promotion policy');
 function encode(id,args){return schemas[id]?encodeArguments(schemas[id],args):serialize(args);}
 function decode(id,output){return schemas[id]?decodeResult(schemas[id],output):JSON.parse(output);}
 function unpack(id,output,encodeMs){
  if(!timing)return decode(id,output);
  const begin=now(),value=decode(id,output.value);
  onTiming({id,jsEncode:encodeMs,...output.timings,jsDecode:now()-begin});return value;
 }
 const functions=new Map();let pending=0,poisoned=false;
 function state(id,args){let f=functions.get(id);if(!f){f={buckets:new Map(),shadows:[],calls:0,native:0,fallback:0};functions.set(id,f);}const bucket=estimateSize(args);let s=f.buckets.get(bucket);if(!s){s={state:poisoned?'demoted':'js',bucket,calls:0,js:[],times:[],verified:0,pairs:[],cold:0,epochs:0,atCall:null};f.buckets.set(bucket,s);}return {f,s};}
 function transition(id,s,to,extra={}){if(s.state===to)return;s.state=to;s.atCall=s.calls;log('next-scriptc '+JSON.stringify({fn:id,bucket:s.bucket,state:to,calls:s.calls,js:s.js.length?median(s.js):null,native:s.times.length?median(s.times):null,n:s.verified,...extra}));}
 function panic(error){poisoned=true;for(const [id,f] of functions)for(const s of f.buckets.values())transition(id,s,'demoted',{reason:'panic',error:String(error)});}
 function shadow(id,args,result,f,s,jsMs){
  const time=now();f.shadows=f.shadows.filter(t=>time-t<60000);
  if(pending||f.shadows.length>=perMinute)return;
  let input,expected,inputMs;const encodeBegin=now();try{input=encode(id,args);inputMs=now()-encodeBegin;}catch(e){transition(id,s,'demoted',{reason:'invalid JSON'});return;}
  try{expected=canonicalResult(result,schemas[id]);}catch{f.fallback++;return;}
  f.shadows.push(time);pending++;
  // Start after the synchronous caller receives its JS answer. Capturing bytes
  // now isolates mutable caller arguments and results from the background job.
  setImmediate(async()=>{const begin=now();try{
   const sample=nativeSample?await nativeSample(id,input):null;
   const output=sample?sample.value:await nativeAsync(id,input);
   if(output?.fallback===true){f.fallback++;return;}
   const decodeBegin=now(),parsed=unpack(id,output,inputMs);
   const ms=sample?sample.elapsedMs+inputMs+now()-decodeBegin:now()-begin+inputMs;
   if(canonicalResult(parsed,schemas[id])!==expected){transition(id,s,'demoted',{reason:'mismatch',inputHash:createHash('sha256').update(typeof input==='string'?input:serialize(input.map(v=>v instanceof Uint8Array?Array.from(v):v))).digest('hex')});return;}
   if(poisoned||s.state==='demoted')return;
   s.verified++;
   if(s.cold++<policy.coldSamples)return;
   if(!(Number.isFinite(ms)&&ms>=0&&Number.isFinite(jsMs)&&jsMs>0))return;
   s.times.push(ms);s.js.push(jsMs);s.pairs.push([jsMs,ms]);
   if(s.pairs.length===policy.samples){
    const lane=s.state==='native'?'native':'js-final';
    const next=decideLane(s.pairs,lane,policy);
    s.lastDecision={js:s.js,native:s.times,state:next,atCall:s.calls,epoch:++s.epochs};
    transition(id,s,next,{epoch:s.epochs});
    s.pairs=[];s.times=[];s.js=[];
   }
  }catch(e){panic(e);}finally{pending--;}});
 }
 function dispatch(id,js,args){const {f,s}=state(id,args);f.calls++;s.calls++;if(f.calls%10000===0)log('next-scriptc '+JSON.stringify({fn:id,calls:f.calls,native:f.native,fallback:f.fallback}));
  const recheck=mode==='auto'&&s.calls%policy.recheckEvery===0;
  if(!poisoned&&(mode==='native'||s.state==='native')&&s.state!=='demoted'&&pending<maxPending&&!recheck){
   const begin=timing?now():0;let input,valid=true;try{input=encode(id,args);}catch{valid=false;f.fallback++;}
   if(valid)try{const encodeMs=timing?now()-begin:0;pending++;try{const output=native(id,input);if(output?.fallback===true){f.fallback++;}else{const result=unpack(id,output,encodeMs);f.native++;return result;}}finally{pending--;}}catch(e){panic(e);}
  }else if(s.state==='native'&&!recheck)f.fallback++;
  if(mode==='auto'&&s.state==='js'&&s.calls>=jsSamples)transition(id,s,'shadow');
  const learning=s.state==='shadow';
  const due=mode==='auto'&&s.state!=='demoted'&&s.state!=='js'&&s.calls%(learning?sampleEvery:policy.recheckEvery)===0;
  // Ordinary JS calls do no timing, allocation of samples, or serialization.
  const begin=due?now():0,result=js(...args);
  if(due)shadow(id,args,result,f,s,now()-begin);
  return result;
 }
 return {dispatch,panic,get pending(){return pending;},snapshot:()=>Object.fromEntries([...functions].map(([id,f])=>[id,{calls:f.calls,native:f.native,fallback:f.fallback,buckets:[...f.buckets.values()]}]))};
}
