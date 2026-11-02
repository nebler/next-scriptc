import {strictClosureProgram} from './construction-proof.mjs';
export const opaqueType = t => !!t.getProperty('__scriptcOpaqueHandle');
const brand='type __ScriptcOpaqueHandle = number & {readonly __scriptcOpaqueHandle: unique symbol};\n';
// Deliberately intraprocedural. Helper calls, computed keys, destructuring and
// aliases with writes are inspection, never evidence for borrowing.
export function lowerOpaqueHandles(text, name, ts) {
 if(text.includes('__scriptcOpaqueHandle')||text.includes('__ScriptcOpaqueHandle')||text.includes('__scriptcOriginal'))throw Error('reserved opaque handle type');
 const {source,checker}=strictClosureProgram(text,ts);
 const target=source.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);
 if(!target||target.type||target.typeParameters?.length)return {native:text};
 const origins=new Map(),uses=[],edits=[];
 const symbol=n=>ts.isShorthandPropertyAssignment(n.parent)?checker.getShorthandAssignmentValueSymbol(n.parent):checker.getSymbolAtLocation(n);
 target.parameters.forEach((p,i)=>{if(ts.isIdentifier(p.name))origins.set(symbol(p.name),[String(i)]);});
 function origin(n){
  if(ts.isIdentifier(n))return origins.get(symbol(n));
  if(ts.isParenthesizedExpression(n))return origin(n.expression);
  if(ts.isPropertyAccessExpression(n)){const o=origin(n.expression);return o&&[...o,n.name.text];}
 }
 function walk(n){
  if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer){const o=origin(n.initializer);if(o&&n.parent.flags&ts.NodeFlags.Const)origins.set(symbol(n.name),o);}
  if(ts.isForOfStatement(n)&&ts.isVariableDeclarationList(n.initializer)){const o=origin(n.expression),d=n.initializer.declarations[0];if(o&&ts.isIdentifier(d.name))origins.set(symbol(d.name),[...o,'[]']);}
  if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='map'){
   const o=origin(n.expression.expression),cb=n.arguments[0];if(o&&cb&&ts.isArrowFunction(cb)&&cb.parameters[0]&&ts.isIdentifier(cb.parameters[0].name))origins.set(symbol(cb.parameters[0].name),[...o,'[]']);
  }
  ts.forEachChild(n,walk);
 }walk(target);
 function use(n){
  if(ts.isTypeNode(n)||ts.isTypeAliasDeclaration(n)||ts.isInterfaceDeclaration(n))return;
  if(ts.isIdentifier(n)&&((ts.isVariableDeclaration(n.parent)||ts.isParameter(n.parent))&&n.parent.name===n))return;
  const o=origin(n);
  if(o){const p=n.parent;
   if(ts.isPropertyAccessExpression(p)&&p.expression===n)return ts.forEachChild(n,use);
   if(ts.isVariableDeclaration(p)&&p.initializer===n&&origins.has(symbol(p.name)))return;
   if(ts.isForOfStatement(p)&&p.expression===n)return;
   if(ts.isPropertyAccessExpression(n)&&n.name.text==='map'&&ts.isCallExpression(p)&&p.expression===n)return;
   // A map receiver is a structural array traversal, not a whole-value read.
   if(ts.isPropertyAccessExpression(p)&&p.name.text==='map'&&ts.isCallExpression(p.parent))return;
   const push=ts.isCallExpression(p)&&p.arguments.includes(n)&&ts.isPropertyAccessExpression(p.expression)&&p.expression.name.text==='push';
   const pass=push||ts.isReturnStatement(p)||ts.isArrowFunction(p)&&p.body===n||ts.isPropertyAssignment(p)&&p.initializer===n||ts.isShorthandPropertyAssignment(p)||ts.isArrayLiteralExpression(p);
   const t=checker.getTypeAtLocation(n),scalar=!!(t.flags&(ts.TypeFlags.StringLike|ts.TypeFlags.NumberLike|ts.TypeFlags.BooleanLike|ts.TypeFlags.Null));
   uses.push({path:o,kind:pass&&!scalar?'passthrough-only':'read',unsafe:!scalar||ts.isBinaryExpression(p)&&p.left===n&&p.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&p.operatorToken.kind<=ts.SyntaxKind.LastAssignment||ts.isDeleteExpression(p)||ts.isPostfixUnaryExpression(p)||ts.isPrefixUnaryExpression(p),node:n});return;
  }
  ts.forEachChild(n,use);
 }use(target.body);
 const prefix=(a,b)=>a.length<=b.length&&a.every((x,i)=>x===b[i]);
 const handles=uses.filter(u=>u.kind==='passthrough-only').map(u=>u.path).sort((a,b)=>a.length-b.length);
 if(handles.some(p=>p.length===1&&checker.getTypeAtLocation(target.parameters[Number(p[0])]).flags&(ts.TypeFlags.Any|ts.TypeFlags.Unknown)))return {native:text,classification:uses.map(({node,unsafe,...u})=>u)};
 for(const h of handles){const conflict=uses.find(u=>u.kind==='read'&&(prefix(u.path,h)||u.unsafe&&prefix(h,u.path)));if(conflict)throw Error(`opaque handle is also read: ${h.join('.')} (read ${conflict.path.join('.')}, ${ts.SyntaxKind[conflict.node.parent.kind]})`);}
 if(!handles.length)return {native:text,classification:uses.map(({node,unsafe,...u})=>u)};
 const atHandle=p=>handles.some(h=>h.length===p.length&&prefix(h,p));
 const dual=p=>atHandle(p)&&uses.some(u=>u.kind==='read'&&prefix(p,u.path));
 for(const u of uses)if(u.kind==='passthrough-only'&&dual(u.path)){const n=u.node;const value=n.getText(source)+'.__scriptcOriginal';edits.push([n.getStart(source),n.end,ts.isShorthandPropertyAssignment(n.parent)?n.getText(source)+':'+value:value]);}
 let budget=256;
 function type(t,p,seen=new Set()){
  if(--budget<0||seen.has(t))throw Error('opaque boundary is unbounded');
  if(atHandle(p)&&!dual(p))return {text:'__ScriptcOpaqueHandle',shape:{kind:'handle'}};
  if(t.flags&ts.TypeFlags.StringLike)return {text:'string',shape:{kind:'string'}};
  if(t.flags&ts.TypeFlags.NumberLike)return {text:'number',shape:{kind:'number'}};
  if(t.flags&ts.TypeFlags.BooleanLike)return {text:'boolean',shape:{kind:'boolean'}};
  if(t.flags&ts.TypeFlags.Null)return {text:'null',shape:{kind:'null'}};
  const next=new Set(seen).add(t);
  if(checker.isArrayType(t)){const v=type(checker.getTypeArguments(t)[0],[...p,'[]'],next);return {text:`Array<${v.text}>`,shape:{kind:'array',value:v.shape}};}
  if(!(t.flags&ts.TypeFlags.Object)||t.isUnion()||checker.getIndexInfosOfType(t).length||checker.getSignaturesOfType(t,ts.SignatureKind.Call).length||t.getSymbol()?.declarations?.some(d=>ts.isClassDeclaration(d)))throw Error(`read path is not bounded JSON: ${p.join('.')}`);
  const fields=dual(p)?[['__scriptcOriginal',{text:'__ScriptcOpaqueHandle',shape:{kind:'handle'}}]]:[];for(const prop of checker.getPropertiesOfType(t)){
   const q=[...p,prop.name];if(!uses.some(u=>prefix(q,u.path)||u.kind==='read'&&prefix(u.path,q)))continue;
   if(prop.flags&ts.SymbolFlags.Optional)throw Error('optional opaque boundary field');
   const v=type(checker.getTypeOfSymbolAtLocation(prop,prop.valueDeclaration??prop.declarations?.[0]??target),q,next);fields.push([prop.name,v]);
  }
  return {text:`{${fields.map(([k,v])=>`${JSON.stringify(k)}:${v.text}`).join(';')}}`,shape:{kind:'object',...(dual(p)?{original:true}:{}),fields:fields.map(([k,v])=>[k,v.shape])}};
 }
 let inputs;try{inputs=target.parameters.map((p,i)=>{if(!p.type||!ts.isIdentifier(p.name))throw Error('opaque boundary needs explicit simple parameters');const v=type(checker.getTypeAtLocation(p),[String(i)]);edits.push([p.type.getStart(source),p.type.end,v.text]);return v.shape;});}catch(e){if(/read path is not bounded JSON|unbounded|optional opaque boundary field|explicit simple parameters/.test(e.message))return {native:text,classification:uses.map(({node,unsafe,...u})=>u)};throw e;}

 // Parameter specialization can make an original type unreachable. Remove only
 // such declarations, leaving helper and local annotations for the usual proof.
 const positions=Array.from({length:text.length},(_,i)=>i);
 let native=text;for(const [start,end,value] of edits.sort((a,b)=>b[0]-a[0])){native=native.slice(0,start)+value+native.slice(end);positions.splice(start,end-start,...Array(value.length).fill(start));}
 const rewritten=ts.createSourceFile('opaque.ts',native,ts.ScriptTarget.Latest,true);
 const declarations=new Map(rewritten.statements.filter(n=>ts.isTypeAliasDeclaration(n)||ts.isInterfaceDeclaration(n)).map(n=>[n.name.text,n]));
 const needed=new Set();
 function names(n){if(ts.isIdentifier(n))needed.add(n.text);ts.forEachChild(n,names);}
 for(const n of rewritten.statements)if(!declarations.has(n.name?.text))names(n);
 const expanded=new Set();for(const name of needed){if(declarations.has(name)&&!expanded.has(name)){expanded.add(name);names(declarations.get(name));}}
 for(const n of [...declarations.values()].filter(n=>!needed.has(n.name.text)).sort((a,b)=>b.getStart(rewritten)-a.getStart(rewritten))){native=native.slice(0,n.getStart(rewritten))+native.slice(n.end);positions.splice(n.getStart(rewritten),n.end-n.getStart(rewritten));}
 const loweringMap=[];for(let i=0;i<positions.length;i++){const previous=loweringMap.at(-1);if(previous&&previous.originalOffset+previous.length===positions[i])previous.length++;else loweringMap.push({generatedOffset:brand.length+i,originalOffset:positions[i],length:1});}
 return {native:brand+native,loweringMap,inputs,classification:uses.map(({node,unsafe,...u})=>u)};
}

