// Original audit example outside the lost-211 cohort. Pass the B1 archive root.
import fs from 'node:fs';
import {createRequire,stripTypeScriptTypes} from 'node:module';
import {buildPromotion} from '../../../packages/scriptc-promote/src/functions/promotion-build.mjs';
import {loadPromotion} from '../../../packages/scriptc-promote/src/functions/promotion-runtime.mjs';
import {checkFunctionTypes} from '../../../packages/scriptc-promote/src/functions/types.mjs';
const ts=createRequire(process.cwd()+'/packages/scriptc-promote/package.json')('typescript');
const {promotionCandidates}=await import(process.argv[2]+'/packages/scriptc-promote/src/functions/promotion-discovery.mjs');
const dir=fs.mkdtempSync('/tmp/b1c-destructure-');try{
 const text='const {n}:any={n:"a"};export function rows(x:string[]):string[]{return x.map(v=>n.n+v);}',file=dir+'/entry.ts';fs.writeFileSync(file,text);
 const modules=promotionCandidates(text,file,()=>{},{ts});
 checkFunctionTypes(ts,ts.createProgram([file],{strict:true,types:[],target:ts.ScriptTarget.ES2022}),modules);
 const built=await buildPromotion(modules,dir+'/out');
 const original=new Function(stripTypeScriptTypes(text.replace('export function','function'))+';return rows;')();
 const result={text,baseline:'6cfeb847',accepted:modules.length===1,native:modules[0]?.native,built:built.length,js:original(['b'])};
 if(built.length){const d=loadPromotion(dir+'/out/promotion.node',{mode:'native',log:()=>{},crashGuard:{directory:dir+'/markers'}});result.forcedNative=d.dispatch(modules[0].functions[0].id,original,[['b']]);result.snapshot=d.snapshot();}
 fs.writeFileSync(new URL('destructuring-gap.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
