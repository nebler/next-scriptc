import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {discoverPromotions} from '../functions/promotion-discovery.mjs';
import {compilerPath} from '../paths.mjs';
export async function prepareBrowser(root,options,output) {
 const report=options.report??console.log;
 const modules=await discoverPromotions(root,output,{promotionSourceDir:options.sourceDir??'src'},report);
 const require=createRequire(path.join(root,'package.json'));
 const pack=path.dirname(require.resolve('@scriptc/runtime-wasm32-wasi/package.json'));
 if(require('@scriptc/runtime-wasm32-wasi/package.json').version!=='0.4.6')throw Error('Browser requires stock wasm runtime 0.4.6');
 await mkdir(output,{recursive:true});
 const selected=[],entries={};
 for(const spec of options.functions??[]) {
  const source=path.resolve(root,spec.source);
  if(selected.some(m=>m.source===source))throw Error('Browser currently supports one selected function per source module');
  const m=modules.find(m=>m.source===source&&m.functions.some(f=>f.name===spec.name));
  if(!m)throw Error(`Browser function is not promotable: ${spec.source}#${spec.name}`);
  const fn=m.functions.find(f=>f.name===spec.name);
  if(fn.boundary.params.includes('bytes')||fn.boundary.result==='bytes'||fn.boundary.opaque||fn.expression||fn.defaults?.some(Boolean)||fn.originalParams?.some(p=>!/^\w+(\s*:\s*[^=]+)?$/.test(p)))throw Error('Browser currently requires ordinary parameters and JSON boundaries');
  if(!Array.isArray(spec.sizePath)||!spec.sizePath.length||!spec.sizePath.every(k=>typeof k==='string'||Number.isInteger(k))||!Array.isArray(spec.buckets)||!spec.buckets.every(n=>Number.isInteger(n)&&n>=0&&n<=52))throw Error('Browser requires sizePath and calibrated log2 buckets');
  // The calibration explicitly pins the complete compiler input, target and ABI.
  const key=createHash('sha256').update(JSON.stringify({native:m.native,schema:fn.boundary,target:'wasm32-wasi',compiler:'0.4.6',abi:47,policy:1})).digest('hex');
  if(spec.key&&spec.key!==key)throw Error(`Stale browser calibration for ${fn.name}; expected ${key}`);
  const dir=path.join(output,fn.id);await mkdir(dir,{recursive:true});
  await writeFile(path.join(dir,'module.ts'),m.native);
  await writeFile(path.join(dir,'entry.ts'),`import {${fn.name} as f} from './module.ts';\nexport function run(input:string):string {const a=JSON.parse(input) as Parameters<typeof f>;return JSON.stringify(f(...a));}\n`);
  await writeFile(path.join(dir,'tsconfig.json'),JSON.stringify({compilerOptions:{strict:true,target:'ESNext',types:[]}}));
  const profile={profile_format:1,name:'browser',entry:'entry.ts',emission:'llvm',abi:{prefix:'bench_',init_symbol:'bench_init',sink_register_symbol:'bench_sink',collect_symbol:'bench_collect'},exports:[{export:'run',symbol:'bench_run',params:['string'],returns:'string'}]};
  await writeFile(path.join(dir,'profile.json'),JSON.stringify(profile));
  execFileSync(compilerPath(),['build','--lib','--profile',path.join(dir,'profile.json'),'-o',path.join(dir,'compute.wasm')],{cwd:dir,stdio:'pipe',env:{...process.env,SCRIPTC_TARGET:'wasm32-wasi',SCRIPTC_RUNTIME_PACK:pack,SCRIPTC_CHECKER_SERVER:'0'}});
  const bytes=await readFile(path.join(dir,'compute.wasm'));
  const hash=createHash('sha256').update(bytes).digest('hex').slice(0,20);
  entries[fn.id]={schema:fn.boundary,sizePath:spec.sizePath,buckets:spec.key?spec.buckets:[],key,fileName:`scriptc/${hash}.wasm`,bytes:bytes.length};
  selected.push({...m,functions:[fn],wasm:bytes});
  report(`[scriptc-promote] browser ${fn.name}: ${bytes.length} wasm bytes; calibration key ${key}`);
 }
 return {modules:selected,entries};
}
export const runtimePath=fileURLToPath(new URL('./runtime.mjs',import.meta.url));
export function registrySource(entries) {return `import {createBrowserDispatcher} from ${JSON.stringify(runtimePath)};\nconst d=typeof window==='undefined'?null:createBrowserDispatcher(${JSON.stringify(entries)});\nexport const promote=(file,id,js,args)=>d?d.dispatch(file,id,js,args):js(...args);\n`;}
