import {measurementAddon} from '../../../packages/scriptc-promote/src/report-addon.mjs';
import {execFileSync} from 'node:child_process';
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
const temp=process.argv[2];
const {modules,inputs,root}=JSON.parse(await readFile(path.join(temp,'request.json'),'utf8'));
// Retain schema discriminants without committing copied fixture payloads.
const ts=createRequire(new URL('../../../packages/scriptc-promote/package.json',import.meta.url))('typescript');
const rawInput=process.env.M1_INPUT_RAW?JSON.parse(await readFile(process.env.M1_INPUT_RAW,'utf8')):{};
const schemaRestored=new Set();
for(const m of modules){
 const fn=m.functions[0],id=path.relative(root,m.source).split(path.sep).join('/')+'#'+fn.name,key=Object.hasOwn(inputs,id)?id:fn.id;
 if(!rawInput[key]||!inputs[key])continue;
 const tags=new Set(),prefixes=new Set(),suffixes=new Set(),constants=new Map(),ast=ts.createSourceFile('closure.ts',m.native,ts.ScriptTarget.Latest,true);
 function constantsVisit(n){if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer&&ts.isStringLiteral(n.initializer))constants.set(n.name.text,n.initializer.text);ts.forEachChild(n,constantsVisit);}constantsVisit(ast);
 function visit(n){
  if(ts.isLiteralTypeNode(n)&&ts.isStringLiteral(n.literal))tags.add(n.literal.text);
  if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.arguments[0]){const a=n.arguments[0],value=ts.isStringLiteral(a)?a.text:ts.isIdentifier(a)?constants.get(a.text):null;if(value){if(n.expression.name.text==='startsWith')prefixes.add(value);if(n.expression.name.text==='endsWith')suffixes.add(value);}}
  if(n.kind===ts.SyntaxKind.RegularExpressionLiteral){const match=/^\/\^([A-Za-z_]+)/.exec(n.text);if(match)prefixes.add(match[1]);}
  ts.forEachChild(n,visit);
 }visit(ast);
 function restore(v,r){if(typeof v==='string'){
  if(tags.has(r))return r;
  try{const a=JSON.parse(v),b=JSON.parse(r);return JSON.stringify(restore(a,b));}catch{}
  if(typeof r==='string'){for(const p of [...prefixes].sort((a,b)=>b.length-a.length))if(r.startsWith(p)){v=p+v.slice(p.length);break;}for(const p of [...suffixes].sort((a,b)=>b.length-a.length))if(r.endsWith(p)){v=v.slice(0,-p.length)+p;break;}}
  return v;
 }if(Array.isArray(v))return v.map((x,i)=>restore(x,r?.[i]));if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,restore(x,r?.[k])]));return v;}
 inputs[key]=inputs[key].map((args,i)=>restore(args,rawInput[key][i]));schemaRestored.add(id);
}
const stats=a=>{const s=[...a].sort((a,b)=>a-b);return {n:s.length,min:s[0],p10:s[Math.floor(s.length*.1)],median:s[Math.floor(s.length*.5)],p90:s[Math.floor(s.length*.9)],max:s.at(-1)};};
const results=[],logs=[];
const validIds=new Set(modules.flatMap(m=>[m.functions[0].id,path.relative(root,m.source).split(path.sep).join('/')+'#'+m.functions[0].name]));
for(const id of Object.keys(inputs))if(!validIds.has(id))throw Error('Unknown function input ID: '+id);
const compileBegin=performance.now();let built=[];
try{built=await buildPromotion(modules,path.join(temp,'plain'),{report:m=>logs.push(m)});}catch(e){logs.push(e.stderr?.toString()??e.message);}
const compileMs=performance.now()-compileBegin;let stages=[];
if(built.length)try{stages=await buildPromotion(built,path.join(temp,'stages'),{timing:true,report:m=>logs.push(m)});}catch{}
const addonPath=path.join(temp,'plain/promotion.node');
const timingAddonPath=path.join(temp,'stages/promotion.node');
for(const m of modules){const fn=m.functions[0],id=path.relative(root,m.source).split(path.sep).join('/')+'#'+fn.name,index=built.indexOf(m);
 if(index<0){
  try {
   const reference=path.join(temp,'refused-'+results.length+'.mjs');await writeFile(reference,stripTypeScriptTypes(m.referenceNative??m.native));const js=(await import(pathToFileURL(reference).href))[fn.name];
   const supplied=inputs[id]??inputs[fn.id],tuples=supplied??[8,32,128].map(size=>resize(synthesize(m,fn),size));
   for(const [inputIndex,args] of tuples.entries()){
    const coldBegin=performance.now();let sink=js(...args);const firstJsWallNs=(performance.now()-coldBegin)*1e6;for(let i=0;i<30;i++)sink=js(...args);let iterations=1;
    for(let r=0;r<8;r++){const begin=performance.now();for(let i=0;i<iterations;i++)sink=js(...args);const ms=performance.now()-begin;if(ms>=2)break;iterations=Math.min(10000000,Math.ceil(iterations*2.5/Math.max(ms,.001)));}
    const raw=[];for(let b=0;b<21;b++){const begin=process.cpuUsage();for(let i=0;i<iterations;i++)sink=js(...args);const cpu=process.cpuUsage(begin);raw.push((cpu.user+cpu.system)*1000/iterations);globalThis.__m1Sink=sink;}
    const j=stats(raw),bytes=Buffer.byteLength(JSON.stringify(args));results.push({id,status:'compile-rejected',schemaLiteralTagsRestored:schemaRestored.has(id),compileMs,cold:{sharedBatchCompileWallMs:compileMs,firstJsWallNs,firstNativeWallNs:null},inputIndex,inputSource:supplied?'test-shape-derived':'synthetic',arguments:args,js:j,metric:'process-cpu',native:null,inputJsonBytes:bytes,computeIntensity:j.median/bytes,screenPass:j.median>=100000&&j.median/bytes>=100,verdict:null,jsIterationsPerBatch:iterations,rawJsNs:raw,reason:logs.join('\n')||'Stock compiler rejected function'});
   }
  }catch(e){results.push({id,status:'compile-rejected',reason:logs.join('\n'),inputError:e.message,js:null,native:null,verdict:null,screenPass:null});}
  continue;
 }
 try{
  const addon=await measurementAddon(addonPath,path.join(temp,'plain',`measure-${index}.node`));
  const timingAddon=stages.length?await measurementAddon(timingAddonPath,path.join(temp,'stages',`measure-${index}.node`)):null;
  let tuples=inputs[id]??inputs[fn.id],inputSource='test-shape-derived';
  if(tuples===undefined){inputSource='synthetic';tuples=[8,32,128].map(size=>resize(synthesize(m,fn),size));}
  if(!Array.isArray(tuples)||!tuples.length||tuples.some(t=>!Array.isArray(t)))throw Error('Expected a nonempty array of argument tuples');
  const reference=path.join(temp,`reference-${index}.mjs`);await writeFile(reference,stripTypeScriptTypes(m.referenceNative??m.native));const js=(await import(pathToFileURL(reference).href))[fn.name];
  const providedCount=inputSource==='synthetic'?0:tuples.length,resultStart=results.length;
  // Report each tuple separately: never blend dispatcher size buckets or distributions.
  for(const [inputIndex,args] of tuples.entries()){
   if(providedCount&&inputIndex>=providedCount)inputSource='synthetic-fallback';
   try{
   const schema=fn.boundary,encoded=encodeArguments(schema,args),table=argumentTable(encoded);const firstJsBegin=performance.now(),firstJs=js(...args),firstJsWallNs=(performance.now()-firstJsBegin)*1e6,expected=canonicalResult(firstJs,schema,table);
   const invoke=()=>{const input=encodeArguments(schema,args),out=addon.run(index,input);if(out?.fallback)throw Error('Native fallback; no realizable saving');return decodeResult(schema,out,argumentTable(input));};
   const firstNativeBegin=performance.now(),firstNative=invoke(),firstNativeWallNs=(performance.now()-firstNativeBegin)*1e6;
   if(canonicalResult(firstNative,schema,table)!==expected)throw Error('Native/JS mismatch');
   for(let i=0;i<30;i++){js(...args);invoke();}
   const pairs=[],jsNs=[],nativeNs=[];
   const cpu=!!addon.runShadow&&!!addon.threadCpuMs,now=cpu?()=>{const c=process.cpuUsage();return (c.user+c.system)/1000;}:()=>performance.now();
   let sink, iterations=1;
   for(let round=0;round<8;round++){const begin=performance.now();for(let i=0;i<iterations;i++)sink=js(...args);const ms=performance.now()-begin;if(ms>=2)break;iterations=Math.min(10000000,Math.max(iterations+1,Math.ceil(iterations*2.5/Math.max(ms,.001))));}
   async function pair(){let j,n;const runJS=()=>{const begin=now();for(let i=0;i<iterations;i++)sink=js(...args);j=(now()-begin)*1e6/iterations;globalThis.__m1Sink=sink;};const runNative=async()=>{const begin=now(),input=encodeArguments(schema,args),encode=now()-begin;const out=cpu?await addon.runShadow(index,input):{value:addon.run(index,input)};if(out.value?.fallback)throw Error('Native fallback');const decodeBegin=now(),value=decodeResult(schema,out.value,argumentTable(input));n=(now()-begin)*1e6;if(canonicalResult(value,schema,argumentTable(input))!==expected)throw Error('Native/JS mismatch');};if(pairs.length%2){await runNative();runJS();}else{runJS();await runNative();}return [j,n];}
   for(let i=0;i<stabilityDefaults.coldSamples;i++)await pair();
   for(let i=0;i<60;i++){const [j,n]=await pair();jsNs.push(j);nativeNs.push(n);pairs.push([j,n]);}
   let boundaryShare=null,boundaryStages=null;
   const stageIndex=stages.indexOf(m);
   if(stageIndex>=0){const totals=[],computes=[];for(let i=0;i<10;i++){const begin=performance.now(),input=encodeArguments(schema,args),out=timingAddon.run(stageIndex,input);if(out?.fallback)throw Error('Instrumented native fallback');decodeResult(schema,out.value,argumentTable(input));totals.push((performance.now()-begin)*1e6);computes.push(out.timings.compute*1e6);}const total=stats(totals).median,compute=stats(computes).median;boundaryShare=Math.max(0,Math.min(1,1-compute/total));boundaryStages={n:10,totalWallNs:total,computeWallNs:compute};}
   let cliffCheck=null;
   if(stats(nativeNs).median/stats(jsNs).median<=.9){
    const probe=path.join(temp,'deopt.mjs');
    await writeFile(probe,`import {${fn.name} as f} from ${JSON.stringify(pathToFileURL(reference).href)};const args=${JSON.stringify(args)};let sink;for(let i=0;i<1000;i++)sink=f(...args);console.log('M1_BEGIN');for(let i=0;i<300;i++)sink=f(...args);console.log('M1_END');console.log(typeof sink);`);
    try{const trace=execFileSync(process.execPath,['--trace-deopt',probe],{encoding:'utf8',timeout:60000});const steady=trace.split('M1_BEGIN')[1]?.split('M1_END')[0]??'';cliffCheck={steadyDeopts:(steady.match(/bailout/g)??[]).length,trace,hasRemainder:/(?:%|remainder)/.test(m.referenceNative??m.native),scope:'1000 warm calls then 300 steady calls; diagnostic, not an optimized rewrite'};}catch(e){cliffCheck={status:'unavailable',reason:e.message};}
   }
   const protocolCI=bootstrap(pairs); const bytes=Buffer.byteLength(JSON.stringify(args)),j=stats(jsNs),n=stats(nativeNs),verdict=decideLane(pairs.slice(0,24),'js-final')==='native'?'native':pairs.filter(([a,b])=>b>=a).length>=stabilityDefaults.required?'JS':'unclear';
   results.push({id,status:'ok',schemaLiteralTagsRestored:schemaRestored.has(id),compileMs,cold:{sharedBatchCompileWallMs:compileMs,firstJsWallNs,firstNativeWallNs},cliffCheck,inputIndex,inputSource,inputProvenance:inputSource.startsWith('synthetic')?{kind:inputSource}:process.env.M1_INPUT_META?JSON.parse(await readFile(process.env.M1_INPUT_META,'utf8'))[id]??{kind:'synthetic'}:{kind:'synthetic'},arguments:args,bucket:estimateSize(args),metric:cpu?'process-cpu':'wall',js:j,native:n,inputJsonBytes:bytes,nsPerInputJsonByte:{js:j.median/bytes,native:n.median/bytes},computeIntensity:j.median/bytes,computeIntensityUnit:'JS ns per input JSON byte',boundaryShare,boundaryStages,verdict,policy:stabilityDefaults,protocolCI,protocolPass:cpu&&n.median/j.median<=.90&&protocolCI.upper<1,screenPass:j.median>=100000&&j.median/bytes>=100,jsIterationsPerBatch:iterations,rawPairsNs:pairs,notes:['Native includes checked argument encoding, native execution and result decoding. JS uses the extracted original closure with raw internal calls.','Decision uses an uninstrumented addon and dispatcher paired thresholds; stage share uses a separate instrumented wall probe.','Prediction excludes wrapper overhead, training quotas, traffic distribution, periodic rechecks and host deployment costs. It is not an observed promotion or application saving.']});
   }catch(e){results.push({id,status:'unmeasured',compileStatus:'compiled',inputIndex,inputSource,reason:e.message});}
   if(providedCount&&inputIndex===providedCount-1&&!results.slice(resultStart).some(r=>r.status==='ok'))try{tuples.push(...[8,32,128].map(size=>resize(synthesize(m,fn),size)));}catch(e){results.push({id,status:'unmeasured',compileStatus:'compiled',inputSource:'synthetic-fallback',reason:e.message});}
  }
 }catch(e){results.push({id,status:'unmeasured',compileStatus:'compiled',reason:e.message});}
}
await writeFile(path.join(temp,'result.json'),JSON.stringify(results));

function resize(value,size){
 if(value instanceof Uint8Array)return Uint8Array.from({length:size},(_,i)=>(i*17+13)&255);
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
