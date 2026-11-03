import {writeFileSync, renameSync} from 'node:fs';

// A global registry also joins bundled copies of the core in one Node process.
const key=Symbol.for('scriptc-promote.runtime-snapshots.v1');
const registry=globalThis[key]??= {dispatchers:new Set(),started:false};
const median=a=>a.length?[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)]:null;
export function describeSnapshot(functions,config){
 return Object.fromEntries([...functions].map(([id,f])=>[id,{
  calls:f.calls,native:f.native,fallback:f.fallback,
  buckets:[...f.buckets.values()].map(s=>{
   const decision=s.lastDecision, pairs=decision?decision.js.map((js,i)=>[js,decision.native[i]]):s.pairs;
   const previous=decision?.previous??(s.state==='native'?'native':'js-final');
   const threshold=previous==='native'?config.policy.demoteRatio:config.policy.promoteRatio;
   const ratios=pairs.map(([js,native])=>native/js);
   const votes=ratios.filter(r=>previous==='native'?r>threshold:r<threshold).length;
   const jsMedian=median(pairs.map(p=>p[0])),nativeMedian=median(pairs.map(p=>p[1]));
   return {fallbackAttempts:s.fallbackAttempts,fallbackCount:s.fallbackCount,cold:s.cold,atCall:s.atCall,metric:s.metric,wallPairs:s.wallPairs?.map(p=>[...p]),lastDecision:decision?structuredClone(decision):undefined,pairs:s.pairs.map(p=>[...p]),js:[...s.js],times:[...s.times],epochs:s.epochs,nextRecheck:s.nextRecheck,nextSample:s.nextSample,bucket:s.bucket,state:s.state,lane:config.mode==='native'&&s.state!=='demoted'||s.state==='native'?'native':s.state==='demoted'||s.state==='js-final'?'settled':config.mode==='js'?'js':'learning',
    reason:s.reason??(config.mode==='native'?'forced native':config.mode==='js'?'runtime-unavailable':'collecting samples'),calls:s.calls,native:s.nativeCalls??0,
    shadows:s.shadowCount??0,verified:s.verified,mismatches:s.mismatches??0,pending:s.pending,
    fallbackReasons:{...s.fallbackReasons},nativeAttempts:s.nativeAttempts,nativeFallbacks:s.nativeFallbacks,
    decision:{metric:decision?.metric??s.metric??null,ratio:median(ratios),votes,samples:pairs.length,required:config.policy.required,threshold,thresholdHit:pairs.length>=config.policy.samples&&votes>=config.policy.required,jsMedianMs:jsMedian,nativeMedianMs:nativeMedian,epoch:decision?.epoch??0},
    policy:{...config.policy},scheduling:{jsSamples:config.jsSamples,sampleEvery:config.sampleEvery,perMinute:config.perMinute,maxPending:config.maxPending,nextSample:s.nextSample,nextRecheck:s.nextRecheck},
    fallbackPolicy:{window:config.fallbackWindow,threshold:config.fallbackThreshold},boundaryShare:null,
    estimatedCpuSavedMs:decision?.metric==='thread-cpu'&&jsMedian!==null?Math.max(0,jsMedian-nativeMedian)*(s.nativeCalls??0):null};
  })
 }]));
}
export function runtimeSnapshot(){
 const dispatchers=[];
 for(const ref of registry.dispatchers){const d=ref.deref();if(d)dispatchers.push({functions:d.snapshot()});else registry.dispatchers.delete(ref);}
 return {version:1,pid:process.pid,capturedAt:new Date().toISOString(),dispatchers};
}
export function writeRuntimeSnapshot(file=process.env.SCRIPTC_PROMOTE_SNAPSHOT){
 if(!file)throw Error('Snapshot path is required');
 const target=file.replaceAll('%p',String(process.pid)),temporary=target+`.${process.pid}.tmp`;
 writeFileSync(temporary,JSON.stringify(runtimeSnapshot(),null,2)+'\n',{mode:0o600});renameSync(temporary,target);
}
export function registerDispatcher(dispatcher){
 registry.dispatchers.add(new WeakRef(dispatcher));
 if(registry.started||!process.env.SCRIPTC_PROMOTE_SNAPSHOT)return;
 registry.started=true;
 const flush=()=>{try{writeRuntimeSnapshot();}catch{console.error('[scriptc-promote] Could not write runtime snapshot');}};
 const interval=Number(process.env.SCRIPTC_PROMOTE_SNAPSHOT_INTERVAL_MS??10000);
 registry.timer=setInterval(flush,Number.isFinite(interval)&&interval>=100?interval:10000);registry.timer.unref();
 process.once('exit',flush);
}
