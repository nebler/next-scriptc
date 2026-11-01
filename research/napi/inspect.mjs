import {readFile,stat,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {root,scratch,raw,hash,save} from './common.mjs';
const out={artifacts:[],tools:{}};
for(const file of ['revenue.node','revenue.lib.a','revenue-serialized.node','revenue-serialized.lib.a','functions','revenue-linux.node','revenue-linux.lib.a','revenue-linux-serialized.node','revenue-linux-serialized.lib.a']){
 try{const b=await readFile(scratch+'/'+file);out.artifacts.push({file,bytes:b.length,gzipBytes:gzipSync(b).length,sha256:hash(b)});}catch(e){if(e.code!=='ENOENT')throw e;}
}
for(const [tool,args] of [['clang',['--version']],['zig',['version']],['sysctl',['-n','machdep.cpu.brand_string']],['sw_vers',[]]]){const r=spawnSync(tool,args,{encoding:'utf8'});out.tools[tool]={status:r.status,stdout:r.stdout,stderr:r.stderr};}
for(const file of ['scr_core.h','scr_library.c','scr_alloc.c','scr_console.c']){const p='/Users/noah/scriptc/packages/runtime/src/'+file;out.tools[file]={path:p,sha256:hash(await readFile(p))};}
for(const variant of ['','-serialized']){
 for(const [name,tool,args] of [['symbols','nm',['-gU',scratch+'/revenue'+variant+'.node']],['imports','nm',['-u',scratch+'/revenue'+variant+'.node']],['libraries','otool',['-L',scratch+'/revenue'+variant+'.node']],['archive','ar',['-t',scratch+'/revenue'+variant+'.lib.a']]]){
 const r=spawnSync(tool,args,{encoding:'utf8'});await writeFile(root+'/research/napi/logs/'+name+variant+'.log',r.stdout+r.stderr);
 }
}
out.libraryContract='Minimal library profiles emit no contract JSON. sidecar metadata is opt-in for the Model/Msg application-state schema, unrelated to a string function export. raw/profile*.json plus symbol audit record this ABI.';
await save('artifacts',out);
