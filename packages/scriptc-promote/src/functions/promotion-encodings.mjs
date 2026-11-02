import { serialize } from './json.mjs';

// UTF-8 cannot round-trip lone UTF-16 surrogates. Refuse rather than silently
// replacing them. Dispatcher falls back to JS, preserving observable behavior.
function primitive(kind, value) {
  if (kind === 'bytes') {
    if (!(value instanceof Uint8Array) || Object.getPrototypeOf(value)!==Uint8Array.prototype || Object.getOwnPropertySymbols(value).length || Object.getOwnPropertyNames(value).length!==value.length) throw Error('Expected plain Uint8Array');
    return value.slice(); // Shadow jobs must own a snapshot before caller mutation.
  }
  if (kind === 'string') {
    if (typeof value !== 'string' || !value.isWellFormed()) throw Error('Expected well-formed UTF-8 string');
  } else if (kind === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw Error('Expected finite number');
    return value; // f64 preserves the sign bit.
  } else if (kind === 'boolean' ? typeof value !== 'boolean' : value !== null) throw Error('Invalid boundary primitive');
  return value;
}
const tables=new WeakMap(),indexes=new WeakMap(),negativeZero=Symbol('negative zero');
const identityKey=v=>Object.is(v,-0)?negativeZero:v;
function indexOf(table,value){const index=indexes.get(table);return index?index.get(identityKey(value))??-1:table.findIndex(v=>Object.is(v,value));}
function walkOpaque(shape,value,handle,exact=false,reads){
 if(shape.kind==='handle')return handle(value);
 if(reads&&value!==null&&(typeof value==='object'||typeof value==='function'))reads.add(value);
 if(shape.kind==='nullable')return value===null?null:walkOpaque(shape.value,value,handle,exact,reads);
 if(shape.kind==='array'){
  if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)throw Error('Expected plain array');
  if(Object.getOwnPropertySymbols(value).length||Object.getOwnPropertyNames(value).length!==value.length+1)throw Error('Unexpected result array fields');
  return Array.from({length:value.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||!('value' in d))throw Error('Expected dense data array');return walkOpaque(shape.value,d.value,handle,exact,reads);});
 }
 if(shape.kind==='object'){
  if(value===null||typeof value!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error('Expected plain JSON object');
  if(exact&&(Object.getOwnPropertySymbols(value).length||Object.getOwnPropertyNames(value).length!==shape.fields.length))throw Error('Unexpected result fields');
  const out={};
  for(const [key,child] of shape.fields){if(['__proto__','constructor','prototype','toJSON'].includes(key))throw Error('Reserved boundary field');const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!('value' in d))throw Error('Expected own data field');out[key]=walkOpaque(child,d.value,handle,exact,reads);}return out;
 }
 return primitive(shape.kind,value);
}
export function argumentTable(encoded){return tables.get(encoded);}
export function encodeArguments(schema, args) {
  if (args.length !== schema.params.length) throw Error('Boundary argument count mismatch');
  const table=schema.opaque?[]:null,index=table?new Map():null,reads=table?new Set():null;if(table)indexes.set(table,index);
  const capture=value=>{let i=indexOf(table,value);if(i<0){i=table.length;table.push(value);index.set(identityKey(value),i);}return i;};
  const encoded=schema.params.map((kind, i) => {
    const value=schema.opaque?walkOpaque(schema.opaque.inputs[i],args[i],capture,false,reads):args[i];
    return kind==='json'?serialize(value):primitive(kind,value);
  });
  if(schema.opaque){if(table.some(v=>reads.has(v)))throw Error('Borrowed value aliases a read container');tables.set(encoded,table);}
  // Validate the primitive before parsing so invalid objects cannot coerce.
  // Screened parse assertions need syntactically valid JSON before native entry.
  for(const index of schema.parseInputs??[])JSON.parse(encoded[index]);
  return encoded;
}
export function decodeResult(schema, value, table) {
  const parsed=schema.result === 'json' ? JSON.parse(value) : primitive(schema.result, value);
  if(!schema.opaque)return parsed;
  if(!table)throw Error('Missing call handle table');
  return walkOpaque(schema.opaque.result,parsed,index=>{if(!Number.isInteger(index)||index<0||index>=table.length)throw Error('Invalid call handle');return table[index];},true);
}
export function canonicalResult(value, schema, table) {
  if(schema?.opaque){
    if(!table)throw Error('Missing call handle table');
    value=walkOpaque(schema.opaque.result,value,reference=>{const i=indexOf(table,reference);if(i<0)throw Error('Result does not retain input identity');return i;},true);
  }
  // The scalar f64 lane preserves -0; its comparison bytes must distinguish it.
  if (schema?.result==='number' && Object.is(value,-0)) return '-0';
  return serialize(schema?.result==='bytes'?Array.from(primitive('bytes',value)):value, true); }
