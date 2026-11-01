// Held-out correctness only: no native timing, no upstream source artifact.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {base,ts,load} from './coverage-baseline/common.mjs';
import {promotionCandidates} from '../packages/next-scriptc/src/functions/promotion-discovery.mjs';
import {checkFunctionTypes} from '../packages/next-scriptc/src/functions/types.mjs';
import {buildPromotion} from '../packages/next-scriptc/src/functions/promotion-build.mjs';
import {loadPromotion} from '../packages/next-scriptc/src/functions/promotion-runtime.mjs';
const file=path.join(base,'papermark/lib/video-analytics/playback.ts'),text=await fs.readFile(file,'utf8');
const config=ts.readConfigFile(path.join(base,'papermark-actual.json'),ts.sys.readFile).config;
const options=ts.parseJsonConfigFileContent(config,ts.sys,base).options;
const program=ts.createProgram([file],options),js=load(file);
const wanted=['watchTimeSeconds','resolveVideoLength'];
const modules=promotionCandidates(text,file,()=>{}).filter(m=>wanted.includes(m.functions[0].name));checkFunctionTypes(ts,program,modules);
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'optional-heldout-'));
try{
 const reports=[];const built=await buildPromotion(modules,dir,{report:x=>reports.push(x)});
 const d=loadPromotion(dir+'/promotion.node',{mode:'native',fallbackWindow:10000,log:()=>{},crashGuard:{directory:dir+'/markers'}});
 const results=[];
 const shadow=loadPromotion(dir+'/promotion.node',{jsSamples:1,sampleEvery:1,log:()=>{},crashGuard:{directory:dir+'/markers'}});
 // Inputs follow the unchanged endpoint fixture in K1; optional and null probes
 // add correctness coverage, without changing or tuning application code.
 const events=Array.from({length:6000},(_,i)=>({timestamp:new Date(1761955200000+i*10000).toISOString(),view_id:`v${Math.floor(i/60)}`,event_type:'played',start_time:i%60*10,end_time:i%60*10+10,playback_rate:1,volume:1,is_muted:0,is_focused:1,is_fullscreen:0}));
 for(const m of built){const fn=m.functions[0];const large=Array.from({length:60000},(_,i)=>events[i%events.length]);const cases=fn.name==='watchTimeSeconds'?[[large],[events],[events.map(({view_id,...e})=>e)],[events.map(e=>({...e,view_id:undefined}))]]:[[600,large],[600,events],[undefined,events],[null,events]];
 for(const args of cases){const expected=js[fn.name](...args),actual=d.dispatch(fn.id,js[fn.name],args);assert.deepEqual(actual,expected);assert.equal(JSON.stringify(actual),JSON.stringify(expected));}
 for(const args of cases){shadow.dispatch(fn.id,js[fn.name],args);await new Promise(r=>setImmediate(r));while(shadow.pending)await new Promise(r=>setTimeout(r,5));}
 assert.ok(shadow.snapshot()[fn.id].buckets.some(b=>b.verified>0));
 assert.ok(shadow.snapshot()[fn.id].buckets.every(b=>b.state!=='demoted'));
 results.push({shadow:shadow.snapshot()[fn.id],name:fn.name,cases:cases.length,...d.snapshot()[fn.id]});
 }
 const output={compiler:'stock 0.4.6',built:built.map(m=>m.functions[0].name),reports,results};await fs.mkdir(new URL('./optional-boundaries/',import.meta.url),{recursive:true});await fs.writeFile(new URL('./optional-boundaries/heldout-correctness.json',import.meta.url),JSON.stringify(output,null,2)+'\n');console.log(output);
}finally{await fs.rm(dir,{recursive:true,force:true});}
