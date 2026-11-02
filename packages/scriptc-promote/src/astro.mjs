import {fileURLToPath} from 'node:url';
import {scriptcPromote} from './vite.mjs';

/** Astro 5 SSR with @astrojs/node. Inline .astro bodies are not discovered. */
export function scriptcAstro(options={}) {
 let config;
 return {name:'scriptc-promote/astro',hooks:{
  'astro:config:done':({config:resolved})=>{config=resolved;},
  'astro:build:setup':({target,updateConfig})=>{
   if(target!=='server'||config.output!=='server')return;
   if(config.adapter?.name!=='@astrojs/node')throw Error('scriptc-promote/astro requires @astrojs/node');
   updateConfig({plugins:[scriptcPromote({sourceDir:fileURLToPath(config.srcDir),...options})]});
  }
 }};
}
export default scriptcAstro;
