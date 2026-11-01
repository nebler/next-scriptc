import ts from 'typescript';
import path from 'node:path';
import { checkFunctionTypes } from '../../packages/next-scriptc/src/functions/types.mjs';
const cfg=ts.readConfigFile(new URL('./tsconfig.json',import.meta.url).pathname,ts.sys.readFile);
const parsed=ts.parseJsonConfigFileContent(cfg.config,ts.sys,new URL('.',import.meta.url).pathname);
const output=[];
for(const repo of ['papermark','dub','cal','umami','twenty','formbricks']) {
 const file=path.resolve(`research/real-app-targets/${repo}/entry.ts`);
 const program=ts.createProgram([file],parsed.options); program.getTypeChecker(); const source=program.getSourceFile(file);
 function visit(node) {
  if(ts.isFunctionLike(node)&&node.body) {
   const name=node.name?.getText(source)??(ts.isVariableDeclaration(node.parent)?node.parent.name.getText(source):'anonymous');
   if(node.parent===source||ts.isVariableDeclaration(node.parent)) {
    try {checkFunctionTypes(ts,program,[{source:file,functions:[{name,start:node.body.getStart(source)}]}]);output.push({repo,name,pass:true});}
    catch(e){output.push({repo,name,pass:false,reason:e.message.replace(file,`${repo}/entry.ts`)});}
   }
  }
  ts.forEachChild(node,visit);
 }
 visit(source);
}
console.log(JSON.stringify(output,null,2));
