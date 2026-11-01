import fs from 'node:fs';
import {write} from './common.mjs';
const {results}=JSON.parse(fs.readFileSync(new URL('profiles.json',import.meta.url)));
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const rows=results.map(t=>{
 const cats=[...new Set(t.rounds.flatMap(r=>Object.keys(r.profile.counts)))];
 const details=Object.fromEntries(cats.map(c=>{const a=t.rounds.map(r=>r.profile.shares[c]??0);return[c,{mean:a.reduce((a,b)=>a+b)/a.length,min:Math.min(...a),max:Math.max(...a)}];}));
 const split=Object.fromEntries(['a','b','c','d'].map(k=>{const a=t.rounds.map(r=>Object.entries(r.profile.shares).filter(([c])=>c.startsWith(k+':')).reduce((s,[,v])=>s+v,0));return [k,{mean:a.reduce((a,b)=>a+b)/a.length,min:Math.min(...a),max:Math.max(...a)}];}));
 return {name:t.name,medianCpuUsPerRequest:median(t.rounds.map(r=>r.cpuUsPerRequest)),totalProfiledCpuUs:t.rounds.reduce((s,r)=>s+r.cpuUs,0),requests:t.rounds.reduce((s,r)=>s+r.requests,0),activeSamples:t.rounds.reduce((s,r)=>s+r.profile.activeSamples,0),split,details};
});
write('summary.json',rows);
const colors=['var(--chart-1,#63b3ed)','var(--chart-2,#b794f4)','var(--chart-3,#94a3b8)','var(--chart-4,#f6ad55)'];
fs.writeFileSync(new URL('shares.html',import.meta.url),`<!doctype html><html><head><meta charset="utf-8"><style>body{font:14px var(--font-sans,system-ui);color:var(--foreground);margin:0}p{color:var(--muted-foreground,#888)}.row{margin:18px 0}.bar{display:flex;height:26px;overflow:hidden;border-radius:4px;margin-top:5px}.seg{display:flex;align-items:center;justify-content:center;color:#111;font-size:12px}.legend{display:flex;gap:14px;flex-wrap:wrap}i{display:inline-block;width:10px;height:10px;margin-right:5px}</style></head><body><p>Mocked server CPU shares · three sampling rounds · no production traffic weighting</p>${rows.map(r=>`<div class="row">${r.name}<div class="bar">${Object.entries(r.split).map(([k,v],i)=>`<span class="seg" style="width:${v.mean}%;background:${colors[i]}" title="${k}: ${v.mean.toFixed(1)}%">${v.mean>=5?v.mean.toFixed(0)+'%':''}</span>`).join('')}</div></div>`).join('')}<div class="legend">${['Current candidate','Blocked compute','Serialization / runtime','Other / GC / native crypto'].map((s,i)=>`<span><i style="background:${colors[i]}"></i>${s}</span>`).join('')}</div><p>Papermark and Dub execute original handlers with mocked services. Umami executes only saveEventData, excluding its HTTP handler. Blocked compute needs multiple gates lifted; it is an upper bound.</p></body></html>`);
console.log(rows.map(r=>[r.name,r.medianCpuUsPerRequest,Object.fromEntries(Object.entries(r.split).map(([k,v])=>[k,v.mean.toFixed(1)]))]));
