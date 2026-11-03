import {isCheckedIndexHelper,provenFixedTypedIndex} from './checked-index.mjs';
// Monotone allocation-site analysis. Joins deliberately forget control flow.
// Every possible reference edge is retained; cycles and opaque result edges fail.
export function localConstruction(source, checker, ts) {
 const fail=(n,s)=>{throw Error(`${s} at ${source.getLineAndCharacterOfPosition(n.getStart(source)).line+1}`);};
 const typedArrays=new Set(['Int8Array','Int16Array','Int32Array','Uint8Array','Uint16Array','Uint32Array','Float32Array','Float64Array']);
 const typed=n=>typedArrays.has(checker.getTypeAtLocation(n).getSymbol()?.name);
 const bad=new Set(['__proto__','constructor','prototype','toJSON']);
 const sym=n=>ts.isShorthandPropertyAssignment(n.parent)?checker.getShorthandAssignmentValueSymbol(n.parent):checker.getSymbolAtLocation(n);
 const funcs=new Map(),heap=new Map(),env=new Map(),active=new Set();let changed=false;
 const scalar=new Set(),arg={kind:'argument'},opaque={kind:'opaque'};
 const union=(...vs)=>new Set(vs.flatMap(v=>[...v]));
 function merge(a,b){for(const x of b)if(!a.has(x)){a.add(x);changed=true;}return a;}
 function alloc(n,kind){if(!heap.has(n))heap.set(n,{kind,fields:new Map()});return heap.get(n);}
 function field(o,k){if(!o.fields.has(k))o.fields.set(k,new Set());return o.fields.get(k);}
 function bind(n,v){if(!ts.isIdentifier(n))fail(n,'unsupported binding');const s=sym(n);if(!env.has(s))env.set(s,new Set());merge(env.get(s),v);}
 function primitive(n){const scalarType=t=>t.getProperty('__scriptcOpaqueHandle')?true:t.isUnion()?t.types.every(scalarType):!!(t.flags&(ts.TypeFlags.StringLike|ts.TypeFlags.NumberLike|ts.TypeFlags.BooleanLike|ts.TypeFlags.Null|ts.TypeFlags.Undefined|ts.TypeFlags.Void));return scalarType(checker.getTypeAtLocation(n));}
 function read(v,k,n){let out=new Set();for(const o of v){if(o===arg){if(!primitive(n))out.add(arg);}else if(o===opaque)out.add(opaque);else for(const x of field(o,k))out.add(x);}return out;}
 function elements(v,receiver,n){const t=checker.getTypeAtLocation(receiver),e=checker.isArrayType(t)?checker.getTypeArguments(t)[0]:null;const plain=t=>!t.getProperty('__scriptcOpaqueHandle')&&(t.isUnion()?t.types.every(plain):!!(t.flags&(ts.TypeFlags.StringLike|ts.TypeFlags.NumberLike|ts.TypeFlags.BooleanLike|ts.TypeFlags.Null|ts.TypeFlags.Undefined)));return e&&plain(e)?scalar:read(v,'element',n);}
 function local(v,kind,n){if(!v.size||[...v].some(o=>o===arg||o===opaque||kind&&!kind.includes(o.kind)))fail(n,'mutation requires local allocation');}
 function write(v,k,x,n,kind){local(v,kind,n);for(const o of v)merge(field(o,k),x);}
 function callback(n,args){if(!n||!ts.isArrowFunction(n)||n.modifiers?.length||n.typeParameters?.length)fail(n,'inline synchronous callback required');n.parameters.forEach((p,i)=>{if(p.initializer||p.dotDotDotToken||p.questionToken)fail(p,'callback default/rest parameter');if(ts.isArrayBindingPattern(p.name)){p.name.elements.forEach((e,j)=>{if(e.initializer||e.dotDotDotToken)fail(e,'destructuring default/rest');bind(e.name,union(...[...args[i]].map(o=>read(new Set([o]),o.kind==='array'?'element':String(j),e))));});}else bind(p.name,primitive(p)&&!checker.getTypeAtLocation(p).getProperty('__scriptcOpaqueHandle')?scalar:args[i]??scalar);});return ts.isBlock(n.body)?block(n.body):expr(n.body);}
 function invoke(n,args){if(active.has(n))fail(n,'recursive helper graph');active.add(n);n.parameters.forEach((p,i)=>{if(!ts.isIdentifier(p.name)||p.dotDotDotToken||p.initializer)fail(p,'unsupported helper parameter');bind(p.name,args[i]??new Set([arg]));});const result=block(n.body);active.delete(n);return result;}
 function expr(n){
  if(!n)fail(source,'missing expression');
  if(ts.isNonNullExpression(n)&&ts.isElementAccessExpression(n.expression)&&provenFixedTypedIndex(n.expression,checker,ts))return expr(n.expression);
  if(ts.isParenthesizedExpression(n))return expr(n.expression);
  if(ts.isAsExpression(n)&&parsedAssertion(n)){expr(n.expression.arguments[0]);const schema=shape(checker.getTypeAtLocation(n));if(!schema)fail(n,'unbounded parsed schema');let owner=n.parent;while(owner&&!ts.isFunctionDeclaration(owner))owner=owner.parent;const input=n.expression.arguments[0];const index=owner?.parameters.findIndex(p=>ts.isIdentifier(input)&&sym(p.name)===sym(input));if(index===undefined||index<0)fail(n,'parse requires direct function parameter');guards[owner.name.text]??=[];if(!guardNodes.has(n)){guards[owner.name.text].push({index,shape:schema});guardNodes.add(n);}return new Set([arg]);}
  if(ts.isIdentifier(n)){const s=sym(n);if(!env.has(s))fail(n,'opaque or uninitialized reference');return env.get(s);}
  if(ts.isStringLiteral(n)||ts.isNumericLiteral(n)||[ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword,ts.SyntaxKind.NullKeyword].includes(n.kind))return scalar;
  if(ts.isArrayLiteralExpression(n)){const a=alloc(n,'array');for(const e of n.elements)merge(field(a,'element'),expr(e));return new Set([a]);}
  if(ts.isObjectLiteralExpression(n)){const a=alloc(n,'object');for(const p of n.properties){if(!ts.isPropertyAssignment(p)&&!ts.isShorthandPropertyAssignment(p))fail(p,'ordinary data properties required');if(ts.isComputedPropertyName(p.name)||bad.has(p.name.text))fail(p,'unsafe object key');merge(field(a,p.name.text),expr(ts.isShorthandPropertyAssignment(p)?p.name:p.initializer));}return new Set([a]);}
  if(ts.isNewExpression(n)&&ts.isIdentifier(n.expression)&&['Map','Set'].includes(n.expression.text)&&!n.arguments?.length)return new Set([alloc(n,n.expression.text)]);
  if(ts.isNewExpression(n)&&ts.isIdentifier(n.expression)&&typedArrays.has(n.expression.text)&&n.arguments?.length===1&&checker.getTypeAtLocation(n.arguments[0]).flags&ts.TypeFlags.NumberLike){expr(n.arguments[0]);return new Set([alloc(n,'typed-array')]);}
  if(ts.isPropertyAccessExpression(n)){if(bad.has(n.name.text))fail(n,'reserved member');const v=expr(n.expression);if(n.name.text==='length'&&[...v].every(o=>['array','typed-array'].includes(o.kind)||o===arg&&primitive(n))||n.name.text==='size'&&[...v].every(o=>['Map','Set'].includes(o.kind)))return scalar;return read(v,n.name.text,n);}
  if(ts.isElementAccessExpression(n)){if(!checker.isArrayType(checker.getTypeAtLocation(n.expression))&&!typed(n.expression)||!(checker.getTypeAtLocation(n.argumentExpression).flags&ts.TypeFlags.NumberLike))fail(n,'indexed access excluded');expr(n.argumentExpression);const v=expr(n.expression);if([...v].some(o=>o!==arg&&!['array','typed-array'].includes(o.kind)))fail(n,'array receiver required');return typed(n.expression)?scalar:read(v,'element',n);}
  if(ts.isConditionalExpression(n)){expr(n.condition);return union(expr(n.whenTrue),expr(n.whenFalse));}
  if(ts.isTemplateExpression(n)){for(const s of n.templateSpans){expr(s.expression);if(!primitive(s.expression))fail(s,'template coercion');}return scalar;}
  if(ts.isNoSubstitutionTemplateLiteral(n))return scalar;
  if(ts.isPrefixUnaryExpression(n)||ts.isPostfixUnaryExpression(n)){if([ts.SyntaxKind.PlusPlusToken,ts.SyntaxKind.MinusMinusToken].includes(n.operator))assign(n.operand,scalar,n);else {expr(n.operand);if(n.operator!==ts.SyntaxKind.ExclamationToken&&!primitive(n.operand))fail(n,'unary coercion');}return scalar;}
  if(ts.isBinaryExpression(n)){const op=n.operatorToken.getText(source);if(['=','+=','-=','*=','/='].includes(op)){const v=expr(n.right);if(op!=='='&&(!primitive(n.left)||!primitive(n.right)))fail(n,'assignment coercion');assign(n.left,v,n);return v;}const a=expr(n.left),b=expr(n.right);if(['&&','||','??'].includes(op))return union(a,b);if(!['===','!==','<','>','<=','>=','+','-','*','/','%','|','&','^','<<','>>','>>>'].includes(op))fail(n,'unsupported binary operation');if(!['===','!=='].includes(op)&&(!primitive(n.left)||!primitive(n.right)))fail(n,'binary coercion');return scalar;}
  if(ts.isCallExpression(n)){
   const e=n.expression;
   if(ts.isIdentifier(e)&&e.text.startsWith('__scriptc_checked_index')&&n.arguments.length===2&&checker.getSymbolAtLocation(e)?.declarations?.some(d=>isCheckedIndexHelper(d,source))){expr(n.arguments[1]);return read(expr(n.arguments[0]),'element',n);}
   if(ts.isIdentifier(e)&&funcs.has(sym(e))){const target=funcs.get(sym(e)),result=invoke(target,n.arguments.map(expr));if(guards[target.name.text]?.length)fail(n,'parse guard in called helper');return result;}
   if(!ts.isPropertyAccessExpression(e))fail(n,'opaque call');const name=e.name.text;
   if(ts.isIdentifier(e.expression)&&e.expression.text==='Math'&&['floor','ceil','round','trunc','abs','min','max','sqrt','pow','sign','log','exp','sin','cos','tan','imul','clz32'].includes(name)){for(const a of n.arguments){expr(a);if(!primitive(a))fail(a,'Math coercion');}return scalar;}
   if(ts.isIdentifier(e.expression)&&e.expression.text==='Array'&&name==='from'&&n.arguments.length===1){const v=expr(n.arguments[0]);if(!checker.isArrayType(checker.getTypeAtLocation(n.arguments[0]))&&[...v].some(o=>o.kind!=='iterator'))fail(n,'Array.from requires array or local iterator');const a=alloc(n,'array');merge(field(a,'element'),elements(v,n.arguments[0],n));return new Set([a]);}
   if(ts.isIdentifier(e.expression)&&e.expression.text==='Array'&&name==='of'){const a=alloc(n,'array');for(const arg of n.arguments)merge(field(a,'element'),expr(arg));return new Set([a]);}
   if(ts.isIdentifier(e.expression)&&e.expression.text==='Object'&&['keys','values','entries'].includes(name)&&n.arguments.length===1){const v=expr(n.arguments[0]);local(v,['object'],n);const a=alloc(n,'array');let values=new Set();for(const o of v)for(const x of o.fields.values())values=union(values,x);if(name==='entries'){const pair=alloc(e,'tuple');merge(field(pair,'1'),values);values=new Set([pair]);}merge(field(a,'element'),name==='keys'?scalar:values);return new Set([a]);}
   const v=expr(e.expression);
   if(['some','forEach'].includes(name)&&checker.isArrayType(checker.getTypeAtLocation(e.expression))&&n.arguments.length===1){if([...v].some(o=>o.kind!=='array'&&o!==arg))fail(n,'array receiver required');callback(n.arguments[0],[elements(v,e.expression,e.expression),scalar,v]);return scalar;}
   if(name==='includes'&&checker.isArrayType(checker.getTypeAtLocation(e.expression))&&n.arguments.length===1){const plain=t=>!t.getProperty('__scriptcOpaqueHandle')&&(t.isUnion()?t.types.every(plain):!!(t.flags&(ts.TypeFlags.StringLike|ts.TypeFlags.NumberLike|ts.TypeFlags.BooleanLike|ts.TypeFlags.Null)));if([...v].some(o=>o.kind!=='array'&&o!==arg)||!plain(checker.getTypeArguments(checker.getTypeAtLocation(e.expression))[0])||!plain(checker.getTypeAtLocation(n.arguments[0])))fail(n,'scalar includes required');expr(n.arguments[0]);return scalar;}
   if(name==='slice'){if(!checker.isArrayType(checker.getTypeAtLocation(e.expression)))fail(n,'array receiver required');n.arguments.forEach(expr);const a=alloc(n,'array');merge(field(a,'element'),elements(v,e.expression,n));return new Set([a]);}
   if(['map','filter','sort'].includes(name)){if([...v].some(o=>o.kind!=='array'&&o!==arg))fail(n,'array receiver required');if(name==='sort')local(v,['array'],n);const child=elements(v,e.expression,n);const result=callback(n.arguments[0],name==='sort'?[child,child]:[child,scalar,v]);if(name==='sort')return v;const a=alloc(n,'array');merge(field(a,'element'),name==='filter'?child:result);return new Set([a]);}
   // Reordering a fresh container preserves every possible child reference.
   if(name==='reverse'&&!n.arguments.length){if(!checker.isArrayType(checker.getTypeAtLocation(e.expression)))fail(n,'array receiver required');local(v,['array'],n);return v;}
   if(name==='push'){for(const a of n.arguments)write(v,'element',expr(a),n,['array']);return scalar;}
   if(name==='set'){if(n.arguments.length!==2)fail(n,'Map.set arity');write(v,'key',expr(n.arguments[0]),n,['Map']);write(v,'value',expr(n.arguments[1]),n,['Map']);return v;}
   if(name==='add'){write(v,'value',expr(n.arguments[0]),n,['Set']);return v;}
   if(name==='get'){local(v,['Map'],n);n.arguments.forEach(expr);return read(v,'value',n);}
   if(name==='forEach'){local(v,['Map','Set'],n);const values=read(v,'value',n),keys=new Set();for(const o of v)for(const x of field(o,o.kind==='Set'?'value':'key'))keys.add(x);callback(n.arguments[0],[values,keys,v]);return scalar;}
   if(['values','entries','keys'].includes(name)){local(v,['Map','Set'],n);const a=alloc(n,'iterator');const keys=new Set();for(const o of v)for(const x of field(o,o.kind==='Set'?'value':'key'))keys.add(x);let value=name==='keys'?keys:read(v,'value',n);if(name==='entries'){const pair=alloc(e,'tuple');merge(field(pair,'0'),keys);merge(field(pair,'1'),value);value=new Set([pair]);}merge(field(a,'element'),value);return new Set([a]);}
   fail(n,'call outside local allocation allowlist');
  }
  fail(n,`unsupported expression ${ts.SyntaxKind[n.kind]}`);
 }
 function assign(n,v,at){if(ts.isElementAccessExpression(n)&&typed(n.expression)&&checker.getTypeAtLocation(n.argumentExpression).flags&ts.TypeFlags.NumberLike){expr(n.argumentExpression);local(expr(n.expression),['typed-array'],at);if(v.size)fail(n,'typed array scalar write required');return;}if(ts.isIdentifier(n)){if(sym(n)?.declarations?.some(d=>ts.isParameter(d)))fail(n,'parameter assignment excluded');if(!env.has(sym(n)))fail(n,'uninitialized assignment');bind(n,v);return;}if(ts.isPropertyAccessExpression(n)&&!bad.has(n.name.text)&&n.name.text!=='length'){write(expr(n.expression),n.name.text,v,at,['object']);return;}fail(n,'indexed or unsafe write');}
 function declarations(n){for(const d of n.declarations){if(!d.initializer)fail(d,'initialized bindings required');bind(d.name,expr(d.initializer));}}
 function block(n){let out=new Set();for(const s of n.statements)for(const x of stmt(s))out.add(x);return out;}
 function stmt(n){
  if(ts.isThrowStatement(n)&&ts.isStringLiteral(n.expression)&&n.expression.text==='__scriptc_throw_fallback__')return scalar;
  if(ts.isBlock(n))return block(n);
  if(ts.isReturnStatement(n))return expr(n.expression);
  if(ts.isVariableStatement(n)){declarations(n.declarationList);return scalar;}
  if(ts.isExpressionStatement(n)){expr(n.expression);return scalar;}
  if(ts.isIfStatement(n)){expr(n.expression);return union(stmt(n.thenStatement),n.elseStatement?stmt(n.elseStatement):scalar);}
  if(ts.isForOfStatement(n)){const v=expr(n.expression);if([...v].some(o=>o!==arg&&!['array','typed-array'].includes(o.kind)))fail(n,'for-of array required');if(!ts.isVariableDeclarationList(n.initializer)||n.initializer.declarations.length!==1)fail(n,'for-of binding');bind(n.initializer.declarations[0].name,read(v,'element',n));return stmt(n.statement);}
  if(ts.isForStatement(n)){if(n.initializer){if(ts.isVariableDeclarationList(n.initializer))declarations(n.initializer);else expr(n.initializer);}if(n.condition)expr(n.condition);const out=stmt(n.statement);if(n.incrementor)expr(n.incrementor);return out;}
  if(ts.isContinueStatement(n)||ts.isEmptyStatement(n))return scalar;
  fail(n,`unsupported statement ${ts.SyntaxKind[n.kind]}`);
 }
 function shape(t,seen=new Set()){
  if(t.getProperty('__scriptcOpaqueHandle'))return {kind:'handle'};
  if(seen.has(t)||seen.size>32)return null;
  if(t.flags&ts.TypeFlags.NumberLike)return {kind:'number'};if(t.flags&ts.TypeFlags.StringLike)return {kind:'string'};if(t.flags&ts.TypeFlags.BooleanLike)return {kind:'boolean'};if(t.flags&ts.TypeFlags.Null)return {kind:'null'};
  if(t.isUnion()){const rest=t.types.filter(x=>!(x.flags&ts.TypeFlags.Null));if(rest.length===1&&rest.length<t.types.length){const value=shape(rest[0],seen);return value?{kind:'nullable',value}:null;}return null;}
  const next=new Set(seen).add(t);
  if(checker.isArrayType(t)){const value=shape(checker.getTypeArguments(t)[0],next);return value?{kind:'array',value}:null;}
  if(!(t.flags&ts.TypeFlags.Object)||checker.getIndexInfosOfType(t).length||checker.getSignaturesOfType(t,ts.SignatureKind.Call).length)return null;
  const fields=checker.getPropertiesOfType(t).map(p=>[p.name,shape(checker.getTypeOfSymbolAtLocation(p,p.valueDeclaration??p.declarations?.[0]??source),next)]);return fields.every(([k,v])=>v&&!bad.has(k))?{kind:'object',fields}:null;
 }
 const shapes={},guards={},guardNodes=new Set();
 function parsedAssertion(n){return ts.isAsExpression(n)&&ts.isCallExpression(n.expression)&&ts.isPropertyAccessExpression(n.expression.expression)&&ts.isIdentifier(n.expression.expression.expression)&&n.expression.expression.expression.text==='JSON'&&n.expression.expression.name.text==='parse'&&n.expression.arguments.length===1;}
 function syntax(n){if(ts.isStringLiteral(n)&&!n.text.isWellFormed())fail(n,'ill-formed literal');if(ts.isIdentifier(n)&&['Math','Map','Set','Array','Object','JSON',...typedArrays].includes(n.text)&&checker.getSymbolAtLocation(n)?.declarations?.some(d=>d.getSourceFile()===source))fail(n,'shadowed builtin');if([ts.SyntaxKind.AnyKeyword,ts.SyntaxKind.UnknownKeyword,ts.SyntaxKind.TypeAssertionExpression,ts.SyntaxKind.SatisfiesExpression,ts.SyntaxKind.GetAccessor,ts.SyntaxKind.SetAccessor,ts.SyntaxKind.ClassDeclaration,ts.SyntaxKind.ClassExpression,ts.SyntaxKind.DeleteExpression].includes(n.kind)||ts.isNonNullExpression(n)&&!(ts.isElementAccessExpression(n.expression)&&provenFixedTypedIndex(n.expression,checker,ts))||ts.isAsExpression(n)&&!parsedAssertion(n))fail(n,'unsafe type escape or reflective syntax');ts.forEachChild(n,syntax);}syntax(source);
 const literal=n=>n&&(ts.isStringLiteral(n)||ts.isNumericLiteral(n)||[ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword,ts.SyntaxKind.NullKeyword].includes(n.kind)||ts.isPrefixUnaryExpression(n)&&[ts.SyntaxKind.MinusToken,ts.SyntaxKind.PlusToken].includes(n.operator)&&ts.isNumericLiteral(n.operand));
 for(const n of source.statements){if(ts.isVariableStatement(n)&&n.declarationList.flags&ts.NodeFlags.Const&&n.declarationList.declarations.every(d=>ts.isIdentifier(d.name)&&literal(d.initializer))){for(const d of n.declarationList.declarations)bind(d.name,scalar);continue;}
 else if(ts.isFunctionDeclaration(n)&&isCheckedIndexHelper(n,source))continue;
 else if(ts.isFunctionDeclaration(n)&&n.name&&n.body){if(n.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword)||n.asteriskToken||n.typeParameters?.length)fail(n,'async/generic helper');funcs.set(sym(n.name),n);}else if(ts.isImportDeclaration(n)&&n.importClause?.isTypeOnly)continue;else if(!ts.isTypeAliasDeclaration(n)&&!ts.isInterfaceDeclaration(n)&&!(ts.isExportDeclaration(n)&&!n.moduleSpecifier))fail(n,'module statement excluded');}
 const exported=new Set();for(const n of source.statements){if(ts.isFunctionDeclaration(n)&&n.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))exported.add(n.name.text);if(ts.isExportDeclaration(n))for(const e of n.exportClause?.elements??[])exported.add((e.propertyName??e.name).text);}
 // Only boundary inputs are borrowed; helper inputs use caller provenance.
 const returns=new Map();for(let round=0;round<64;round++){changed=false;for(const n of funcs.values()){if(!exported.has(n.name.text))continue;const v=invoke(n,n.parameters.map(p=>primitive(p)?scalar:new Set([arg])));if(!returns.has(n))returns.set(n,new Set());merge(returns.get(n),v);}if(!changed)break;if(round===63)fail(source,'allocation analysis did not converge');}
 function closed(v,seen=new Set()){for(const o of v){if(o===arg||o===opaque||!['array','object'].includes(o.kind)||seen.has(o))return false;const next=new Set(seen).add(o);for(const x of o.fields.values())if(!closed(x,next))return false;}return true;}
 // Only exported boundaries must be JSON. Helpers may return intermediate Maps.
 for(const n of funcs.values())if(exported.has(n.name.text)){if(!closed(returns.get(n)))fail(n,'non-JSON, borrowed or cyclic result provenance');const s=shape(checker.getReturnTypeOfSignature(checker.getSignatureFromDeclaration(n)));if(!s)fail(n,'unbounded result shape');shapes[n.name.text]=s;}
 for(const name of Object.keys(guards))if(!exported.has(name))fail(source,'parse guard in non-boundary helper');
 return {shapes,guards};
}
