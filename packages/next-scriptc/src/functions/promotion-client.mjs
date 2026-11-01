import {existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadPromotion} from './promotion-runtime.mjs';
const key=Symbol.for('next-scriptc.functions.promotion');
const instances=globalThis[key]??=new Map();
export function promote(file,id,js,args){
 if(!existsSync(file))file=path.join(process.cwd(),'.next/scriptc-promotion/promotion.node');
 let instance=instances.get(file);
 if(!instance){try{
  const marker='/tmp/next-scriptc-'+createHash('sha256').update(file).digest('hex').slice(0,20)+'.active';
  if(existsSync(marker))throw Error('Previous native process did not exit cleanly; promotion disabled');
  writeFileSync(marker,String(process.pid));process.once('exit',()=>{try{unlinkSync(marker);}catch{}});
  instance=loadPromotion(file,{onTiming:sample=>globalThis[Symbol.for('next-scriptc.promotion.timing')]?.(sample)});
 }catch(e){console.error('[next-scriptc] promotion unavailable',e.message);instance={dispatch:(_id,js,args)=>js(...args)};}instances.set(file,instance);}
 return instance.dispatch(id,js,args);
}
