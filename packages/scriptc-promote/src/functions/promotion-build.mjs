import { infrastructureFailure, translateDiagnostics } from './diagnostics.mjs';
import {assertDependencyHashes} from './dependency-closure.mjs';
import {constructionProof} from './construction-proof.mjs';
import { signature, constructionResultsDefault } from './promotion-signature.mjs';
import { readFile,writeFile,mkdir,rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {existsSync} from 'node:fs';
import os from 'node:os';
import { compilerPath } from '../paths.mjs';
async function compilePromotion(modules, output, {linux=false, target=linux?'linux-x64-gnu':`${process.platform}-${process.arch}${process.platform==='linux'?'-gnu':''}`, timing=false, constructionResults=constructionResultsDefault, catchFallback=true, runtime=process.env.LINUX_PACK, headers=process.env.NODE_HEADERS??path.join(os.homedir(),process.platform==='darwin'?'Library/Caches/node-gyp':' .cache/node-gyp'.trim(),'24.22.1/include/node'), report=console.log}={}){
 if(!modules.length)return [];
 for(const module of modules)assertDependencyHashes(module);
 const constructionReport=modules.flatMap(m=>{const proof=m.functions[0]?.constructionProof??constructionProof(m.native);return m.functions.map(fn=>{fn.constructionProof=proof;if(fn.boundary?.opaque&&!proof.eligible)throw Error('Opaque handles require a construction proof: '+proof.reason);const row={id:fn.id,name:fn.name,...proof,enabled:constructionResults&&proof.eligible&&fn.boundary?.result==='json'};return row;});});
 if(!['linux-arm64-gnu','linux-x64-gnu',`${process.platform}-${process.arch}${process.platform==='linux'?'-gnu':''}`].includes(target))throw Error(`Unsupported promotion target: ${target}`);
 const triple=target==='linux-arm64-gnu'?'aarch64-linux-gnu.2.34':'x86_64-linux-gnu.2.34';
 linux=target.startsWith('linux-');
 await mkdir(output,{recursive:true});
 await writeFile(path.join(output,'dependency-report.json'),JSON.stringify(modules.map(m=>({source:m.source,functions:m.functions.map(f=>f.name),closureHash:m.closureHash??m.hash,dependencies:m.dependencies??[]})),null,2)+'\n');
 await writeFile(path.join(output,'construction-report.json'),JSON.stringify(constructionReport,null,2)+'\n');
 for(const name of ['promotion.node','ids.json','encodings.json'])await rm(path.join(output,name),{force:true});
 if(linux&&!runtime){
  runtime=path.join(output,'runtime/package');
  if(!existsSync(path.join(runtime,'package.json'))){
  await mkdir(path.join(output,'runtime'),{recursive:true});
  execFileSync('npm',['pack',`@scriptc/runtime-${target}@0.4.6`,'--ignore-scripts','--silent','--pack-destination',path.join(output,'runtime')],{stdio:'pipe'});
  execFileSync('tar',['-xzf',path.join(output,`runtime/scriptc-runtime-${target}-0.4.6.tgz`),'-C',path.join(output,'runtime')]);
  await rm(path.join(output,`runtime/scriptc-runtime-${target}-0.4.6.tgz`));
  }
 }

 await writeFile(path.join(output,'package.json'),'{"type":"module"}');
 // Compile the self-contained closure independently of a non-strict app config.
 await writeFile(path.join(output,'tsconfig.json'),JSON.stringify({compilerOptions:{strict:true,target:'ESNext',types:[]}}));
 const json=path.join(output,'json.ts');await writeFile(json,await readFile(new URL('./json.ts',import.meta.url)));
 const accepted=[];let last;
 async function compile(list){
  let entry=`import {serialize} from './json.ts';\n`+(timing?'declare function boundaryStage(stage:number):void;\n':'');
  const exports=[];
  for(const [i,m] of list.entries()){
   await writeFile(path.join(output,`module-${i}.ts`),m.native);
   const fn=m.functions[0], sig=signature(fn,i,timing,constructionResults,catchFallback);entry+=`import {${fn.name} as f${i}} from './module-${i}.ts';\n`+sig.source;
   exports.push(sig.profile);
  }
  const profile={profile_format:1,name:'promotion',entry:'entry.ts',emission:'llvm',abi:{prefix:'rev_',init_symbol:'rev_init',sink_register_symbol:'rev_sink',collect_symbol:'rev_collect',localize_runtime:true,instance_per_thread:false},exports,...(timing?{callbacks:[{name:'boundaryStage',params:['f64'],returns:'void'}],abi:{prefix:'rev_',init_symbol:'rev_init',sink_register_symbol:'rev_sink',collect_symbol:'rev_collect',callback_register_symbol:'rev_callbacks',localize_runtime:true,instance_per_thread:false}}:{})};
  await writeFile(path.join(output,'entry.ts'),entry);await writeFile(path.join(output,'profile.json'),JSON.stringify(profile));
  const env={...process.env,SCRIPTC_CHECKER_SERVER:'0',...(linux?{SCRIPTC_TARGET:triple,SCRIPTC_RUNTIME_PACK:runtime}:{})};
  execFileSync(compilerPath(),['build','--lib','--profile',path.join(output,'profile.json'),'-o',path.join(output,'functions.lib.a')],{cwd:output,env,encoding:'utf8',stdio:'pipe'});
 }
 // Incremental final-filter probes leave one combined archive, never link
 // multiple copies of the scriptc runtime. Restore the last accepted set after a refusal.
 try{await compile(modules);accepted.push(...modules);last=true;}
 catch(error){
  const infrastructure=infrastructureFailure(error);if(infrastructure){report(infrastructure);return [];}
  for(const m of modules){try{await compile([...accepted,m]);accepted.push(m);last=true;}catch(e){const infrastructure=infrastructureFailure(e);if(infrastructure){report(infrastructure);return [];} const message=translateDiagnostics(e.stderr??e.message,[...accepted,m].map((module,i)=>({file:path.join(output,`module-${i}.ts`),module})));if(m.forced)throw Error(message);last=false;report(`[next-scriptc] not a candidate ${m.functions[0].name}: ${message}`);}}
 }
 if(!accepted.length)return [];
 if(!last)await compile(accepted);
 let c=await readFile(new URL('./promotion-addon.c',import.meta.url),'utf8');
 const signatures=accepted.map((m,i)=>signature(m.functions[0],i,timing,constructionResults,catchFallback));
 c=c.replace('/* TABLE */',signatures.map(s=>s.native).join('\n')+'\nstatic void (*entries[])(Job *)={'+signatures.map((_,i)=>`invoke${i}`).join(',')+'};\nstatic const Schema schemas[]={'+signatures.map(s=>`{${s.kinds.length},{${s.kinds.join(',')}},${s.resultKind}}`).join(',')+'};');
 await writeFile(path.join(output,'addon.c'),c);
 const common=['-O2','-DSERIALIZED_RUNTIME',...(timing?['-DBOUNDARY_TIMING']:[]),'-fPIC','-I'+headers,path.join(output,'addon.c'),path.join(output,'functions.lib.a'),'-o',path.join(output,'promotion.node')];
 try { execFileSync(linux?'zig':'clang',linux?['cc','-target',triple,'-shared',...common,'-lm','-lpthread','-ldl','-Wl,--allow-shlib-undefined']:['-bundle','-undefined','dynamic_lookup',...common],{stdio:'pipe'}); } catch(error) {const infrastructure=infrastructureFailure(error);if(!infrastructure)throw error;report(infrastructure);return [];}
 await writeFile(path.join(output,'ids.json'),JSON.stringify(accepted.map(m=>m.functions[0].id)));
 await writeFile(path.join(output,'encodings.json'),JSON.stringify({timing,functions:Object.fromEntries(accepted.map(m=>[m.functions[0].id,{...m.functions[0].boundary,...(constructionResults&&!catchFallback&&m.functions[0].constructionProof?.eligible&&m.functions[0].constructionProof?.guards?.[m.functions[0].name]?.length?{parseInputs:m.functions[0].constructionProof.guards[m.functions[0].name].map(g=>g.index)}:{})}]))}));
 return accepted;
}

export async function buildPromotion(modules, output, options={}) {
 try {return await compilePromotion(modules,output,options);}
 catch(error){const message=infrastructureFailure(error);if(!message)throw error; (options.report??console.log)(message);return [];}
}
