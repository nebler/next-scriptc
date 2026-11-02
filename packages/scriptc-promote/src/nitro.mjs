import {scriptcPromote} from './vite.mjs';

/** Nitro 2 Node server module. Runs before Nitro transpiles server/API sources. */
export function scriptcNitro(options={}) {
 return {name:'scriptc-promote',setup(nitro) {
  if(nitro.options.dev)return;
  if(nitro.options.preset!=='node-server')throw new Error('scriptc-promote/nitro requires the node-server preset');
  nitro.hooks.hook('rollup:before',(_nitro,config)=>{
   const plugin=scriptcPromote({sourceDir:'.',...options});
   plugin.configResolved({root:nitro.options.rootDir,command:'build',build:{ssr:true,outDir:nitro.options.output.serverDir},resolve:{alias:Object.keys(nitro.options.alias??{}).map(find=>({find}))},ssr:{target:'node'}});
   // Nitro's Rollup graph is exclusively server code; unlike Vite it has no ssr flag.
   const transform=plugin.transform;
   plugin.transform=function(code,id){return transform.call(this,code,id,{ssr:true});};
   delete plugin.config;
   delete plugin.configResolved;
   config.plugins.unshift(plugin);
  });
 }};
}
export default scriptcNitro;
