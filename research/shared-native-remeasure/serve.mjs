import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const files={
 '/float.wasm':'/tmp/d1b-float-wasm/compute.wasm',
 '/integer.wasm':'/tmp/d1b-integer-wasm/compute.wasm',
 '/float.mjs':new URL('./forecast-float.ts',import.meta.url),
 '/integer.mjs':new URL('../../examples/shared-native/lib/forecast.ts',import.meta.url),
 '/bridge.mjs':new URL('../../packages/next-scriptc/src/cloudflare/bridge.mjs',import.meta.url),
 '/measure.mjs':new URL('../browser-wasm/measure.mjs',import.meta.url),
};
createServer(async(req,res)=>{
 try{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>D1b benchmark</title>');return;}
  if(!files[req.url]){res.writeHead(404).end();return;}
  let data=await readFile(files[req.url]);
  if(req.url==='/float.mjs'||req.url==='/integer.mjs')data=stripTypeScriptTypes(data.toString());
  res.setHeader('Content-Type',req.url.endsWith('.wasm')?'application/wasm':'text/javascript');res.end(data);
 }catch(e){res.writeHead(500).end(String(e));}
}).listen(18997,'127.0.0.1',()=>console.log('http://127.0.0.1:18997'));
