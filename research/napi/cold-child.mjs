// Start timing before loading any workload or addon modules.
const begin=performance.now();
const [mode,sizeText]=process.argv.slice(2),size=Number(sizeText),args=['2026-01-01','2026-01-31',size,false];
let value,loaded,extra={};
if(mode==='node'){
 const {revenue}=await import('../../.checks/napi/stage/revenue-js.mjs');loaded=performance.now();value=await revenue(...args);
}else if(mode==='sidecar'){
 const {createSidecar}=await import('../../.checks/napi/stage/sidecar.mjs');
 const {callNative}=await import('../../.checks/napi/stage/client.mjs');
 const s=createSidecar(new URL('../../.checks/napi/functions',import.meta.url).pathname);
 loaded=performance.now();try{value=await callNative(await s.port(),'revenue',args);extra.sidecarReadyMs=s.state.readyMs;}finally{s.stop();}
}else{
 const {createRequire}=await import('node:module');
 const a=createRequire(import.meta.url)(mode.startsWith('serial')?'../../.checks/napi/revenue-serialized.node':'../../.checks/napi/revenue.node');loaded=performance.now();
 if(mode==='echoSync'||mode==='serialEchoSync')value=a.echo('x');else if(mode==='echoAsync'||mode==='serialEchoAsync')value=await a.echoAsync('x');
 else value=JSON.parse((mode==='sync'||mode==='serialSync')?a.revenueJson(JSON.stringify(args)):await a.revenueJsonAsync(JSON.stringify(args)));
}
const end=performance.now();
const {createHash}=await import('node:crypto');
console.log(JSON.stringify({mode,size,loadMs:loaded-begin,firstCallMs:end-loaded,totalMs:end-begin,uptimeMs:process.uptime()*1000,sha256:createHash('sha256').update(JSON.stringify(value)).digest('hex'),...extra}));
