import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire,stripTypeScriptTypes} from 'node:module';
import {dependencyClosure} from '../src/functions/dependency-closure.mjs';
import {promotionCandidates} from '../src/functions/promotion-discovery.mjs';
import {checkFunctionTypes} from '../src/functions/types.mjs';
import {buildPromotion} from '../src/functions/promotion-build.mjs';
import {loadPromotion} from '../src/functions/promotion-runtime.mjs';
const ts=createRequire(import.meta.url)('typescript');
async function fixture(run){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'closure-features-'));const write=(name,text)=>{const file=path.join(dir,name);fs.writeFileSync(file,text);return file;};try{await run(write,dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
const close=(text,file)=>dependencyClosure(text,file,'rows',{ts});
const evaluate=native=>new Function(stripTypeScriptTypes(native.replace(/export\s*\{[^}]*\};?/g,''))+';return rows;')();
test('imported interfaces and aliases link transitively with collision renaming',()=>fixture(write=>{
 write('base.ts','export interface Row { n:number }');write('helper.ts','import type {Row} from "./base";export type Rows=Row[];');
 for(const kind of ['type ','']){const text=`import ${kind}{Rows} from './helper';export function rows(x:Rows){return x.map(v=>v.n);}`,file=write('entry.ts',text),result=close(text,file);assert.doesNotMatch(result.native,/import /);assert.deepEqual(evaluate(result.native)([{n:4}]),[4]);assert.match(result.native,/__dep_\w+_Row/);}
 write('decl.d.ts','export interface Item { n:number }');write('helper.ts',"export type {Item as Rows} from './decl';");{const text="import {Rows} from './helper';export function rows(x:Rows[]){return x.map(v=>v.n);}",file=write('entry.ts',text);assert.deepEqual(evaluate(close(text,file).native)([{n:3}]),[3]);}
 write('helper.ts','type T=number;export type Rows<T>={n:T};');{const text="import type {Rows} from './helper';export function rows(x:Rows<string>[]){return x.map(v=>v.n);}",file=write('entry.ts',text);assert.throws(()=>close(text,file),/scoped type linking/);}
 for(const type of ['Date','()=>number','any','Map<string,number>','typeof value','Missing']){write('helper.ts',`export type Rows=${type};`);const text="import type {Rows} from './helper';export function rows(x:Rows){return [x];}",file=write('entry.ts',text);if(['Date','()=>number','Map<string,number>'].includes(type))assert.equal(close(text,file).opaqueInputs[0].kind,'handle');else assert.throws(()=>close(text,file));}
}));
test('literal enums follow named reexports and reject computed members and writes',()=>fixture(write=>{
 for(const prefix of ['', 'const ']){write('base.ts',`export ${prefix}enum E { A='a', B='b', C=3, D }`);write('helper.ts',"export {E} from './base';");const text="import {E} from './helper';export function rows(x:number[]){return x.map(v=>v+E.D);}",file=write('entry.ts',text);assert.deepEqual(evaluate(close(text,file).native)([1,2]),[5,6]);}
 write('helper.ts',"export enum E { A='a', B='b' } export function value(n:E){return n===E.A?1:2;}");{const text="import {value} from './helper';export function rows(x:('a'|'b')[]){return x.map(v=>value(v));}",file=write('entry.ts',text);assert.deepEqual(evaluate(close(text,file).native)(['a','b']),[1,2]);}
 write('helper.ts','export enum E { A=Math.floor(1) }');const text="import {E} from './helper';export function rows(x:number[]){return x.map(v=>v+E.A);}",file=write('entry.ts',text);assert.throws(()=>close(text,file),/computed member/);
}));
test('private literal graphs admit scalar lookups and reject mutation and escape',()=>fixture(write=>{
 for(const bad of ['', 'function mutate(){table.a.n=9;}', 'const escaped=table.a;', 'export {table};']){
 write('helper.ts',`const table={a:{n:2}, b:[3,4]} as const;${bad} export function value(n:number){return n+table.a.n+table.b[1];}`);
 const text="import {value} from './helper';export function rows(x:number[]){return x.map(v=>value(v));}",file=write('entry.ts',text);if(bad)assert.throws(()=>close(text,file),/constant graph/);else assert.deepEqual(evaluate(close(text,file).native)([1]),[7]);
 }
}));
test('throw-only classes compile with mandatory fallback and preserve original JS errors',()=>fixture(async(write,dir)=>{
 write('helper.ts',"export class AppError extends Error { constructor(message:string){super(message);this.name='AppError';} } export enum E { N=2 } const table={n:3} as const;export function value(n:number){if(n<0)throw new AppError('bad:'+n);return n+E.N+table.n;}");
 const text="import {value} from './helper';export function rows(x:number[]){return x.map(v=>value(v));}",file=write('entry.ts',text),modules=promotionCandidates(text,file,console.log,{ts});assert.equal(modules.length,1);assert.equal(modules[0].requiresFallback,true);
 checkFunctionTypes(ts,ts.createProgram([file],{strict:true,types:[]}),modules);
 const out=path.join(dir,'out');assert.equal((await buildPromotion(modules,out,{catchFallback:false})).length,1);
 const d=loadPromotion(path.join(out,'promotion.node'),{mode:'native',log:()=>{},crashGuard:{directory:path.join(dir,'markers')}}),id=modules[0].functions[0].id;
 const app={exports:{}};new Function('exports',ts.transpileModule(fs.readFileSync(path.join(dir,'helper.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(app.exports);
 const {AppError,value}=app.exports;let replays=0;const js=x=>{replays++;return x.map(value);};
 assert.deepEqual(d.dispatch(id,js,[[1,2]]),[6,7]);assert.equal(replays,0);
 for(let i=0;i<3;i++)assert.throws(()=>d.dispatch(id,js,[[-2]]),e=>e.constructor===AppError&&e instanceof AppError&&e.name==='AppError'&&e.message==='bad:-2');
 assert.equal(replays,3);assert.equal(d.snapshot()[id].fallback,3);assert.equal(d.snapshot()[id].native,1);
 for(const body of ['return new AppError("x");','const e=new AppError("x");throw e;','return n instanceof AppError;','try {throw new AppError("x");}catch(e){return 0;}']){
 write('helper.ts',`export class AppError extends Error {} export function value(n:number){${body}}`);assert.throws(()=>close(text,file));
 }
}));
test('writes, shadowing, schema calls and noncanonical array keys fail closed',()=>fixture(write=>{
 const text="import {value} from './helper';export function rows(x:number[]){return x.map(v=>value(v));}",file=write('entry.ts',text);
 for(const helper of [
  'const t={a:2} as const;const unused=eval("t.a=9");export function value(n:number){return n+t.a;}',
  'export enum E { A=2 } function mutate(){E.A=9;} export function value(n:number){return n+E.A;}',
  'const t=[2,3] as const;export function value(n:number){return n+t["01"]}',
  'const t={a:2} as const;function escape(){return t;} export function value(n:number){return n+t.a;}',
  'const t=Object.freeze({a:call()});export function value(n:number){return n+t.a;}',
  'const t=z.enum(["a"]);export function value(n:number){return n+t.enum.a;}',
 ]){write('helper.ts',helper);assert.throws(()=>close(text,file));}
 write('helper.ts','const t={a:2} as const;function read(t:{a:number}){return t.a;}export function value(n:number){return read({a:n})+t.a;}');assert.deepEqual(evaluate(close(text,file).native)([1]),[3]);
}));
test('checker resolves real Zod infer and type queries without copying schema values',()=>fixture((write,dir)=>{
 const appRequire=createRequire(new URL('../../../examples/demo/package.json',import.meta.url));
 fs.mkdirSync(path.join(dir,'node_modules'));
 fs.symlinkSync(path.dirname(appRequire.resolve('zod/package.json')),path.join(dir,'node_modules/zod'));
 fs.symlinkSync(path.dirname(appRequire.resolve('typescript/package.json')),path.join(dir,'node_modules/typescript'));
 const appTs=createRequire(path.join(dir,'package.json'))('typescript');
 const text="import type {Rows} from './helper';export function rows(x:Rows[]){return x.map(v=>v.n+1);}",file=write('entry.ts',text);
 write('helper.ts',"import {z} from 'zod';const schema=z.object({n:z.number()});export type Rows=z.infer<typeof schema>;");
 const result=dependencyClosure(text,file,'rows',{ts:appTs});
 assert.doesNotMatch(result.native,/schema|zod|typeof|infer/);assert.deepEqual(evaluate(result.native)([{n:2}]),[3]);
 assert.ok(result.dependencies.some(d=>d.file.endsWith('helper.ts')));
 write('helper.ts',"import {z} from 'zod';const schema=z.object({n:z.number(),date:z.date(),fn:z.function()});export type Rows=z.infer<typeof schema>;");
 const passText="import type {Rows} from './helper';export function rows(x:Rows[]){return x.map(v=>({n:v.n+1,date:v.date,original:v}));}";
 write('entry.ts',passText);const pass=dependencyClosure(passText,file,'rows',{ts:appTs});
 assert.ok(pass.opaqueInputs);assert.doesNotMatch(pass.native,/unknown|schema|zod|typeof|infer/);
 write('entry.ts',text);

 write('helper.ts','const value={n:2};export type Rows=typeof value;');assert.deepEqual(evaluate(dependencyClosure(text,file,'rows',{ts:appTs}).native)([{n:2}]),[3]);
 for(const schema of ['z.object({n:z.function()})','z.object({n:z.symbol()})','z.object({n:z.string().brand<"B">()})']){
  write('helper.ts',`import {z} from 'zod';const schema=${schema};export type Rows=z.infer<typeof schema>;`);
  assert.throws(()=>dependencyClosure(text,file,'rows',{ts:appTs}));
 }
 write('helper.ts','interface Recursive {n:Recursive};declare const value:Recursive;export type Rows=typeof value;');assert.throws(()=>dependencyClosure(text,file,'rows',{ts:appTs}));
}));
