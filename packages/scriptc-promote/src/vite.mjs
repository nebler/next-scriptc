import {viteRuntimeConditionSets} from './functions/resolution-conditions.mjs';
import path from 'node:path';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {discoverPromotions} from './functions/promotion-discovery.mjs';
import {buildPromotion} from './functions/promotion-build.mjs';
import loader from './functions/loader.mjs';
import {promotionArtifacts} from './functions/promotion-runtime.mjs';

const internalAliases=[/^\/?@vite\/env/,/^\/?@vite\/client/].map(String);
const virtual = '\0scriptc-promote:runtime';
/** Production Node SSR only. Dev and client transforms always return null. */
function promotionPlugin({sourceDir='src', tsconfig='tsconfig.json', build={}, report=console.log}={}) {
 let config, modules=[], references, active=false;
 const server = context => active && context.environment?.config?.consumer !== 'client';
 return {
  name:'scriptc-promote', enforce:'pre', apply:'build',
  config() {return {build:{ssrEmitAssets:true}};},
  configResolved(resolved) {config=resolved;active=resolved.command==='build' && (!!resolved.build.ssr || resolved.consumer==='server') && resolved.ssr?.target!=='webworker';},
  async buildStart() {
   modules=[]; references=undefined;
   if(!server(this))return;
   const candidates=await discoverPromotions(config.root,path.resolve(config.root,config.build.outDir),{promotionRuntimeConditionSets:viteRuntimeConditionSets(config),typescript:{tsconfigPath:tsconfig},promotionSourceDir:sourceDir,webpack:config.resolve.alias.some(alias=>!internalAliases.includes(String(alias.find)))},report);
   const temporary=await mkdtemp(path.join(os.tmpdir(),'scriptc-vite-'));
   try {
    modules=await buildPromotion(candidates,temporary,{...build,report});
    report(`[scriptc-promote] census: ${candidates.length} eligible, ${modules.length} compiled`);
    for(const name of ['build-results.json','fuzz-results.json']){try{this.emitFile({type:'asset',fileName:`scriptc-promotion/${name}`,source:await readFile(path.join(temporary,name))});}catch(error){if(error.code!=='ENOENT')throw error;}}
    if(!modules.length)return;
    references={};
    for(const name of promotionArtifacts)references[name]=this.emitFile({type:'asset',fileName:`scriptc-promotion/${name}`,source:await readFile(path.join(temporary,name))});
    for(const module of modules){this.addWatchFile(module.source);for(const dependency of module.dependencies??[])this.addWatchFile(dependency.file);}
   } finally {await rm(temporary,{recursive:true,force:true});}
  },
  resolveId(id) {if(id==='scriptc-promote:runtime'&&server(this)&&references)return virtual;},
  load(id) {
   if(id!==virtual||!server(this)||!references)return;
   return `import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {createDispatcher} from ${JSON.stringify(fileURLToPath(new URL('./functions/promotion.mjs',import.meta.url)))};
import {loadPromotion} from ${JSON.stringify(fileURLToPath(new URL('./functions/promotion-runtime.mjs',import.meta.url)))};
let file=fileURLToPath(import.meta.ROLLUP_FILE_URL_${references['promotion.node']});
const complete=file=>['promotion.node','ids.json','encodings.json'].every(name=>existsSync(path.join(path.dirname(file),name)));
if(!complete(file)){let directory=path.dirname(fileURLToPath(import.meta.url));for(let i=0;i<8;i++){const candidate=path.join(directory,'scriptc-promotion/promotion.node');if(complete(candidate)){file=candidate;break;}const parent=path.dirname(directory);if(parent===directory)break;directory=parent;}}
let dispatcher;
export function promote(_file,id,js,args){
 if(process.env.SCRIPTC_PROMOTE==='0')return js(...args);
 if(!dispatcher){try{dispatcher=loadPromotion(file);(globalThis[Symbol.for('scriptc-promote.dispatchers')]??=new Map()).set(file,dispatcher);}catch(error){console.error('[scriptc-promote] promotion unavailable',error.message);dispatcher=createDispatcher({mode:'js'});}}
 return dispatcher.dispatch(id,js,args);
}`;
  },
  resolveFileUrl({referenceId,relativePath}) {
   if(references&&Object.values(references).includes(referenceId))return `new URL(${JSON.stringify(relativePath)},import.meta.url).href`;
  },
  transform(text,id,options) {
   if(!server(this)||(options?.ssr!==true&&this.environment?.config?.consumer!=='server')||id.includes('?'))return null;
   const matches=modules.filter(module=>module.source===id);
   if(!matches.length)return null;
   const code=loader.call({resourcePath:id,getOptions:()=>({modules:Object.fromEntries([...Map.groupBy(modules,m=>m.source)].map(([source,group])=>[source,{...group[0],functions:group.flatMap(m=>m.functions).sort((a,b)=>a.start-b.start)}])),server:true,promotionClient:'scriptc-promote:runtime',promotionFile:''}),addDependency:file=>this.addWatchFile(file)},text);
   return {code,map:null};
  }
 };
}
/** Each builder environment owns its compilation and Rollup asset references. */
export function scriptcPromote(options={}) {
 const classic=promotionPlugin(options), environments=new WeakMap();
 let resolved;
 const instance=context=>{
  if(!context.environment)return classic;
  let plugin=environments.get(context.environment);
  if(!plugin){
   plugin=promotionPlugin(options);
   const environment=context.environment.config;
   plugin.configResolved({...resolved,...environment,root:resolved.root,command:resolved.command,
    resolve:environment.resolve??resolved.resolve,build:environment.build??resolved.build,
    ssr:environment.ssr??resolved.ssr});
   environments.set(context.environment,plugin);
  }
  return plugin;
 };
 const result={...classic,configEnvironment(_name,config){if(config.consumer==='server')return {build:{emitAssets:true}};},configResolved(config){resolved=config;classic.configResolved(config);}};
 for(const hook of ['buildStart','resolveId','load','resolveFileUrl','transform'])
  result[hook]=function(...args){return instance(this)[hook].apply(this,args);};
 return result;
}
export default scriptcPromote;
