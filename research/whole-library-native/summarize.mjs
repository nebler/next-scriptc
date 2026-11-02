// Retain diagnostics and measurements, never generated third-party source lines.
import fs from 'node:fs';
const here=new URL('./',import.meta.url);
const files=fs.readdirSync(here).filter(f=>f.endsWith('.json')&&f!=='deps-lock.json'&&f!=='summary.json');
for(const file of files){
 const r=JSON.parse(fs.readFileSync(new URL(file,here)));
 for(const a of r.attempts??[]){a.classification=a.exit===0?'compiled; runtime verification required':a.firstCode==='SC0001'?'bundler-fixable via nocheck banner or syntax/UMD adjustment':'scriptc-gap';a.diagnostic=a.diagnostic.split('\n').filter(l=>/SC\d{4}|^\d+ errors?\.|functions.lib.a$/.test(l)).join('\n');}
 if(r.parity?.errors.length)r.failureClassification=r.library==='escape-html'?'bundler-fixable via require entry':'scriptc-gap';
 for(const key of ['forcedDispatcher','shadowDispatcher'])for(const f of Object.values(r[key]??{}))for(const b of f.buckets)for(const k of Object.keys(b))if(!['bucket','state','verified','nativeAttempts','nativeFallbacks'].includes(k))delete b[k];
 const text=JSON.stringify(r,null,2).replaceAll(/\/private\/tmp\/whole-library-native\.[^/\s"\\]+/g,'<TEMP>');fs.writeFileSync(new URL(file,here),text+'\n');
}
const runs=files.filter(f=>f.endsWith('results.json')).map(f=>({file:f,...JSON.parse(fs.readFileSync(new URL(f,here)))}));
const checks=files.filter(f=>f.startsWith('check-')).map(file=>({file,...JSON.parse(fs.readFileSync(new URL(file,here)))}));
const summary={schema:1,compiler:runs[0].compiler,buildAttempts:runs.reduce((n,r)=>n+r.attempts.length,0),checks:checks.map(r=>({file:r.file,library:r.library,variant:r.variant,parity:r.parity,emptyInput:r.emptyInput,timings:r.timings.map(({pairs,...t})=>t)}))};
fs.writeFileSync(new URL('summary.json',here),JSON.stringify(summary,null,2)+'\n');
