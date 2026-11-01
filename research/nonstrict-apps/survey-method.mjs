// Inspect already-unpacked published packages; never execute package code.
// Usage: node survey-method.mjs /temporary/package/parent > init-samples.json
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),ts=require(require.resolve('typescript',{paths:[process.cwd()]}));
const root=process.argv[2],rows=[];
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):/\.(mjs|js|cjs)$/.test(e.name)?[path.join(dir,e.name)]:[]);}
for(const folder of fs.readdirSync(root)){const dir=path.join(root,folder,'package');if(!fs.existsSync(dir))continue;const p=JSON.parse(fs.readFileSync(dir+'/package.json'));
 const candidates=files(dir).filter(f=>!/min\.|pack\.|\/test|__tests__|\/bin\/|\/script|\/umd\/|eslintrc|\/deps\.js/.test(f));
 // Prefer ESM files, then representative implementation modules rather than barrels.
 const selected=candidates.filter(f=>f.endsWith('.mjs')||fs.readFileSync(f,'utf8').match(/(^|\n)(import |export )/)).slice(0,12);
 for(const f of (selected.length?selected:candidates.slice(0,4))){const text=fs.readFileSync(f,'utf8'),src=ts.createSourceFile(f,text,99,true,ts.ScriptKind.JS);const init=[];
 for(const n of src.statements){if(ts.isVariableStatement(n))for(const d of n.declarationList.declarations)init.push({binding:d.name.getText(src),constant:!!(n.declarationList.flags&ts.NodeFlags.Const),initializer:d.initializer?ts.SyntaxKind[d.initializer.kind]:'none'});else if(!ts.isFunctionDeclaration(n)&&!ts.isImportDeclaration(n)&&!ts.isExportDeclaration(n))init.push({statement:ts.SyntaxKind[n.kind]});}
 rows.push({package:p.name,version:p.version,file:path.relative(dir,f),sha256:createHash('sha256').update(text).digest('hex'),initialization:init});
 }
}console.log(JSON.stringify(rows,null,2));
