import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {discoverPromotions} from './functions/promotion-discovery.mjs';
import {buildPromotion} from './functions/promotion-build.mjs';
import {fuzzBuiltPromotions} from './functions/promotion-fuzz-build.mjs';
import {fuzzOptions,fuzzMessage} from './functions/promotion-fuzz.mjs';
const require=createRequire(import.meta.url);
export async function fuzzCommand(args=process.argv.slice(3)){
 let directory='.',seen=false,json;const options={};
 for(let i=0;i<args.length;i++){const a=args[i];if(['--seed','--budget-ms','--max-cases','--json'].includes(a)){if(args[i+1]===undefined)throw Error('Missing '+a);const v=args[++i];if(a==='--json')json=v;else options[{'--seed':'seed','--budget-ms':'budgetMs','--max-cases':'maxCases'}[a]]=Number(v);}else if(a.startsWith('-')||seen)throw Error('Unexpected argument '+a);else {directory=a;seen=true;}}
 const settings=fuzzOptions(options),root=path.resolve(directory),temp=await mkdtemp('/tmp/scriptc-fuzz-cli-');
 const start=performance.now();
 try{
  const ts=require('typescript');
  const modules=await discoverPromotions(root,path.join(root,'dist'),{reportOnly:true,typescript:{implementation:ts}},console.log);
  const discoveryMs=performance.now()-start,buildStart=performance.now();
  const built=await buildPromotion(modules,temp);
  const buildMs=performance.now()-buildStart,fuzzStart=performance.now();
  const results=await fuzzBuiltPromotions(built,temp,settings);
  const fuzzMs=performance.now()-fuzzStart;
  const rows=modules.map(m=>{const i=built.indexOf(m);return {source:m.source,name:m.functions[0].name,forced:!!m.forced,...(i<0?{status:'compile-rejected'}:results[i])};});
  for(const [i,m] of built.entries())if(results[i].status!=='passed')console.log(fuzzMessage(m,results[i]));
  const report={settings,discoveryMs,buildMs,fuzzMs,discovered:modules.length,compiled:built.length,elapsedMs:performance.now()-start,results:rows};
  console.log(JSON.stringify(report,null,2));if(json)await writeFile(json,JSON.stringify(report,null,2)+'\n');
  if(rows.some(r=>r.status!=='passed'))process.exitCode=1;
  return report;
 }finally{await rm(temp,{recursive:true,force:true});}
}
