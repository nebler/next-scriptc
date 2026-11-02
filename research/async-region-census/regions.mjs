// Research only. No application rewrite or executable transform is emitted.
export function regions(ts, checker, sf) {
 const result=[], functions=[], barriers={awaitLoops:0};
 const fn=n=>ts.isFunctionLike(n)&&!!n.body;
 function ownWalk(n, visit, root=n){visit(n);ts.forEachChild(n,c=>{if(!fn(c)||c===root)ownWalk(c,visit,root);});}
 function suspended(n){let yes=false;ownWalk(n,c=>{if(ts.isAwaitExpression(c)||ts.isYieldExpression(c)||c.awaitModifier)yes=true;});return yes;}
 function symbol(n){return ts.isShorthandPropertyAssignment(n.parent)?checker.getShorthandAssignmentValueSymbol(n.parent):checker.getSymbolAtLocation(n);}
 function local(d){for(let p=d.parent;p;p=p.parent)if(fn(p))return true;return false;}
 function reference(n){if(!ts.isIdentifier(n))return false;const p=n.parent;if(ts.isBinaryExpression(p)&&p.left===n&&p.operatorToken.kind===ts.SyntaxKind.EqualsToken)return false;return !(ts.isPropertyAccessExpression(p)&&p.name===n||ts.isPropertyAssignment(p)&&p.name===n||ts.isBindingElement(p)&&p.propertyName===n||ts.isDeclarationName(n)&&!ts.isShorthandPropertyAssignment(p)||ts.isTypeNode(p));}
 function walkAll(n,visit){visit(n);ts.forEachChild(n,c=>walkAll(c,visit));}
 function analyze(f, statements, expression=false){
  const start=statements[0].getStart(sf),end=statements.at(-1).end;
  const reads=new Map(),writes=new Map(),usesAfter=new Set(),declared=new Set();let thisUse=false,args=false,returns=[],throws=0,breaks=false;
  const inside=d=>d&&d.getSourceFile()===sf&&d.getStart(sf)>=start&&d.end<=end;
  for(const st of statements)walkAll(st,n=>{if(ts.isIdentifier(n)&&ts.isDeclarationName(n)){const s=symbol(n);if(s)declared.add(s);}});
  walkAll(f.body,n=>{if(n.getStart(sf)>=end&&reference(n)){const s=symbol(n);if(s)usesAfter.add(s);}});
  function addWrite(n){while(ts.isPropertyAccessExpression(n)||ts.isElementAccessExpression(n))n=n.expression;if(ts.isIdentifier(n)){const s=symbol(n);if(s)writes.set(s,n);}}
  for(const st of statements){ownWalk(st,n=>{if(n.kind===ts.SyntaxKind.ThisKeyword)thisUse=true;if(ts.isReturnStatement(n))returns.push(n);if(ts.isThrowStatement(n))throws++;if(ts.isBreakStatement(n)||ts.isContinueStatement(n)){let p=n.parent;while(p&&p.getStart(sf)>=start&&!ts.isIterationStatement(p,false)&&!ts.isSwitchStatement(p))p=p.parent;if(!p||p.getStart(sf)<start)breaks=true;}});
   walkAll(st,n=>{if(reference(n)){const s=symbol(n);if(n.text==='arguments')args=true;if(s)reads.set(s,reads.get(s)??n);}
    if(ts.isBinaryExpression(n)&&n.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&n.operatorToken.kind<=ts.SyntaxKind.LastAssignment)addWrite(n.left);
    if(ts.isPrefixUnaryExpression(n)||ts.isPostfixUnaryExpression(n))if([ts.SyntaxKind.PlusPlusToken,ts.SyntaxKind.MinusMinusToken].includes(n.operator))addWrite(n.operand);
    if(ts.isVariableDeclaration(n)){const collect=x=>{if(ts.isIdentifier(x)){const s=symbol(x);if(s)writes.set(s,x);}else ts.forEachChild(x,collect);};collect(n.name);}
    // Alias-visible mutator calls count as writes for live-out accounting.
    if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&/^(push|pop|shift|unshift|splice|sort|reverse|set|add|delete|clear)$/.test(n.expression.name.text))addWrite(n.expression.expression);
   });
  }
  const liveIns=[...reads].filter(([s])=>!s.declarations?.some(inside)&&s.declarations?.some(d=>d.getSourceFile()===sf&&local(d)&&!inside(d)));
  const liveOuts=[...writes].filter(([s])=>usesAfter.has(s));
  function info([s,n]){const type=checker.getTypeAtLocation(n);return {definedInside:s.declarations?.some(inside)??false,name:s.name,type:checker.typeToString(type,n,ts.TypeFormatFlags.NoTruncation),anyUnknown:!!(type.flags&(ts.TypeFlags.Any|ts.TypeFlags.Unknown))||/\b(any|unknown)\b/.test(checker.typeToString(type)),errorType:!!type.intrinsicName&&type.intrinsicName==='error',node:n};}
  if(expression)returns=[statements[0]];
  const terminal=returns.length===1&&returns[0]===statements.at(-1);
  result.push({expression,function:f.name?.getText(sf)??f.parent?.name?.getText(sf)??'<callback>',start,end,line:sf.getLineAndCharacterOfPosition(start).line+1,endLine:sf.getLineAndCharacterOfPosition(end).line+1,liveIns:liveIns.map(info),liveOuts:liveOuts.map(info),thisUse,argumentsUse:args,returns:returns.length,earlyReturn:returns.length>0&&!terminal,throws,externalJump:breaks,terminalReturn:terminal,statements});
 }
 function lists(f,block){let run=[];const flush=()=>{if(run.length)analyze(f,run);run=[];};
  for(const s of block.statements){if(ts.isTryStatement(s)){flush();lists(f,s.tryBlock);if(s.catchClause)lists(f,s.catchClause.block);if(s.finallyBlock)lists(f,s.finallyBlock);continue;}
   let hasTry=false;ownWalk(s,n=>{if(ts.isTryStatement(n))hasTry=true;});
   if(!suspended(s)&&!hasTry){run.push(s);if(ts.isReturnStatement(s)||ts.isThrowStatement(s))flush();continue;}
   flush();if(ts.isIterationStatement(s,false)){barriers.awaitLoops++;continue;}
   function nested(n){if(fn(n))return;if(ts.isBlock(n)){lists(f,n);return;}ts.forEachChild(n,nested);}ts.forEachChild(s,nested);
  }flush();
 }
 walkAll(sf,n=>{if(fn(n)&&n.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword)){functions.push(n);if(ts.isBlock(n.body))lists(n,n.body);else if(!suspended(n.body))analyze(n,[n.body],true);}});
 return {functions: functions.length,expressionArrows:functions.filter(n=>!ts.isBlock(n.body)).length,barriers,regions:result};
}
