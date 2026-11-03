import fs from 'node:fs';
import {createRequire} from 'node:module';
const ts=createRequire(process.cwd()+'/packages/scriptc-promote/package.json')('typescript');
const root=process.argv[2]||process.cwd();const {promotionCandidates}=await import(root+'/packages/scriptc-promote/src/functions/promotion-discovery.mjs');
const cases={
 defaultEffect:'const table={n:2};function init(){table.n=9;return 0;}export default init();export function rows(x:number[]){return x.map(v=>v+table.n);}',
 statefulLiteral:'const table={r:/x/g};export function advance(){table.r.test("x");}export function rows(x:string[]){return x.map(v=>table.r.test(v));}',
 caught:'class Fault extends Error{};export function rows(x:string[]){return x.map(v=>{try{if(v==="bad")throw new Fault("bad");return v.length;}catch{return -1;}});}',
 constructor:'const table={n:2};export function rows(x:number[]){const y=new Set(x);return x.map(v=>v+table.n+y.size);}',
 unsupportedCall:'const table={n:2};export function rows(x:number[]){return x.map(v=>v+table.n).concat(x);}',
 uninitialized:'const table={n:2};export function rows(x:number[]){let s:number;s=0;for(const v of x)s+=v;return s+table.n;}',
 reverse:'export function rows(x:number[]){const a=x.map(v=>v+1);a.reverse();return a;}',
 alias:'export function rows(x:{n:number}[]){const a=x;for(const v of a)v.n++;return a.map(v=>v.n);}',
 aliaspush:'export function rows(x:number[]){const a=x;a.push(9);return a.map(v=>v+1);}',
 init:'const n=Math.max(2,3);export function rows(x:number[]){return x.map(v=>v+n);}',
 arithmetic:'const n=2*3;export function rows(x:number[]){return x.map(v=>v+n);}',
 exported:'export const table={n:2};export function rows(x:number[]){return x.map(v=>v+table.n);}',
 unresolved:'const table=[1,2];export function rows(x:number[]){return x.map(v=>table.includes(v)?1:0);}',
 dynamic:'const table={a:2,b:3};export function rows(x:("a"|"b")[]){return x.map(v=>table[v]);}',
 literals:'const table={n:2*3};export function rows(x:number[]){return x.map(v=>v+table.n);}',
 escape:'const table={n:2};function mutate(){table.n=4;}export function rows(x:number[]){return x.map(v=>v+table.n);}',
 property:'const table={get n(){return 2;}};export function rows(x:number[]){return x.map(v=>v+table.n);}',
 default:'function helper(){return 2;}export default helper;export function rows(x:number[]){return x.map(v=>v+1);}',
 defaultclass:'class Helper{}export default Helper;export function rows(x:number[]){return x.map(v=>v+1);}',
 defaultcall:'export default Math.random();export function rows(x:number[]){return x.map(v=>v+1);}',
};fs.mkdirSync('/tmp/b1c-fixtures',{recursive:true});const out=[];for(const [name,text]of Object.entries(cases)){const file='/tmp/b1c-fixtures/'+name+'.ts';fs.writeFileSync(file,text);const messages=[];try{const m=promotionCandidates(text,file,s=>messages.push(s),{ts});out.push({name,text,accepted:m.some(m=>m.functions[0].name==='rows'),messages,native:m.find(m=>m.functions[0].name==='rows')?.native});}catch(e){out.push({name,text,error:e.message});}}console.log(JSON.stringify(out,null,2));
