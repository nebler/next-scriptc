import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {measurementAddon} from '../src/report-addon.mjs';
test('measurement instances do not inherit a previous function failure',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'report-addon-'));
 try{
  const source=path.join(dir,'fixture.cjs');
  await writeFile(source,"let poisoned=false;module.exports={run(fail){if(fail)poisoned=true;if(poisoned)throw Error('poisoned instance');return 42;}};");
  const first=await measurementAddon(source,path.join(dir,'first.cjs'));
  assert.throws(()=>first.run(true),/poisoned/);
  const second=await measurementAddon(source,path.join(dir,'second.cjs'));
  assert.equal(second.run(false),42);
  assert.throws(()=>first.run(false),/poisoned/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
