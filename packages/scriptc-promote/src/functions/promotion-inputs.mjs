// Shared bounded TypeScript synthesis for measurement and differential fuzzing.
import {createRequire} from 'node:module';
import {strictClosureProgram} from './construction-proof.mjs';
const require=createRequire(import.meta.url);
export function inputShapes(module,fn){
 const ts=require('typescript'),{program,source}=strictClosureProgram(fn.specialization?module.native:(module.referenceNative??module.native),ts),checker=program.getTypeChecker();
 let declaration;
 function find(n){if(ts.isFunctionDeclaration(n)&&n.name?.text===fn.name)declaration=n;else if(ts.isVariableDeclaration(n)&&n.name?.text===fn.name)declaration=n.initializer;else ts.forEachChild(n,find);}find(source);
 if(!declaration?.parameters)throw Error('Cannot synthesize signature');
 let budget=256;
 function shape(t,seen=new Set(),depth=0){
  if(--budget<0||depth>32||seen.has(t))throw Error('Recursive or large input type; bounded synthesis unavailable');
  if(t.isLiteral())return {kind:'literal',value:t.value};
  for(const [flag,kind] of [[ts.TypeFlags.Number,'number'],[ts.TypeFlags.String,'string'],[ts.TypeFlags.BooleanLike,'boolean'],[ts.TypeFlags.Null,'null'],[ts.TypeFlags.Undefined,'undefined']])if(t.flags&flag)return {kind};
  const next=new Set(seen).add(t),child=v=>shape(v,next,depth+1);
  if(t.isUnion())return {kind:'union',values:t.types.map(child)};
  if(checker.isArrayType(t))return {kind:'array',value:child(checker.getTypeArguments(t)[0])};
  if(checker.isTupleType(t))return {kind:'tuple',values:checker.getTypeArguments(t).map(child)};
  if(t.symbol?.name==='Uint8Array')return {kind:'bytes'};
  if(t.flags&ts.TypeFlags.Object&&!t.getCallSignatures().length&&!t.getConstructSignatures().length){
   const fields=checker.getPropertiesOfType(t).map(p=>[p.name,child(checker.getTypeOfSymbolAtLocation(p,p.valueDeclaration??declaration)),!!(p.flags&ts.SymbolFlags.Optional)]);
   const index=checker.getIndexInfosOfType(t)[0];return {kind:'object',fields,index:index?child(index.type):null};
  }
  throw Error('No bounded input type');
 }
 return declaration.parameters.map((p,i)=>{try{return shape(checker.getTypeAtLocation(p));}catch(error){const fallback=fn.boundary?.opaque?.inputs?.[i];if(fallback)return fallback;throw error;}});
}
export function baseValue(s){
 let budget=4096;
 function value(s){
  if(--budget<0)throw Error('Synthesized value exceeds 4096 nodes');
  switch(s.kind){
   case 'handle':return {};
   case 'nullable':return value(s.value);
   case 'literal':return s.value;
   case 'number':return 32;
   case 'string':return 'synthetic';
   case 'boolean':return true;
   case 'null':return null;
   case 'undefined':return undefined;
   case 'bytes':return new Uint8Array([0,127,255]);
   case 'union':return value(s.values.find(v=>!['null','undefined'].includes(v.kind))??s.values[0]);
   case 'array':return Array.from({length:16},()=>value(s.value));
   case 'tuple':return s.values.map(value);
   case 'object':return Object.fromEntries(s.fields.map(([k,v])=>[k,value(v)]));
   default:throw Error('Unsupported shape '+s.kind);
  }
 }
 return value(s);
}
export function synthesize(module,fn){return inputShapes(module,fn).map(baseValue);}
