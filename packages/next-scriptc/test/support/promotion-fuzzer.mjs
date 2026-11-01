import assert from 'node:assert/strict';
import {createRequire,stripTypeScriptTypes} from 'node:module';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {sources} from './promotion-fuzz-corpus.mjs';
import {buildPromotion} from '../../src/functions/promotion-build.mjs';
import {loadPromotion} from '../../src/functions/promotion-runtime.mjs';
import {checkFunctionTypes} from '../../src/functions/types.mjs';
import {constructionProof} from '../../src/functions/construction-proof.mjs';
import {extractFunctions} from '../../src/functions/extract.mjs';
import {canonicalResult} from '../../src/functions/promotion-encodings.mjs';
const ts=createRequire(new URL('../../../../examples/demo/package.json',import.meta.url))('typescript');
const numbers=[0,-0,1,-1,Number.MAX_VALUE,-Number.MAX_VALUE,Number.MIN_VALUE,-Number.MIN_VALUE,1e-200,1e200,Number.MAX_SAFE_INTEGER];
const strings=['','a','2026-01-01','2026-01-31','世界','\ue000','\uffff','😀','e\u0301','\0','\ud800','\udfff','__proto__','constructor'];
const outcome=fn=>{try{return {value:fn()};}catch(e){return {error:e.constructor.name,message:e.message};}};
// The JSON ABI documents -0 -> +0. Preserve every other value (especially NaN,
// undefined and infinities returned by fallback); JSON round-tripping is unsafe.
function zeros(v){if(typeof v==='number')return Object.is(v,-0)?0:v;if(Array.isArray(v))return v.map(zeros);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,zeros(x)]));return v;}
function equivalent(a,b,schema){
 if(a.error||b.error){assert.equal(b.error,a.error);assert.equal(b.message,a.message);return;} // Native reruns the original JS exception.
 assert.deepEqual(schema.result==='json'?zeros(b.value):b.value,schema.result==='json'?zeros(a.value):a.value);
 let bytes;try{bytes=canonicalResult(a.value,schema);}catch{return;}
 assert.equal(canonicalResult(b.value,schema),bytes);
}
function* shrink(v){
 if(Array.isArray(v)){yield [];if(v.length>1)yield v.slice(0,Math.floor(v.length/2));for(let i=0;i<v.length;i++)for(const x of shrink(v[i]))yield v.map((a,j)=>i===j?x:a);}
 else if(typeof v==='string'&&v.length){yield '';yield v.slice(0,Math.floor(v.length/2));try{for(const x of shrink(JSON.parse(v)))yield JSON.stringify(x);}catch{}}
 else if(typeof v==='number'&&v!==0){yield 0;yield 1;}
 else if(v&&typeof v==='object'){for(const k of Object.keys(v)){const x={...v};delete x[k];yield x;}}
}
export async function fuzzPromotion({seed=Number(process.env.PROMOTION_FUZZ_SEED??0x51c7),cases=Number(process.env.PROMOTION_FUZZ_CASES??(process.env.PROMOTION_FUZZ_LONG?10000:40))}={}){
 const start=performance.now();
 let state=seed>>>0;const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};const pick=a=>a[Math.floor(random()*a.length)];
 const dir=await mkdtemp(path.join(os.tmpdir(),'promotion-fuzz-'));const counts={seed,cases,inputs:0,checks:0,native:0,fallback:0,candidates:0};
 try{
 const revenueFile=new URL('../../../../examples/demo/lib/revenue-core.ts',import.meta.url).pathname;
 const revenue=extractFunctions(await readFile(revenueFile,'utf8'),revenueFile,'revenueCore').native;
 const modules=[];
 for(const [i,source] of [...sources,revenue].entries()){
  const file=path.join(dir,`source-${i}.ts`);await writeFile(file,source);
  const program=ts.createProgram([file],{strict:true,target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,allowImportingTsExtensions:true});
  const declaration=program.getSourceFile(file).statements.find(n=>ts.isFunctionDeclaration(n));
  const fn={name:declaration.name.text,id:declaration.name.text,promotion:true,start:declaration.body.getStart(program.getSourceFile(file))};
  checkFunctionTypes(ts,program,[{source:file,functions:[fn]}]);
  const proof=constructionProof(source);assert.equal(proof.eligible,true,`${fn.name}: ${proof.reason}`);
  const checker=program.getTypeChecker();
  function shape(type,depth=0){assert.ok(depth<32);if(type.isUnion()){const nonnull=type.types.filter(t=>!(t.flags&ts.TypeFlags.Null));if(nonnull.length!==type.types.length)return {kind:'nullable',value:shape(nonnull[0],depth+1)};return shape(type.types[0],depth+1);}
   for(const [flag,kind] of [[ts.TypeFlags.NumberLike,'number'],[ts.TypeFlags.StringLike,'string'],[ts.TypeFlags.BooleanLike,'boolean'],[ts.TypeFlags.Null,'null']])if(type.flags&flag)return {kind};
   if(checker.isArrayType(type))return {kind:'array',value:shape(checker.getTypeArguments(type)[0],depth+1)};
   return {kind:'object',fields:checker.getPropertiesOfType(type).map(p=>[p.name,shape(checker.getTypeOfSymbolAtLocation(p,declaration),depth+1)])};
  }
  const shapes=declaration.parameters.map(p=>shape(checker.getTypeAtLocation(p)));
  const js=new Function(stripTypeScriptTypes(source.replaceAll(/export\s+(?=function)/g,'').replaceAll(/export\s*\{[^}]*\};?/g,''))+`;return ${fn.name};`)();
  modules.push({native:source,forced:true,functions:[fn],shapes,proof,js});
 }
 function generate(s,depth=0){switch(s.kind){case 'number':return random()<0.75?pick(numbers):(random()-.5)*1e6;case 'string':return pick(strings);case 'boolean':return random()<.5;case 'null':return null;case 'nullable':return random()<.25?null:generate(s.value,depth+1);case 'array':return Array.from({length:Math.floor(random()*(depth>6?2:6))},()=>generate(s.value,depth+1));case 'object':return Object.fromEntries(s.fields.map(([k,v])=>[k,generate(v,depth+1)]));default:throw Error(s.kind);}}
 const dispatchers=[];
 for(const constructionResults of [false,true]){
  const output=path.join(dir,String(constructionResults));await buildPromotion(modules,output,{constructionResults,report:()=>{}});
  dispatchers.push(loadPromotion(output+'/promotion.node',{mode:'native',fallbackWindow:100000000,log:()=>{},crashGuard:{directory:dir+'/markers'}}));
 }
 counts.candidates=modules.length;
 for(const m of modules){const fn=m.functions[0],schema=fn.boundary;
  function input(index){const args=m.shapes.map(generate);
   for(const guard of m.proof.guards?.[fn.name]??[]){let value=generate(guard.shape);args[guard.index]=JSON.stringify(value);if(index%13===0&&value&&typeof value==='object'){let deep={};for(let j=0;j<16;j++)deep={next:deep};value=Object.assign(value,{extra:deep});args[guard.index]=JSON.stringify(value);}
    if(index%9===0&&value&&typeof value==='object'&&!Array.isArray(value))args[guard.index]=args[guard.index].replace('{','{"n":999,"__proto__":{"x":1},"constructor":0,');}
   if(fn.name==='revenueCore'){args[0]='';args[1]='\uffff';}
   if(index%5===0){const j=Math.floor(random()*args.length);args[j]=pick([null,true,12,{},[],undefined]);}
   if(index%11===0&&m.proof.guards?.[fn.name]?.length)args[m.proof.guards[fn.name][0].index]=pick(['{','{}','null','[]','{"n":null,"s":3}']);
   return args;}
  const good=m.shapes.map(s=>s.kind==='number'?2:s.kind==='array'?[]:s.kind==='string'?'ok':generate(s));
  for(const g of m.proof.guards?.[fn.name]??[])good[g.index]=JSON.stringify(g.shape.kind==='array'?[]:generate(g.shape));
  for(let i=0;i<cases;i++){
   const args=input(i);counts.inputs++;const expected=outcome(()=>m.js(...args));
   for(const d of dispatchers){
    const check=a=>equivalent(outcome(()=>m.js(...a)),outcome(()=>d.dispatch(fn.id,m.js,a)),schema);
    try{equivalent(expected,outcome(()=>d.dispatch(fn.id,m.js,args)),schema);}catch(error){
     let minimal=args;for(let round=0;round<30;round++){let changed=false;for(const smaller of shrink(minimal)){if(JSON.stringify(smaller)===JSON.stringify(minimal))continue;try{check(smaller);}catch{minimal=smaller;changed=true;break;}}if(!changed)break;}
     throw Error(`seed=${seed} candidate=${fn.name} case=${i} minimized=${JSON.stringify(minimal)}\n${error.stack}`);
    }
    counts.checks++;
    const before=d.snapshot()[fn.id].native;
    check(good);assert.equal(d.snapshot()[fn.id].native,before+1,`instance poisoned after ${fn.name} case ${i}`);
    assert.ok(d.snapshot()[fn.id].buckets.every(b=>b.state!=='demoted'));
   }
  }
 }
 for(const d of dispatchers)for(const f of Object.values(d.snapshot())){counts.native+=f.native;counts.fallback+=f.fallback;}
 counts.elapsedMs=performance.now()-start;
 return counts;
 }finally{await rm(dir,{recursive:true,force:true});}
}
