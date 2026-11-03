// Creation-only defaults are not observed by the retained closure. No calls,
// spreads, computed keys or identifier reads are evaluated by this rule.
export function inertDefaultExpression(n){
 if(!n)return false;
 if(['StringLiteral','NumericLiteral','BooleanLiteral','NullLiteral','RegExpLiteral','FunctionExpression','ArrowFunctionExpression'].includes(n.type))return true;
 if(n.type==='UnaryExpression'&&['+','-'].includes(n.operator)&&n.argument.type==='NumericLiteral')return true;
 if(n.type==='ObjectExpression')return n.properties.every(p=>!p.computed&&(p.type==='ObjectProperty'&&inertDefaultExpression(p.value)||p.type==='ObjectMethod'));
 if(n.type==='ArrayExpression')return n.elements.every(inertDefaultExpression);
 return n.type==='TSAsExpression'&&inertDefaultExpression(n.expression);
}
