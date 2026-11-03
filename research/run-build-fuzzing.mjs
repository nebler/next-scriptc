// Local-only corpus runner; all generated sources and native artifacts stay in /tmp.
import {createRequire} from 'node:module';
const ts=createRequire(new URL('../packages/scriptc-promote/package.json',import.meta.url))('typescript');
import {sources} from '../packages/scriptc-promote/test/support/promotion-fuzz-corpus.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {fuzzCommand} from '../packages/scriptc-promote/src/fuzz.mjs';
const dir=await mkdtemp('/tmp/scriptc-fuzz-corpus-');
try{
 await writeFile(dir+'/tsconfig.json',JSON.stringify({compilerOptions:{strict:true,target:'ESNext'}}));
 for(const [i,source] of sources.entries()){
  const file=ts.createSourceFile('fixture.ts',source,ts.ScriptTarget.Latest,true);
  const fn=file.statements.find(s=>ts.isFunctionDeclaration(s)&&s.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword));
  const offset=fn.body.getStart(file)+1;
  await writeFile(dir+'/'+i+'.ts',source.slice(0,offset)+'"use native";'+source.slice(offset));
 }
 await fuzzCommand([dir,'--budget-ms','200','--json',process.argv[2]??'/tmp/scriptc-fuzz-corpus.json']);
}finally{await rm(dir,{recursive:true,force:true});}
