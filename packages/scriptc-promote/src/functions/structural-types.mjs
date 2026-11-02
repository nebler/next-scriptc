// Emit checker-resolved type queries without visiting or executing schema values.
export function structuralType(t, checker, ts, location, depth=0, seen=new Set()) {
 const fail=()=>{throw Error('type query is not bounded structural data');};
 if(depth>12||seen.has(t))fail();
 if(t.flags&(ts.TypeFlags.Any|ts.TypeFlags.Unknown|ts.TypeFlags.ESSymbolLike|ts.TypeFlags.TypeParameter))fail();
 if(t.isIntersection())fail(); // Includes Zod brands, including nominal intersections.
 if(t.flags&ts.TypeFlags.StringLiteral)return JSON.stringify(t.value);
 if(t.flags&ts.TypeFlags.NumberLiteral)return String(t.value);
 if(t.flags&ts.TypeFlags.String)return 'string';
 if(t.flags&ts.TypeFlags.Number)return 'number';
 if(t.flags&ts.TypeFlags.BooleanLike)return 'boolean';
 if(t.flags&ts.TypeFlags.Null)return 'null';
 if(t.flags&ts.TypeFlags.Undefined)return 'undefined';
 // Unsupported leaves remain unknown until path specialization. They can only
 // survive as handles; the strict boundary and construction proofs reject reads.
 const next=new Set(seen).add(t),emit=v=>{try{return structuralType(v,checker,ts,location,depth+1,next);}catch(e){if(e.message==='type query is not bounded structural data')return 'unknown';throw e;}};
 if(t.isUnion())return '('+t.types.map(emit).join('|')+')';
 if(checker.getSignaturesOfType(t,ts.SignatureKind.Call).length||checker.getSignaturesOfType(t,ts.SignatureKind.Construct).length)fail();
 if(checker.isArrayType(t))return `Array<${emit(checker.getTypeArguments(t)[0])}>`;
 if(!(t.flags&ts.TypeFlags.Object)||t.getSymbol()?.declarations?.some(d=>ts.isClassDeclaration(d)))fail();
 const fields=checker.getPropertiesOfType(t).map(p=>{
  if(p.name.startsWith('__@')||p.declarations?.some(d=>ts.isGetAccessorDeclaration(d)||ts.isSetAccessorDeclaration(d)))fail();
  return `${JSON.stringify(p.name)}${p.flags&ts.SymbolFlags.Optional?'?':''}:${emit(checker.getTypeOfSymbolAtLocation(p,p.valueDeclaration??p.declarations?.[0]??location))}`;
 });
 for(const info of checker.getIndexInfosOfType(t)){
  if(!(info.keyType.flags&(ts.TypeFlags.String|ts.TypeFlags.Number)))fail();
  fields.push(`[key:${info.keyType.flags&ts.TypeFlags.String?'string':'number'}]:${emit(info.type)}`);
 }
 return '{'+fields.join(';')+'}';
}
