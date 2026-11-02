// External source only. Install TypeScript in each application before running.
import {execFileSync} from 'node:child_process';
import {readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {discoverPromotions} from '../packages/scriptc-promote/src/functions/promotion-discovery.mjs';
const pins=new Map([
 ['https://github.com/k0kishima/nuxt3-realworld-example-app.git','88148ef6339be2ee7b396176a4f2eb50047cd563'],
 ['https://github.com/nikolasburk/livestore-tanstack-cloudflare-auth-example.git','b2629833e4f2d5aa0beb204886052d02fff6a48a']
]);
const results=[];
for(const [app,sourceDir] of [[process.argv[2],'.'],[process.argv[3],'src']]){
 const root=path.resolve(app),diagnostics=[];
 const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 const origin=execFileSync('git',['remote','get-url','origin'],{cwd:root,encoding:'utf8'}).trim();
 if(pins.get(origin)!==commit)throw Error('Expected pinned external application commit');
 const modules=await discoverPromotions(root,path.join(root,'.output'),{promotionSourceDir:sourceDir,webpack:true},line=>diagnostics.push(line));
 const files=(await readdir(path.join(root,sourceDir),{recursive:true})).filter(f=>/\.[cm]?[jt]sx?$/.test(f)&&!f.startsWith('.')&&!f.startsWith('node_modules/')).length;
 results.push({origin,commit,sourceDir,files,eligible:modules.length,functions:modules.flatMap(m=>m.functions.map(f=>({file:path.relative(root,m.source),name:f.name}))),diagnostics});
}
await writeFile(new URL('../research/framework-integrations-census.json',import.meta.url),JSON.stringify(results,null,2)+'\n');
console.log(results.map(({diagnostics,...result})=>result));
