import app from './.output/worker/index.mjs';
import {forward} from './forward.mjs';
import config from './offload.json' with {type:'json'};
import {Container,getContainer} from '@cloudflare/containers';
export {ContainerProxy} from '@cloudflare/containers';
export class AppContainer extends Container {defaultPort=8080;sleepAfter='30s';}
export default {fetch:(request,env,ctx)=>forward(request,env,(r,e)=>app.fetch(r,e,ctx),
 async(r,e)=>{
  const stub=getContainer(e.APP,config.instance);
  // Serve the cold request in Workers while startup proceeds in the background.
  if((await stub.getState()).status!=='healthy'){
   ctx.waitUntil(stub.startAndWaitForPorts().catch(error=>console.error('co1 startup',error.message)));
   throw new Error('cold');
  }
  return stub.fetch(r);
 })};
