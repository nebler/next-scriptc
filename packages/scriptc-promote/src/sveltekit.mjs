import {cp,mkdir,rm,stat} from 'node:fs/promises';
import path from 'node:path';
import {promotionArtifacts} from './functions/promotion-runtime.mjs';
/** Compose adapter-node: it rebundles JS and does not copy arbitrary SSR assets. */
export function scriptcAdapter(adapter,{out='build'}={}) {
 return {...adapter,async adapt(builder) {
  await adapter.adapt(builder);
  const source=path.join(builder.getServerDirectory(),'scriptc-promotion');
  const destination=path.resolve(out,'server/scriptc-promotion');
  await rm(destination,{recursive:true,force:true});
  const present=await stat(path.join(source,'promotion.node')).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;});
  if(!present)return;
  await mkdir(destination,{recursive:true});
  for(const name of promotionArtifacts)await cp(path.join(source,name),path.join(destination,name));
 }};
}
