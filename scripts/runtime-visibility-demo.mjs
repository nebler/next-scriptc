// Local fixture: no deployment or external requests.
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {stripTypeScriptTypes} from 'node:module';
import {createRequire} from 'node:module';
import {discoverPromotions} from '../packages/scriptc-promote/src/functions/promotion-discovery.mjs';
import {buildPromotion} from '../packages/scriptc-promote/src/functions/promotion-build.mjs';
import {loadPromotion} from '../packages/scriptc-promote/src/functions/promotion-runtime.mjs';
import {writeRuntimeSnapshot} from '../packages/scriptc-promote/src/runtime-snapshot.mjs';
import {coverageReport,formatReport} from '../packages/scriptc-promote/src/report.mjs';
const root=await mkdtemp('/tmp/scriptc-runtime-demo-');
const source=`export function numeric(n:number):number {
 const a=new Int32Array(1024);for(let j=0;j<1024;j++)a[j]=(j*17+13)|0;
 let total=0;for(let i=0;i<n;i++){for(let j=0;j<1024;j++){const x=a[j];a[j]=(Math.imul(x,1664525)+1013904223)|0;total=(total+(a[j]>>>16))|0;}}return total;
}`;
await writeFile(root+'/compute.ts',source);await writeFile(root+'/tsconfig.json','{"compilerOptions":{"strict":true,"target":"ESNext"}}');
const require=createRequire(new URL('../packages/scriptc-promote/package.json',import.meta.url)),ts=require('typescript');
process.chdir(root);
const modules=await discoverPromotions(root,root+'/dist',{typescript:{implementation:ts}},console.log);
const built=await buildPromotion(modules,root+'/dist');if(!built.length)throw Error('No fixture compiled');
const d=loadPromotion(root+'/dist/promotion.node');
const js=(await import('data:text/javascript,'+encodeURIComponent(stripTypeScriptTypes(source)))).numeric,id=built[0].functions[0].id;
const expected=js(1000);
const server=createServer((_req,res)=>{const value=d.dispatch(id,js,[1000]);if(value!==expected)throw Error('wrong result');res.end(String(value));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{for(let i=0;i<1200;i++){await (await fetch(`http://127.0.0.1:${server.address().port}`)).text();}}
finally{await new Promise(r=>server.close(r));}
while(d.pending)await new Promise(r=>setImmediate(r));
writeRuntimeSnapshot(root+'/snapshot.json');
const report=await coverageReport(root,{runtime:root+'/snapshot.json'});await writeFile(root+'/report.json',JSON.stringify(report,null,2));
console.log(formatReport(report));console.log('Artifacts: '+root);
