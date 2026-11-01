import {createRequire} from 'node:module';
import {readFileSync,existsSync,writeFileSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createDispatcher} from './promotion.mjs';
const key=Symbol.for('next-scriptc.functions.promotion');
const instances=globalThis[key]??=new Map();
export function promote(file,id,js,args){
 if(!existsSync(file))file=path.join(process.cwd(),'.next/scriptc-promotion/promotion.node');
 let instance=instances.get(file);
 if(!instance){try{
  const marker='/tmp/next-scriptc-'+createHash('sha256').update(file).digest('hex').slice(0,20)+'.active';
  if(existsSync(marker))throw Error('Previous native process did not exit cleanly; promotion disabled');
  writeFileSync(marker,String(process.pid));process.once('exit',()=>{try{unlinkSync(marker);}catch{}});
  const addon=createRequire(import.meta.url)(file), ids=JSON.parse(readFileSync(file.replace(/promotion.node$/,'ids.json'),'utf8'));
  const index=id=>{const i=ids.indexOf(id);if(i<0)throw Error('Unknown promotion id');return i;};
  instance=createDispatcher({native:(id,input)=>addon.run(index(id),input),nativeAsync:(id,input)=>addon.runAsync(index(id),input)});
 }catch(e){console.error('[next-scriptc] promotion unavailable',e.message);instance={dispatch:(_id,js,args)=>js(...args)};}instances.set(file,instance);}
 return instance.dispatch(id,js,args);
}
