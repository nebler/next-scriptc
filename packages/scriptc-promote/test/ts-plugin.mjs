import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {Worker} from 'node:worker_threads';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const init = require('../src/ts-plugin/index.cjs');
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
function fixture(t, text, config={}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scriptc-editor-'));
  const file = path.join(root, 'code.ts');
  const options = {strict:true, target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.ESNext};
  fs.writeFileSync(file, text);
  fs.writeFileSync(path.join(root,'tsconfig.json'), JSON.stringify({compilerOptions:{strict:true,target:'ES2022',module:'ESNext'},files:['code.ts']}));
  let version = 0, refreshes = 0;
  const host = {getScriptFileNames:()=>[file],getScriptVersion:()=>String(version),getScriptSnapshot:f=>f===file?ts.ScriptSnapshot.fromString(text):ts.sys.fileExists(f)?ts.ScriptSnapshot.fromString(ts.sys.readFile(f)):undefined,getCurrentDirectory:()=>root,getCompilationSettings:()=>options,getDefaultLibFileName:o=>ts.getDefaultLibFilePath(o),fileExists:ts.sys.fileExists,readFile:ts.sys.readFile,readDirectory:ts.sys.readDirectory};
  const base = ts.createLanguageService(host);
  const plugin = init({typescript:ts}).create({languageService:base,languageServiceHost:host,config:{debounceMs:20,...config},project:{refreshDiagnostics:()=>refreshes++}});
  t.after(()=>{plugin.dispose();fs.rmSync(root,{recursive:true,force:true});});
  async function ready() {const before=refreshes;plugin.getSemanticDiagnostics(file);for(let i=0;i<200&&refreshes===before;i++)await sleep(25);assert.ok(refreshes>before,'worker completed');return plugin.getSemanticDiagnostics(file).filter(d=>d.source==='scriptc-promote');}
  return {root,file,plugin,base,ready,edit:value=>{text=value;version++;}};
}
test('marked blockers retain original span, stable NSC code and hint; hover and unsaved updates',async t=>{
  const text='export function bad(n:number):number {\n "use native";\n return missing(n);\n}';
  const f=fixture(t,text);
  const ds=await f.ready();
  assert.equal(ds.length,1);assert.equal(ds[0].code,1001);assert.match(ds[0].messageText,/NSC1001:.*unsupported reference missing.*Hint:/);
  assert.equal(ds[0].start,text.indexOf('missing'));assert.equal(ds[0].length,'missing'.length);
  assert.match(f.plugin.getQuickInfoAtPosition(f.file,text.indexOf('bad')).documentation.map(d=>d.text).join(''),/use native: blocked/);
  f.edit('export function bad(n:number):number {"use native"; return n+1;}');
  assert.deepEqual(await f.ready(),[]);
  assert.match(f.plugin.getQuickInfoAtPosition(f.file,17).documentation.map(d=>d.text).join(''),/eligible for extraction/);
});
test('unmarked suggestions default off and opt in',async t=>{
  const text='export function tiny(n:number):number {return n+1;}';
  const off=fixture(t,text);assert.deepEqual(await off.ready(),[]);assert.deepEqual(off.plugin.getSuggestionDiagnostics(off.file).filter(d=>d.source==='scriptc-promote'),[]);
  const on=fixture(t,text,{unmarkedHints:true});await on.ready();assert.match(on.plugin.getSuggestionDiagnostics(on.file).find(d=>d.source==='scriptc-promote').messageText,/NSC1005.*Hint:/);
});
test('file directive shares explicit extraction and boundary checks',async t=>{
  const f=fixture(t,'"use native"; export async function good(n:number):Promise<number>{return n+1;}');
  assert.deepEqual(await f.ready(),[]);
  assert.match(f.plugin.getQuickInfoAtPosition(f.file,36).documentation.map(d=>d.text).join(''),/eligible/);
});
test('host failures never break the language service',async t=>{
  const f=fixture(t,'export const n = 1;');
  const host={getScriptVersion(){throw Error('broken host');}};
  const plugin=init({typescript:ts}).create({languageService:f.base,languageServiceHost:host,config:{}});
  assert.deepEqual(plugin.getSemanticDiagnostics(f.file),f.base.getSemanticDiagnostics(f.file));
  assert.equal(plugin.getQuickInfoAtPosition(f.file,13).kind,'const');
});
test('worker cache reuses unchanged results and invalidates disk dependency hashes',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'scriptc-editor-cache-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file=path.join(root,'code.ts'), dep=path.join(root,'dep.ts');
  const text='import {helper} from "./dep"; export function good(n:number):number {"use native";return helper(n);}';
  fs.writeFileSync(file,text);fs.writeFileSync(dep,'export function helper(n:number):number{return n+1;}');fs.writeFileSync(path.join(root,'tsconfig.json'),'{"compilerOptions":{"strict":true}}');
  const worker=new Worker(new URL('../src/ts-plugin/worker.mjs',import.meta.url));t.after(()=>worker.terminate());
  let id=0;
  const run=()=>new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.postMessage({id:++id,file,root,overlays:{[file]:text},options:{strict:true}});});
  const first=await run();assert.equal(first.error,undefined);assert.equal(first.cached,false);assert.deepEqual(first.diagnostics,[]);
  assert.equal((await run()).cached,true);
  fs.writeFileSync(dep,'console.log("effect"); export function helper(n:number):number{return n+1;}');
  const changed=await run();assert.equal(changed.cached,false);assert.match(changed.diagnostics[0].messageText,/module initialization/);
});
test('worker exceptions preserve TypeScript results and a later edit recovers',async t=>{
  const f=fixture(t,'export function broken( { "use native";');
  const before=f.base.getSemanticDiagnostics(f.file);
  f.plugin.getSemanticDiagnostics(f.file);
  await sleep(600);
  assert.deepEqual(f.plugin.getSemanticDiagnostics(f.file),before);
  f.edit('export function good(n:number):number {"use native"; return n+1;}');
  assert.deepEqual(await f.ready(),[]);
});
test('eligible automatic hint and excluded nested marked shape',async t=>{
  const f=fixture(t,'export function sum(n:number):number {let s=0;for(let i=0;i<n;i++)s+=i;return s;}',{unmarkedHints:true});
  await f.ready();
  assert.match(f.plugin.getSuggestionDiagnostics(f.file).find(d=>d.source==='scriptc-promote').messageText,/would be promoted automatically/);
  const nested=fixture(t,'export function outer(){function inner(n:number){"use native";return n+1;}return inner(1);}');
  assert.match((await nested.ready())[0].messageText,/named module-level function/);
});
test('tsserver legacy resolver loads the packaged subpath, as does Node exports',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'scriptc-editor-resolve-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const destination=path.join(root,'node_modules/scriptc-promote');fs.mkdirSync(destination,{recursive:true});
  for(const name of ['package.json','ts-plugin','src/ts-plugin']) fs.cpSync(new URL(`../${name}`,import.meta.url),path.join(destination,name),{recursive:true});
  const resolved=ts.sys.require(root,'scriptc-promote/ts-plugin');
  assert.equal(resolved.error,undefined);assert.equal(typeof resolved.module,'function');
  assert.equal(typeof require('scriptc-promote/ts-plugin'),'function');
});
