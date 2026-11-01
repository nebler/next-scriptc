import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import inspector from 'node:inspector';
import {createHash} from 'node:crypto';
import os from 'node:os';
import {base,load,declaration,write} from './common.mjs';
import {createRequire} from 'node:module';
const deps=createRequire(path.join(base,'deps/package.json'));
const jsoncsv=deps('json-2-csv'),dateFns=deps('date-fns');
const {v4}=deps('uuid');
const hash=x=>createHash('sha256').update(x).digest('hex');
const group={};
function mark(name,category,fn){const wrap=new Function('fn',`return function ${name}(...args){return fn(...args);}`)(fn);group[name]=category;return wrap;}
const jsonEncode=mark('responseSerialization','c:serialization',JSON.stringify);
const jsonDecode=mark('mockHttpDecode','c:serialization',JSON.parse);
function papermark(n){
 const root=path.join(base,'papermark');
 const playback=load(path.join(root,'lib/video-analytics/playback.ts'));
 const types={documentViewDistribution:'a:current',watchTimeSeconds:'b:optional boundary',countablePlaybackEvents:'b:generic + optional boundary',resolveVideoLength:'b:optional boundary'};
 const promoted=process.env.COVERAGE_ACCEPTED?JSON.parse(fs.readFileSync(process.env.COVERAGE_ACCEPTED)).built:[];
 for(const name of promoted)if(types[name])types[name]='a:current';
 const wrapped=Object.fromEntries(Object.entries(playback).map(([k,v])=>[k,typeof v==='function'&&types[k]?mark('pm_'+k,types[k],v):v]));
 const encoded=JSON.stringify(Array.from({length:n},(_,i)=>({timestamp:new Date(1761955200000+i*10000).toISOString(),view_id:`v${Math.floor(i/60)}`,event_type:'played',start_time:i%60*10,end_time:i%60*10+10,playback_rate:1,volume:1,is_muted:0,is_focused:1,is_fullscreen:0})));
 const route=load(path.join(root,'pages/api/teams/[teamId]/documents/[id]/video-analytics.ts'),{
  '@/pages/api/auth/[...nextauth]':{authOptions:{}},'next-auth/next':{getServerSession:async()=>({user:{id:'u'}})},
  '@/lib/api/rbac/guard':{enforceDocumentMemberScope:async()=>false},'@/lib/prisma':{document:{findFirst:async()=>({versions:[{length:600}]})}},
  '@/lib/tinybird/pipes':{getVideoEventsByDocument:async()=>({data:jsonDecode(encoded)})},'@/lib/video-analytics/playback':wrapped
 });
 group.calculateAnalytics='b:nonexport sync core + Date';
 const validate=output=>{const x=JSON.parse(output).overall;assert.equal(x.unique_views,n/60);assert.equal(x.total_watch_time,n*10);assert.equal(x.view_distribution.length,601);assert.equal(x.view_distribution[0].unique_views,n/60);};
 const res={status(code){if(code!==200)throw Error('HTTP '+code);return this;},json:jsonEncode};
 return {name:`papermark-video-${n}`,fixture:{events:n,viewers:n/60,videoSeconds:600,inputBytes:encoded.length},validate,run:()=>route.default({method:'GET',query:{teamId:'t',id:'d'}},res)};
}
function dub(n){
 const root=path.join(base,'dub/apps/web');
 const convert=load(path.join(root,'lib/analytics/utils/convert-to-csv.ts'),{'json-2-csv':jsoncsv});
 const cols=declaration(path.join(root,'lib/zod/schemas/links.ts'),'exportLinksColumns');
 const formatter=load(path.join(root,'lib/api/links/format-links-for-export.ts'),{
  '@/lib/api/utils/format-money-cents-for-export':{formatMoneyCentsForExport(){throw Error('unused money branch');}},
  '@/lib/zod/schemas/links':{exportLinksColumns:cols},'@dub/utils':{linkConstructor(){throw Error('unused link branch');}}
 });
 const rows=Array.from({length:n},(_,i)=>({id:`link_${i}`,domain:'example.com',key:`hello-${i}`,url:`https://example.com/item/${i}?a="quoted",yes`,clicks:i,leads:i%13,conversions:i%7,createdAt:new Date(1761955200000+i*10000),updatedAt:new Date(1761955200000+i*10000),tags:[{name:'=formula'},{name:'tag,quoted'}],archived:i%2}));
 const imports={
  '@/lib/analytics/utils':{convertToCSV:mark('dub_convert','b:npm json-2-csv + object boundary',convert.convertToCSV)},
  '@/lib/analytics/utils/get-start-end-dates':{getStartEndDates:()=>({})},
  '@/lib/api/links':{getLinksCount:async()=>n},
  '@/lib/api/links/format-links-for-export':{formatLinksForExport:mark('dub_format','b:cross-module + broad boundary',formatter.formatLinksForExport)},
  '@/lib/api/links/get-links-for-workspace':{getLinksForWorkspace:async()=>rows},
  '@/lib/api/links/usage-checks':{throwIfClicksUsageExceeded(){}},
  '@/lib/api/links/validate-links-query-filters':{validateLinksQueryFilters:async()=>({folderIds:[]})},
  '@/lib/auth':{withWorkspace:fn=>fn},'@/lib/constants/misc':{MEGA_WORKSPACE_LINKS_LIMIT:1000000,SORTABLE_LINKS_LIMIT:100000},
  '@/lib/cron':{qstash:{publishJSON(){throw Error('background path not tested');}}},
  '@/lib/zod/schemas/links':{linksExportQuerySchema:{parse:x=>x}},'@dub/utils':{APP_DOMAIN_WITH_NGROK:'https://example.com'},'date-fns':dateFns,'next/server':{NextResponse:Response}
 };
 const route=load(path.join(root,'app/api/links/export/route.ts'),imports);
 return {name:`dub-links-export-${n}`,fixture:{rows:n,columns:9,foregroundLimit:1000},validate:out=>{assert.equal(out.split("\n").length,n+1);assert.match(out,/Destination URL/);assert.match(out,/label|formula/);},run:async()=>{
  const res=await route.GET({searchParams:{columns:['url','clicks','leads','conversions','createdAt','id','updatedAt','tags','archived'],interval:'all'},workspace:{id:'w',totalLinks:n},session:{user:{id:'u'}}});
  return res.text();
 }};
}
function umami(n){
 const root=path.join(base,'umami/src'),constants=load(path.join(root,'lib/constants.ts'));
 const format=load(path.join(root,'lib/format.ts'),{'punycode':deps('node:punycode'),'./constants':constants});
 const data=load(path.join(root,'lib/data.ts'),{'./constants':constants,'./format':format});
 const capture={};
 const save=load(path.join(root,'queries/sql/events/saveEventData.ts'),{
  '@/lib/clickhouse':{enabled:false},'@/lib/constants':constants,'@/lib/crypto':{uuid:mark('umami_uuid','d:already-native crypto dependency',v4)},
  '@/lib/data':{...data,flattenJSON:mark('umami_flatten','b:cross-module + any boundary + closure',data.flattenJSON),getStoredStringValue:mark('umami_stored','b:cross-module + Date formatting',data.getStoredStringValue)},
  '@/lib/db':{PRISMA:'prisma',CLICKHOUSE:'clickhouse',runQuery:x=>x.prisma()},'@/lib/format':format,'@/lib/kafka':{},
  '@/lib/prisma':{client:{eventData:{createMany:async x=>{capture.value=x;}}}}
 });
 group.relationalQuery='b:async sync core extraction';
 const fixture={websiteId:'w',eventId:'e',createdAt:new Date('2026-01-01'),eventData:Object.fromEntries(Array.from({length:n},(_,i)=>[`p${i}`,{value:i+0.125,label:`label-${i}`,active:true,date:'2026-01-01T00:00:00Z',items:[1,2,3]}]))};
 return {name:`umami-saveEventData-${n}`,fixture:{nestedProperties:n,leaves:n*5,inputBytes:JSON.stringify(fixture).length},validate:out=>assert.equal(Number(out),n*5),run:async()=>{await save.saveEventData(fixture);return String(capture.value.data.length);}};
}
const session=new inspector.Session();session.connect();
const post=(name,args={})=>new Promise((resolve,reject)=>session.post(name,args,(e,r)=>e?reject(e):resolve(r)));
function summarize(profile){
 const nodes=new Map(profile.nodes.map(n=>[n.id,n]));const parents=new Map();for(const n of nodes.values())for(const c of n.children??[])parents.set(c,n.id);
 const counts={},frames={},stacks={};let idle=0;
 for(const id of profile.samples){let n=nodes.get(id),chain=[];while(n){chain.push(n);n=nodes.get(parents.get(n.id));}
  if(chain.some(n=>n.callFrame.functionName==='(idle)')){idle++;continue;}
  const marker=chain.find(n=>group[n.callFrame.functionName]);
  const cat=marker?group[marker.callFrame.functionName]:chain.some(n=>n.callFrame.functionName==='(garbage collector)')?'d:GC':chain.some(n=>/node:internal|node:buffer/.test(n.callFrame.url)&&/Response|extractBody|text|Buffer|Readable/.test(n.callFrame.functionName))?'c:Response/framework':'d:other';
  counts[cat]=(counts[cat]??0)+1;
  const f=chain[0]?.callFrame;const key=`${f.functionName||'(anonymous)'} ${f.url.replace(base+'/','')}:${f.lineNumber+1}`;frames[key]=(frames[key]??0)+1;
  const stack=chain.map(n=>n.callFrame.functionName||'(anonymous)').slice(0,12).join(' <- ');stacks[stack]=(stacks[stack]??0)+1;
 }
 const active=profile.samples.length-idle;
 return {intervalUs:500,samples:profile.samples.length,activeSamples:active,idleSamples:idle,counts,shares:Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,100*v/active])),topFrames:Object.entries(frames).sort((a,b)=>b[1]-a[1]).slice(0,30),topStacks:Object.entries(stacks).sort((a,b)=>b[1]-a[1]).slice(0,30)};
}
const selected=process.env.RUN_APPS?.split(",");
const results=selected&&fs.existsSync(new URL("profiles.json",import.meta.url))?JSON.parse(fs.readFileSync(new URL("profiles.json",import.meta.url))).results.filter(r=>!selected.some(a=>r.name.startsWith(a))):[];
for(const task of [papermark(6000),papermark(60000),dub(100),dub(1000),umami(20),umami(100)].filter(t=>!selected||selected.some(a=>t.name.startsWith(a)))){
 if(process.env.CHECK_ONLY){task.validate(await task.run());console.log("validated",task.name);continue;}
 for(let i=0;i<10;i++)await task.run();
 const rounds=[];let last;
 for(let r=0;r<3;r++){
  await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:500});await post('Profiler.start');
  const start=process.cpuUsage();let cpu=0,requests=0;
  // Fixed CPU budget, independent of loaded-host wall time. Setup and fixtures excluded.
  while(cpu<500000){for(let i=0;i<10;i++){last=await task.run();requests++;}const d=process.cpuUsage(start);cpu=d.user+d.system;}
  const measured=process.cpuUsage(start);const {profile}=await post('Profiler.stop');await post('Profiler.disable');
  rounds.push({requests,cpuUs:measured.user+measured.system,cpuUsPerRequest:(measured.user+measured.system)/requests,profile:summarize(profile)});
 }
 task.validate(last);
 results.push({name:task.name,fixture:task.fixture,outputBytes:last.length,sha256:task.name.startsWith('umami')?null:hash(last),rounds});
 write('profiles.json',{node:process.version,arch:process.arch,cpu:os.cpus()[0].model,load:os.loadavg(),method:'V8 inspector CPU sampling; 3 x >=500ms process CPU; 10 warmups; 500us interval; active unweighted samples',results});
 console.log(task.name,rounds.map(r=>r.requests));
}
session.disconnect();
