export const nodeRuntimeConditions=['node','module-sync','node-addons'];
// These are possible build contexts, not an ordered list of fallback conditions.
// A closure must select the same implementation in every possible context.
export function viteRuntimeConditionSets(config) {
 const phase=config.isProduction===false?'development':'production';
 const expand=values=>values.map(c=>c==='development|production'?phase:c).filter(c=>!['import','require','default'].includes(c));
 const bundled={mode:'import',bundled:true,conditions:expand(config.ssr?.resolve?.conditions??config.resolve?.conditions??['module','node','development|production'])};
 const external={mode:'import',conditions:expand(config.ssr?.resolve?.externalConditions??nodeRuntimeConditions)};
 if(config.ssr?.noExternal===true)return [bundled];
 if(config.ssr?.external===true)return [external];
 return [external,bundled];
}
export function nextRuntimeConditionSets(phase='production') {
 const sets=[];
 // External CommonJS/ESM, bundled modules, and React Server Components may
 // reach the same source function. Discovery runs before those layers resolve.
 for(const mode of ['import','require']){
  sets.push({mode,conditions:nodeRuntimeConditions});
  for(const bundler of [[],['webpack']])for(const layer of [[],['react-server']])sets.push({mode,bundled:true,sourceExtensions:true,conditions:['node','module',phase,...bundler,...layer]});
 }
 return sets;
}
