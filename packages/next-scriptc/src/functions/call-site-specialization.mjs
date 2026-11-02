// A closed set of direct calls with fresh JSON literals. Types alone cannot
// prove JSON provenance: a structural interface can hide accessors/prototypes.
export function specializeCallSites(ts, program, module) {
 const checker=program.getTypeChecker(),source=program.getSourceFile(module.source);
 const fail=reason=>{throw Error(`${module.source}: function ${module.functions[0].name}: call-site specialization: ${reason}`);};
 const fn=module.functions[0];let declaration;
 if(!ts.isExternalModule(source))fail('binding is not module-private');
 function find(n){if(ts.isFunctionLike(n)&&n.body?.getStart(source)===fn.start)declaration=n;else ts.forEachChild(n,find);}find(source);
 if(!declaration)fail('missing declaration');
 const binding=declaration.parent&&ts.isVariableDeclaration(declaration.parent)?declaration.parent:declaration;
 const symbol=checker.getSymbolAtLocation(binding.name);
 if(!symbol)fail('missing binding');
 const moduleSymbol=checker.getSymbolAtLocation(source);
 if(moduleSymbol)for(const exported of checker.getExportsOfModule(moduleSymbol)){
  const target=exported.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(exported):exported;
  if(target===symbol)fail('exported binding has unseen callers');
 }
 for(let n=binding;n&&!ts.isSourceFile(n);n=n.parent)if(n.modifiers?.some(m=>[ts.SyntaxKind.ExportKeyword,ts.SyntaxKind.DefaultKeyword].includes(m.kind)))fail('exported binding has unseen callers');
 // Only literal construction is admitted. Identifiers, spreads, calls, casts,
 // methods, accessors and computed keys need a separate alias/origin proof.
 function literal(n){
  if(ts.isParenthesizedExpression(n))return literal(n.expression);
  if(ts.isStringLiteral(n)||ts.isNumericLiteral(n)||[ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword,ts.SyntaxKind.NullKeyword].includes(n.kind))return true;
  if(ts.isPrefixUnaryExpression(n))return [ts.SyntaxKind.MinusToken,ts.SyntaxKind.PlusToken].includes(n.operator)&&ts.isNumericLiteral(n.operand);
  if(ts.isArrayLiteralExpression(n))return n.elements.every(literal);
  if(ts.isObjectLiteralExpression(n))return n.properties.every(p=>ts.isPropertyAssignment(p)&&(ts.isIdentifier(p.name)||ts.isStringLiteral(p.name)||ts.isNumericLiteral(p.name))&&!['__proto__','constructor','prototype','toJSON'].includes(p.name.text)&&literal(p.initializer));
  return false;
 }
 const calls=[];
 function refs(n){
  if(n.getSourceFile()===source&&ts.isIdentifier(n)&&n.text==='eval')fail('dynamic evaluation can reach the binding');
  if(ts.isIdentifier(n)&&(n.parent&&ts.isShorthandPropertyAssignment(n.parent)?checker.getShorthandAssignmentValueSymbol(n.parent):checker.getSymbolAtLocation(n))===symbol&&n!==binding.name){
   if((!n.parent||!ts.isCallExpression(n.parent))||n.parent.expression!==n||n.parent.questionDotToken)fail('binding escapes or has a dynamic reference');
   calls.push(n.parent);
  }
  ts.forEachChild(n,refs);
 }
 // Scan the complete checker program, not merely discovery's directory. A
 // private binding still must not escape through export specifiers or aliases.
 for(const file of program.getSourceFiles())if(!file.isDeclarationFile)refs(file);
 if(!calls.length)fail('no visible direct calls');
 let types;
 for(const call of calls){
  if(call.arguments.length!==declaration.parameters.length||!call.arguments.every(literal))fail('caller lacks fresh JSON provenance or exact arity');
  if(!checker.getResolvedSignature(call))fail('unresolved call');
  const current=call.arguments.map(a=>checker.typeToString(checker.getWidenedType(checker.getBaseTypeOfLiteralType(checker.getTypeAtLocation(a))),undefined,ts.TypeFormatFlags.NoTruncation|ts.TypeFormatFlags.InTypeAlias));
  if(types&&JSON.stringify(types)!==JSON.stringify(current))fail('instantiations disagree');
  types=current;
 }
 const native=ts.createSourceFile('specialized.ts',module.native,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const edits=[];let found=false;
 function rewrite(n){
  const name=n.name?.text??(n.parent&&ts.isVariableDeclaration(n.parent)?n.parent.name.text:undefined);
  if(ts.isFunctionLike(n)&&name===fn.name&&n.body){
   found=true;
   if(n.typeParameters?.length)edits.push([n.typeParameters.pos-1,n.typeParameters.end+1,'']);
   n.parameters.forEach((p,i)=>{
    if(!ts.isIdentifier(p.name)||p.dotDotDotToken||p.initializer||p.questionToken)fail('specialized parameters must be required identifiers');
    edits.push([p.name.end,p.type?.end??p.name.end,`: ${types[i]}`]);
   });
   // Re-infer the result using the concrete parameter types in a strict program.
   if(n.type)edits.push([n.parameters.end+1,n.type.end,'']);
  }else ts.forEachChild(n,rewrite);
 }
 rewrite(native);if(!found)fail('missing extracted binding');
 let text=module.native;for(const [start,end,value] of edits.sort((a,b)=>b[0]-a[0]))text=text.slice(0,start)+value+text.slice(end);
 return {native:text,metadata:{calls:calls.length,params:types,policy:'private-direct-fresh-json'}};
}
