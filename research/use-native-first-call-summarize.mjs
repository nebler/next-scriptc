import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const dir = process.env.FIRST_CALL_OUTPUT ?? 'research/use-native-first-call';
const diff = stamps => stamps.slice(1).map((t,i) => +(t-stamps[i]).toFixed(3));
const quantile = (values,q) => values.toSorted((a,b)=>a-b)[Math.ceil(values.length*q)-1];
const rows = [];
for (const file of readdirSync(dir).filter(f=>/^(trace|warm-trace|ready-trace|after|final)-(native|node)-[12]\.json$/.test(f)).sort()) {
  const raw = JSON.parse(readFileSync(`${dir}/${file}`));
  const samples = [...(raw.first?.samples ?? []),...(raw.warm?.samples ?? [])];
  for (const s of samples) { assert(s.valid); assert.equal(s.resultSha256,'58e99230368693d8899627a9c334b197a66005e8504ac2874e55fb6596ef720c'); }
  assert.equal(raw.status, 'complete');
  assert.equal(samples.length, 11);
  assert.equal(new Set(samples.map(s=>s.targetInstance)).size, 1);
  if (raw.label.includes('-native-')) for (const s of samples) assert.equal(s.attempts,'1');
  const row = {label:raw.label,id:raw.id,url:raw.url,status:raw.status,first:raw.first?.samples[0],warm: {count:raw.warm?.samples.length,functionP50:quantile((raw.warm?.samples??[]).map(s=>s.computeMs),.5),functionP95:quantile((raw.warm?.samples??[]).map(s=>s.computeMs),.95),renderP50:quantile((raw.warm?.samples??[]).map(s=>s.renderMs),.5),e2eP50:quantile((raw.warm?.samples??[]).map(s=>s.totalMs),.5)},instances:[...new Set(samples.map(s=>s.targetInstance))]};
  if (raw.label.includes('trace-')) {
    const logs = readFileSync(`${dir}/${raw.label}-logs.jsonl`,'utf8').split('\n').filter(Boolean).map(s=>JSON.parse(s));
    const events = [];
    for (const log of logs) for (const line of (log.data?.message ?? '').split('\n')) {
      for (const prefix of ['scriptc-call ','scriptc-startup ']) if(line.startsWith(prefix)) events.push({...JSON.parse(line.slice(prefix.length)),kind:prefix.trim()});
    }
    row.clients = events.filter(e=>e.side==='client').sort((a,b)=>a.stamps.start-b.stamps.start).map(e=>{
      const t=e.stamps;
      return {...e,intervals:{serialize:t.serialized-t.start,port:t.port-t.serialized,requestToSocket:t.socket-t.port,connect:(t.connect??t.socket)-t.socket,write:t.write-(t.connect??t.socket),headers:t.headers-t.write,body:t.body-t.headers,parse:t.parsed-t.body,total:t.parsed-t.start},cpuMs:e.cpu ? Object.fromEntries(Object.entries(e.cpu).map(([stage,value])=>[stage,(value.user+value.system-e.cpu.start.user-e.cpu.start.system)/1000])) : null,nativeDurations:e.native ? diff(JSON.parse(e.native)) : null};
    });
    row.revenue = events.filter(e=>e.side==='revenue').sort((a,b)=>a.stamps[0]-b.stamps[0]).map(e=>({...e,durations:diff(e.stamps)}));
    row.native = events.filter(e=>e.side==='native').sort((a,b)=>a.stamps[0]-b.stamps[0]).map(e=>({...e,durations:diff(e.stamps)}));
    row.startup = events.filter(e=>e.kind==='scriptc-startup');
  }
  rows.push(row);
}
const result = {deployments:rows.length,successfulRequests:rows.reduce((n,r)=>n+1+r.warm.count,0),protocol:{events:5000,region:'iad1',client:'E3 existing near-client',first:1,subsequent:10,retries:0,nativeStages:['received','body-read','args-parsed','dispatch','user-done','validated','encoded','write-returned'],revenueStages:['start','fixture-ready','fixture-parsed','aggregate-done']},rows};
writeFileSync(`${dir}/summary.json`,JSON.stringify(result)+'\n');
for (const row of rows) console.log(JSON.stringify({label:row.label,url:row.url,first:row.first,warm:row.warm,client:row.clients?.slice(0,2),native:row.native?.slice(0,2),revenue:row.revenue?.slice(0,2)}));
