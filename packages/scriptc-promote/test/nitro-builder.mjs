import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {createBuilder} from 'vite';
import {scriptcPromote} from '../src/vite.mjs';
import {scriptcNitro} from '../src/nitro.mjs';

test('Nitro skips dev and rejects non-Node output',()=>{
 scriptcNitro().setup({options:{dev:true}});
 assert.throws(()=>scriptcNitro().setup({options:{preset:'cloudflare'}}),/node-server/);
});

test('builder API isolates client and two server compilations without build.ssr',{timeout:120000},async()=>{
 const root=await mkdtemp(path.resolve(import.meta.dirname,'../.builder-'));
 try{
  await mkdir(path.join(root,'src'));
  await writeFile(path.join(root,'package.json'),'{"type":"module"}');
  await writeFile(path.join(root,'tsconfig.json'),'{"compilerOptions":{"strict":true,"target":"ESNext"}}');
  await writeFile(path.join(root,'src/entry.ts'),'export function checksum(n:number):number{let sum=0;for(let i=0;i<n;i++)sum+=i*i;return sum;}');
  const environments=Object.fromEntries(['client','ssr','other'].map(name=>[name,{consumer:name==='client'?'client':'server',build:{outDir:name,lib:{entry:path.join(root,'src/entry.ts'),formats:['es']}}}]));
  const builder=await createBuilder({root,configFile:false,logLevel:'silent',plugins:[scriptcPromote()],environments});
  for(const name of ['ssr','client','other'])await builder.build(builder.environments[name]);
  assert.ok(!(await readdir(path.join(root,'client'))).includes('scriptc-promotion'));
  for(const name of ['ssr','other']){
   assert.ok((await readFile(path.join(root,name,'scriptc-promotion/promotion.node'))).length);
   const file=(await readdir(path.join(root,name))).find(file=>file.endsWith('.js'));
   assert.match(await readFile(path.join(root,name,file),'utf8'),/loadPromotion/);
  }
 }finally{await rm(root,{recursive:true,force:true});}
});
