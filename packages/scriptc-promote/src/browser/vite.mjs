import path from 'node:path';
import {prepareBrowser,registrySource} from './build.mjs';
import loader from '../functions/loader.mjs';
const virtual='\0scriptc-browser:registry';
export function scriptcBrowser(options={}) {
 let config,prepared,references={};
 return {name:'scriptc-browser',enforce:'pre',apply:'build',
 configResolved(c){config=c;},
 async buildStart(){if(config.build.ssr)return;prepared=await prepareBrowser(config.root,options,path.join(config.root,'.scriptc/browser-vite'));for(const m of prepared.modules){const id=m.functions[0].id;references[id]=this.emitFile({type:'asset',fileName:prepared.entries[id].fileName,source:m.wasm});this.addWatchFile(m.source);for(const d of m.dependencies??[])this.addWatchFile(d.file);}},
 resolveId(id){if(id==='scriptc-browser:registry')return virtual;},
 load(id){if(id!==virtual||!prepared)return;const entries=structuredClone(prepared.entries);let code=registrySource(entries);for(const [id,ref] of Object.entries(references)){code=code.replace(JSON.stringify(entries[id].fileName),`import.meta.ROLLUP_FILE_URL_${ref}`);code=code.replace('"fileName":','"url":');}return code;},
 transform(text,id,opts){if(!prepared||opts?.ssr)return null;const map=Object.fromEntries(prepared.modules.map(m=>[m.source,m]));if(!map[id])return null;return {code:loader.call({resourcePath:id,getOptions:()=>({modules:map,server:true,promotionClient:'scriptc-browser:registry',promotionFile:''}),addDependency:file=>this.addWatchFile(file)},text),map:null};}
 };
}
