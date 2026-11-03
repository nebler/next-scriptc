import fs from 'node:fs';
import {readJsonArtifact} from '../../lib/artifact.mjs';
const dir=new URL('./',import.meta.url),before=readJsonArtifact(new URL('../dev-census-b1/summary.json',import.meta.url));
const lost=readJsonArtifact(new URL('../dev-census-b1/comparison.json',import.meta.url)).lostCoveredAcceptances;
const after=readJsonArtifact(new URL('summary.json',dir));
const key=f=>f.repository+'#'+f.id,current=new Map(after.functions.map(f=>[key(f),f])),prior=new Map(before.functions.map(f=>[key(f),f]));
function category(f){return f.after[0].split(' Hint:')[0].split(': ').at(-1);}
const rows=lost.map(f=>{const now=current.get(key(f));return {...f,category:category(f),status:!now?'unknown':now.status==='accepted'?'restored':'kept refused',currentDiagnostics:now?.diagnostics??['not covered']};});
const categories={};for(const f of rows){const c=categories[f.category]??={total:0,restored:0,'kept refused':0,unknown:0};c.total++;c[f.status]++;}
const newlyAccepted=after.functions.filter(f=>f.status==='accepted'&&prior.get(key(f))?.status!=='accepted'&&!lost.some(l=>key(l)===key(f))).map(f=>({repository:f.repository,id:f.id,previous:prior.get(key(f))?.diagnostics??['not previously covered']}));
const result={baseline:'B1',lostTotal:lost.length,restored:rows.filter(f=>f.status==='restored').length,keptRefused:rows.filter(f=>f.status==='kept refused').length,unknown:rows.filter(f=>f.status==='unknown').length,newlyAccepted,categories,rows,note:'Covered refusals are observed discovery outcomes, not proof of unsoundness. Unknown includes failed installs/scans and missing files. Static eligibility is not compiler support or speed.'};
fs.writeFileSync(new URL('comparison.json',dir),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({restored:result.restored,keptRefused:result.keptRefused,unknown:result.unknown,newlyAccepted:newlyAccepted.length,categories},null,2));
