import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createRequire,stripTypeScriptTypes} from 'node:module';
import path from 'node:path';
import {buildPromotion} from '../src/functions/promotion-build.mjs';
import {compilerPath} from '../src/paths.mjs';
import {instantiate} from '../../next-scriptc/src/cloudflare/bridge.mjs';
const require=createRequire(import.meta.url);
export async function semanticEvidence(){
 const dir=await mkdtemp('/tmp/scriptc-semantics-'),source=await readFile(new URL('./support/fixtures/fuzz/semantics.ts',import.meta.url),'utf8');
 try{
  const m={source:'semantics.ts',native:source,functions:[{id:'semantics',name:'run',params:['input'],boundary:{params:['string'],result:'string'}}]};
  const built=await buildPromotion([m],path.join(dir,'native'));assert.equal(built.length,1);
  const addon=require(path.join(dir,'native/promotion.node'));
  await writeFile(path.join(dir,'reference.mjs'),stripTypeScriptTypes(source));const js=(await import(path.join(dir,'reference.mjs'))).run;
  await writeFile(path.join(dir,'entry.ts'),source);
  const profile={profile_format:1,name:'semantics',entry:'entry.ts',emission:'llvm',abi:{prefix:'bench_',init_symbol:'bench_init',sink_register_symbol:'bench_sink',collect_symbol:'bench_collect'},exports:[{export:'run',symbol:'bench_run',params:['string'],returns:'string'}]};
  await writeFile(path.join(dir,'profile.json'),JSON.stringify(profile));
  const pack=new URL('../../../node_modules/.pnpm/@scriptc+runtime-wasm32-wasi@0.4.6/node_modules/@scriptc/runtime-wasm32-wasi',import.meta.url).pathname;
  execFileSync(compilerPath(),['build','--lib','--profile',path.join(dir,'profile.json'),'-o',path.join(dir,'compute.wasm')],{cwd:dir,env:{...process.env,SCRIPTC_TARGET:'wasm32-wasi',SCRIPTC_RUNTIME_PACK:pack,SCRIPTC_CHECKER_SERVER:'0'},stdio:'pipe'});
  const wasm=instantiate(new WebAssembly.Module(await readFile(path.join(dir,'compute.wasm'))));
  return ['zero','nan','integer','float','string','stable','map','set','keys'].map(input=>({input,js:js(input),native:addon.run(0,[input]),wasm:wasm.run(input)}));
 }finally{await rm(dir,{recursive:true,force:true});}
}
test('numeric and ordering semantics on stock native and local Cloudflare reactor', {timeout:180000},async()=>{
 const rows=await semanticEvidence();
 if(process.env.SCRIPTC_SEMANTICS_OUTPUT)await writeFile(process.env.SCRIPTC_SEMANTICS_OUTPUT,JSON.stringify(rows,null,2));
 for(const row of rows){assert.equal(row.native,row.js,JSON.stringify(row));assert.equal(row.wasm,row.js,JSON.stringify(row));}
});
