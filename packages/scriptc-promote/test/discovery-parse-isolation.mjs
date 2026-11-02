import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {discoverPromotions} from '../src/functions/promotion-discovery.mjs';
import {coverageReport,formatReport} from '../src/report.mjs';
const ts=createRequire(import.meta.url)('typescript');
test('unsupported parser syntax retains healthy files and exact file error',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'discovery-parse-'));
 try{
  await writeFile(path.join(root,'tsconfig.json'),JSON.stringify({compilerOptions:{strict:true}}));
  await writeFile(path.join(root,'bad.ts'),'@decorator\nexport class Bad {}');
  await writeFile(path.join(root,'good.ts'),'export function sum(a:number[]):number {let s=0;for(const n of a)s+=n;return s;}');
  await writeFile(path.join(root,'dependency.ts'),'@decorator\nexport class Dep {}');
  await writeFile(path.join(root,'caller.ts'),'import {Dep} from \"./dependency\"; export function blocked(a:number[]){return a.map(n=>new Dep());}');
  const errors=[],logs=[];
  const modules=await discoverPromotions(root,path.join(root,'dist'),{typescript:{implementation:ts},onFileError:e=>errors.push(e)},m=>logs.push(m));
  assert.equal(errors.length,2);assert.equal(errors[0].source,path.join(root,'bad.ts'));assert.match(errors[0].message,/decorators/);assert.match(logs[0],/bad\.ts/);assert.ok(modules.some(m=>m.functions.some(f=>f.name==='sum')));
  assert.ok(logs.some(m=>/not a candidate blocked:.*dependency\.ts:/.test(m)),JSON.stringify(logs));
  const report=await coverageReport(root);assert.equal(report.fileErrors.length,2);assert.equal(report.fileErrors[0].source,'bad.ts');assert.equal(report.counts.accepted,1);assert.match(formatReport(report),/files failed to parse; their coverage is unknown/);assert.match(formatReport(report),/Parse failure bad\.ts:/);
  await writeFile(path.join(root,'forced.ts'),'import {Dep} from \"./dependency\";export function forced(a:number[]){\"use native\";return a.map(n=>new Dep());}');
  await assert.rejects(discoverPromotions(root,path.join(root,'dist'),{typescript:{implementation:ts}},()=>{}),/dependency\.ts:/);
 }finally{await rm(root,{recursive:true,force:true});}
});
