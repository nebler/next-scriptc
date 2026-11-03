import {babelModules} from '../babel.mjs';
import {parserOptions} from './parser-options.mjs';
// Used only with a subsequent construction proof. That proof excludes lexical
// this/arguments, function identity inspection, and escapes of function values.
export function normalizeModuleFunctions(text,source,options){
 const b=babelModules,t=b.types(),ast=b.parser().parse(text,parserOptions(source,options));let changed=false;
 ast.program.body=ast.program.body.flatMap(statement=>{
  if(statement.type!=='VariableDeclaration'||statement.kind!=='const')return [statement];
  const out=[];
  for(const d of statement.declarations){
   const n=d.init;
   if(d.id.type==='Identifier'&&!d.id.typeAnnotation&&(n?.type==='ArrowFunctionExpression'||n?.type==='FunctionExpression'&&!n.id)){
    const body=n.body.type==='BlockStatement'?n.body:t.blockStatement([t.returnStatement(n.body)]);
    const fn=t.functionDeclaration(t.cloneNode(d.id),n.params,body,n.generator??false,n.async??false);fn.typeParameters=n.typeParameters;fn.returnType=n.returnType;out.push(fn);changed=true;
   }else out.push(t.variableDeclaration(statement.kind,[d]));
  }
  return out;
 });
 return {native:changed?b.generator().default(ast).code:text,changed};
}
