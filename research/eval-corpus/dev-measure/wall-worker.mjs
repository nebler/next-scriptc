import {createRequire,stripTypeScriptTypes} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {synthesize} from '../../../packages/scriptc-promote/src/functions/promotion-inputs.mjs';
const temp=process.argv[2],{modules,inputs,root}=JSON.parse(await readFile(path.join(temp,'request.json'),'utf8'));
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
const file=process.env.M1_BASELINE_FILE,b=await readFile(file),baseline=JSON.parse(file.endsWith('.gz')?gunzipSync(b):b);
const results=[];
for(const [index,m] of modules.entries()){
 const fn=m.functions[0],id=path.relative(root,m.source).split(path.sep).join('/')+'#'+fn.name,fullId=path.posix.join(process.env.M1_WALL_SCAN_ROOT??'.',id),prior=baseline.find(r=>r.repository===process.env.M1_WALL_REPO&&r.id===fullId);
 try{
  let given=inputs[id]??inputs[fn.id],tuples=given??[8,32,128].map(size=>resize(synthesize(m,fn),size));
  let cases=tuples.map((args,inputIndex)=>({args,inputIndex,inputSource:given?'test-shape-derived':'synthetic'}));
  if(given&&prior?.measurements.some(x=>x.inputSource==='synthetic-fallback'))cases.push(...[8,32,128].map((size,i)=>({args:resize(synthesize(m,fn),size),inputIndex:given.length+i,inputSource:'synthetic-fallback'})));
  for(const old of prior?.measurements??[]){
   if(!old.arguments)continue;
   const signature=JSON.stringify(old.arguments),match=cases.find(c=>c.inputIndex===old.inputIndex&&JSON.stringify(c.args)===signature)??cases.find(c=>c.inputSource===old.inputSource&&JSON.stringify(c.args)===signature);
   const args=match?.args??old.arguments.map((v,i)=>fn.boundary.params[i]==='bytes'?Uint8Array.from(Object.values(v)):v);
   cases=cases.filter(c=>c.inputIndex!==old.inputIndex);cases.push({args,inputIndex:old.inputIndex,inputSource:old.inputSource,nativeArgumentsMatched:JSON.stringify(args)===signature,replay:match?'regenerated-exact':'JSON-replay'});
  }
  cases.sort((a,b)=>a.inputIndex-b.inputIndex);
  const reference=path.join(temp,`wall-reference-${index}.mjs`);await writeFile(reference,stripTypeScriptTypes(m.referenceNative??m.native));const js=(await import(pathToFileURL(reference).href))[fn.name];
  for(const c of cases)try{
   const {args,inputIndex,inputSource}=c;let sink;
   for(let i=0;i<30;i++)sink=js(...args);
   let iterations=1;
   for(let round=0;round<8;round++){const start=performance.now();for(let i=0;i<iterations;i++)sink=js(...args);const ms=performance.now()-start;if(ms>=2)break;iterations=Math.min(10000000,Math.max(iterations+1,Math.ceil(iterations*2.5/Math.max(ms,.001))));}
   const raw=[];
   for(let batch=0;batch<21;batch++){const cpu=process.cpuUsage(),begin=performance.now();for(let i=0;i<iterations;i++)sink=js(...args);const elapsedNs=(performance.now()-begin)*1e6/iterations,delta=process.cpuUsage(cpu),cpuNs=(delta.user+delta.system)*1000/iterations;globalThis.__m1WallSink=sink;raw.push({cpuNs,elapsedNs});}
   const cpu=stats(raw.map(x=>x.cpuNs)),wall=stats(raw.map(x=>x.elapsedNs)),bytes=Buffer.byteLength(JSON.stringify(args));
   results.push({id,status:'js-baseline',reason:'Independent JS elapsed/process-CPU baseline; no native execution in this pass.',inputIndex,inputSource,arguments:args,inputJsonBytes:bytes,nativeArgumentsMatched:c.nativeArgumentsMatched??false,replay:c.replay??'generated',jsCpu:cpu,jsWall:wall,nsPerInputJsonByte:{cpu:cpu.median/bytes,wall:wall.median/bytes},screenPass:wall.median>=100000&&wall.median/bytes>=100,iterationsPerBatch:iterations,rawBatches:raw});
  }catch(e){results.push({id,status:'unmeasured',inputIndex:c.inputIndex,inputSource:c.inputSource,reason:e.message});}
 }catch(e){results.push({id,status:'unmeasured',reason:e.message});}
}
await writeFile(path.join(temp,'result.json'),JSON.stringify(results));
function resize(value,size){
 if(value instanceof Uint8Array)return Uint8Array.from({length:size},(_,i)=>(i*17+13)&255);
 if(Array.isArray(value))return value.length===16?Array.from({length:size},(_,i)=>resize(value[i%value.length],size)):value.map(v=>resize(v,size));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resize(v,size)]));
 if(value==='synthetic')return 'x'.repeat(size);
 return value;
}
