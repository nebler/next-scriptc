import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {build} from 'vite';
import {scriptcBrowser} from '../src/browser/vite.mjs';
import {instantiate} from '../src/browser/bridge.mjs';
import {forecast} from '../../../examples/shared-native/lib/forecast.ts';
test('Vite client emits a stock reactor, rewrites the shared function and preserves results',async()=>{
 const root=path.resolve(import.meta.dirname,'../../../examples/shared-native');
 const out=await mkdtemp(path.join(os.tmpdir(),'w1-vite-'));
 try {
  const result=await build({root,configFile:false,logLevel:'silent',plugins:[scriptcBrowser({sourceDir:'lib',report:()=>{},functions:[{source:'lib/forecast.ts',name:'forecast',sizePath:[0,'trials'],buckets:[9,13,16]}]})],build:{write:false,minify:false,rollupOptions:{input:path.join(root,'lib/forecast.ts')}}});
  const chunks=result.output;
  const wasm=chunks.find(c=>c.fileName.endsWith('.wasm'));assert.ok(wasm);assert.ok(wasm.source.byteLength>0);
  const code=chunks.filter(c=>c.type==='chunk').map(c=>c.code).join('\n');assert.match(code,/createBrowserDispatcher/);assert.match(code,/\.wasm/);assert.doesNotMatch(code,/node:fs|node:module/);
  const reactor=instantiate(await WebAssembly.compile(wasm.source));
  for(const trials of [1000,10000,100000])for(const seed of [1,42,2147483648,4294967295]){
   const input={trials,seed,cash:250000,revenue:40000,costs:50000};assert.deepEqual(JSON.parse(reactor.run(JSON.stringify([input]))),forecast(input));
  }
 }finally{await rm(out,{recursive:true,force:true});}
});
