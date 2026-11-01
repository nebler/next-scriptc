import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createDispatcher} from './promotion.mjs';

// Local Node hosts and host packagers share the same artifact contract. Neither
// discovery, code generation nor dispatch depends on Next or a hosting service.
export function loadPromotion(file, options={}) {
  const dir=path.dirname(file), addon=createRequire(import.meta.url)(file);
  const ids=JSON.parse(readFileSync(path.join(dir,'ids.json'),'utf8'));
  const encoding=JSON.parse(readFileSync(path.join(dir,'encodings.json'),'utf8'));
  const index=id=>{const i=ids.indexOf(id);if(i<0)throw Error('Unknown promotion id');return i;};
  return createDispatcher({...options,schemas:encoding.functions,timing:encoding.timing,
    native:(id,input)=>addon.run(index(id),input),
    nativeAsync:(id,input)=>addon.runAsync(index(id),input),
    nativeSample:addon.runShadow ? (id,input)=>addon.runShadow(index(id),input) : undefined});
}
export const promotionArtifacts=['promotion.node','ids.json','encodings.json'];
