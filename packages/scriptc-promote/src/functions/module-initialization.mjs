// Creation-only defaults are not observed by the retained closure. No calls,
// spreads, computed keys or identifier reads are evaluated by this rule.
export function inertDefaultExpression(n,scope){
 if(n?.type==='Identifier'){const binding=scope?.getBinding(n.name);return !!binding&&(binding.path.isFunctionDeclaration()||binding.path.isClassDeclaration()&&binding.path.node.end<n.start);}
 if(!n)return false;
 if(['StringLiteral','NumericLiteral','BooleanLiteral','NullLiteral','RegExpLiteral','FunctionExpression','ArrowFunctionExpression'].includes(n.type))return true;
 if(n.type==='UnaryExpression'&&['+','-'].includes(n.operator)&&n.argument.type==='NumericLiteral')return true;
 if(n.type==='ObjectExpression')return n.properties.every(p=>!p.computed&&(p.type==='ObjectProperty'&&inertDefaultExpression(p.value)||p.type==='ObjectMethod'));
 if(n.type==='ArrayExpression')return n.elements.every(inertDefaultExpression);
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
