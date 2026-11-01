import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import os from 'node:os';
// Match the adapter bootstrap: prevent the client import spawning another child.
process.env.NEXT_SCRIPTC_VERCEL='1';
const instance=randomUUID(), modes=['node','sidecar','sync','async'];
const args=size=>['2026-01-01','2026-01-31',size,false];
const hash=text=>createHash('sha256').update(text).digest('hex');
const loaded={};
async function load(mode){
 if(loaded[mode])return loaded[mode];
 if(mode==='node'){const {revenue}=await import('./revenue-js.mjs');return loaded[mode]=a=>revenue(...a);}
 const {serialize}=await import('./json.mjs');
 if(mode==='sidecar'){
  const {createSidecar}=await import('./sidecar.mjs');const {callNative}=await import('./client.mjs');
  const s=createSidecar(new URL('./functions',import.meta.url).pathname);
  return loaded[mode]=async a=>callNative(await s.port(),'revenue',a);
 }
 const addon=createRequire(import.meta.url)('./revenue.node');
 return loaded[mode]=mode==='sync'?a=>JSON.parse(addon.revenueJson(serialize(a))):async a=>JSON.parse(await addon.revenueJsonAsync(serialize(a)));
}
export default async function handler(req,res){
 const start=performance.now();const u=new URL(req.url,'https://local');
 const result={at:new Date().toISOString(),instance,node:process.version,arch:process.arch,platform:process.platform,region:process.env.VERCEL_REGION,cpu:os.cpus()[0],cpus:os.cpus().length,rss:process.memoryUsage().rss,rows:[]};
 try{
 const size=Number(u.searchParams.get('size')||5000);if(![1000,5000,15000,200000].includes(size))throw Error('size');
 const cold=u.pathname.match(/cold-(node|sidecar|sync|async)/)?.[1];
 if(cold){
  const begin=performance.now();const fn=await load(cold);const loadedAt=performance.now();const value=await fn(args(size));const end=performance.now();
  result.cold={mode:cold,size,loadMs:loadedAt-begin,firstCallMs:end-loadedAt,totalMs:end-begin,sha256:hash(JSON.stringify(value)),value};
 }else{
  for(const mode of modes)await load(mode);
  // No precomputed baseline call: the first warmup computes the expected hash.
  let expected;const n=60,warmups=15;result.n=n;result.warmups=warmups;result.size=size;
  for(let i=-warmups;i<n;i++){
   const offset=(i+warmups)%modes.length;
   for(let k=0;k<modes.length;k++){
    const mode=modes[(offset+k)%modes.length],begin=performance.now();
    const value=mode==='sync'?loaded[mode](args(size)):await loaded[mode](args(size));
    const ms=performance.now()-begin,sha256=hash(JSON.stringify(value));
    if(expected===undefined)expected=sha256;
    result.rows.push({i,mode,ms,sha256});
    if(sha256!==expected)throw Error('SHA mismatch');
   }
  }
  result.expectedSha256=expected;
 }
 res.setHeader('Cache-Control','no-store');res.setHeader('Server-Timing',`batch;dur=${(performance.now()-start).toFixed(3)}`);res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
 }catch(error){result.error=error.stack;res.statusCode=500;res.end(JSON.stringify(result));}
}
