import path from 'node:path';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {prepareBrowser,registrySource,runtimePath} from './build.mjs';
// Await in next.config.mjs. The existing server adapter still owns native builds.
export async function withBrowserWasm(config={},options={}) {
 const root=path.resolve(options.root??process.cwd()),output=path.join(root,'.scriptc/browser');
 const {modules,entries}=await prepareBrowser(root,options,output);
 for(const m of modules){const e=entries[m.functions[0].id];const file=path.join(root,'public',e.fileName);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,m.wasm);e.url=`${config.basePath??''}/${e.fileName}`;}
 const registry=path.join(output,'registry.mjs');await writeFile(registry,registrySource(entries).replace(JSON.stringify(runtimePath),JSON.stringify('./'+path.relative(output,runtimePath).split(path.sep).join('/'))));
 const map=Object.fromEntries(modules.map(m=>[m.source,m]));
 const loader=fileURLToPath(new URL('./next-loader.mjs',import.meta.url));
 // Loader options must remain JSON serializable for Turbopack.
 for(const m of Object.values(map))delete m.wasm;
 const settings={modules:JSON.parse(JSON.stringify(map)),server:true,promotionClient:registry,promotionFile:''};
 const rules={...config.turbopack?.rules};
 const require=createRequire(path.join(root,'package.json'));
 const bundleRoot=config.turbopack?.root??require('next/dist/lib/find-root.js').findRootDirAndLockFiles(root).rootDir;
 const files={any:Object.keys(map).map(source=>({path:new RegExp('^'+path.relative(bundleRoot,source).split(path.sep).join('/').replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')}))};
 const existing=rules['*'];
 rules['*']=[...(existing?(Array.isArray(existing)?existing:[existing]):[]),{condition:{all:[files,'browser']},loaders:[{loader,options:settings}]}];
 const original=config.webpack;
 return {...config,turbopack:{...config.turbopack,rules},webpack(webpackConfig,context){const result=original?.(webpackConfig,context)??webpackConfig;if(!context.isServer)result.module.rules.push({test:file=>!!map[file],enforce:'pre',use:[{loader,options:settings}]});return result;}};
}
