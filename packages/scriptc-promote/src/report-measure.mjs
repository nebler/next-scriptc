import {measurementAddon} from './report-addon.mjs';
// Runs only for explicit --measure. Isolate addon failures from static reporting.
import {stripTypeScriptTypes} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildPromotion} from './functions/promotion-build.mjs';
import {encodeArguments,decodeResult,canonicalResult,argumentTable} from './functions/promotion-encodings.mjs';
import {stabilityDefaults,decideLane} from './functions/promotion-policy.mjs';
import {synthesize} from './functions/promotion-inputs.mjs';
import {estimateSize} from './functions/promotion.mjs';
const temp=process.argv[2];
const {modules,inputs,root}=JSON.parse(await readFile(path.join(temp,'request.json'),'utf8'));
const stats=a=>{const s=[...a].sort((a,b)=>a-b);return {n:s.length,min:s[0],p10:s[Math.floor(s.length*.1)],median:s[Math.floor(s.length*.5)],p90:s[Math.floor(s.length*.9)],max:s.at(-1)};};
const results=[],logs=[];
const validIds=new Set(modules.flatMap(m=>[m.functions[0].id,path.relative(root,m.source).split(path.sep).join('/')+'#'+m.functions[0].name]));
for(const id of Object.keys(inputs))if(!validIds.has(id))throw Error('Unknown function input ID: '+id);
let built=[];
try{built=await buildPromotion(modules,path.join(temp,'plain'),{report:m=>logs.push(m)});}catch(e){logs.push(e.stderr?.toString()??e.message);}
let stages=[];
if(built.length)try{stages=await buildPromotion(built,path.join(temp,'stages'),{timing:true,report:m=>logs.push(m)});}catch{}
const addonPath=path.join(temp,'plain/promotion.node');
const timingAddonPath=path.join(temp,'stages/promotion.node');
for(const m of modules){const fn=m.functions[0],id=path.relative(root,m.source).split(path.sep).join('/')+'#'+fn.name,index=built.indexOf(m);
 if(index<0){results.push({id,status:'compile-rejected',reason:logs.join('\n')||'Stock compiler rejected function'});continue;}
 try{
  let tuples=inputs[id]??inputs[fn.id],inputSource='user-provided';
  if(tuples===undefined){inputSource='synthetic';tuples=[synthesize(m,fn)];}
  if(!Array.isArray(tuples)||!tuples.length||tuples.some(t=>!Array.isArray(t)))throw Error('Expected a nonempty array of argument tuples');
  const reference=path.join(temp,`reference-${index}.mjs`);await writeFile(reference,stripTypeScriptTypes(m.referenceNative??m.native));const js=(await import(pathToFileURL(reference).href))[fn.name];
  // Report each tuple separately: never blend dispatcher size buckets or distributions.
  for(const [inputIndex,args] of tuples.entries()){
   try{
   const addon=await measurementAddon(addonPath,path.join(temp,'plain',`measure-${index}-${inputIndex}.node`));
   const timingAddon=stages.length?await measurementAddon(timingAddonPath,path.join(temp,'stages',`measure-${index}-${inputIndex}.node`)):null;
   const schema=fn.boundary,encoded=encodeArguments(schema,args),table=argumentTable(encoded),expected=canonicalResult(js(...args),schema,table);
   const invoke=()=>{const input=encodeArguments(schema,args),out=addon.run(index,input);if(out?.fallback)throw Error('Native fallback; no realizable saving');return decodeResult(schema,out,argumentTable(input));};
   if(canonicalResult(invoke(),schema,table)!==expected)throw Error('Native/JS mismatch');
   for(let i=0;i<20;i++){js(...args);invoke();}
   const pairs=[],jsNs=[],nativeNs=[];
   const cpu=!!addon.runShadow&&!!addon.threadCpuMs,now=cpu?addon.threadCpuMs:()=>performance.now();
   async function pair(){let j,n;const runJS=()=>{const begin=now();js(...args);j=(now()-begin)*1e6;};const runNative=async()=>{const begin=now(),input=encodeArguments(schema,args),encode=now()-begin;const out=cpu?await addon.runShadow(index,input):{value:addon.run(index,input)};if(out.value?.fallback)throw Error('Native fallback');const decodeBegin=now(),value=decodeResult(schema,out.value,argumentTable(input));n=(cpu?out.cpuMs+encode+now()-decodeBegin:now()-begin)*1e6;if(canonicalResult(value,schema,argumentTable(input))!==expected)throw Error('Native/JS mismatch');};if(pairs.length%2){await runNative();runJS();}else{runJS();await runNative();}return [j,n];}
   for(let i=0;i<stabilityDefaults.coldSamples;i++)await pair();
   for(let i=0;i<stabilityDefaults.samples;i++){const [j,n]=await pair();jsNs.push(j);nativeNs.push(n);pairs.push([j,n]);}
   let boundaryShare=null,boundaryStages=null;
   const stageIndex=stages.indexOf(m);
   if(stageIndex>=0){const totals=[],computes=[];for(let i=0;i<10;i++){const begin=performance.now(),input=encodeArguments(schema,args),out=timingAddon.run(stageIndex,input);if(out?.fallback)throw Error('Instrumented native fallback');decodeResult(schema,out.value,argumentTable(input));totals.push((performance.now()-begin)*1e6);computes.push(out.timings.compute*1e6);}const total=stats(totals).median,compute=stats(computes).median;boundaryShare=Math.max(0,Math.min(1,1-compute/total));boundaryStages={n:10,totalWallNs:total,computeWallNs:compute};}
   const bytes=Buffer.byteLength(JSON.stringify(args)),j=stats(jsNs),n=stats(nativeNs),verdict=decideLane(pairs,'js-final')==='native'?'native':pairs.filter(([a,b])=>b>=a).length>=stabilityDefaults.required?'JS':'unclear';
   results.push({id,status:'ok',inputIndex,inputSource,bucket:estimateSize(args),metric:cpu?'thread-cpu':'wall',js:j,native:n,inputJsonBytes:bytes,nsPerInputJsonByte:{js:j.median/bytes,native:n.median/bytes},computeIntensity:j.median/bytes,computeIntensityUnit:'JS ns per input JSON byte',boundaryShare,boundaryStages,verdict,policy:stabilityDefaults,rawPairsNs:pairs,notes:['Native includes checked argument encoding, native execution and result decoding. JS uses the extracted original closure with raw internal calls.','Decision uses an uninstrumented addon and dispatcher paired thresholds; stage share uses a separate instrumented wall probe.','Prediction excludes wrapper overhead, training quotas, traffic distribution, periodic rechecks and host deployment costs. It is not an observed promotion or application saving.']});
   }catch(e){results.push({id,status:'unmeasured',inputIndex,inputSource,reason:e.message});}
  }
 }catch(e){results.push({id,status:'unmeasured',reason:e.message});}
}
await writeFile(path.join(temp,'result.json'),JSON.stringify(results));
