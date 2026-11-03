import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {doctor} from '../src/doctor.mjs';

test('doctor reports missing dependencies, old Node, tools, config and bad cache without writing', () => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'doctor-'));
 try {
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({dependencies:{next:'16'}}));
  const result=doctor(root,{nodeVersion:'22.0.0',findTool:()=>false,tmpdir:'/dev/null/cache'});
  for(const id of ['node','scriptc','adapter','typescript','tool-ar','tool-clang','temp']) assert.equal(result.checks.find(c=>c.id===id).ok,false,id);
  assert.ok(result.checks.filter(c=>!c.ok).every(c=>c.repair));
  assert.deepEqual(fs.readdirSync(root),['package.json']);
  const cli=spawnSync(process.execPath,[path.resolve(import.meta.dirname,'../src/cli.mjs'),'doctor',root,'--json'],{encoding:'utf8'});
  assert.equal(cli.status,1); assert.equal(JSON.parse(cli.stdout).ok,false);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
test('doctor inspects helper permissions and postinstall, without executing configs',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'doctor-'));
 try {
  const pkg=path.join(root,'node_modules/scriptc');fs.mkdirSync(pkg,{recursive:true});
  fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({devDependencies:{vite:'7'}}));
  fs.writeFileSync(path.join(root,'vite.config.mjs'),"throw Error('never execute'); scriptcPromote()");
  fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({name:'scriptc',version:'0.4.6',bin:{scriptc:'bin/compiler'}}));
  fs.mkdirSync(path.join(pkg,'bin'));const bin=path.join(pkg,'bin/compiler');
  fs.writeFileSync(bin,'x'.repeat(200));fs.chmodSync(bin,0o755);
  fs.writeFileSync(bin+'.json',JSON.stringify({ts7:'checker'}));fs.writeFileSync(path.join(pkg,'bin/checker'),'helper');fs.chmodSync(path.join(pkg,'bin/checker'),0o644);
  const result=doctor(root,{findTool:()=>true});
  assert.equal(result.checks.find(c=>c.id==='adapter').ok,true);
  assert.equal(result.checks.find(c=>c.id==='approved-build').ok,true);
  assert.equal(result.checks.find(c=>c.id==='helper-ts7').ok,false);
  assert.match(result.checks.find(c=>c.id==='helper-ts7').repair,/approve-builds.*rebuild scriptc/);
  fs.unlinkSync(bin+'.json');
  assert.equal(doctor(root).checks.find(c=>c.id==='approved-build').ok,false);
  assert.equal(doctor(root,{cross:true,findTool:()=>false}).checks.find(c=>c.id==='tool-zig').ok,false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('Next CLI delegates doctor and preserves structured failure status',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'doctor-next-'));
 try {
  fs.writeFileSync(path.join(root,'package.json'),'{"dependencies":{"next":"16"}}');
  const cli=spawnSync(process.execPath,[path.resolve(import.meta.dirname,'../../next-scriptc/src/cli.mjs'),'doctor',root,'--json'],{encoding:'utf8'});
  assert.equal(cli.status,1);assert.equal(JSON.parse(cli.stdout).framework,'next');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
