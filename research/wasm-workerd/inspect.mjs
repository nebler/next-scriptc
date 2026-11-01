import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..'),scratch=root+'/.checks/wasm-workerd';
const require=createRequire(scratch+'/package.json');const wabt=await require('wabt')();
const compiler=process.env.SCRIPTC||'/Users/noah/code/next-scriptc/packages/next-scriptc/node_modules/scriptc/bin/scriptc.exe';
const result={scriptc:spawnSync(compiler,['--version'],{encoding:'utf8'}).stdout.trim(),date:new Date().toISOString(),baseCommit:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),branch:spawnSync('git',['branch','--show-current'],{encoding:'utf8'}).stdout.trim(),node:process.version,v8:process.versions.v8,os:spawnSync('sw_vers',[],{encoding:'utf8'}).stdout,hardware:spawnSync('sysctl',['machdep.cpu.brand_string','hw.memsize'],{encoding:'utf8'}).stdout,zig:spawnSync('zig',['version'],{encoding:'utf8'}).stdout.trim(),workerd:require('workerd/package.json').version,esbuild:require('esbuild/package.json').version,wabt:require('wabt/package.json').version,runtime:require('@scriptc/runtime-wasm32-wasi/package.json').version,artifacts:[],sources:[]};
for(const name of ['sync-original-fixture','revenue','regex','vector']) {
 const bytes=await readFile(scratch+'/'+name+'.wasm'),module=new WebAssembly.Module(bytes);
 const disassembled=wabt.readWasm(bytes,{readDebugNames:true});const wat=disassembled.toText({foldExprs:false,inlineExport:false});
 const simdLines=wat.split('\n').filter(s=>/\b(v128|[if]\d+x\d+)\./.test(s));
 result.artifacts.push({name,rawBytes:bytes.length,gzipBytes:gzipSync(bytes).length,sha256:createHash('sha256').update(bytes).digest('hex'),imports:WebAssembly.Module.imports(module),exports:WebAssembly.Module.exports(module),simdInstructions:simdLines.length,memory:wat.split('\n').find(s=>s.trim().startsWith('(memory ')),simdLines});
}
for(const file of ['examples/demo/lib/revenue.ts','examples/demo/lib/revenue-fixtures.ts','examples/demo/app/api/analytics/revenue/events.ts','examples/demo/app/api/heavy/vectors/route.native.ts','examples/demo/app/api/heavy/vectors/data.ts','examples/demo/app/api/heavy/vectors/common.ts','packages/next-scriptc/src/functions/json.ts','research/wasm-workerd/src/regex.ts','research/wasm-workerd/src/vector.ts'])result.sources.push({file,sha256:createHash('sha256').update(await readFile(root+'/'+file)).digest('hex')});
const native=await readFile(scratch+'/native-functions');result.native={rawBytes:native.length,sha256:createHash('sha256').update(native).digest('hex')};
await mkdir(import.meta.dirname+'/raw/profiles',{recursive:true});
for(const name of ['unchanged','sync-original-fixture','revenue','regex','vector','object-abi','reachable-async'])await copyFile(scratch+'/stage/'+name+'.json',import.meta.dirname+'/raw/profiles/'+name+'.json');
await writeFile(import.meta.dirname+'/raw/artifacts.json',JSON.stringify(result,null,2)+'\n');
