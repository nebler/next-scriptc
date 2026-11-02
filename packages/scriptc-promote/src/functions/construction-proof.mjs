// An intentionally small immutable language. Unknown syntax fails closed.
// Run on the extracted closure, never on just the exported function body.
import {localConstruction} from './construction-local.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
export function constructionProof(text, ts) {
 try { ts ??= require(require.resolve('typescript',{paths:[process.cwd()]})); }
 catch { return {eligible:false,reason:'TypeScript checker unavailable',version:1}; }
 const {program,source,checker}=strictClosureProgram(text,ts);
 const fail=(node,reason)=>{throw Error(`${reason} at ${source.getLineAndCharacterOfPosition(node.getStart(source)).line+1}`);};
 const bad=new Set(['__proto__','prototype','constructor','toJSON']);
 const functions=new Map(),edges=new Map();
 let initialized=new Set();
 const symbol=n=>ts.isShorthandPropertyAssignment(n.parent)&&n.parent.name===n ? checker.getShorthandAssignmentValueSymbol(n.parent) : checker.getSymbolAtLocation(n);
 function data(type,seen=new Set(),depth=0){
  if(depth>32||seen.has(type))return false;
  if(type.flags&(ts.TypeFlags.StringLike|ts.TypeFlags.NumberLike|ts.TypeFlags.BooleanLike|ts.TypeFlags.Null))return true;
  if(type.isUnion())return type.types.every(t=>data(t,seen,depth+1));
  if(!(type.flags&ts.TypeFlags.Object)||checker.getSignaturesOfType(type,ts.SignatureKind.Call).length||checker.getSignaturesOfType(type,ts.SignatureKind.Construct).length)return false;
  const next=new Set(seen).add(type);
  if(checker.isArrayType(type))return data(checker.getTypeArguments(type)[0],next,depth+1);
  if(checker.isTupleType(type)||checker.getIndexInfosOfType(type).length)return false;
  if(type.getSymbol()?.declarations?.some(d=>ts.isClassDeclaration(d)||ts.isClassExpression(d)))return false;
  return checker.getPropertiesOfType(type).every(p=>!bad.has(p.name)&&!(p.flags&ts.SymbolFlags.Optional)&&!p.name.startsWith('__@')&&!p.declarations?.some(d=>ts.isGetAccessorDeclaration(d)||ts.isSetAccessorDeclaration(d))&&data(checker.getTypeOfSymbolAtLocation(p,p.valueDeclaration??p.declarations?.[0]??source),next,depth+1));
 }
 function expr(n,owner){
  if(!n)fail(source,'missing expression');
  if(!data(checker.getTypeAtLocation(n)))fail(n,'expression is not bounded JSON data');
  if(ts.isIdentifier(n)){
   const s=symbol(n),ds=s?.declarations;
   if(!ds?.length||ds.some(d=>d.getSourceFile()!==source)||functions.has(s)||!initialized.has(s))fail(n,'opaque, function or uninitialized reference');
   return;
  }
  if(ts.isStringLiteral(n)||ts.isNumericLiteral(n)||[ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword,ts.SyntaxKind.NullKeyword].includes(n.kind)){
   if(ts.isNumericLiteral(n)&&!Number.isFinite(Number(n.text)))fail(n,'non-finite literal');
   if(ts.isStringLiteral(n)&&!n.text.isWellFormed())fail(n,'ill-formed string literal');
   return;
  }
  if(ts.isParenthesizedExpression(n))return expr(n.expression,owner);
  if(ts.isPrefixUnaryExpression(n)&&[ts.SyntaxKind.MinusToken,ts.SyntaxKind.PlusToken].includes(n.operator)&&ts.isNumericLiteral(n.operand))return expr(n.operand,owner);
  if(ts.isArrayLiteralExpression(n)){for(const e of n.elements)expr(e,owner);return;}
  if(ts.isObjectLiteralExpression(n)){
   for(const p of n.properties){
    if(!ts.isPropertyAssignment(p)&&!ts.isShorthandPropertyAssignment(p))fail(p,'only data properties allowed');
    if(!ts.isIdentifier(p.name)&&!ts.isStringLiteral(p.name)&&!ts.isNumericLiteral(p.name))fail(p,'computed property');
    if(bad.has(p.name.text)||!p.name.text.isWellFormed())fail(p,'reserved or ill-formed property');
    expr(ts.isShorthandPropertyAssignment(p)?p.name:p.initializer,owner);
   }return;
  }
  if(ts.isPropertyAccessExpression(n)){
   if(bad.has(n.name.text)||!checker.getPropertyOfType(checker.getTypeAtLocation(n.expression),n.name.text))fail(n,'unsafe property read');
   expr(n.expression,owner);return;
  }
  if(ts.isConditionalExpression(n)){expr(n.condition,owner);expr(n.whenTrue,owner);expr(n.whenFalse,owner);return;}
  if(ts.isBinaryExpression(n)&&['===','!==','<','>','<=','>=','&&','||','??'].includes(n.operatorToken.getText(source))){
   if(['<','>','<=','>='].includes(n.operatorToken.getText(source)))for(const operand of [n.left,n.right]){const t=checker.getTypeAtLocation(operand);if(!(t.flags&(ts.TypeFlags.StringLike|ts.TypeFlags.NumberLike)))fail(n,'coercing comparison');}
   expr(n.left,owner);expr(n.right,owner);return;
  }
  if(ts.isCallExpression(n)){
   if(n.typeArguments?.length)fail(n,'explicit type arguments');
   if(ts.isIdentifier(n.expression)&&functions.has(symbol(n.expression))){
    const target=functions.get(symbol(n.expression));edges.get(owner)?.add(target);
    for(const a of n.arguments)expr(a,owner);return;
   }
   if(ts.isPropertyAccessExpression(n.expression)&&['map','filter'].includes(n.expression.name.text)&&checker.isArrayType(checker.getTypeAtLocation(n.expression.expression))&&n.arguments.length===1&&ts.isArrowFunction(n.arguments[0])){
    expr(n.expression.expression,owner);fn(n.arguments[0],owner);return;
   }
   fail(n,'call outside allocating array/local helper allowlist');
  }
  fail(n,`syntax ${ts.SyntaxKind[n.kind]} is outside construction allowlist`);
 }
 function fn(n,owner=n){
  const outer=initialized;initialized=new Set(outer);
  if(n.asteriskToken||n.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword)||n.typeParameters?.length)fail(n,'async, generator or generic function');
  for(const p of n.parameters){if(!ts.isIdentifier(p.name)||p.initializer||p.dotDotDotToken||p.questionToken||!data(checker.getTypeAtLocation(p)))fail(p,'non-data/default/rest parameter');initialized.add(symbol(p.name));}
  if(ts.isBlock(n.body))for(const s of n.body.statements)stmt(s,owner);else expr(n.body,owner);
  initialized=outer;
 }
 function stmt(n,owner){
  if(ts.isThrowStatement(n)&&ts.isStringLiteral(n.expression)&&n.expression.text==='__scriptc_throw_fallback__')return ;
  if(ts.isReturnStatement(n)){expr(n.expression,owner);return;}
  if(ts.isBlock(n)){for(const s of n.statements)stmt(s,owner);return;}
  if(ts.isIfStatement(n)){expr(n.expression,owner);stmt(n.thenStatement,owner);if(n.elseStatement)stmt(n.elseStatement,owner);return;}
  if(ts.isVariableStatement(n)&&n.declarationList.flags&ts.NodeFlags.Const){
   for(const d of n.declarationList.declarations){if(!ts.isIdentifier(d.name))fail(d,'destructuring');expr(d.initializer,owner);initialized.add(symbol(d.name));}return;
  }
  fail(n,`statement ${ts.SyntaxKind[n.kind]} is outside construction allowlist`);
 }
 try{
  // Assertions and unsafe annotations anywhere, including unreachable helpers.
  function annotations(n){if([ts.SyntaxKind.AnyKeyword,ts.SyntaxKind.UnknownKeyword,ts.SyntaxKind.AsExpression,ts.SyntaxKind.TypeAssertionExpression,ts.SyntaxKind.NonNullExpression,ts.SyntaxKind.SatisfiesExpression].includes(n.kind))fail(n,'unsafe type escape');ts.forEachChild(n,annotations);}annotations(source);
  for(const n of source.statements)if(ts.isFunctionDeclaration(n)&&n.name){functions.set(symbol(n.name),n);edges.set(n,new Set());}
  for(const n of source.statements){
   if(ts.isFunctionDeclaration(n)&&n.body)fn(n);
   else if(ts.isTypeAliasDeclaration(n)||ts.isInterfaceDeclaration(n)||ts.isExportDeclaration(n)&&!n.moduleSpecifier)continue;
   // Module initialization can call helpers before captured consts initialize.
   else fail(n,'module statement outside function/type/export allowlist');
  }
  const active=new Set(),done=new Set();
  function acyclic(n){if(active.has(n))fail(n,'recursive helper graph');if(done.has(n))return;active.add(n);for(const e of edges.get(n))acyclic(e);active.delete(n);done.add(n);}for(const n of edges.keys())acyclic(n);
  const errors=ts.getPreEmitDiagnostics(program);if(errors.length)fail(source,`checker diagnostic TS${errors[0].code}`);
  return {eligible:true,reason:'immutable acyclic JSON construction (experimental; resource/compiler parity unproven)',version:1};
 }catch(e){try {const {shapes,guards}=localConstruction(source,checker,ts);const errors=ts.getPreEmitDiagnostics(program);if(errors.length)fail(source,`checker diagnostic TS${errors[0].code}`);return {eligible:true,reason:'local allocation construction with typed value scan',version:2,shapes,guards};}catch(local){return {eligible:false,reason:local.message,version:2};}}
}

// Shared by effect proofs and non-strict application boundary discovery.
export function strictClosureProgram(text,ts) {
 const file='/__next_scriptc_construction__.ts';
 const options={strict:true,noUncheckedIndexedAccess:true,target:ts.ScriptTarget.ESNext,types:[]};
 const host=ts.createCompilerHost(options), original=host.getSourceFile.bind(host);
 host.getSourceFile=(name,...args)=>name===file?ts.createSourceFile(file,text,options.target,true):original(name,...args);
 const program=ts.createProgram([file],options,host);
 return {program,source:program.getSourceFile(file),checker:program.getTypeChecker()};
}
