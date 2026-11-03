import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {fuzzOptions} from './promotion-fuzz.mjs';
export async function fuzzBuiltPromotions(modules,output,settings={}){
 const options=fuzzOptions(settings),results=[];
 // One subprocess per function contains native crashes and synchronous hangs.
 const temp=await mkdtemp('/tmp/scriptc-fuzz-');
 try{for(const [index,module] of modules.entries()){
  const request=path.join(temp,index+'.request.json'),result=path.join(temp,index+'.result.json');
  await writeFile(request,JSON.stringify({module,addonFile:path.resolve(output,'promotion.node'),index,options}));
  try{
   await promisify(execFile)(process.execPath,[fileURLToPath(new URL('./promotion-fuzz-worker.mjs',import.meta.url)),request,result],{timeout:options.budgetMs+10000,maxBuffer:1024*1024,cwd:process.cwd()});
   results.push({id:module.functions[0].id,source:module.source,name:module.functions[0].name,...JSON.parse(await readFile(result,'utf8'))});
  }catch(e){results.push({status:'unavailable',seed:options.seed,reason:'Fuzz subprocess failed: '+(e.signal??e.message)});}
 }}finally{await rm(temp,{recursive:true,force:true});}return results;
}
