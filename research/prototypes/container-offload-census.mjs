// Source-only adapter census. Usage: node this-file.mjs /tmp/clone [source-dir]
// Requires TypeScript in the clone and Babel dependencies in scriptc-promote.
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { discoverPromotions } from '../../packages/scriptc-promote/src/functions/promotion-discovery.mjs';
const root=path.resolve(process.argv[2]), source=process.argv[3]||'src', logs=[];
let sourceFiles=0;
async function count(dir){for(const f of await readdir(dir,{withFileTypes:true})){
 if(f.name.startsWith('.')||['node_modules','tests','test'].includes(f.name))continue;
 if(f.isDirectory())await count(path.join(dir,f.name));else if(/\.[cm]?[jt]sx?$/.test(f.name))sourceFiles++;
}}
await count(path.join(root,source));
const modules=await discoverPromotions(root,path.join(root,'dist'),{promotionSourceDir:source,typescript:{tsconfigPath:'tsconfig.json'}},m=>logs.push(m.replaceAll(root,'<app>')));
console.log(JSON.stringify({repository:execFileSync('git',['-C',root,'remote','get-url','origin'],{encoding:'utf8'}).trim(),commit:execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),source,sourceFiles,accepted:modules.flatMap(m=>m.functions.map(f=>({file:path.relative(root,m.source),name:f.name,boundary:f.boundary}))),logs},null,2));
