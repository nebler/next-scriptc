import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
test('file-batch scope preserves real identities and excludes nested routes',()=>{
 const app=path.join(root,'packages/scriptc-promote/test/support/fixtures/report/next'),temp=mkdtempSync(path.join(os.tmpdir(),'dev-file-scope-'));
 try{
  const output=path.join(temp,'report.json');
  execFileSync(process.execPath,['--import',new URL('./file-scope.mjs',import.meta.url).pathname,path.join(root,'packages/scriptc-promote/src/cli.mjs'),'report',app,'--source-dir','app','--json',output],{env:{...process.env,DEV_CENSUS_SCOPE_DIR:path.join(app,'app'),DEV_CENSUS_ONLY_FILES:'["compute.ts"]'},stdio:'pipe'});
  const r=JSON.parse(readFileSync(output));assert.equal(r.counts.files,1);assert.equal(r.counts.considered,3);assert.equal(r.counts.accepted,1);assert.equal(r.routes.length,0);assert.equal(r.files[0].file,'app/compute.ts');assert.equal(r.files[0].functions.find(f=>f.name==='sum').status,'accepted');
  execFileSync(process.execPath,['--import',new URL('./file-scope.mjs',import.meta.url).pathname,path.join(root,'packages/scriptc-promote/src/cli.mjs'),'report',app,'--json',output],{env:{...process.env,DEV_CENSUS_SOURCE_ROOT:app,DEV_CENSUS_SOURCE_FILES:JSON.stringify([path.join(app,'app/compute.ts')])},stdio:'pipe'});
  const batch=JSON.parse(readFileSync(output));assert.deepEqual(batch.counts,r.counts);assert.deepEqual(batch.files,r.files);assert.equal(batch.routes.length,0);
 }finally{rmSync(temp,{recursive:true,force:true});}
});
