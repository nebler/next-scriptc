// Binding reads are admitted only with creation-only setup. Otherwise setup or
// an import cycle could invoke an exported function before a captured const is
// initialized. The retained closure also needs a construction proof at the caller.
const setupCache=new WeakMap();
function initializedDeclaration(n,scope){
 const binding=scope?.getBinding?.(n.name);
 return !!binding&&!binding.path.node.declare&&(binding.path.isFunctionDeclaration()||binding.path.isClassDeclaration()&&binding.path.node.end<n.start);
}
function containsNode(node,match){
 const seen=new Set(),pending=[node];while(pending.length){const n=pending.pop();if(!n||typeof n!=='object'||seen.has(n))continue;seen.add(n);if(match(n))return true;pending.push(...Object.values(n));}return false;
}
const hasDecorator=node=>containsNode(node,n=>n.type==='Decorator');
export const hasLexicalEval=scope=>containsNode(scope?.path?.node,n=>n.type==='CallExpression'&&n.callee.type==='Identifier'&&n.callee.name==='eval');
// Object spread is creation-only here only for a prior const literal whose
// properties are scalar data. General spreads can invoke getters and stay out.
function scalarSnapshot(scope,spread){
 if(spread.argument?.type!=='Identifier')return false;
 const b=scope.getBinding(spread.argument.name),d=b?.path;
 if(b?.kind!=='const'||!d.isVariableDeclarator()||d.node.id.type!=='Identifier'||d.parent.declare||d.node.end>=spread.start)return false;
 let n=d.node.init;while(n?.type==='TSAsExpression')n=n.expression;
 const scalar=n=>n&&(['StringLiteral','BooleanLiteral','NullLiteral'].includes(n.type)||n.type==='NumericLiteral'&&Number.isFinite(n.value)||n.type==='UnaryExpression'&&['+','-'].includes(n.operator)&&n.argument.type==='NumericLiteral'&&Number.isFinite(n.argument.value)||literalArithmetic(n)!==undefined);
 return n?.type==='ObjectExpression'&&n.properties.every(p=>p.type==='ObjectProperty'&&!p.computed&&!p.shorthand&&scalar(p.value));
}
export function creationOnlySetup(scope){
 if(!scope?.path?.isProgram())return false;if(setupCache.has(scope))return setupCache.get(scope);if(hasLexicalEval(scope)){setupCache.set(scope,false);return false;}
 const value=n=>!n||literalArithmetic(n)!==undefined||n.type==='TSAsExpression'&&value(n.expression)||n.type==='ArrayExpression'&&n.elements.every(e=>e&&value(e))||n.type==='ObjectExpression'&&n.properties.every(p=>p.type==='SpreadElement'?scalarSnapshot(scope,p):!p.computed&&(p.type==='ObjectProperty'&&value(p.value)||p.type==='ObjectMethod'))||n.type==='CallExpression'&&n.callee.type==='MemberExpression'&&!n.callee.computed&&n.callee.object.name==='Object'&&!scope.getBinding('Object')&&n.callee.property.name==='freeze'&&n.arguments.length===1&&value(n.arguments[0])||inertDefaultExpression(n);
 function declaration(n){
  if(!n)return true;
  if(['FunctionDeclaration','TSDeclareFunction','TSTypeAliasDeclaration','TSInterfaceDeclaration','EmptyStatement'].includes(n.type))return !hasDecorator(n);
  if(n.type==='VariableDeclaration')return !n.declare&&n.declarations.every(d=>d.id.type==='Identifier'&&value(d.init));
  if(n.type==='ClassDeclaration')return n.declare||!hasDecorator(n)&&(!n.superClass||n.superClass.type==='Identifier'&&n.superClass.name==='Error'&&!scope.getBinding('Error'))&&n.body.body.every(m=>!m.computed&&(['ClassMethod','ClassPrivateMethod'].includes(m.type)||['ClassProperty','ClassPrivateProperty'].includes(m.type)&&(!m.static||value(m.value))));
  return false;
 }
 const result=scope.path.node.body.every(n=>{
  if(n.type==='ImportDeclaration')return n.importKind==='type';
  if(n.type==='ExportAllDeclaration')return n.exportKind==='type';
  if(n.type==='ExportNamedDeclaration')return n.exportKind==='type'||!n.source&&declaration(n.declaration);
  if(n.type==='ExportDefaultDeclaration')return n.declaration.type==='Identifier'?initializedDeclaration(n.declaration,scope):inertDefaultExpression(n.declaration);
  return declaration(n);
 });setupCache.set(scope,result);return result;
}

// Unused defaults may create inert data or read an initialized declaration.
// Calls, spreads, computed keys and other identifier reads remain unproved.
export function inertDefaultExpression(n,scope){
 if(n?.type==='Identifier')return initializedDeclaration(n,scope)&&creationOnlySetup(scope);
 if(!n)return false;
 if(['StringLiteral','NumericLiteral','BooleanLiteral','NullLiteral','RegExpLiteral','FunctionExpression','ArrowFunctionExpression'].includes(n.type))return true;
 if(n.type==='UnaryExpression'&&['+','-'].includes(n.operator)&&n.argument.type==='NumericLiteral')return true;
 if(n.type==='ObjectExpression')return n.properties.every(p=>!p.computed&&(p.type==='ObjectProperty'&&inertDefaultExpression(p.value)||p.type==='ObjectMethod'));
 if(n.type==='ArrayExpression')return n.elements.every(e=>inertDefaultExpression(e));
 return n.type==='TSAsExpression'&&inertDefaultExpression(n.expression);
}

// Evaluate only numeric literal arithmetic. No names, calls, coercion, or
// non-finite values enter the constant graph. Keep negative zero out because
// Babel's numeric literal printer does not preserve its sign.
export function literalArithmetic(n){
 if(n?.type==='NumericLiteral')return Number.isFinite(n.value)&&!Object.is(n.value,-0)?n.value:undefined;
 if(n?.type==='UnaryExpression'&&['+','-'].includes(n.operator)){
  const a=literalArithmetic(n.argument);if(a===undefined)return;
  const value=n.operator==='-'?-a:a;return Number.isFinite(value)&&!Object.is(value,-0)?value:undefined;
 }
 if(n?.type!=='BinaryExpression'||!['+','-','*','/','%','**'].includes(n.operator))return;
 const a=literalArithmetic(n.left),b=literalArithmetic(n.right);if(a===undefined||b===undefined)return;
 const value=({'+':()=>a+b,'-':()=>a-b,'*':()=>a*b,'/':()=>a/b,'%':()=>a%b,'**':()=>a**b})[n.operator]();
 return Number.isFinite(value)&&!Object.is(value,-0)?value:undefined;
}
