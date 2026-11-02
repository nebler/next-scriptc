// Source downloads and package code stay in the external L1 install directory.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import os from 'node:os';
const work=path.resolve(process.argv[2]);
if(work.startsWith(process.cwd()+path.sep))throw Error('Use external temp directory');
if((process.env.VARIANTS??'').split(',').includes('annotated'))fs.writeFileSync(new URL('./annotations.patch',import.meta.url),'');
const out=new URL(process.env.RESULTS_FILE??'./build-results.json',import.meta.url);
const req=createRequire(path.join(work,'package.json'));
const {build}=req('esbuild');
const sha=s=>createHash('sha256').update(s).digest('hex');
const compiler=path.join(work,'node_modules/scriptc/bin/scriptc.exe');
const report={host:{cpu:os.cpus()[0].model,node:process.version,platform:process.platform,arch:process.arch},compiler:{version:spawnSync(compiler,['--version'],{encoding:'utf8'}).stdout.trim(),sha256:sha(fs.readFileSync(compiler))},sources:[],attempts:[]};
const specs=[['json-2-csv','5.5.0','mrodrig/json-2-csv','5.5.0','src/converter.ts'],['deeks','3.1.0','mrodrig/deeks','3.1.0','src/deeks.ts'],['doc-path','4.1.0','mrodrig/doc-path','4.1.0','src/path.ts'],['fastest-levenshtein','1.0.16','ka-weihe/fastest-levenshtein','03d621ba324d0f665b3b7f557429ca622560d9a3','mod.ts']];
for(const [name,version,repo,ref,entry] of specs){
 const dir=path.join(work,'sources',name);
 if(!fs.existsSync(dir)){const r=spawnSync('git',['clone','--quiet',`https://github.com/${repo}.git`,dir],{encoding:'utf8'});if(r.status)throw Error(r.stderr);}
 const checkout=spawnSync('git',['checkout','--quiet',ref],{cwd:dir,encoding:'utf8'});if(checkout.status)throw Error(checkout.stderr);
 const files=spawnSync('git',['ls-files'],{cwd:dir,encoding:'utf8'}).stdout.trim().split('\n').filter(f=>f.endsWith('.ts')&&!f.endsWith('.d.ts')||/^LICENSE/i.test(f));
 report.sources.push({name,version,repo:`https://github.com/${repo}`,ref,commit:spawnSync('git',['rev-parse','HEAD'],{cwd:dir,encoding:'utf8'}).stdout.trim(),entry,license:JSON.parse(fs.readFileSync(path.join(dir,'package.json'))).license,files:files.map(file=>({file,sha256:sha(fs.readFileSync(path.join(dir,file)))})),tarballSourceFiles:fs.readdirSync(path.join(work,'node_modules',name)).filter(f=>f==='src'||f.endsWith('.ts')&&!f.endsWith('.d.ts'))});
}
fs.copyFileSync(path.join(work,'package-lock.json'),new URL('./deps-lock.json',import.meta.url));
for(const library of (process.env.LIBRARIES??'json-2-csv,fastest-levenshtein').split(','))for(const variant of (process.env.VARIANTS??'typed,untyped').split(',')){
 const dir=path.join(work,'builds',library,variant);fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'tsconfig.json'),JSON.stringify({compilerOptions:{strict:true,allowJs:true,checkJs:false,skipLibCheck:true,target:'ESNext',module:'ESNext',moduleResolution:'bundler',types:[]}}));
 let imp;
 if(variant!=='untyped'){
  for(const [name,,,,entry] of specs.filter(s=>library==='json-2-csv'?s[0]!=='fastest-levenshtein':s[0]===library)){
   const dest=path.join(dir,'vendor',name);fs.mkdirSync(dest,{recursive:true});
   const src=path.join(work,'sources',name);if(fs.existsSync(path.join(src,'src')))fs.cpSync(path.join(src,'src'),path.join(dest,'src'),{recursive:true});else fs.copyFileSync(path.join(src,entry),path.join(dest,entry));
   fs.writeFileSync(path.join(dest,'package.json'),JSON.stringify({name,main:entry,types:entry}));
  }
  // Resolve package imports to project modules; preserve every expression and type.
  const csv=path.join(dir,'vendor/json-2-csv/src/json2csv.ts');
  if(fs.existsSync(csv)){let s=fs.readFileSync(csv,'utf8');s=s.replace("from 'doc-path'","from '../../doc-path/src/path'").replace("from 'deeks'","from '../../deeks/src/deeks'");fs.writeFileSync(csv,s);}
  const utils=path.join(dir,'vendor/json-2-csv/src/utils.ts');if(fs.existsSync(utils))fs.writeFileSync(utils,fs.readFileSync(utils,'utf8').replace("from 'doc-path'","from '../../doc-path/src/path'"));
  const csv2=path.join(dir,'vendor/json-2-csv/src/csv2json.ts');
  if(fs.existsSync(csv2))fs.writeFileSync(csv2,fs.readFileSync(csv2,'utf8').replace("from 'doc-path'","from '../../doc-path/src/path'"));
  imp=library==='json-2-csv'?"import {json2csv as entry} from './vendor/json-2-csv/src/converter';":"import {distance as entry} from './vendor/fastest-levenshtein/mod';";
 }else{
  const contents=library==='json-2-csv'?"export {json2csv as entry} from 'json-2-csv';":"export {distance as entry} from 'fastest-levenshtein';";
  const bundle=await build({stdin:{contents,resolveDir:work,sourcefile:'entry.js'},bundle:true,platform:'node',target:'es2022',format:'esm',write:false,mainFields:['module','main'],banner:{js:'// @ts-nocheck'},define:{'process.env.NODE_ENV':'"production"'}});
  fs.writeFileSync(path.join(dir,'bundle.js'),bundle.outputFiles[0].text);imp="import {entry} from './bundle.js';";
 }
 if(variant==='annotated'&&library==='json-2-csv'){
  const edits=[['deeks/src/utils.ts',[["flatten(array: unknown[])","flatten(array: unknown[]): any[]"],["[].concat","([] as any).concat"]]],['json-2-csv/src/utils.ts',[["if (array.flat)","if ((array as any).flat)"],["safeArray.concat(...","(safeArray as any).concat(..."]]],['json-2-csv/src/json2csv.ts',[["fieldValue.toLocaleString()","(fieldValue as any).toLocaleString()"]]]];
  for(const [file,replacements] of edits){const f=path.join(dir,'vendor',file);const before=fs.readFileSync(f,'utf8');let after=before;for(const [a,b] of replacements){if(!after.includes(a))throw Error('Missing edit '+a);after=after.replace(a,b);}fs.writeFileSync(f,after);
   const ts=req('typescript');const transpile=x=>ts.transpileModule(x,{compilerOptions:{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext,removeComments:true}}).outputText;if(transpile(before)!==transpile(after))throw Error('Annotation changed emitted JS '+file);
   const prev=path.join(work,'before.ts');fs.writeFileSync(prev,before);const diff=spawnSync('diff',['-U','0',prev,f],{encoding:'utf8'}).stdout.split('\n').slice(2).join('\n');fs.appendFileSync(new URL('./annotations.patch',import.meta.url),'--- a/'+file+'\n+++ b/'+file+'\n'+diff);
  }
 }
 const facade=library==='json-2-csv'?`type Row={id:number;text:string;meta:{note:string}};\nexport function convert(rows:Row[]):string{return entry(rows);}\nexport function run(input:string):string{return convert(JSON.parse(input) as Row[]);}`:`export function run(input:string):string{const pair=JSON.parse(input) as {a:string;b:string};return String(entry(pair.a,pair.b));}`;
 fs.writeFileSync(path.join(dir,'facade.ts'),imp+'\n'+facade+'\nexport function echo(input:string):string{return input;}\nexport function parseOnly(input:string):string{JSON.parse(input);return input;}\nexport function sink(input:string):string{return "0";}\n');
 fs.writeFileSync(path.join(dir,'profile.json'),JSON.stringify({profile_format:1,name:'promotion',entry:'facade.ts',emission:'llvm',abi:{prefix:'rev_',init_symbol:'rev_init',sink_register_symbol:'rev_sink',collect_symbol:'rev_collect',localize_runtime:true,instance_per_thread:false},exports:['run','echo','parseOnly','sink'].map((f,i)=>({export:f,symbol:`rev_fn_${i}`,params:['string'],returns:'string'}))}));
 const args=['build','--lib','--profile',path.join(dir,'profile.json'),'-o',path.join(dir,'functions.lib.a')];
 const r=spawnSync(compiler,args,{cwd:dir,env:{...process.env,SCRIPTC_CHECKER_SERVER:'0'},encoding:'utf8',timeout:120000,maxBuffer:8e6});
 const diagnostic=(r.stdout+r.stderr).replaceAll(work,'<TEMP>');
 report.attempts.push({library,variant,exit:r.status,signal:r.signal,error:r.error?.message,diagnostic,facade:imp+'\n'+facade});
 fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(library,variant,r.status,diagnostic.slice(-4000));
}
