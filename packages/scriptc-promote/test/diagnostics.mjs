import ts from 'typescript';
import test from 'node:test';
import assert from 'node:assert/strict';
import {extractFunctions} from '../src/functions/extract.mjs';
import {translateDiagnostics,infrastructureFailure} from '../src/functions/diagnostics.mjs';
import {promotionCandidates} from '../src/functions/promotion-discovery.mjs';
import {buildPromotion} from '../src/functions/promotion-build.mjs';
import {coverageReport,formatReport} from '../src/report.mjs';
import {mkdtemp,writeFile,rm,chmod,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
test('extracted compiler positions map to original source and indexed access hints',()=>{
 const text='// header\n\nconst ignored = 1;\nexport async function broken(xs:number[]):Promise<number> {\n "use native";\n return xs[0];\n}\n';
 const module=extractFunctions(text,'/app/user.ts');const offset=module.native.indexOf('xs[0]'),prefix=module.native.slice(0,offset);
 const output=translateDiagnostics(`/cache/module-0.ts:${prefix.split('\n').length}:${offset-prefix.lastIndexOf('\n')} - error SC0001: possibly undefined`,[{file:'/cache/module-0.ts',module}]);
 assert.match(output,/\/app\/user.ts:6:9/);assert.match(output,/Guard the indexed value, use a tuple/);
});
test('extractor and work screen carry stable codes, locations and repair hints',()=>{
 assert.throws(()=>extractFunctions('export function f(){"use native";return 1;}','/app/f.ts'),/f.ts:1:17 - NSC1002:.*must be async.*Hint:/);
 assert.throws(()=>extractFunctions('class W {constructor(public weight:number){}}\nexport async function f():Promise<number>{"use native";return new W(1).weight;}','/app/f.ts'),/f.ts:1:29 - NSC1001:.*unsupported reference weight.*parameter properties/);
 const messages=[];promotionCandidates('export function tiny(n:number){return n+1;}','/app/f.ts',m=>messages.push(m),{ts});assert.match(messages[0],/f.ts:1:8 - NSC1005:.*work: no loop.*Hint:/);
});
test('missing compiler and ar are infrastructure refusals with JS fallback',async()=>{
 assert.equal(infrastructureFailure({message:'ENOENT: no such file or directory, open /app/helper.ts'}),null);
 for(const [message,tool] of [['spawnSync ar ENOENT','ar'],['SC3004: TypeScript server startup: Permission denied','scriptc helper']]){const result=infrastructureFailure({message});assert.ok(result.includes(tool));assert.match(result,/continues in JS.*Repair:/);}
 const dir=await mkdtemp(path.join(os.tmpdir(),'p1b-tools-'));const old=process.env.SCRIPTC_COMPILER;
 try {process.env.SCRIPTC_COMPILER=path.join(dir,'missing-scriptc');const logs=[];const module=extractFunctions('export function sum(n:number):number{let s=0;for(let i=0;i<n;i++)s+=i;return s;}','/app/sum.ts','sum');module.functions[0].boundary={params:['number'],result:'number'};
 assert.deepEqual(await buildPromotion([module],dir,{report:m=>logs.push(m)}),[]);assert.match(logs[0],/missing-scriptc.*continues in JS.*pnpm rebuild scriptc/s);assert.doesNotMatch(logs[0],/not a candidate/);
 const fake=path.join(dir,'fake-scriptc');await writeFile(fake,'#!/bin/sh\necho "error SC3004: spawnSync ar ENOENT" >&2\nexit 1\n');await chmod(fake,0o755);process.env.SCRIPTC_COMPILER=fake;logs.length=0;
 assert.deepEqual(await buildPromotion([module],dir,{report:m=>logs.push(m)}),[]);assert.match(logs[0],/unavailable \(ar\).*continues in JS.*Repair:/s);
 const explicit={...module,forced:true};logs.length=0;
 await assert.rejects(buildPromotion([explicit],dir,{report:m=>logs.push(m)}),/NSC2001: Toolchain unavailable \(ar\).*"use native" require it, so the build stops.*#sum/s);
 process.env.SCRIPTC_COMPILER=path.join(dir,'missing-scriptc');
 await assert.rejects(buildPromotion([module,explicit],dir,{report:m=>logs.push(m)}),/missing-scriptc.*build stops/s);
 assert.equal(logs.length,0);
 }finally{if(old===undefined)delete process.env.SCRIPTC_COMPILER;else process.env.SCRIPTC_COMPILER=old;await rm(dir,{recursive:true,force:true});}
});
test('report lists async explicit functions with extraction and build status',async()=>{
 const dir=await mkdtemp(path.join(new URL('./support/fixtures/',import.meta.url).pathname,'.p1b-'));
 try{await writeFile(path.join(dir,'native.ts'),'export async function f(n:number):Promise<number>{"use native";return n+1;}');const report=await coverageReport(dir);const row=report.files[0].functions[0];assert.equal(row.status,'explicit');assert.equal(row.extractionStatus,'extracted');assert.equal(report.counts.silentExclusions,0);assert.match(formatReport(report),/explicit.*extraction: extracted; build: not inspected/);}
 finally{await rm(dir,{recursive:true,force:true});}
});
test('flattened imported helper diagnostics preserve original source positions',async()=>{
 const {dependencyClosure}=await import('../src/functions/dependency-closure.mjs');
 const dir=await mkdtemp(path.join(os.tmpdir(),'p1b-map-'));
 try{const helper=path.join(dir,'helper.ts'),file=path.join(dir,'main.ts');await writeFile(helper,'export function helper(n:number):number {\n return n * 2;\n}\n');
 const text='import {helper} from "./helper";\nexport function sum(n:number):number {let s=0;for(let i=0;i<n;i++)s+=helper(i);return s;}';await writeFile(file,text);
 const module={...extractFunctions(text,file,'sum'),...dependencyClosure(text,file,'sum',{ts})};const at=module.native.indexOf('n * 2'),prefix=module.native.slice(0,at);
 const message=translateDiagnostics(`/cache/module-0.ts:${prefix.split('\n').length}:${at-prefix.lastIndexOf('\n')} - error SC0001: broken`,[{file:'/cache/module-0.ts',module}]);assert.ok(message.includes(helper+':2:9'),message);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('absolute promotion runtime imports become relative for packed Next consumers',async()=>{
 const {default:loader}=await import('../src/functions/loader.mjs');const text='export function sum(n:number):number{let s=0;for(let i=0;i<n;i++)s+=i;return s;}',source='/app/sum.ts';const module=extractFunctions(text,source,'sum');module.promotion=true;module.functions.forEach(f=>f.promotion=true);
 const output=loader.call({resourcePath:source,getOptions:()=>({modules:{[source]:module},server:true,promotionClient:'/app/node_modules/.pnpm/pkg@file+a/runtime.mjs'})},text);assert.match(output,/from "\.\/node_modules\/\.pnpm\/pkg@file\+a\/runtime.mjs"/);
});

test('Next explicit report distinguishes absent, current and stale build artifacts',async()=>{
 const {createHash}=await import('node:crypto');const dir=await mkdtemp(path.join(new URL('./support/fixtures/',import.meta.url).pathname,'.p1b-status-'));
 try {const file=path.join(dir,'native.ts'),text='export async function f(n:number):Promise<number>{"use native";return n+1;}';await writeFile(file,text);const row=async()=>(await coverageReport(dir,{framework:'next'})).files[0].functions[0];assert.match((await row()).buildStatus,/not built/);
 await mkdir(path.join(dir,'.next/scriptc-functions'),{recursive:true});await writeFile(path.join(dir,'.next/BUILD_ID'),'test');await writeFile(path.join(dir,'.next/scriptc-functions/functions'),'fixture artifact');await writeFile(path.join(dir,'.next/scriptc-functions/manifest.json'),JSON.stringify({buildId:'test',functions:[{source:file,names:['f'],hash:createHash('sha256').update(text).digest('hex')}]}));assert.match((await row()).buildStatus,/^built/);await writeFile(file,text+'\n');assert.match((await row()).buildStatus,/not built/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
