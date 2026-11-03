import {strictClosureProgram} from './construction-proof.mjs';
export const checkedIndexHelper='function __scriptc_checked_index<T>(array: T[], index: number): T { if (index < 0 || index >= array.length || index % 1 !== 0) throw "__scriptc_throw_fallback__"; const value = array[index]; if (value === undefined) throw "__scriptc_throw_fallback__"; return value; }';
const typedArrays=['Int8Array','Int16Array','Int32Array','Uint8Array','Uint16Array','Uint32Array','Float32Array','Float64Array'];
function helper(type){if(type?.endsWith('_bounded')){const plain=type.slice(0,-8);return `function __scriptc_checked_index_${type}(array: ${plain}, index: number): number { return array[index] ?? 0; }`;}return type?checkedIndexHelper.replace('__scriptc_checked_index<T>','__scriptc_checked_index_'+type).replace('array: T[]','array: '+type).replace('): T {','): number {'):checkedIndexHelper;}
export function isCheckedIndexHelper(node,source){const name=node.name?.text;if(!name?.startsWith('__scriptc_checked_index'))return false;const type=name.slice('__scriptc_checked_index_'.length);if(name!=='__scriptc_checked_index'&&!typedArrays.includes(type.replace(/_bounded$/,'')))return false;return node.getText(source).replace(/\s/g,'')===helper(name==='__scriptc_checked_index'?null:type).replace(/\s/g,'');}
export function provenFixedTypedIndex(n,checker,ts){
  if(!ts.isIdentifier(n.expression)||!ts.isIdentifier(n.argumentExpression))return false;
  const allocation=checker.getSymbolAtLocation(n.expression)?.valueDeclaration;
  if(!allocation||!ts.isVariableDeclaration(allocation)||!(allocation.parent.flags&ts.NodeFlags.Const)||!allocation.initializer||!ts.isNewExpression(allocation.initializer))return false;
  const constructor=allocation.initializer.expression;
  if(!ts.isIdentifier(constructor)||!typedArrays.includes(constructor.text)||checker.getSymbolAtLocation(constructor)?.declarations?.some(d=>d.getSourceFile()===n.getSourceFile()))return false;
  const size=allocation.initializer.arguments?.[0];if(!size||!ts.isNumericLiteral(size))return false;
  const symbol=checker.getSymbolAtLocation(n.argumentExpression),declaration=symbol?.valueDeclaration;
  if(!declaration||!ts.isVariableDeclaration(declaration)||!declaration.initializer||!ts.isNumericLiteral(declaration.initializer)||Number(declaration.initializer.text)!==0)return false;
  const loop=declaration.parent.parent,c=loop.condition,u=loop.incrementor;
  if(!ts.isForStatement(loop)||!c||!ts.isBinaryExpression(c)||c.operatorToken.kind!==ts.SyntaxKind.LessThanToken||checker.getSymbolAtLocation(c.left)!==symbol||!ts.isNumericLiteral(c.right)||Number(c.right.text)!==Number(size.text)||!u||!ts.isPostfixUnaryExpression(u)||u.operator!==ts.SyntaxKind.PlusPlusToken||checker.getSymbolAtLocation(u.operand)!==symbol)return false;
  let parent=n.parent;while(parent&&parent!==loop){if(ts.isFunctionLike(parent))return false;parent=parent.parent;}if(!parent)return false;
  let changed=false;function audit(x){if((ts.isBinaryExpression(x)&&x.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&x.operatorToken.kind<=ts.SyntaxKind.LastAssignment&&checker.getSymbolAtLocation(x.left)===symbol)||((ts.isPrefixUnaryExpression(x)||ts.isPostfixUnaryExpression(x))&&checker.getSymbolAtLocation(x.operand)===symbol))changed=true;ts.forEachChild(x,audit);}audit(loop.statement);return !changed;
 }

// Evaluate the original receiver/key/read exactly once. Undefined (including a
// hole or out-of-range index) aborts native execution before it can be observed.
export function lowerCheckedIndexes(text,ts){
 if(!text.includes('__scriptc_checked_index')&&!/[\w)\]]\s*\[[^\]]+\]/.test(text))return {native:text,requiresFallback:false};
 const {source,checker}=strictClosureProgram(text,ts),edits=[];
 if(text.includes('__scriptc_checked_index')){if(!source.statements.some(n=>isCheckedIndexHelper(n,source)))throw Error('reserved checked index helper');return {native:text,requiresFallback:source.statements.some(n=>isCheckedIndexHelper(n,source)&&!n.name.text.endsWith('_bounded'))};}
 function walk(n){
  if(ts.isElementAccessExpression(n)&&!n.questionDotToken&&(checker.isArrayType(checker.getTypeAtLocation(n.expression))||['Int8Array','Int16Array','Int32Array','Uint8Array','Uint16Array','Uint32Array','Float32Array','Float64Array'].includes(checker.getTypeAtLocation(n.expression).getSymbol()?.name))){
   const p=n.parent,write=ts.isBinaryExpression(p)&&p.left===n&&p.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&p.operatorToken.kind<=ts.SyntaxKind.LastAssignment||ts.isPrefixUnaryExpression(p)||ts.isPostfixUnaryExpression(p)||ts.isDeleteExpression(p)||ts.isCallExpression(p)&&p.expression===n;
   const key=checker.getTypeAtLocation(n.argumentExpression),type=checker.getTypeAtLocation(n);
   if(!write&&!ts.isNonNullExpression(p)&&key.flags&ts.TypeFlags.NumberLike&&type.isUnion()&&type.types.some(t=>t.flags&ts.TypeFlags.Undefined)){
    edits.push([n,typedArrays.includes(checker.getTypeAtLocation(n.expression).getSymbol()?.name)?checker.getTypeAtLocation(n.expression).getSymbol().name+(provenFixedTypedIndex(n,checker,ts)?'_bounded':''):null]);
   }
  }
  ts.forEachChild(n,walk);
 }
 walk(source);if(!edits.length)return {native:text,requiresFallback:false};
 const selected=new Map(edits);
 const result=ts.transform(source,[context=>root=>ts.visitNode(root,function visit(n){const updated=ts.visitEachChild(n,visit,context);return selected.get(n)?.endsWith('_bounded')?ts.factory.createNonNullExpression(updated):selected.has(n)?ts.factory.createCallExpression(ts.factory.createIdentifier('__scriptc_checked_index'+(selected.get(n)?'_'+selected.get(n):'')),undefined,[updated.expression,updated.argumentExpression]):updated;})]);
 const native=ts.createPrinter().printFile(result.transformed[0]);result.dispose();
 return {native:[...new Set(edits.filter(([,type])=>!type?.endsWith('_bounded')).map(([,type])=>helper(type)))].join('\n')+'\n'+native,requiresFallback:edits.some(([,type])=>!type?.endsWith('_bounded'))};
}
