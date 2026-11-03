import fs from 'node:fs';
import {gzipSync} from 'node:zlib';
import {readJsonArtifact} from '../../lib/artifact.mjs';
const dir=new URL('./',import.meta.url),before=readJsonArtifact(new URL('../dev-census-b1/summary.json',import.meta.url));
const lost=readJsonArtifact(new URL('../dev-census-b1/comparison.json',import.meta.url)).lostCoveredAcceptances;
const after=readJsonArtifact(new URL('summary.json',dir));
const key=f=>f.repository+'#'+f.id,current=new Map(after.functions.map(f=>[key(f),f])),prior=new Map(before.functions.map(f=>[key(f),f]));
function category(f){return f.after[0].split(' Hint:')[0].split(': ').at(-1);}
const installed=new Set(after.repos.filter(r=>r.installExit===0).map(r=>r.repository));
const rows=lost.map(f=>{const now=installed.has(f.repository)?current.get(key(f)):null;return {...f,category:category(f),status:!now?'unknown':now.status==='accepted'?'restored':'kept refused',currentDiagnostics:now?.diagnostics??['not covered']};});
const categories={};for(const f of rows){const c=categories[f.category]??={total:0,restored:0,'kept refused':0,unknown:0};c.total++;c[f.status]++;}
const newlyObserved=after.functions.filter(f=>installed.has(f.repository)&&f.status==='accepted'&&prior.get(key(f))?.status!=='accepted'&&!lost.some(l=>key(l)===key(f))).map(f=>({repository:f.repository,id:f.id,url:f.url,previous:prior.get(key(f))?.diagnostics??['not previously covered']}));
const newlyAccepted=newlyObserved.filter(f=>prior.has(key(f))),newlyCoveredAcceptances=newlyObserved.filter(f=>!prior.has(key(f)));
const newCoveredRefusals=before.functions.filter(f=>f.status==='accepted'&&installed.has(f.repository)&&current.has(key(f))&&current.get(key(f)).status!=='accepted').map(f=>({repository:f.repository,id:f.id,diagnostics:current.get(key(f)).diagnostics}));
const repositories=after.repos.map(r=>({repository:r.repository,status:r.status,before:before.repos.find(b=>b.repository===r.repository)?.counts??null,after:r.installExit===0?r.counts:null,uncovered:r.remainingPartitionOmissions?.length??null}));
const result={repositories,baseline:'B1',lostTotal:lost.length,restored:rows.filter(f=>f.status==='restored').length,keptRefused:rows.filter(f=>f.status==='kept refused').length,unknown:rows.filter(f=>f.status==='unknown').length,newlyAccepted,newlyCoveredAcceptances,newCoveredRefusals,categories,rows,note:'Covered refusals are observed discovery outcomes, not proof of unsoundness. Unknown includes failed installs/scans and missing files. Static eligibility is not compiler support or speed.'};
const bytes=Buffer.from(JSON.stringify(result,null,2)+'\n');if(bytes.length>256*1024){fs.writeFileSync(new URL('comparison.json.gz',dir),gzipSync(bytes,{level:9}));fs.rmSync(new URL('comparison.json',dir),{force:true});}else{fs.writeFileSync(new URL('comparison.json',dir),bytes);fs.rmSync(new URL('comparison.json.gz',dir),{force:true});}console.log(JSON.stringify({restored:result.restored,keptRefused:result.keptRefused,unknown:result.unknown,newlyAccepted:newlyAccepted.length,newlyCoveredAcceptances:newlyCoveredAcceptances.length,newCoveredRefusals:newCoveredRefusals.length,categories},null,2));
