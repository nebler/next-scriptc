import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire,stripTypeScriptTypes} from 'node:module';
import {promotionCandidates} from '../../packages/scriptc-promote/src/functions/promotion-discovery.mjs';
import {checkFunctionTypes} from '../../packages/scriptc-promote/src/functions/types.mjs';
import {strictClosureProgram} from '../../packages/scriptc-promote/src/functions/construction-proof.mjs';
import {buildPromotion} from '../../packages/scriptc-promote/src/functions/promotion-build.mjs';
const ts=createRequire(import.meta.url)('typescript'),base=process.cwd()+'/.checks/e1';await mkdir(base,{recursive:true});
const file=process.cwd()+'/research/boundary-encoders/fixture.ts',text=await readFile(file,'utf8');
const rows=promotionCandidates(text,file,console.log);for(const m of rows){const strict=strictClosureProgram(m.native,ts);for(const fn of m.functions){const declaration=strict.source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===fn.name);fn.start=declaration.body.getStart(strict.source);fn.strictClosure=true;}checkFunctionTypes(ts,strict.program,[{source:strict.source.fileName,functions:m.functions}]);}
console.log(JSON.stringify(rows.map(r=>r.functions),null,2));
await writeFile(base+'/reference.mjs',stripTypeScriptTypes(text));
const cf=process.cwd()+'/research/boundary-encoders/columns.ts',ct=await readFile(cf,'utf8');
const cols=promotionCandidates(ct,cf,console.log);checkFunctionTypes(ts,ts.createProgram([cf],{strict:true,target:ts.ScriptTarget.ES2022}),cols);
for(const target of [undefined,'linux-arm64-gnu']){
 const dir=base+'/'+(target?'linux':'host');
 if(!rows[0].functions[0].boundary.opaque)throw Error('missing projection');
 if((await buildPromotion(rows,dir,{target,timing:true,constructionResults:false})).length!==1)throw Error('fixture refused');
 if((await buildPromotion(cols,dir+'-columns',{target,timing:true,constructionResults:false})).length!==1)throw Error('columns refused');
}
