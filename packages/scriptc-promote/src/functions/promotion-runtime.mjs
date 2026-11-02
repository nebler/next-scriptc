import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {promotionCrashGuard} from './promotion-crash-guard.mjs';
import {createDispatcher} from './promotion.mjs';

// Local Node hosts and host packagers share the same artifact contract. Neither
// discovery, code generation nor dispatch depends on Next or a hosting service.
export function loadPromotion(file, options={}) {
  const dir=path.dirname(file);
  let guard;
  try{guard=promotionCrashGuard(file,options.crashGuard);if(guard.disabled)throw Error('Previous native process did not exit cleanly; promotion disabled');guard.arm();}
  catch(e){(options.log??console.error)('[next-scriptc] promotion unavailable: '+e.message);return createDispatcher({...options,mode:'js'});}
  const addon=createRequire(import.meta.url)(file);
  const ids=JSON.parse(readFileSync(path.join(dir,'ids.json'),'utf8'));
  const encoding=JSON.parse(readFileSync(path.join(dir,'encodings.json'),'utf8'));
  const index=id=>{const i=ids.indexOf(id);if(i<0)throw Error('Unknown promotion id');return i;};
  const invoke=(method,id,input)=>{
    guard.enter();
    try{
      const result=addon[method](index(id),input);
      if(result?.then)return result.finally(()=>guard.leave());
      guard.leave();return result;
    }catch(e){guard.leave();throw e;}
  };
  return createDispatcher({...options,schemas:encoding.functions,timing:encoding.timing,
    native:(id,input)=>invoke('run',id,input),
    nativeAsync:(id,input)=>invoke('runAsync',id,input),
    cpuNow:addon.runShadow ? addon.threadCpuMs : undefined,
    nativeSample:addon.runShadow ? (id,input)=>invoke('runShadow',id,input) : undefined});
}
export const promotionArtifacts=['promotion.node','ids.json','encodings.json'];
