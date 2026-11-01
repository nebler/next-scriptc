import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { compilerPath } from '../paths.mjs';
export async function buildPromotion(modules, output, {linux=false, runtime=process.env.LINUX_PACK, headers=process.env.NODE_HEADERS??path.join(os.homedir(),process.platform==='darwin'?'Library/Caches/node-gyp':' .cache/node-gyp'.trim(),'24.22.1/include/node'), report=console.log}={}){
 if(!modules.length)return [];
 await mkdir(output,{recursive:true});
 if(linux&&!runtime){
  runtime=path.join(output,'runtime/package');
  await mkdir(path.join(output,'runtime'),{recursive:true});
  execFileSync('npm',['pack','@scriptc/runtime-linux-x64-gnu@0.4.6','--ignore-scripts','--silent','--pack-destination',path.join(output,'runtime')],{stdio:'pipe'});
  execFileSync('tar',['-xzf',path.join(output,'runtime/scriptc-runtime-linux-x64-gnu-0.4.6.tgz'),'-C',path.join(output,'runtime')]);
 }

 await writeFile(path.join(output,'package.json'),'{"type":"module"}');
 const json=path.join(output,'json.ts');await writeFile(json,await readFile(new URL('./json.ts',import.meta.url)));
 const accepted=[];let last;
 async function compile(list){
  let entry=`import {serialize} from './json.ts';\n`;
  const exports=[];
  for(const [i,m] of list.entries()){
   await writeFile(path.join(output,`module-${i}.ts`),m.native);
   const fn=m.functions[0];entry+=`import {${fn.name} as f${i}} from './module-${i}.ts';\nexport function run${i}(input:string):string {const args=JSON.parse(input) as Parameters<typeof f${i}>;const value=f${i}(${fn.params.map((_,j)=>`args[${j}]`).join(',')});return serialize(value,true,()=>JSON.stringify(value));}\n`;
   exports.push({export:`run${i}`,symbol:`rev_fn_${i}`,params:['string'],returns:'string'});
  }
  const profile={profile_format:1,name:'promotion',entry:'entry.ts',emission:'llvm',abi:{prefix:'rev_',init_symbol:'rev_init',sink_register_symbol:'rev_sink',collect_symbol:'rev_collect',localize_runtime:true,instance_per_thread:false},exports};
  await writeFile(path.join(output,'entry.ts'),entry);await writeFile(path.join(output,'profile.json'),JSON.stringify(profile));
  const env={...process.env,SCRIPTC_CHECKER_SERVER:'0',...(linux?{SCRIPTC_TARGET:'x86_64-linux-gnu.2.34',SCRIPTC_RUNTIME_PACK:runtime}:{})};
  execFileSync(compilerPath(),['build','--lib','--profile',path.join(output,'profile.json'),'-o',path.join(output,'functions.lib.a')],{cwd:output,env,encoding:'utf8',stdio:'pipe'});
 }
 // Incremental final-filter probes leave one combined archive, never link
 // multiple copies of the scriptc runtime. Restore the last accepted set after a refusal.
 for(const m of modules){try{await compile([...accepted,m]);accepted.push(m);last=true;}catch(e){if(m.forced)throw e;last=false;report(`[next-scriptc] not a candidate ${m.functions[0].name}: ${e.stderr??e.message}`);}}
 if(!accepted.length)return [];
 if(!last)await compile(accepted);
 let c=await readFile(new URL('./promotion-addon.c',import.meta.url),'utf8');
 c=c.replace('/* TABLE */',accepted.map((_,i)=>`extern void rev_fn_${i}(const uint8_t *,size_t,const uint8_t **,size_t *);`).join('\n')+'\nstatic void (*entries[])(const uint8_t *,size_t,const uint8_t **,size_t *)={'+accepted.map((_,i)=>`rev_fn_${i}`).join(',')+'};');
 await writeFile(path.join(output,'addon.c'),c);
 const common=['-O2','-DSERIALIZED_RUNTIME','-fPIC','-I'+headers,path.join(output,'addon.c'),path.join(output,'functions.lib.a'),'-o',path.join(output,'promotion.node')];
 execFileSync(linux?'zig':'clang',linux?['cc','-target','x86_64-linux-gnu.2.34','-shared',...common,'-lm','-lpthread','-ldl','-Wl,--allow-shlib-undefined']:['-bundle','-undefined','dynamic_lookup',...common],{stdio:'pipe'});
 await writeFile(path.join(output,'ids.json'),JSON.stringify(accepted.map(m=>m.functions[0].id)));
 return accepted;
}
