// Our harness only. Papermark source and generated extracted modules stay outside this repo.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {withScriptc} from '../../packages/next-scriptc/src/index.mjs';
import {discoverPromotions} from '../../packages/next-scriptc/src/functions/promotion-discovery.mjs';
import {buildPromotion} from '../../packages/next-scriptc/src/functions/promotion-build.mjs';
import {loadPromotion} from '../../packages/next-scriptc/src/functions/promotion-runtime.mjs';
import {createDispatcher} from '../../packages/next-scriptc/src/functions/promotion.mjs';
import {canonicalResult} from '../../packages/next-scriptc/src/functions/promotion-encodings.mjs';
import loader from '../../packages/next-scriptc/src/functions/loader.mjs';
const require=createRequire(import.meta.url);
const project=process.env.PAPERMARK_SLICE??'/Users/noah/code/papermark-gate-slice';
const target=process.argv[2]??`${process.platform}-${process.arch}`;
const output=path.join(project,'.next',target);
const source=path.join(project,'lib/video-analytics/playback.ts');
assert.equal(createHash('sha256').update(await readFile(source)).digest('hex'),'9bf4d1fc55df8588be0804d333c2e42e6ade6e4a8404847a2cc380809c60e3e2','Papermark source must remain unchanged at the pinned commit');
const config=withScriptc({}, {nativePromotion:'auto'});
const reports=[];
const modules=await discoverPromotions(project,path.join(project,'.next'),config,s=>reports.push(s));
assert.deepEqual(modules.map(m=>m.functions[0].name),['documentViewDistribution']);
const accepted=process.env.GATE_VERIFY_ONLY?modules:await buildPromotion(modules,output,{target,report:s=>reports.push(s)});
const record={commit:'ed19717ec02a1ac79aecf5569159aa9d2d869312',path:'lib/video-analytics/playback.ts',target,sourceSha256:createHash('sha256').update(await readFile(source)).digest('hex'),reports,candidates:modules.map(m=>({name:m.functions[0].name,boundary:m.functions[0].boundary})),compiled:accepted.map(m=>m.functions[0].name)};
await mkdir(new URL('.',import.meta.url),{recursive:true});
if(!accepted.length){await writeFile(new URL(`./${target}.json`,import.meta.url),JSON.stringify(record,null,2)+'\n');throw Error('No candidates compiled');}
if(![`${process.platform}-${process.arch}`,`${process.platform}-${process.arch}-gnu`].includes(target)){await writeFile(new URL(`./${target}.json`,import.meta.url),JSON.stringify(record,null,2)+'\n');process.exit(0);}
const ts=require(require.resolve('typescript',{paths:[project]}));
const original=ts.transpileModule(await readFile(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
await writeFile(path.join(output,'original.mjs'),original);
const js=(await import(pathToFileURL(path.join(output,'original.mjs')))).documentViewDistribution;
const fn=accepted[0].functions[0],file=path.join(output,'promotion.node');
const logs=[];
// Keep all calls shadowing and avoid any lane decision from loaded-host clocks.
const options={jsSamples:1,sampleEvery:1,perMinute:1000,policy:{samples:1000,required:1000,coldSamples:0},log:s=>logs.push(s)};
const dispatcher=loadPromotion(file,options);
globalThis[Symbol.for('next-scriptc.functions.promotion')]=new Map([[file,dispatcher]]);
const transformed=loader.call({resourcePath:source,getOptions:()=>({modules:{[source]:accepted[0]},server:true,promotionFile:file,promotionClient:new URL('../../packages/next-scriptc/src/functions/promotion-client.mjs',import.meta.url).pathname})},await readFile(source,'utf8'));
await writeFile(path.join(output,'wrapped.mjs'),ts.transpileModule(transformed,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const wrapped=(await import(pathToFileURL(path.join(output,'wrapped.mjs')))).documentViewDistribution;
const event=(i,start,end)=>({view_id:`viewer-${Math.floor(i/60)}-東京-😀`,event_type:'played',start_time:start,end_time:end,timestamp:'2026-10-01T00:00:00.000Z',volume:1,playback_rate:1,muted:false,optional_note:null});
const cases=[['empty',[],0],['empty-video',[],600],['single',[event(0,0,1)],1],['unicode',[{...event(0,0,2),view_id:'é e\u0301 雪 😀 \u0000'}],2],['negative-zero',[event(0,-0,1)],-0],['large-number',[event(0,2**40,2**40+2)],2],['fractional-overlap',[event(0,-1.5,2.1),event(0,0.1,3.2),event(60,0,2)],3],['reversed',[event(0,4,1)],2]];
for(const n of [60,600,6000,60000])cases.push([`history-${n}`,Array.from({length:n},(_,i)=>event(i,(i%60)*10,(i%60+1)*10)),600]);
record.cases=[];
for(const [name,events,length] of cases){
 const expected=canonicalResult(js(events,length),fn.boundary);
 const before=dispatcher.snapshot()[fn.id]?.buckets.reduce((n,b)=>n+b.verified,0)??0;
 assert.equal(canonicalResult(wrapped(events,length),fn.boundary),expected);
 while(dispatcher.pending)await new Promise(r=>setTimeout(r,5));
 const state=dispatcher.snapshot()[fn.id];
 assert.equal(state.buckets.reduce((n,b)=>n+b.verified,0),before+1,JSON.stringify({name,logs,state}));
 assert.ok(state.buckets.every(b=>b.state!=='demoted'));
 record.cases.push({name,events:events.length,bytes:Buffer.byteLength(expected),sha256:createHash('sha256').update(expected).digest('hex'),verified:true});
}
record.shadow=dispatcher.snapshot();record.logs=logs;
const addon=require(file);let nativeAnswers=0;
const badLogs=[];
const bad=createDispatcher({...options,log:s=>badLogs.push(s),schemas:{[fn.id]:fn.boundary},native:()=>{nativeAnswers++;throw Error('unexpected native answer');},nativeSample:async(_id,input)=>{const sample=await addon.runShadow(0,input);return {...sample,value:'[]'};}});
const args=[[event(0,0,1)],1];
for(let i=0;i<3;i++){assert.deepEqual(bad.dispatch(fn.id,js,args),js(...args));while(bad.pending)await new Promise(r=>setTimeout(r,5));}
assert.equal(bad.snapshot()[fn.id].buckets[0].state,'demoted');assert.equal(nativeAnswers,0);assert.ok(badLogs.some(s=>s.includes('mismatch')));
record.mismatch={state:'demoted',nativeAnswers,logs:badLogs};
// Deliberately omit all sampled durations: this is a correctness gate.
for(const f of Object.values(record.shadow))for(const b of f.buckets){delete b.js;delete b.times;delete b.pairs;delete b.lastDecision;}
await writeFile(new URL(`./${target}.json`,import.meta.url),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({target,compiled:record.compiled,cases:record.cases.length,mismatch:record.mismatch.state}));
