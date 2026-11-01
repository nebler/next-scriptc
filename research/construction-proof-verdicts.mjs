// Keep held-out source outside this repository, including generated closures.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {extractFunctions} from '../packages/next-scriptc/src/functions/extract.mjs';
import {constructionProof} from '../packages/next-scriptc/src/functions/construction-proof.mjs';
const rows=[];
for(const [file,name] of [[`${process.env.PAPERMARK_SLICE??'/Users/noah/code/papermark-gate-slice'}/lib/video-analytics/playback.ts`,'documentViewDistribution'],[new URL('../examples/demo/lib/revenue-core.ts',import.meta.url),'revenueCore'],[new URL('../examples/demo/lib/revenue.ts',import.meta.url),'revenue']]){
 const text=await readFile(file,'utf8'),hash=createHash('sha256').update(text).digest('hex');
 if(name==='documentViewDistribution'&&hash!=='9bf4d1fc55df8588be0804d333c2e42e6ade6e4a8404847a2cc380809c60e3e2')throw Error('Papermark hash changed');
 const module=extractFunctions(text,file instanceof URL?fileURLToPath(file):file,name==='revenue'?null:name);
 rows.push({name,sourceHash:hash,...constructionProof(module.native)});
}
await writeFile(new URL('construction-proof-verdicts.json',import.meta.url),JSON.stringify(rows,null,2)+'\n');
console.log(rows);
