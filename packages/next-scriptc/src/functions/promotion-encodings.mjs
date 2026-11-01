import { serialize } from './json.ts';

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
export function encodeArguments(schema, args) {
  if (args.length !== schema.params.length) throw Error('Boundary argument count mismatch');
  return schema.params.map((kind, i) => kind === 'json' ? serialize(args[i],false,null,null,true) : primitive(kind, args[i]));
}
export function decodeResult(schema, value) {
  return schema.result === 'json' ? JSON.parse(value) : primitive(schema.result, value);
}
export function canonicalResult(value, schema) {
  // The scalar f64 lane preserves -0; its comparison bytes must distinguish it.
  if (schema?.result==='number' && Object.is(value,-0)) return '-0';
  return serialize(schema?.result==='bytes'?Array.from(primitive('bytes',value)):value, true, null, null, schema?.result==='json'); }
