import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import os from 'node:os';
import * as p from './papermark/entry.ts';
import { convertToCSV } from './dub/entry.ts';
import { flattenJSON } from './umami/entry.ts';
import { calculateTtcTotal } from './formbricks/entry.ts';
import { parseResult } from './twenty/entry.ts';
import { intersect } from './cal/entry.ts';
import dayjs from 'dayjs';
import { calculateAnalytics } from './papermark/analytics.ts';
const results=[];
function bench(name, fixture, fn) {
  for(let i=0;i<10;i++) fn(fixture);
  const times=[]; const cpu=[]; let result;
  for(let i=0;i<30;i++) {
    const c=process.cpuUsage(), t=performance.now();
    result=fn(fixture);
    times.push(performance.now()-t);
    const delta=process.cpuUsage(c); cpu.push((delta.user+delta.system)/1000);
  }
  times.sort((a,b)=>a-b); cpu.sort((a,b)=>a-b);
  const bytes=JSON.stringify(result);
  results.push({name,inputBytes:JSON.stringify(fixture).length,medianMs:times[14],p95Ms:times[28],medianCpuMs:cpu[14],outputBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),timesMs:times,cpuMs:cpu});
}
// Ten-second playback heartbeats over a ten-minute video. Multiple events per viewer.
for (const n of [600,6000,60000]) {
 const events=Array.from({length:n},(_,i)=>({view_id:`v${Math.floor(i/60)}`,event_type:'played',start_time:(i%60)*10,end_time:(i%60)*10+10}));
 bench(`papermark distribution ${n} events`, events, e=>p.documentViewDistribution(e,600));
 bench(`papermark watch ${n} events`, events, p.watchTimeSeconds);
}
for(const n of [100,1000,10000]) {
 const rows=Array.from({length:n},(_,i)=>({id:`link_${i}`,domain:'example.com',key:`hello-${i}`,url:`https://example.com/item/${i}`,clicks:i,leads:i%13,sales:i%7,country:'DE',title:'A real, quoted "title"',createdAt:'2026-01-01T12:00:00.000Z'}));
 bench(`dub CSV ${n} rows`,rows,convertToCSV);
}
for(const n of [20,100,1000]) bench(`umami flatten ${n} props`,Object.fromEntries(Array.from({length:n},(_,i)=>[`p${i}`,{value:i,label:`label${i}`} ])),flattenJSON);
for(const n of [20,100]) bench(`formbricks TTC ${n} questions`,Object.fromEntries(Array.from({length:n},(_,i)=>[`q${i}`,i])),calculateTtcTotal);
for(const n of [100,1000]) bench(`twenty parse ${n} records`,Array.from({length:n},(_,i)=>({id:`r${i}`,__typename:'__Person',COMPOSITE___name_firstName:'Alice',COMPOSITE___name_lastName:'Smith',email:`p${i}@example.com`,city:'Berlin'})),parseResult);
for(const n of [5,20,100]) {
 const ranges=Array.from({length:n},(_,u)=>Array.from({length:22},(_,d)=>({start:dayjs('2026-11-01').add(d,'day').add(9+u%2,'hour'),end:dayjs('2026-11-01').add(d,'day').add(17,'hour')})));
 bench(`cal intersection ${n} users 22 days`,ranges,intersect);
}
for(const n of [600,6000,60000]) {
 const events=Array.from({length:n},(_,i)=>({timestamp:new Date(1761955200000+i*10000).toISOString(),view_id:`v${Math.floor(i/60)}`,event_type:'played',start_time:(i%60)*10,end_time:(i%60)*10+10,playback_rate:1,volume:1,is_muted:0,is_focused:1,is_fullscreen:0}));
 bench(`papermark full analytics ${n} events`,events,e=>calculateAnalytics(e,600));
 bench(`papermark distribution full records ${n} events`,events,e=>p.documentViewDistribution(e,600));
 const encoded=JSON.stringify(events);
 bench(`papermark JSON boundary distribution ${n} events`,encoded,s=>JSON.stringify(p.documentViewDistribution(JSON.parse(s),600)));
}
console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0].model,warmups:10,samples:30,results},null,2));
