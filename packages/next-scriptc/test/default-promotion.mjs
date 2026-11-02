import test from 'node:test';
import assert from 'node:assert/strict';
import {withScriptc} from '../src/index.mjs';
import {optionsKey} from '../src/options.mjs';
import adapter from '../src/adapter.mjs';
test('Next defaults to automatic promotion and preserves explicit choices',()=>{
 for(const value of [undefined,'auto','off'])assert.equal(withScriptc({},value?{nativePromotion:value}:{}).rewrites[optionsKey].nativePromotion,value??'auto');
 assert.equal(withScriptc({},{target:'cloudflare',cloudflare:{entry:'worker.ts'}}).rewrites[optionsKey].nativePromotion,'off');
});
test('dev emits production native testing instructions once per project',async()=>{
 const logs=[],original=console.log;console.log=m=>logs.push(m);
 try{for(let i=0;i<2;i++)await adapter.modifyConfig({}, {phase:'phase-development-server',projectDir:'/tmp/p1b-dev-notice'});}
 finally{console.log=original;}
 assert.equal(logs.length,1);assert.match(logs[0],/production builds.*Dev serves JS.*pnpm build && pnpm start/);
});

test('build prints functions and modules separately from route counts',async()=>{
 const {mkdtemp,mkdir,writeFile,rm}=await import('node:fs/promises');const path=await import('node:path');const dir=await mkdtemp(path.join(import.meta.dirname,'.p1b-counts-'));const distDir=path.join(dir,'.next');const logs=[],original=console.log;
 try{await mkdir(distDir);await adapter.modifyConfig(withScriptc({distDir:'.next',experimental:{},typescript:{tsconfigPath:'tsconfig.json'}},{nativePromotion:'off'}),{phase:'phase-production-build',projectDir:dir});await writeFile(path.join(distDir,'routes-manifest.json'),JSON.stringify({rewrites:{beforeFiles:[],afterFiles:[],fallback:[]}}));console.log=m=>logs.push(m);await adapter.onBuildComplete({projectDir:dir,distDir,buildId:'test',outputs:{appRoutes:[],prerenders:[]}});assert.ok(logs.includes('[next-scriptc] Built 0 native function(s) in 0 module(s).'));assert.ok(logs.includes('[next-scriptc] Built 0 native route(s) in 0 process(es).'));}
 finally{console.log=original;await rm(dir,{recursive:true,force:true});}
});
