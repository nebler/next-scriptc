import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import path from 'node:path';
import {discoverPromotions} from '../../packages/next-scriptc/src/functions/promotion-discovery.mjs';
import {buildPromotion} from '../../packages/next-scriptc/src/functions/promotion-build.mjs';
const root=path.resolve(import.meta.dirname,'../..'),s=root+'/.checks/auto-promotion';
const logs=[];const report=s=>{logs.push(s);console.log(s);};
const candidates=(await discoverPromotions(root+'/examples/demo',root+'/examples/demo/.next',{},report)).filter(m=>m.source.endsWith('/revenue-core.ts'));
await writeFile(import.meta.dirname+'/raw/discovery.json',JSON.stringify({candidates:candidates.map(m=>m.functions[0]),logs},null,2));
for(const linux of [false,true]){
 const output=s+(linux?'/linux':'/host');
 const accepted=await buildPromotion(candidates,output,{linux,report});
 if(accepted.length!==2)throw Error('Expected core and mismatch');
 await writeFile(import.meta.dirname+'/raw/build-'+(linux?'linux':'host')+'.json',JSON.stringify({ids:accepted.map(m=>m.functions[0]),logs},null,2));
}
await mkdir(s+'/stage',{recursive:true});
for(const [name,file] of Object.entries({core:'examples/demo/lib/revenue-core.ts',events:'examples/demo/app/api/analytics/revenue/events.ts',json:'packages/next-scriptc/src/functions/json.ts',promotion:'packages/next-scriptc/src/functions/promotion.mjs'})){
 const text=(await readFile(root+'/'+file,'utf8')).replace('./json.ts','./json.mjs');
 await writeFile(s+'/stage/'+name+'.mjs',file.endsWith('.ts')?stripTypeScriptTypes(text,{mode:'strip'}):text);
}
