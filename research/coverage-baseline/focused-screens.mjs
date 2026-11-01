import fs from 'node:fs';
import path from 'node:path';
import {base,ts,write} from './common.mjs';
import {extractFunctions} from '../../packages/next-scriptc/src/functions/extract.mjs';
import {checkFunctionTypes} from '../../packages/next-scriptc/src/functions/types.mjs';
import {constructionProof} from '../../packages/next-scriptc/src/functions/construction-proof.mjs';
const targets={papermark:['lib/video-analytics/playback.ts',['documentViewDistribution','watchTimeSeconds','playbackSeconds','countablePlaybackEvents','resolveVideoLength','eventsForView']],dub:['apps/web/lib/analytics/utils/convert-to-csv.ts',['convertToCSV']],umami:['src/lib/data.ts',['flattenJSON','getStoredStringValue','createKeyValue','objectToArray']]};
const result=[];
for(const [app,[rel,names]] of Object.entries(targets)){
 const file=path.join(base,app,rel),text=fs.readFileSync(file,'utf8');
 const cfg=ts.readConfigFile(path.join(base,app+'-'+(app==='umami'?'strict':'actual')+'.json'),ts.sys.readFile).config;
 const opts=ts.parseJsonConfigFileContent(cfg,ts.sys,base).options;
 const program=ts.createProgram([file],opts);
 for(const name of names){const row={app,file:rel,name};try{const m=extractFunctions(text,file,name);row.extraction='pass';for(const fn of m.functions)fn.promotion=true;try{checkFunctionTypes(ts,program,[m]);row.boundary='pass';}catch(e){row.boundary=e.message.replace(base+'/','');}row.construction=constructionProof(m.native,ts);}catch(e){row.extraction=e.message;}result.push(row);}
}
write('focused-screens.json',result);
