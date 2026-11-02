// Build unchanged discovery-accepted benchmark cases only. All outputs stay in /tmp.
import fs from 'node:fs';
import path from 'node:path';
import {discoverPromotions} from '../../packages/scriptc-promote/src/functions/promotion-discovery.mjs';
import {buildPromotion} from '../../packages/scriptc-promote/src/functions/promotion-build.mjs';
const [root,scope,out,reportFile]=process.argv.slice(2), logs=[];
const modules=await discoverPromotions(root,path.join(root,'dist'),{promotionSourceDir:scope},s=>logs.push(s.replaceAll(root,'<app>')));
const wanted=new Set(['isApiKeyBlockedPath','hex6','stringToColor']);
const selected=modules.filter(m=>wanted.has(m.functions[0].name));
let accepted=[],error=null;
try{accepted=await buildPromotion(selected,out,{timing:true,report:s=>logs.push(s.replaceAll(root,'<app>'))});}catch(e){error=e.message;}
fs.writeFileSync(reportFile,JSON.stringify({selected:selected.map(m=>m.functions[0].name),compiled:accepted.map(m=>({name:m.functions[0].name,id:m.functions[0].id})),logs,error},null,2));
