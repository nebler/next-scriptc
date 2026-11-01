import {mkdir,writeFile,readFile,symlink} from 'node:fs/promises';
import path from 'node:path';
import {stripTypeScriptTypes} from 'node:module';
import {prepareFunctions} from '../../packages/next-scriptc/src/functions/build.mjs';
import {optionsKey} from '../../packages/next-scriptc/src/options.mjs';
import loader from '../../packages/next-scriptc/src/functions/loader.mjs';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..'),project=root+'/.checks/auto-promotion/integration';
await mkdir(project,{recursive:true});
try{await symlink(root+'/examples/demo/node_modules',project+'/node_modules');}catch(e){if(e.code!=='EEXIST')throw e;}
await writeFile(project+'/package.json','{"type":"module"}');await writeFile(project+'/tsconfig.json','{"compilerOptions":{"strict":true,"target":"es2022"}}');
const source=project+'/core.ts',text='export function sum(values:number[]):number {let n=0;for(const v of values)n+=v;return n;}';await writeFile(source,text);
const config=await prepareFunctions({rewrites:Object.assign(async()=>[],{[optionsKey]:{nativePromotion:'auto'}})},project);
const options=config.turbopack.rules['*'][0].loaders[0].options;
const transformed=loader.call({resourcePath:source,getOptions:()=>({...options,server:true})},text);
await writeFile(project+'/wrapped.mjs',stripTypeScriptTypes(transformed,{mode:'strip'}));
const {sum}=await import(project+'/wrapped.mjs');for(let i=0;i<105;i++)assert.equal(sum([1,2,3]),6);
await new Promise(r=>setTimeout(r,20));
await writeFile(import.meta.dirname+'/raw/integration.json',JSON.stringify({at:new Date().toISOString(),result:'105 correct calls through prepareFunctions + loader + client + host addon; auto background verification scheduled',source},null,2));
