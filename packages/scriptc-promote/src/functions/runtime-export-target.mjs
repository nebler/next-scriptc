import fs from 'node:fs';
import path from 'node:path';
const fail=message=>{throw Error('dependency closure: '+message);};
function match(map,key){
 if(Object.hasOwn(map,key))return {value:map[key],star:null};
 const keys=Object.keys(map).filter(k=>k.includes('*')&&k.indexOf('*')===k.lastIndexOf('*')).filter(k=>{const [a,b]=k.split('*');return key.startsWith(a)&&key.endsWith(b)&&key.length>=a.length+b.length;}).sort((a,b)=>b.indexOf('*')-a.indexOf('*')||b.length-a.length);
 if(!keys.length)return {value:undefined,star:null};
 const k=keys[0],[a,b]=k.split('*');return {value:map[k],star:key.slice(a.length,key.length-b.length)};
}
function target(value,conditions){
 if(value===undefined||value===null||typeof value==='string')return value;
 if(Array.isArray(value)){for(const child of value){const selected=target(child,conditions);if(selected!==undefined&&selected!==null)return selected;}return null;}
 if(typeof value!=='object')fail('unknown active package export target');
 for(const key of Object.keys(value))if(/^\d+$/.test(key)||key.startsWith('.'))fail('unknown active package export conditions');
 for(const [key,child] of Object.entries(value))if(key==='default'||conditions.has(key)){const selected=target(child,conditions);if(selected!==undefined)return selected;}
}
function packageScope(start){for(let directory=start;;directory=path.dirname(directory)){const file=path.join(directory,'package.json');if(fs.existsSync(file))return {directory,file,json:JSON.parse(fs.readFileSync(file,'utf8'))};if(path.dirname(directory)===directory)return null;}}
function checkFile(directory,selected,resolved,specifier,star,record,context){
 if(typeof selected!=='string'||!selected.startsWith('./'))fail(`unresolved runtime import ${specifier}: selected export has no implementation`);
 const value=star===null?selected:selected.replaceAll('*',star);
 if(value.split('/').slice(1).some(p=>p==='..'||p==='node_modules')||/[%?#]/.test(value)||value.includes('\\'))fail('unknown active package export target');
 const expected=path.resolve(directory,value),variants=[expected];
 if(/\.js$/.test(expected))variants.push(expected.slice(0,-3)+'.ts',expected.slice(0,-3)+'.tsx');
 if(/\.mjs$/.test(expected))variants.push(expected.slice(0,-4)+'.mts');
 if(/\.cjs$/.test(expected))variants.push(expected.slice(0,-4)+'.cts');
 const available=variants.filter(f=>fs.existsSync(f)&&fs.statSync(f).isFile()&&!/\.d\.[cm]?ts$/.test(f));
 if(!available.length)fail(`unresolved runtime import ${specifier}: selected export target differs from resolver fallback`);
 record(path.join(directory,'package.json'));
 const selectedFile=context.sourceExtensions?available.find(f=>/\.[cm]?tsx?$/.test(f))??available[0]:available[0];
 return fs.realpathSync(selectedFile);
}
// TypeScript may try a later active condition when the first target is absent.
// Node selects that first target before checking the filesystem. Never prove the
// later file as a replacement for a missing or unsupported runtime implementation.
// Return the selected implementation, even when TS first selected a types entry.
export function assertRuntimeExportTarget(specifier,importer,resolved,context,record=()=>{},seen=new Set(),resolveOther){
 if(/^(?:node:|next(?:\/|$)|react(?:\/|$))/.test(specifier))fail(`unsupported runtime import ${specifier}`);
 if(specifier.startsWith('.')||path.isAbsolute(specifier))return resolved;
 if(seen.has(specifier))fail('module cycle');seen.add(specifier);
 const conditions=new Set([...context.conditions,context.mode]);
 if(specifier.startsWith('#')){
  const scope=packageScope(path.dirname(importer));if(!scope?.json.imports)return resolved;
  const entry=match(scope.json.imports,specifier),selected=target(entry.value,conditions);record(scope.file);
  if(typeof selected==='string'&&!selected.startsWith('./')){const next=entry.star===null?selected:selected.replaceAll('*',entry.star);if(!resolveOther)fail('unknown package imports target');return resolveOther(next,seen);}
  return checkFile(scope.directory,selected,resolved,specifier,entry.star,record,context);
 }
 const parts=specifier.split('/'),name=specifier.startsWith('@')?parts.slice(0,2).join('/'):parts[0],subpath='.'+specifier.slice(name.length);
 for(let directory=path.dirname(resolved);;directory=path.dirname(directory)){
  const manifest=path.join(directory,'package.json');
  if(fs.existsSync(manifest)){
   const p=JSON.parse(fs.readFileSync(manifest,'utf8'));
   if(p.name===name||directory.endsWith(path.sep+'node_modules'+path.sep+name)){
    if(p.exports!==undefined){
     let entry={value:p.exports,star:null};
     if(p.exports&&typeof p.exports==='object'&&!Array.isArray(p.exports)){
      const keys=Object.keys(p.exports),paths=keys.some(k=>k.startsWith('.'));
      if(paths&&keys.some(k=>!k.startsWith('.')))fail('unknown active package export conditions');
      if(paths)entry=match(p.exports,subpath);else if(subpath!=='.')entry.value=undefined;
     }else if(subpath!=='.')entry.value=undefined;
     return checkFile(directory,target(entry.value,conditions),resolved,specifier,entry.star,record,context);
    }
    return resolved;
   }
  }
  if(path.dirname(directory)===directory)return resolved;
 }
}
