// Redirect a package lookup in the read-only patched CLI to the stock WASI pack.
const Module=require('node:module');const resolve=Module._resolveFilename;
Module._resolveFilename=function(request,...rest){if(request==='@scriptc/runtime-wasm32-wasi/package.json')return process.env.WASM_RUNTIME_PACK+'/package.json';return resolve.call(this,request,...rest);};
