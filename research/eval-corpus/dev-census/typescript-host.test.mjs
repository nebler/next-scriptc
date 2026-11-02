import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {execFileSync} from 'node:child_process';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
test('measurement host can use a full compiler when package compiler has no sys API',()=>{
 const app=mkdtempSync(path.join(os.tmpdir(),'dev-ts-host-'));try{
  mkdirSync(path.join(app,'node_modules/typescript'),{recursive:true});writeFileSync(path.join(app,'node_modules/typescript/package.json'),JSON.stringify({name:'typescript',main:'index.cjs'}));writeFileSync(path.join(app,'node_modules/typescript/index.cjs'),'module.exports={};');
  writeFileSync(path.join(app,'tsconfig.json'),JSON.stringify({compilerOptions:{strict:true}}));writeFileSync(path.join(app,'compute.ts'),'export function sum(a:number[]):number {let s=0;for(const n of a)s+=n;return s;}');
  const cli=path.join(root,'packages/scriptc-promote/src/cli.mjs'),output=path.join(app,'result.json');
  assert.throws(()=>execFileSync(process.execPath,[cli,'report',app],{stdio:'pipe'}),/readFile/);
  execFileSync(process.execPath,['--import',new URL('./typescript-host.mjs',import.meta.url).pathname,cli,'report',app,'--json',output],{env:{...process.env,DEV_CENSUS_TYPESCRIPT_HOST_ROOT:path.join(root,'packages/scriptc-promote')},stdio:'pipe'});
  const r=JSON.parse(readFileSync(output));assert.equal(r.counts.considered,1);assert.equal(r.counts.accepted,1);assert.equal(r.files[0].functions[0].id,'compute.ts#sum');
 }finally{rmSync(app,{recursive:true,force:true});}
});
