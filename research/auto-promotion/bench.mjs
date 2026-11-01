import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {revenueCore,mismatchCandidate} from './core.mjs';
import {revenueEventsJson} from './events.mjs';
import {serialize} from './json.mjs';
import {createDispatcher} from './promotion.mjs';
const addon=createRequire(import.meta.url)('./promotion.node');
const ids=JSON.parse(readFileSync(new URL('./ids.json',import.meta.url)));
const run=(id,input)=>addon.run(ids.indexOf(id),input),runAsync=(id,input)=>addon.runAsync(ids.indexOf(id),input);
const tick=()=>new Promise(r=>setImmediate(r));
const hash=s=>createHash('sha256').update(s).digest('hex');
export async function bench(){
 const transitions=[],d=createDispatcher({native:run,nativeAsync:runAsync,log:s=>transitions.push(s)});
 const id=ids[0],sizes=[1000,5000,200000],args=Object.fromEntries(sizes.map(n=>[n,['2026-01-01','2026-01-31',revenueEventsJson(n)]]));
 const expected=Object.fromEntries(sizes.map(n=>[n,hash(serialize(revenueCore(...args[n]),true))]));
 const warmups=[];
 for(const size of sizes){for(let i=1;i<=240;i++){
  const begin=performance.now(),v=d.dispatch(id,revenueCore,args[size]);warmups.push({size,i,ms:performance.now()-begin,hash:hash(serialize(v,true))});
  if(warmups.at(-1).hash!==expected[size])throw Error('warmup mismatch');
  // Wait outside the caller interval for background completion. No shadow is
  // allowed to vanish merely because a synthetic loop monopolizes JS.
  await tick();while(d.pending)await new Promise(r=>setTimeout(r,1));
  const state=d.snapshot()[id].buckets.find(s=>s.bucket===Math.floor(Math.log2(args[size].reduce((a,v)=>a+v.length,0))));
  if(['native','js-final','demoted'].includes(state?.state))break;
 }}
 const rows=[], modes=['js','native','auto'];
 // Exactly 70/20/10 mixed calls per mode, rotated comparison order.
 const mix=[1000,1000,5000,1000,1000,200000,1000,5000,1000,1000];
 for(let i=0;i<100;i++){const size=mix[i%10];for(let j=0;j<3;j++){
  const mode=modes[(i+j)%3],begin=performance.now();
  const v=mode==='js'?revenueCore(...args[size]):mode==='native'?JSON.parse(run(id,serialize(args[size]))):d.dispatch(id,revenueCore,args[size]);
  const ms=performance.now()-begin,sha=hash(serialize(v,true));rows.push({i,size,mode,ms,hash:sha});if(sha!==expected[size])throw Error('output mismatch');
 }}
 // Exercise the compiled second table entry, corrupt its result deliberately.
 const badLog=[],bad=createDispatcher({native:run,nativeAsync:async(id,s)=>String(Number(await runAsync(id,s))+1),jsSamples:2,sampleEvery:1,matches:2,log:s=>badLog.push(s)});
 for(let i=0;i<10;i++){if(bad.dispatch(ids[1],mismatchCandidate,[[1,2,3]])!==6)throw Error('mismatch escaped');await tick();while(bad.pending)await new Promise(r=>setTimeout(r,1));}
 return {node:process.version,region:process.env.VERCEL_REGION,at:new Date().toISOString(),ids,rows,warmups,transitions,snapshot:d.snapshot(),demotion:{snapshot:bad.snapshot(),logs:badLog},overhead:overhead(),initialOverhead:overhead({mode:'auto'})};
}
export function overhead({mode='js'}={}){const d=createDispatcher({mode,jsSamples:Infinity,log:()=>{}}),fn=x=>x+1,args=[1],rows=[];let sink=0;for(let round=0;round<20;round++){const n=10000;let begin=performance.now();for(let i=0;i<n;i++)sink+=fn(...args);const direct=(performance.now()-begin)/n;begin=performance.now();for(let i=0;i<n;i++)sink+=d.dispatch('noop',fn,args);rows.push({direct,dispatch:(performance.now()-begin)/n});}return {n:10000,rounds:20,rows,sink};}
export default async function handler(req,res){try{const start=performance.now(),result=await bench();res.setHeader('Server-Timing',`batch;dur=${performance.now()-start}`);res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));}catch(e){res.statusCode=500;res.end(JSON.stringify({error:e.stack}));}}
