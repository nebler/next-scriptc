import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import path from 'node:path';
import {withBrowserWasm} from 'scriptc-promote/browser/next';
test('Next browser build emits public reactor and scopes both bundler rules to clients',async()=>{
 const root=path.resolve(import.meta.dirname,'../../../examples/shared-native');
 const config=await withBrowserWasm({basePath:'/demo'},{root,sourceDir:'lib',report:()=>{},functions:[{source:'lib/forecast.ts',name:'forecast',sizePath:[0,'trials'],buckets:[9,13,16],key:'58aa1dd1ed19f90bd2292725504961ce7f09588e68332e67372b1c2906db815f'}]});
 const rule=config.turbopack.rules['*'].at(-1);assert.equal(rule.condition.all[1],'browser');assert.ok(JSON.stringify(rule.loaders[0].options));
 const registry=await readFile(path.join(root,'.scriptc/browser/registry.mjs'),'utf8');assert.match(registry,/\/demo\/scriptc\/\w+\.wasm/);
 const url=registry.match(/\/demo\/scriptc\/\w+\.wasm/)[0];await access(path.join(root,'public',url.slice('/demo/'.length)));
 const server={module:{rules:[]}};config.webpack(server,{isServer:true});assert.equal(server.module.rules.length,0);
 const client={module:{rules:[]}};config.webpack(client,{isServer:false});assert.equal(client.module.rules.length,1);
 await assert.rejects(withBrowserWasm({}, {root,sourceDir:'lib',report:()=>{},functions:[{source:'lib/forecast.ts',name:'forecast',sizePath:[0,'trials'],buckets:[9],key:'stale'}]}),/Stale browser calibration/);
});
