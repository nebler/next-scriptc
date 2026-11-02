// Call sites only choose the specialized type. Soundness comes from the
// runtime: host serialization rejects non-JSON values (Dates, getters,
// prototypes, cycles, holes, present undefined) and the checked typed parse
// rejects shape mismatches, so any caller, seen or unseen, falls back to JS.
export function specializeCallSites(ts, program, module) {
 const checker=program.getTypeChecker(),source=program.getSourceFile(module.source);
 const fail=reason=>{throw Error(`${module.source}: function ${module.functions[0].name}: call-site specialization: ${reason}`);};
 const fn=module.functions[0];let declaration;
  function find(n){if(ts.isFunctionLike(n)&&n.body?.getStart(source)===fn.start)declaration=n;else ts.forEachChild(n,find);}find(source);
 if(!declaration)fail('missing declaration');
 const binding=declaration.parent&&ts.isVariableDeclaration(declaration.parent)?declaration.parent:declaration;
 const symbol=checker.getSymbolAtLocation(binding.name);
 if(!symbol)fail('missing binding');
 const calls=[];
 function refs(n){
  if(ts.isIdentifier(n)&&(n.parent&&ts.isShorthandPropertyAssignment(n.parent)?checker.getShorthandAssignmentValueSymbol(n.parent):checker.getSymbolAtLocation(n))===symbol&&n!==binding.name){
   if(n.parent&&ts.isCallExpression(n.parent)&&n.parent.expression===n)calls.push(n.parent);
  }
  ts.forEachChild(n,refs);
 }
 // Scan the complete checker program, including callers in other modules.
 for(const file of program.getSourceFiles())if(!file.isDeclarationFile)refs(file);
 if(!calls.length)fail('no visible direct calls');
 let types;
 for(const call of calls){
  if(call.arguments.length!==declaration.parameters.length||call.arguments.some(a=>ts.isSpreadElement(a)))fail('caller lacks exact arity');
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
 return {native:text,metadata:{calls:calls.length,params:types,policy:'visible-call-types-runtime-guarded'}};
}
