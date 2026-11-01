import {resultValidator} from './result-validator.mjs';
// Build-time, host-independent lowering of a checked TypeScript signature.
const abi = k => ({number:'f64',boolean:'bool',null:'bool',bytes:'bytes',json:'string',string:'string'})[k];
const ts = k => ({number:'number',boolean:'boolean',null:'boolean',bytes:'Uint8Array',json:'string',string:'string'})[k];
const c = k => ['string','json','bytes'].includes(k) ? ['const uint8_t *','size_t'] : [k === 'number' ? 'double' : 'uint8_t'];
export function signature(fn, i, timing = false, specializeResults = false) {
  if (!fn.boundary) throw Error('Promotion build requires checkFunctionTypes boundary metadata');
  const {params,result} = fn.boundary;
  if(params.length>64)throw Error('Promotion ABI supports at most 64 arguments');
  const mark = n => timing ? `boundaryStage(${n});` : '';
  const declarations = params.map((k,j)=>`const a${j}=${k==='json'?`JSON.parse(p${j}) as Parameters<typeof f${i}>[${j}]`:k==='null'?'null':`p${j}`};`).join('');
  const validator = resultValidator(specializeResults ? fn.resultShape : null, `validateResult${i}`);
  const encode = result==='json' ? (validator ? `(validateResult${i}(value)?JSON.stringify(value):serialize(value,true,()=>JSON.stringify(value),null,true))` : 'serialize(value,true,()=>JSON.stringify(value),null,true)') : result==='null' ? 'false' : 'value';
  const source = validator + `export function run${i}(${params.map((k,j)=>`p${j}:${ts(k)}`).join(',')}):${ts(result)} {${declarations}${mark(1)}const value=f${i}(${params.map((_,j)=>`a${j}`).join(',')});${mark(2)}${['number','boolean','string','null'].includes(result)?"serialize(value,true,()=>'');":''}const output=${encode};${mark(3)}return output;}\n`;
  const buffered = ['string','json','bytes'].includes(result);
  const ret = buffered ? 'void' : result==='number' ? 'double' : 'uint8_t';
  const args = params.flatMap((k,j)=>['string','json','bytes'].includes(k)?[`(uint8_t *)j->inputs[${j}].data`,`j->inputs[${j}].len`]:[k==='number'?`j->inputs[${j}].number`:`j->inputs[${j}].boolean`]);
  const native = `extern ${ret} rev_fn_${i}(${[...params.flatMap(c),...(buffered?['const uint8_t **','size_t *']:[])].join(',')||'void'});\nstatic void invoke${i}(Job *j){${buffered?`const uint8_t *out=NULL;size_t len=0;rev_fn_${i}(${[...args,'&out','&len'].join(',')});copy_output(j,out,len);`:`j->${result==='number'?'number':'boolean'}=rev_fn_${i}(${args.join(',')});`}}`;
  return {source,native,profile:{export:`run${i}`,symbol:`rev_fn_${i}`,params:params.map(abi),returns:abi(result)},kinds:params.map(k=>['string','json','bytes'].includes(k)? (k==='bytes'?4:0):k==='number'?1:2),resultKind:result==='bytes'?4:buffered?0:result==='number'?1:result==='null'?3:2};
}
