import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const app=process.cwd()+'/examples/demo',require=createRequire(app+'/package.json');
const bytes=readFileSync(app+'/.scriptc/cloudflare/compute.wasm'),module=new WebAssembly.Module(bytes);
writeFileSync('research/cloudflare-provider/raw/build.json',JSON.stringify({date:new Date().toISOString(),node:process.version,scriptc:'0.4.6',runtime:require('@scriptc/runtime-wasm32-wasi/package.json').version,opennext:JSON.parse(readFileSync(app+'/node_modules/@opennextjs/cloudflare/package.json')).version,wrangler:require('wrangler/package.json').version,wasmBytes:bytes.length,gzipBytes:gzipSync(bytes).length,workerd:'1.20261023.1',compatibilityDate:'2026-10-30',sha256:createHash('sha256').update(bytes).digest('hex'),imports:WebAssembly.Module.imports(module),exports:WebAssembly.Module.exports(module),profile:JSON.parse(readFileSync(app+'/.scriptc/cloudflare/profile.json')),hardware:spawnSync('sysctl',['machdep.cpu.brand_string','hw.memsize'],{encoding:'utf8'}).stdout},null,2));
