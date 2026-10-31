// Short C=1 production Next hop on the same single-vCPU VM. No load/throughput claim.
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {start,ready,census,stop} from './repo/examples/demo/bench/processes.mjs';
import {vectorFixture} from './repo/examples/demo/bench/heavy/fixtures.mjs';
import {performance} from 'node:perf_hooks';
import path from 'node:path';
const demo=path.resolve('repo/examples/demo'),body=vectorFixture();
const report={node:process.version,protocol:{concurrency:1,warmup:5,count:20,note:'one vCPU shared by generator and application; no CPU affinity, throughput or C=16 measurement'},variants:[]};
const save=()=>writeFile('http.json',JSON.stringify(report,null,2)+'\n');
let reference;
async function request(url,payload=body){
 const begin=performance.now();const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:payload});const bytes=await r.text();
 return {elapsedMs:performance.now()-begin,status:r.status,body:bytes,initMs:r.headers.get('x-vector-init-ms'),native:r.headers.get('x-next-scriptc')};
}
const go=start(path.resolve('http-go'),[],{cwd:demo,env:{PORT:'3520'}});
try{
 await ready(go,'http://127.0.0.1:3520',{path:'/api/heavy/diagnostics',method:'GET'});
 for(const level of ['baseline','dispatch']){
  await copyFile(`http-${level}`,path.join(demo,'.next/scriptc/route-0'));
  const next=start(process.execPath,['node_modules/next/dist/bin/next','start','-p','3519'],{cwd:demo,env:{NEXT_SCRIPTC_DEMO_GROUPS:'vercel',HEAVY_GO_ORIGIN:'http://127.0.0.1:3520',NEXT_SCRIPTC_BASELINE:''}});
  try{
   const readiness=await ready(next,'http://127.0.0.1:3519',{path:'/api/heavy/diagnostics',method:'GET'});
   report.variants.push({level,startup:readiness,rows:[]});const variant=report.variants.at(-1);await save();
   const cases=[['native-natural','/api/heavy/vectors'],['native-imul','/api/heavy/vectors-imul'],...(level==='baseline'?[['go-plain','/api/heavy-go/vectors?kernel=plain'],['go-simd','/api/heavy-go/vectors?kernel=simd'],['go-plain-imul','/api/heavy-go/vectors-imul?kernel=plain'],['go-simd-imul','/api/heavy-go/vectors-imul?kernel=simd']]:[])];
   for(const [runtime,p] of cases){
    const url='http://127.0.0.1:3519'+p;
    const first=await request(url);
    if(runtime.startsWith('native')&&first.native!=='native')throw new Error('native marker missing');
    if(first.status!==200)throw new Error(`${runtime}: ${JSON.stringify(first)}`);
    if(reference===undefined)reference=first.body;
    if(first.body!==reference)throw new Error('HTTP body parity');
    const changed=await request(url,vectorFixture(123));if(changed.status!==200||changed.body===reference)throw new Error('query dependence');
    const zero=await request(url,Buffer.from(JSON.stringify({embedding:Array(768).fill(0)})));
    const expected=JSON.stringify({results:Array.from({length:10},(_,id)=>({id,score:0}))});
    if(zero.status!==200||zero.body!==expected)throw new Error(`tie oracle ${zero.body}`);
    const invalid=await request(url,Buffer.from('{"embedding":[0]}'));if(invalid.status!==400)throw new Error('invalid input');
    for(let i=0;i<5;i++)if((await request(url)).body!==reference)throw new Error('warm parity');
    const before=await census(next),goBefore=runtime.startsWith('go')?await census(go):null;
    const times=[];
    for(let i=0;i<20;i++){const r=await request(url);if(r.status!==200||r.body!==reference)throw new Error('timed parity');times.push(r.elapsedMs)}
    const after=await census(next),goAfter=runtime.startsWith('go')?await census(go):null;
    variant.rows.push({runtime,path:p,first,times,cpuMs:after.cpuMs-before.cpuMs+(goAfter?goAfter.cpuMs-goBefore.cpuMs:0),rssAfter:after.rssBytes+(goAfter?.rssBytes||0),validation:{queryChanged:true,zeroTieOracle:true,invalidDimension400:true,allTimedBodiesIdentical:true}});
    await save();console.log(level,runtime,times.slice().sort((a,b)=>a-b)[10]);
   }
  }finally{await stop(next);report.variants.at(-1).log=next.output;await save()}
 }
 report.status='complete';
}finally{await stop(go);await save()}
