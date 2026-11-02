import config from './offload.json' with {type:'json'};
export async function forward(request, env, local, remote) {
 const url=new URL(request.url);
 const label=(response,path)=>{const r=new Response(response.body,response);r.headers.set('x-co1-path',path);return r;};
 // Only replay-safe reads. Production needs a stricter route-level contract.
 if(request.method!=='GET'||!config.routes.includes(url.pathname)||url.searchParams.get('lane')==='worker')
  return label(await local(request,env),'worker');
 let timer;
 try {
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),config.timeoutMs);});
  const r=await Promise.race([remote(request.clone(),env),timeout]);
  if(r.status>=500){await r.body?.cancel();throw new Error('upstream-'+r.status);}
  return label(r,'node');
 } catch(error) {return label(await local(request,env),'worker-fallback');}
 finally {clearTimeout(timer);}
}
