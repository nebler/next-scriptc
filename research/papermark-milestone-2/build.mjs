import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {withScriptc} from '../../packages/next-scriptc/src/index.mjs';
import {discoverPromotions} from '../../packages/next-scriptc/src/functions/promotion-discovery.mjs';
import {buildPromotion} from '../../packages/next-scriptc/src/functions/promotion-build.mjs';
import loader from '../../packages/next-scriptc/src/functions/loader.mjs';
import {createRequire} from 'node:module';
const project='/Users/noah/code/papermark-gate-slice', source=project+'/lib/video-analytics/playback.ts',output=project+'/.pm2';
const text=await readFile(source,'utf8');assert.equal(createHash('sha256').update(text).digest('hex'),'9bf4d1fc55df8588be0804d333c2e42e6ade6e4a8404847a2cc380809c60e3e2');
const reports=[],modules=await discoverPromotions(project,project+'/.next',withScriptc({},{nativePromotion:'auto'}),s=>reports.push(s));
assert(modules.some(m=>m.functions[0].name==='documentViewDistribution'));
let accepted;
await mkdir(output,{recursive:true});
for(const timing of [false,true]){const a=await buildPromotion(modules,output+(timing?'/timing':'/normal'),{target:'linux-arm64-gnu',timing,report:s=>reports.push(s)});assert(a.some(m=>m.functions[0].name==='documentViewDistribution'));if(!timing)accepted=a;}
const transformed=loader.call({resourcePath:source,getOptions:()=>({modules:{[source]:{...accepted[0],functions:accepted.flatMap(m=>m.functions).sort((a,b)=>a.start-b.start)}},server:true,promotionFile:output+'/normal/promotion.node',promotionClient:new URL('../../packages/next-scriptc/src/functions/promotion-client.mjs',import.meta.url).pathname})},text);
const ts=createRequire(import.meta.url)('../../packages/next-scriptc/node_modules/typescript');
await writeFile(output+'/wrapped.mjs',ts.transpileModule(transformed,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
await writeFile(new URL('./build.json',import.meta.url),JSON.stringify({reports,sourceSha256:createHash('sha256').update(text).digest('hex'),construction:JSON.parse(await readFile(output+'/normal/construction-report.json','utf8'))},null,2));
