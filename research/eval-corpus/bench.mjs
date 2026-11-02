// Our harness only. Third-party source is read at runtime, never emitted here.
// node bench.mjs /tmp/checkouts cases.json results.json
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import os from 'node:os';
const repoRoot=process.env.EVAL_REPO_ROOT??path.resolve(path.dirname(new URL(import.meta.url).pathname),'../..');
const {extractFunctions}=await import(pathToFileURL(path.join(repoRoot,'packages/scriptc-promote/src/functions/extract.mjs')));
const require=createRequire(path.join(repoRoot,'packages/scriptc-promote/package.json'));
const ts=require('typescript');
const [base,casesFile,output,nativeDir]=process.argv.slice(2), cases=JSON.parse(fs.readFileSync(casesFile));
let sink; const rows=[];
const nativeBuild=nativeDir?JSON.parse(fs.readFileSync(path.join(repoRoot,'research/eval-corpus/native-build.json'))):null;
const addon=nativeBuild?.compiled.length?require(path.join(nativeDir,'promotion.node')):null;
const schemas=addon?JSON.parse(fs.readFileSync(path.join(nativeDir,'encodings.json'))).functions:null;
const encoding=await import(pathToFileURL(path.join(repoRoot,'packages/scriptc-promote/src/functions/promotion-encodings.mjs')));

function median(xs){return [...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];}
for(const c of cases){try{
 let source=fs.readFileSync(path.join(base,c.repo,c.file),'utf8');
 // Expose private functions without modifying their bodies. Imports fail explicitly.
 if(c.extract) source=extractFunctions(source,path.join(base,c.repo,c.file),c.name).native;
 const temp=fs.mkdtempSync('/tmp/nsc-eval-bench-');
 let fn;
 try {
  const code=ts.transpileModule(source+`\nexport { ${c.name} as __target };`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  fs.writeFileSync(path.join(temp,'source.mjs'),code);
  fn=(await import(pathToFileURL(path.join(temp,'source.mjs')))).__target;
 } finally { fs.rmSync(temp,{recursive:true,force:true}); }
 for(const input of c.inputs){const args=structuredClone(input.args);if(c.typedFirst)args[0]=args[0].map(x=>new Float64Array(x));const bytes=Buffer.byteLength(JSON.stringify(args));
  for(let i=0;i<30;i++)sink=fn(...args);
  const start=process.hrtime.bigint();sink=fn(...args);const probe=Number(process.hrtime.bigint()-start);
  const iterations=Math.max(1,Math.min(10000,Math.ceil(2e6/Math.max(1,probe))));
  const samples=[];const cpu=[];
  for(let batch=0;batch<21;batch++){
   const cp=process.cpuUsage(),t=process.hrtime.bigint();
   for(let i=0;i<iterations;i++)sink=fn(...args);
   samples.push(Number(process.hrtime.bigint()-t)/iterations);
   const used=process.cpuUsage(cp);cpu.push((used.user+used.system)*1000/iterations);
  }
  if(sink===undefined||JSON.stringify(sink)===undefined)throw Error('undefined result');
  const medianNsJs=median(samples);
  let native=null,boundary=null;
  const entry=c.repo==='umami'?nativeBuild?.compiled.find(x=>x.name===c.name):null;
  if(addon&&entry){
   const schema=schemas[entry.id],index=nativeBuild.compiled.indexOf(entry),samples=[],enc=[],stages=[],cpuSamples=[];
   for(let i=-10;i<60;i++){
    const cpuStart=process.cpuUsage(),start=process.hrtime.bigint();
    const wire=encoding.encodeArguments(schema,args),encoded=process.hrtime.bigint();
    const value=addon.run(index,wire);
    const decoded=encoding.decodeResult(schema,value.value,encoding.argumentTable(wire));
    const elapsed=Number(process.hrtime.bigint()-start),cpuUsed=process.cpuUsage(cpuStart);
    if(JSON.stringify(decoded)!==JSON.stringify(sink))throw Error('native parity mismatch');
    if(i>=0){samples.push(elapsed);cpuSamples.push((cpuUsed.user+cpuUsed.system)*1000);enc.push(Number(encoded-start));stages.push(value.timings);}
   }
   native={medianCpuNs:median(cpuSamples),cpuSamplesNs:cpuSamples,medianNs:median(samples),samplesNs:samples,ratioToJs:median(samples)/medianNsJs};
   boundary={encodeMedianNs:median(enc),stages};
  }
  rows.push({repo:c.repo,file:c.file,name:c.name,size:input.size,inputBytes:bytes,iterations,samplesNs:samples,cpuSamplesNs:cpu,medianNs:median(samples),medianCpuNs:median(cpu),nsPerInputByte:median(samples)/bytes,result:sink,native,boundary});
 }
}catch(e){rows.push({repo:c.repo,file:c.file,name:c.name,error:e.message});}}
fs.writeFileSync(output,JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0].model,date:new Date().toISOString(),method:'21 batches, >=2ms target/batch, 30 warmups; elapsed ns and process CPU; synthetic inputs prebuilt; JSON byte length of argument tuple; normal module realm; no endpoint claim',rows},null,2)+'\n');
