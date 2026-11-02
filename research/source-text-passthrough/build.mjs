import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire,stripTypeScriptTypes} from 'node:module';
import {promotionCandidates} from '../../packages/scriptc-promote/src/functions/promotion-discovery.mjs';
import {strictClosureProgram,constructionProof} from '../../packages/scriptc-promote/src/functions/construction-proof.mjs';
import {checkFunctionTypes} from '../../packages/scriptc-promote/src/functions/types.mjs';
import {buildPromotion} from '../../packages/scriptc-promote/src/functions/promotion-build.mjs';
const ts=createRequire(new URL('../../packages/scriptc-promote/package.json',import.meta.url))('typescript'),base=process.cwd()+'/.checks/e2';await mkdir(base,{recursive:true});
const file=process.cwd()+'/research/source-text-passthrough/fixture.ts',text=await readFile(file,'utf8');
const rows=promotionCandidates(text,file,console.log,{ts});
for(const m of rows){const strict=strictClosureProgram(m.native,ts);for(const fn of m.functions){fn.start=strict.source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===fn.name).body.getStart(strict.source);fn.strictClosure=true;fn.constructionProof=constructionProof(m.native,ts);}checkFunctionTypes(ts,strict.program,[{source:strict.source.fileName,functions:m.functions}]);}
if((await buildPromotion(rows,base,{timing:true})).length!==1)throw Error('fixture refused');
await writeFile(base+'/reference.mjs',stripTypeScriptTypes(text));