// Check the lowered closure too: a borrowed value may flow through a local
// container before an operation. Its nominal type follows that flow.
export function auditOpaqueUses(source,checker,ts){
 if(!source.text.includes('__ScriptcOpaqueHandle'))return;
 function contains(t,seen=new Set()){
  if(opaqueType(t))return true;
  if(seen.has(t)||seen.size>32)return false;
  const next=new Set(seen).add(t);
  if(t.isUnion())return t.types.some(v=>contains(v,next));
  if(checker.isArrayType(t))return contains(checker.getTypeArguments(t)[0],next);
  if(!(t.flags&ts.TypeFlags.Object)||checker.getSignaturesOfType(t,ts.SignatureKind.Call).length)return false;
  return checker.getPropertiesOfType(t).some(p=>contains(checker.getTypeOfSymbolAtLocation(p,p.valueDeclaration??p.declarations?.[0]??source),next));
 }
 function visit(n){
  if(ts.isTypeNode(n)||ts.isTypeAliasDeclaration(n)||ts.isInterfaceDeclaration(n))return;
  if(ts.isVariableDeclaration(n)&&n.type&&n.initializer&&contains(checker.getTypeAtLocation(n.initializer)))throw Error('opaque handle annotation erases provenance');
  if(ts.isParameter(n)&&n.type&&(ts.isArrowFunction(n.parent)||ts.isFunctionExpression(n.parent)))throw Error('opaque callback annotations require a borrowing contract');
  if(ts.isExpression(n)&&contains(checker.getTypeAtLocation(n))){
   const p=n.parent,leaf=opaqueType(checker.getTypeAtLocation(n));
   const binding=(ts.isParameter(p)||ts.isVariableDeclaration(p))&&p.name===n;
   const key=ts.isPropertyAccessExpression(p)&&p.name===n||ts.isPropertyAssignment(p)&&p.name===n;
   const structural=!leaf&&(ts.isPropertyAccessExpression(p)&&p.expression===n||ts.isForOfStatement(p)&&p.expression===n);
   const push=ts.isCallExpression(p)&&p.arguments.includes(n)&&ts.isPropertyAccessExpression(p.expression)&&p.expression.name.text==='push';
   const copy=push||ts.isReturnStatement(p)||ts.isArrowFunction(p)&&p.body===n||ts.isVariableDeclaration(p)&&p.initializer===n||ts.isPropertyAssignment(p)&&p.initializer===n||ts.isShorthandPropertyAssignment(p)||ts.isArrayLiteralExpression(p)||ts.isParenthesizedExpression(p);
   if(!binding&&!key&&!structural&&!copy)throw Error('opaque handle may only be copied');
  }
  ts.forEachChild(n,visit);
 }visit(source);
}
