import {createDispatcher} from 'scriptc-promote/functions/promotion.mjs';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {loadPromotion} from './promotion-runtime.mjs';
const key=Symbol.for('next-scriptc.functions.promotion');
const instances=globalThis[key]??=new Map();
export function promote(file,id,js,args){
 let instance=instances.get(file);
 if(instance)return instance.dispatch(id,js,args);
 const requested=file;
 if(!existsSync(file))file=path.join(process.cwd(),'.next/scriptc-promotion/promotion.node');
 instance=instances.get(file);
 if(!instance){try{
  instance=loadPromotion(file,{onTiming:sample=>globalThis[Symbol.for('next-scriptc.promotion.timing')]?.(sample)});
 }catch(e){console.error('[next-scriptc] promotion unavailable',e.message);instance=createDispatcher({mode:'js'});}instances.set(file,instance);}
 instances.set(requested,instance);
 return instance.dispatch(id,js,args);
}
