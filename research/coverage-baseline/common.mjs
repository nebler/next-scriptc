import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const base=process.env.COVERAGE_APPS??'/Users/noah/code/coverage-apps';
export const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const require=createRequire(path.join(repo,'node_modules','coverage.cjs'));
export const ts=require('typescript');
export const pins={papermark:'ed19717ec02a1ac79aecf5569159aa9d2d869312',dub:'6b463b4bdd9ed2fd9aa416f67b5b77d317b1471e',umami:'559e3c607c23d2c72d9bd4f6481bda428255323c'};
export const roots={papermark:['lib','pages/api'],dub:['apps/web/lib','apps/web/app/api'],umami:['src/lib','src/queries','src/app/api']};
export function load(file,imports={},text=fs.readFileSync(file,'utf8')){
 const js=ts.transpileModule(text,{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const mod={exports:{}};
 const localRequire=s=>{if(Object.hasOwn(imports,s))return imports[s];throw Error(`Unmocked import ${s} in ${file}`);};
 // Compilation happens before profiling; sourceURL keeps upstream file attribution.
 new Function('require','module','exports',js+'\n//# sourceURL='+file)(localRequire,mod,mod.exports);
 return mod.exports;
}
export function declaration(file,name,imports={}){
 const text=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
 const node=ast.statements.find(n=>n.name?.text===name||ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)===name));
 if(!node)throw Error(`Missing ${name}`);
 return load(file,imports,node.getText(ast))[name];
}
export function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.name.startsWith('.')||['node_modules','test','tests','research'].includes(e.name)?[]:e.isDirectory()?files(path.join(dir,e.name)):/\.[cm]?[jt]sx?$/.test(e.name)?[path.join(dir,e.name)]:[]);}
export function write(name,value){fs.writeFileSync(new URL(name,process.env.COVERAGE_OUTPUT?new URL(process.env.COVERAGE_OUTPUT+'/',import.meta.url):import.meta.url),JSON.stringify(value,null,2)+'\n');}
