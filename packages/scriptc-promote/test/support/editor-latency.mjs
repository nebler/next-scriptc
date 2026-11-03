// Run from any directory: node packages/scriptc-promote/test/support/editor-latency.mjs
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {Worker} from 'node:worker_threads';
const require=createRequire(import.meta.url), ts=require('typescript');
const init=require('../../src/ts-plugin/index.cjs');
const repo=fileURLToPath(new URL('../../../../',import.meta.url));
const percentile=(samples,p)=>samples.toSorted((a,b)=>a-b)[Math.floor((samples.length-1)*p)];
for(const relative of ['examples/demo/lib/native-example.ts','examples/shared-native/lib/forecast.ts']) {
  const file=path.join(repo,relative),root=path.dirname(path.dirname(file));
  const config=ts.readConfigFile(path.join(root,'tsconfig.json'),ts.sys.readFile);
  const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,root);
  const text=ts.sys.readFile(file);
  const host={getScriptFileNames:()=>[file],getScriptVersion:()=> '1',getScriptSnapshot:f=>ts.sys.fileExists(f)?ts.ScriptSnapshot.fromString(ts.sys.readFile(f)):undefined,getCurrentDirectory:()=>root,getCompilationSettings:()=>parsed.options,getDefaultLibFileName:o=>ts.getDefaultLibFilePath(o),fileExists:ts.sys.fileExists,readFile:ts.sys.readFile,readDirectory:ts.sys.readDirectory};
  const base=ts.createLanguageService(host);
  let done;const ready=new Promise(resolve=>done=resolve);
  const plugin=init({typescript:ts}).create({languageService:base,languageServiceHost:host,config:{debounceMs:20},project:{refreshDiagnostics:()=>done()}});
  const begin=performance.now();plugin.getSemanticDiagnostics(file);
  let timeout; await Promise.race([ready,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('analysis timeout')),10000);})]);
  const readyMs=performance.now()-begin; clearTimeout(timeout);
  for(let i=0;i<20;i++){base.getSemanticDiagnostics(file);plugin.getSemanticDiagnostics(file);}
  const added=[];
  for(let i=0;i<200;i++){
    let start=performance.now();base.getSemanticDiagnostics(file);const before=performance.now()-start;
    start=performance.now();plugin.getSemanticDiagnostics(file);added.push(performance.now()-start-before);
  }
  plugin.dispose();
  const worker=new Worker(new URL('../../src/ts-plugin/worker.mjs',import.meta.url));
  const job={file,root,overlays:{[file]:text},options:parsed.options};
  const run=id=>new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.postMessage({...job,id});});
  const cold=await run(1);if(cold.error)throw Error(cold.error);
  const start=performance.now(),warm=await run(2),cacheMs=performance.now()-start;
  await worker.terminate();
  console.log(JSON.stringify({file:relative,chars:text.length,readyMs,analysisMs:cold.analysisMs,workerCacheRoundTripMs:cacheMs,cached:warm.cached,addedP50Ms:percentile(added,.5),addedP95Ms:percentile(added,.95)}));
}
