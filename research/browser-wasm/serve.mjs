// Local benchmark transport only. No framework, COOP, COEP or SharedArrayBuffer.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const files={
 '/compute.wasm':process.argv[2] || '/tmp/w1-browser-wasm/compute.wasm',
 '/bridge.mjs':new URL('../../packages/next-scriptc/src/cloudflare/bridge.mjs',import.meta.url),
 '/measure.mjs':new URL('./measure.mjs',import.meta.url),
 '/forecast.mjs':new URL('../../examples/shared-native/lib/forecast.ts',import.meta.url),
};
createServer(async(req,res)=>{
 try {
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>W1 benchmark</title>');return;}
  if(!files[req.url]){res.writeHead(404).end();return;}
  let data=await readFile(files[req.url]);
  if(req.url==='/forecast.mjs')data=stripTypeScriptTypes(data.toString());
  res.setHeader('Content-Type',req.url.endsWith('.wasm')?'application/wasm':'text/javascript');res.end(data);
 }catch(error){res.writeHead(500).end(String(error));}
}).listen(18996,'127.0.0.1',()=>console.log('http://127.0.0.1:18996'));
