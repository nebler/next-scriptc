import path from 'node:path';
import {cp,mkdir,readFile,rm} from 'node:fs/promises';
import {scriptcPromote} from './vite.mjs';
import {promotionArtifacts} from './functions/promotion-runtime.mjs';

/** TanStack Start with Nitro 3's Vite Node builder. Nitro drops arbitrary SSR
 * assets during its final bundle, so publish after that bundle is written. */
export function scriptcTanstack(options={}) {
 let source;
 const promotion=scriptcPromote(options);
 promotion.applyToEnvironment=environment=>environment.name==='ssr';
 return [promotion,{
  name:'scriptc-promote:tanstack-artifacts',apply:'build',
  buildStart(){if(this.environment?.name==='ssr')source=undefined;},
  async writeBundle(output){
   const environment=this.environment;
   if(environment?.config.consumer!=='server')return;
   if(environment.name==='ssr'){
    const directory=path.resolve(environment.config.root,output.dir,'scriptc-promotion');
    source=await readFile(path.join(directory,'ids.json')).then(()=>directory,error=>{if(error.code==='ENOENT')return;throw error;});
   }
   if(environment.name==='nitro'){
    const directory=path.resolve(environment.config.root,output.dir,'scriptc-promotion');
    await rm(directory,{recursive:true,force:true});
    if(!source)return;
    await mkdir(directory,{recursive:true});
    for(const name of promotionArtifacts)await cp(path.join(source,name),path.join(directory,name));
   }
  }
 }];
}
export default scriptcTanstack;
