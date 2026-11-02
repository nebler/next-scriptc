import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {stripTypeScriptTypes,createRequire} from 'node:module';
import {promotionCandidates} from '../../packages/scriptc-promote/src/functions/promotion-discovery.mjs';
import {checkFunctionTypes} from '../../packages/scriptc-promote/src/functions/types.mjs';
import {buildPromotion} from '../../packages/scriptc-promote/src/functions/promotion-build.mjs';
import loader from '../../packages/scriptc-promote/src/functions/loader.mjs';
const root=process.cwd(),base=root+'/.checks/d3';await mkdir(base,{recursive:true});
for(const part of ['loader','promotion']){
 let old=execFileSync('git',['show','79fce825ba186780ed3890809179672fa577aee4:packages/scriptc-promote/src/functions/'+part+'.mjs'],{encoding:'utf8'});
 for(const name of ['dependency-closure','promotion-policy','promotion-encodings','json'])old=old.replaceAll('./'+name+'.mjs','../../packages/scriptc-promote/src/functions/'+name+'.mjs');
 await writeFile(base+'/before-'+part+'.mjs',old);
}
const ts=createRequire(import.meta.url)('typescript');
const text=await readFile('examples/demo/lib/nested-aggregation.ts','utf8'),source=base+'/fixture.ts';await writeFile(source,text);
const rows=promotionCandidates(text,source,console.log);checkFunctionTypes(ts,ts.createProgram([source],{strict:true,target:ts.ScriptTarget.ES2022}),rows);
const accepted=await buildPromotion(rows,base+'/native',{target:'linux-arm64-gnu'});if(accepted.length!==2)throw Error('expected two accepted candidates');
await writeFile(base+'/off.mjs',stripTypeScriptTypes(text));
const module={...accepted[0],functions:accepted.flatMap(m=>m.functions)};
const options={modules:{[source]:module},server:true,promotionClient:'./client.mjs',promotionFile:''};
await writeFile(base+'/after.mjs',stripTypeScriptTypes(loader.call({resourcePath:source,getOptions:()=>options},text)));
// Frozen pre-D3 implementation, copied from the committed base before edits.
const {default:before}=await import('../../.checks/d3/before-loader.mjs');
await writeFile(base+'/before.mjs',stripTypeScriptTypes(before.call({resourcePath:source,getOptions:()=>options},text)));
await writeFile(base+'/client.mjs',`export function promote(_f,id,js,args){return globalThis.d3Dispatcher.dispatch(id,js,args);}`);

await writeFile('research/nested-dispatch/fixture-artifacts.json',JSON.stringify({baseline:'79fce825ba186780ed3890809179672fa577aee4',artifacts:await Promise.all(['native/promotion.node','native/ids.json','native/encodings.json','off.mjs','before.mjs','after.mjs'].map(async name=>{const b=await readFile(base+'/'+name);return {name,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')};}))},null,2)+'\n');
