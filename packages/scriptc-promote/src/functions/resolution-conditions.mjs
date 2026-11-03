export const nodeRuntimeConditions=['node','module-sync','node-addons'];
// Framework resolver settings do not model custom flags on the Node process.
// Refuse these spellings conservatively, including quoted NODE_OPTIONS values.
export function hasNodeConditionFlags() {
 return process.execArgv.some(arg=>arg==='--conditions'||arg.startsWith('--conditions=')||arg.startsWith('-C'))||/--conditions|(?:^|[\s"'])-C/.test(process.env.NODE_OPTIONS??'');
}
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
