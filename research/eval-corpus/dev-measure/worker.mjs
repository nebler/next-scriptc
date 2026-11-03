// Runs only for explicit --measure. Isolate addon failures from static reporting.
import {createRequire,stripTypeScriptTypes} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildPromotion} from '../../../packages/scriptc-promote/src/functions/promotion-build.mjs';
import {encodeArguments,decodeResult,canonicalResult,argumentTable} from '../../../packages/scriptc-promote/src/functions/promotion-encodings.mjs';
import {stabilityDefaults,decideLane} from '../../../packages/scriptc-promote/src/functions/promotion-policy.mjs';
import {synthesize} from '../../../packages/scriptc-promote/src/functions/promotion-inputs.mjs';
import {estimateSize} from '../../../packages/scriptc-promote/src/functions/promotion.mjs';
const require=createRequire(import.meta.url),temp=process.argv[2];
const {modules,inputs,root}=JSON.parse(await readFile(path.join(temp,'request.json'),'utf8'));
const stats=a=>{const s=[...a].sort((a,b)=>a-b);return {n:s.length,min:s[0],p10:s[Math.floor(s.length*.1)],median:s[Math.floor(s.length*.5)],p90:s[Math.floor(s.length*.9)],max:s.at(-1)};};
const results=[],logs=[];
const validIds=new Set(modules.flatMap(m=>[m.functions[0].id,path.relative(root,m.source).split(path.sep).join('/')+'#'+m.functions[0].name]));
for(const id of Object.keys(inputs))if(!validIds.has(id))throw Error('Unknown function input ID: '+id);
let built=[];
try{built=await buildPromotion(modules,path.join(temp,'plain'),{report:m=>logs.push(m)});}catch(e){logs.push(e.stderr?.toString()??e.message);}
let stages=[];
if(built.length)try{stages=await buildPromotion(built,path.join(temp,'stages'),{timing:true,report:m=>logs.push(m)});}catch{}
const addon=built.length?require(path.join(temp,'plain/promotion.node')):null;
const timingAddon=stages.length?require(path.join(temp,'stages/promotion.node')):null;
for(const m of modules){const fn=m.functions[0],id=path.relative(root,m.source).split(path.sep).join('/')+'#'+fn.name,index=built.indexOf(m);
 if(index<0){results.push({id,status:'compile-rejected',reason:logs.join('\n')||'Stock compiler rejected function'});continue;}
 try{
  let tuples=inputs[id]??inputs[fn.id],inputSource='user-provided';
  if(tuples===undefined){inputSource='synthetic';tuples=[8,32,128].map(size=>resize(synthesize(m,fn),size));}
  if(!Array.isArray(tuples)||!tuples.length||tuples.some(t=>!Array.isArray(t)))throw Error('Expected a nonempty array of argument tuples');
  const reference=path.join(temp,`reference-${index}.mjs`);await writeFile(reference,stripTypeScriptTypes(m.referenceNative??m.native));const js=(await import(pathToFileURL(reference).href))[fn.name];
  // Report each tuple separately: never blend dispatcher size buckets or distributions.
  for(const [inputIndex,args] of tuples.entries()){
   const schema=fn.boundary,encoded=encodeArguments(schema,args),table=argumentTable(encoded),expected=canonicalResult(js(...args),schema,table);
   const invoke=()=>{const input=encodeArguments(schema,args),out=addon.run(index,input);if(out?.fallback)throw Error('Native fallback; no realizable saving');return decodeResult(schema,out,argumentTable(input));};
   if(canonicalResult(invoke(),schema,table)!==expected)throw Error('Native/JS mismatch');
   for(let i=0;i<30;i++){js(...args);invoke();}
   const pairs=[],jsNs=[],nativeNs=[];
   const cpu=!!addon.runShadow&&!!addon.threadCpuMs,now=cpu?addon.threadCpuMs:()=>performance.now();
   let sink, iterations=1;
   for(let round=0;round<8;round++){const begin=performance.now();for(let i=0;i<iterations;i++)sink=js(...args);const ms=performance.now()-begin;if(ms>=2)break;iterations=Math.min(100000,Math.max(iterations+1,Math.ceil(iterations*2.5/Math.max(ms,.001))));}
   async function pair(){let j,n;const runJS=()=>{const begin=now();for(let i=0;i<iterations;i++)sink=js(...args);j=(now()-begin)*1e6/iterations;};const runNative=async()=>{const begin=now(),input=encodeArguments(schema,args),encode=now()-begin;const out=cpu?await addon.runShadow(index,input):{value:addon.run(index,input)};if(out.value?.fallback)throw Error('Native fallback');const decodeBegin=now(),value=decodeResult(schema,out.value,argumentTable(input));n=(cpu?out.cpuMs+encode+now()-decodeBegin:now()-begin)*1e6;if(canonicalResult(value,schema,argumentTable(input))!==expected)throw Error('Native/JS mismatch');};if(pairs.length%2){await runNative();runJS();}else{runJS();await runNative();}return [j,n];}
   for(let i=0;i<stabilityDefaults.coldSamples;i++)await pair();
   for(let i=0;i<60;i++){const [j,n]=await pair();jsNs.push(j);nativeNs.push(n);pairs.push([j,n]);}
   let boundaryShare=null,boundaryStages=null;
   const stageIndex=stages.indexOf(m);
   if(stageIndex>=0){const totals=[],computes=[];for(let i=0;i<10;i++){const begin=performance.now(),input=encodeArguments(schema,args),out=timingAddon.run(stageIndex,input);if(out?.fallback)throw Error('Instrumented native fallback');decodeResult(schema,out.value,argumentTable(input));totals.push((performance.now()-begin)*1e6);computes.push(out.timings.compute*1e6);}const total=stats(totals).median,compute=stats(computes).median;boundaryShare=Math.max(0,Math.min(1,1-compute/total));boundaryStages={n:10,totalWallNs:total,computeWallNs:compute};}
   const protocolCI=bootstrap(pairs); const bytes=Buffer.byteLength(JSON.stringify(args)),j=stats(jsNs),n=stats(nativeNs),verdict=decideLane(pairs.slice(0,24),'js-final')==='native'?'native':pairs.filter(([a,b])=>b>=a).length>=stabilityDefaults.required?'JS':'unclear';
   results.push({id,status:'ok',inputIndex,inputSource,bucket:estimateSize(args),metric:cpu?'thread-cpu':'wall',js:j,native:n,inputJsonBytes:bytes,nsPerInputJsonByte:{js:j.median/bytes,native:n.median/bytes},computeIntensity:j.median/bytes,computeIntensityUnit:'JS ns per input JSON byte',boundaryShare,boundaryStages,verdict,policy:stabilityDefaults,protocolCI,protocolPass:cpu&&n.median/j.median<=.90&&protocolCI.upper<1,screenPass:j.median>=100000&&j.median/bytes>=100,jsIterationsPerBatch:iterations,rawPairsNs:pairs,notes:['Native includes checked argument encoding, native execution and result decoding. JS uses the extracted original closure with raw internal calls.','Decision uses an uninstrumented addon and dispatcher paired thresholds; stage share uses a separate instrumented wall probe.','Prediction excludes wrapper overhead, training quotas, traffic distribution, periodic rechecks and host deployment costs. It is not an observed promotion or application saving.']});
  }
 }catch(e){results.push({id,status:'unmeasured',compileStatus:'compiled',reason:e.message});}
}
await writeFile(path.join(temp,'result.json'),JSON.stringify(results));

function resize(value,size){
 if(Array.isArray(value))return value.length===16?Array.from({length:size},(_,i)=>resize(value[i%value.length],size)):value.map(v=>resize(v,size));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resize(v,size)]));
 if(value==='synthetic')return 'x'.repeat(size);
 return value;
}
function bootstrap(pairs){
 let seed=1;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};const ratios=[];
 for(let b=0;b<2000;b++){let j=0,n=0;for(let i=0;i<pairs.length;i+=5){let start=Math.floor(rand()*pairs.length);for(let k=0;k<5&&i+k<pairs.length;k++){const p=pairs[(start+k)%pairs.length];j+=p[0];n+=p[1];}}ratios.push(n/j);}
 ratios.sort((a,b)=>a-b);return {lower:ratios[50],upper:ratios[1950],resamples:2000,block:5,seed:1};
}
