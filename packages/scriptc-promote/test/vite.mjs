import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,rm,cp,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {scriptcPromote} from '../src/vite.mjs';

for(const version of ['vite6','vite'])test(`${version}: client isolation, native SSR, grouped rewrites and relocated artifacts`,{timeout:180000},async()=>{
 const {build,version:actual}=await import(version);
 const root=await mkdtemp(path.resolve(import.meta.dirname,'../.vite-test-'));
 try {
  await writeFile(path.join(root,'package.json'),'{"type":"module"}');
  await writeFile(path.join(root,'tsconfig.json'),JSON.stringify({compilerOptions:{strict:true,target:'ESNext',module:'ESNext',moduleResolution:'bundler'}}));
  await mkdir(path.join(root,'src'));
  await writeFile(path.join(root,'src/helper.ts'),'export const factor=2;');
  await writeFile(path.join(root,'src/entry.ts'),`import {factor} from './helper';
export function sum(n:number):number {let total=0;for(let i=0;i<n;i++)total+=i*factor;return total;}
export const squares=(n:number):number=>{let total=0;for(let i=0;i<n;i++)total+=i*i;return total;};
export function answer(n:number){return [sum(n),squares(n)];}`);
  const common={root,configFile:false,logLevel:'silent',plugins:[scriptcPromote({sourceDir:'src',report:console.log})]};
  await build({...common,build:{outDir:'client',lib:{entry:path.join(root,'src/entry.ts'),formats:['es']}}});
  assert.equal((await readdir(path.join(root,'client'))).some(name=>name==='scriptc-promotion'),false);
  const client=await readFile(path.join(root,'client', (await readdir(path.join(root,'client'))).find(n=>n.endsWith('.js'))),'utf8');
  assert.doesNotMatch(client,/loadPromotion|promotion\.node|scriptc-promote:runtime/);
  await build({...common,plugins:[scriptcPromote({sourceDir:'src',report:console.log})],build:{ssr:'src/entry.ts',outDir:'server'}});
  for(const name of ['promotion.node','ids.json','encodings.json'])assert.ok((await readFile(path.join(root,'server/scriptc-promotion',name))).length);
  assert.equal(JSON.parse(await readFile(path.join(root,'server/scriptc-promotion/ids.json'))).length,3);
  await cp(path.join(root,'server'),path.join(root,'relocated'),{recursive:true});
  await rm(path.join(root,'server'),{recursive:true});
  const entry=await import(pathToFileURL(path.join(root,'relocated/entry.js')));
  for(const mode of ['0','1']){process.env.SCRIPTC_PROMOTE=mode;assert.deepEqual(entry.answer(100),[9900,328350]);}
  for(const fn of [entry.sum,entry.squares,entry.answer])for(let i=0;i<85;i++){fn(100);await new Promise(resolve=>setTimeout(resolve,2));}
  const instances=globalThis[Symbol.for('scriptc-promote.dispatchers')];
  const instance=[...instances].find(([file])=>file.includes(root))[1];
  assert.equal(Object.values(instance.snapshot()).length,3);
  for(const fn of Object.values(instance.snapshot()))assert.ok(fn.buckets.some(bucket=>bucket.verified>0));
  delete process.env.SCRIPTC_PROMOTE;
  console.log(`validated Vite ${actual}`);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('dev and webworker targets disable all promotion hooks',async()=>{
 for(const command of ['serve','build']){
  const plugin=scriptcPromote();assert.equal(plugin.apply,'build');
  plugin.configResolved({command,build:{ssr:true},ssr:{target:'webworker'}});
  await plugin.buildStart.call({});
  assert.equal(plugin.transform.call({},'export const x=1','/src/x.ts',{ssr:true}),null);
 }
});
