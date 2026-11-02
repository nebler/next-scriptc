import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
const pids=process.argv.slice(2).map(Number); // front workerd, app workerd, Node AUTO, Node JS
const cpu=()=>pids.map(pid=>{const r=JSON.parse(execFileSync('python3',['../../wasm-workerd/cpu.py',String(pid)],{encoding:'utf8'}));return (r.user_ns+r.system_ns)/1e6;});
const summary=values=>{const a=[...values].sort((a,b)=>a-b);const q=p=>a[Math.floor((a.length-1)*p)];return {n:a.length,p10:q(.1),p50:q(.5),p90:q(.9),min:a[0],max:a.at(-1)};};
const raw={date:new Date().toISOString(),node:process.version,pids,cells:{},checks:[]};
const req=async(url)=>{const t=performance.now(),r=await fetch(url),text=await r.text();assert.equal(r.status,200,text);return {ms:performance.now()-t,text,path:r.headers.get('x-co1-path'),compute:r.headers.get('x-co1-compute')};};
for(const path of ['/trivial?lane=worker','/trivial','/trivial?fail=1','/binding?lane=worker','/binding','/state']){
 const r=await req('http://127.0.0.1:18991'+path);raw.checks.push({requestUrl:path,...r});
}
raw.stateBefore=JSON.parse((await req('http://127.0.0.1:18992/state')).text);
for(const n of [100000,300000]){
 const urls={workerJS:`http://127.0.0.1:18991/numeric?n=${n}&lane=worker`,workerWasm:`http://127.0.0.1:18991/numeric?n=${n}&lane=worker&compute=wasm`,nodeJS:`http://127.0.0.1:18993/numeric?n=${n}`,nodeAuto:`http://127.0.0.1:18992/numeric?n=${n}`,forwardedAuto:`http://127.0.0.1:18991/numeric?n=${n}`};
 let expected;
 for(const url of Object.values(urls))for(let i=0;i<15;i++){const r=await req(url);expected??=r.text;assert.equal(r.text,expected);}
 const names=Object.keys(urls);
 for(const name of names)raw.cells[n+'-'+name]={wall:[],cpuBatches:[],body:expected};
 for(let block=0;block<6;block++)for(let i=0;i<names.length;i++){
  const name=names[(i+block)%names.length],cell=raw.cells[n+'-'+name],before=cpu();
  for(let j=0;j<10;j++){const r=await req(urls[name]);assert.equal(r.text,expected);if(name==='workerWasm')assert.equal(r.compute,'wasm');cell.wall.push(r.ms);}
  cell.cpuBatches.push(cpu().map((v,k)=>(v-before[k])/10));
 }
}
for(const [name,path] of Object.entries({trivialWorker:'/trivial?lane=worker',trivialForward:'/trivial',fallback:'/trivial?fail=1'})){
 const cell=raw.cells[name]={wall:[],cpuBatches:[]};
 for(let i=0;i<30;i++)await req('http://127.0.0.1:18991'+path);
 for(let b=0;b<6;b++){const before=cpu();for(let j=0;j<40;j++){const r=await req('http://127.0.0.1:18991'+path);assert.equal(r.text,'{"ok":true}');cell.wall.push(r.ms);}cell.cpuBatches.push(cpu().map((v,k)=>(v-before[k])/40));}
}
raw.stateAfter=JSON.parse((await req('http://127.0.0.1:18992/state')).text);
for(const cell of Object.values(raw.cells)){cell.summary=summary(cell.wall);cell.cpuSummary=pids.map((_,k)=>summary(cell.cpuBatches.map(b=>b[k])));}
writeFileSync('results/measurement.json',JSON.stringify(raw,null,2));
for(const [name,cell]of Object.entries(raw.cells))console.log(name,JSON.stringify(cell.summary),JSON.stringify(cell.cpuSummary.map(c=>c.p50)));
