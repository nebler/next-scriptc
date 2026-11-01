// Single switch for builder and signature defaults. Keep opt-in until approved.
export const constructionResultsDefault = false;
import {constructionValidator} from './construction-validator.mjs';
// Build-time, host-independent lowering of a checked TypeScript signature.
const abi = k => ({number:'f64',boolean:'bool',null:'bool',bytes:'bytes',json:'string',string:'string'})[k];
const ts = k => ({number:'number',boolean:'boolean',null:'boolean',bytes:'Uint8Array',json:'string',string:'string'})[k];
const c = k => ['string','json','bytes'].includes(k) ? ['const uint8_t *','size_t'] : [k === 'number' ? 'double' : 'uint8_t'];
export function signature(fn, i, timing = false, constructionResults = constructionResultsDefault, catchFallback = true) {
  if (!fn.boundary) throw Error('Promotion build requires checkFunctionTypes boundary metadata');
  const {params,result} = fn.boundary;
  if(params.length>64)throw Error('Promotion ABI supports at most 64 arguments');
  const mark = n => timing ? `boundaryStage(${n});` : '';
  const declarations = params.map((k,j)=>`const a${j}=${k==='json'?`JSON.parse(p${j}) as Parameters<typeof f${i}>[${j}]`:k==='null'?'null':`p${j}`};`).join('');
  const shape=fn.resultShape??fn.constructionProof?.shapes?.[fn.name];
  const screened=result==='json'&&constructionResults&&fn.constructionProof?.eligible&&!!shape;
  const numericScreen=result==='number'&&constructionResults&&fn.constructionProof?.eligible;
  const scan=screened?constructionValidator(shape,`constructionResult${i}`):'';
  // With catchFallback, scriptc's checked typed JSON.parse is the input guard:
  // any shape mismatch throws inside the try and this call reruns in JS. The
  // separate dynamic preflight (a second native parse) is only kept without it.
  const guards=(screened||numericScreen)&&!catchFallback?(fn.constructionProof?.guards?.[fn.name]??[]):[];
  const guardSource=guards.map((g,j)=>constructionValidator(g.shape,`constructionInput${i}_${j}`,true)).join('');
  const guardCalls=guards.map((g,j)=>`if(!constructionInput${i}_${j}(JSON.parse(p${g.index})))return ${numericScreen?'NaN':"''"};`).join('');
  const encode = result==='json' ? (screened ? `(constructionResult${i}(value)?JSON.stringify(value):'')` : constructionResults&&fn.constructionProof?.eligible&&fn.constructionProof.version===1 ? 'JSON.stringify(value)' : 'serialize(value,true,()=>JSON.stringify(value))') : result==='null' ? 'false' : 'value';
  // Screened functions are pure, so any native exception (JSON syntax, checked
  // typed reads) can rerun this call in JS instead of poisoning the instance.
  const guarded=fn.constructionProof?.eligible&&['json','number'].includes(result)&&catchFallback;
  const fallbackValue=result==='number'?'NaN':"''";
  const source = scan + guardSource + `export function run${i}(${params.map((k,j)=>`p${j}:${ts(k)}`).join(',')}):${ts(result)} {${guarded?'try{':''}${guardCalls}${declarations}${mark(1)}const value=f${i}(${params.map((_,j)=>`a${j}`).join(',')});${mark(2)}${numericScreen?'if(!Number.isFinite(value))return NaN;':''}${['number','boolean','string','null'].includes(result)?"serialize(value,true,()=>'');":''}const output=${encode};${mark(3)}return output;${guarded?`}catch(e){return ${fallbackValue};}`:''}}\n`;
  const buffered = ['string','json','bytes'].includes(result);
  const ret = buffered ? 'void' : result==='number' ? 'double' : 'uint8_t';
  const args = params.flatMap((k,j)=>['string','json','bytes'].includes(k)?[`(uint8_t *)j->inputs[${j}].data`,`j->inputs[${j}].len`]:[k==='number'?`j->inputs[${j}].number`:`j->inputs[${j}].boolean`]);
  const native = `extern ${ret} rev_fn_${i}(${[...params.flatMap(c),...(buffered?['const uint8_t **','size_t *']:[])].join(',')||'void'});\nstatic void invoke${i}(Job *j){${buffered?`const uint8_t *out=NULL;size_t len=0;rev_fn_${i}(${[...args,'&out','&len'].join(',')});${(screened||guarded)?'if(len==0){j->fallback=1;return;}':''}copy_output(j,out,len);`:`j->${result==='number'?'number':'boolean'}=rev_fn_${i}(${args.join(',')});${(numericScreen||guarded)?'if(!isfinite(j->number))j->fallback=1;':''}`}}`;
  return {source,native,profile:{export:`run${i}`,symbol:`rev_fn_${i}`,params:params.map(abi),returns:abi(result)},kinds:params.map(k=>['string','json','bytes'].includes(k)? (k==='bytes'?4:0):k==='number'?1:2),resultKind:result==='bytes'?4:buffered?0:result==='number'?1:result==='null'?3:2};
}
