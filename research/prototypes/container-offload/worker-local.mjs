import app from './.output/worker/index.mjs';
import module from './.build/compute.wasm';
import {instantiate} from '../../../packages/next-scriptc/src/cloudflare/bridge.mjs';
import {forward} from './forward.mjs';
let reactor, calls=0, disabled=false;
async function local(request,env){
 const url=new URL(request.url);
 if(url.pathname==='/wasm-state')return Response.json({calls,disabled});
 if(url.pathname==='/numeric'&&url.searchParams.get('compute')==='wasm'&&!disabled){
  const n=Number(url.searchParams.get('n')??100000);
  if(!Number.isInteger(n)||n<0||n>1000000)return new Response('invalid n',{status:400});
  try {
   reactor??=instantiate(module);
   const text=reactor.run(JSON.stringify(n));
   const response=Response.json({value:JSON.parse(text)});
   if(calls++<3||calls%32===0){
    const js=await app.fetch(request,env,{});
    if(await js.text()!==await response.clone().text())throw Error('wasm mismatch');
   }
   response.headers.set('x-co1-compute','wasm');
   return response;
  }catch(error){disabled=true;console.error(error);}
 }
 return app.fetch(request,env,{});
}
export default {fetch:(request,env)=>forward(request,env,local,async r=>{
 const url=new URL(r.url);const origin=url.searchParams.get('fail')==='1'?'http://127.0.0.1:19999':env.ORIGIN;
 return fetch(origin+url.pathname+url.search,{method:r.method,headers:r.headers});
})};
