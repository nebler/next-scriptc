// CLI preload for explicit file batches at original source paths. No app code runs.
// Filter only asynchronous source enumeration; TypeScript resolution stays intact.
import fs from 'node:fs';
import path from 'node:path';
import {syncBuiltinESMExports} from 'node:module';
const scope=process.env.DEV_CENSUS_SCOPE_DIR;
if(scope){
 const allowed=new Set(JSON.parse(process.env.DEV_CENSUS_ONLY_FILES)),original=fs.promises.readdir;
 fs.promises.readdir=async function(dir,options){const entries=await original.call(this,dir,options);return path.resolve(String(dir))===path.resolve(scope)?entries.filter(e=>allowed.has(typeof e==='string'?e:e.name)):entries;};
 syncBuiltinESMExports();
}
const selected=process.env.DEV_CENSUS_SOURCE_FILES;
if(selected){
 const root=path.resolve(process.env.DEV_CENSUS_SOURCE_ROOT),entries=new Map(),original=fs.promises.readdir;
 for(const file of JSON.parse(selected)){const parts=path.relative(root,path.resolve(file)).split(path.sep);if(parts[0]==='..')throw Error('Source selection escaped root');let dir=root;for(const part of parts){if(!entries.has(dir))entries.set(dir,new Set());entries.get(dir).add(part);dir=path.join(dir,part);}}
 fs.promises.readdir=async function(dir,options){const rows=await original.call(this,dir,options),p=path.resolve(String(dir));if(p===root||p.startsWith(root+path.sep))return rows.filter(e=>entries.get(p)?.has(typeof e==='string'?e:e.name));return rows;};
 syncBuiltinESMExports();
}
