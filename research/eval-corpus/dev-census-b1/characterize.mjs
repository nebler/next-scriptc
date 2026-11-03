import fs from 'node:fs';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {readJsonArtifact} from '../../lib/artifact.mjs';
const base=new URL('../dev-census/',import.meta.url), counts=new Map(), examples=new Map();
function visit(x){if(typeof x==='string'){if(!/not a candidate|parse failure/.test(x))return;for(const line of x.split('\n')){const m=line.match(/(?:unproved module initialization|unsupported module initialization|unsupported package export condition|strict closure: TS\d+|purity: argument mutation|requires enabling one of the following parser plugin)[^\n]*/);if(m){const k=m[0].replace(/ at line \d+/g,'');counts.set(k,(counts.get(k)??0)+1);if(!examples.has(k))examples.set(k,line);}}}else if(Array.isArray(x))x.forEach(visit);else if(x&&typeof x==='object')Object.values(x).forEach(visit);}
for(const f of fs.readdirSync(base).filter(f=>/\.json(?:\.gz)?$/.test(f)&&!['index.json','summary.json','versions.json','cleanup.json','tool-lock.json','bun-tool-lock.json'].includes(f))){const d=readJsonArtifact(new URL(f,base));if(d.split==='DEV')visit(d);}
const rows=[...counts].sort((a,b)=>b[1]-a[1]).map(([diagnostic,occurrences])=>({diagnostic,occurrences,example:examples.get(diagnostic)}));
fs.writeFileSync(new URL('diagnostic-patterns.json',import.meta.url),JSON.stringify({note:'Raw diagnostic occurrences including repeated scope/EV1/EV2 records; not unique-function histogram. Canonical unique counts remain EV3 summary.',rows},null,2)+'\n');
console.log(rows.slice(0,20));
const summary=readJsonArtifact(new URL('summary.json',base));
const patterns=new Map();
for(const row of summary.functions){if(row.classification!=='real'||!row.diagnostics?.length||!/module initialization|package exports|declaration|strict closure|mutation|parser/.test(row.category))continue;let diagnostic=row.diagnostics[0].replace(/^.*?(?:dependency closure: |strict closure: |purity: )/,'');diagnostic=diagnostic.replace(/^.*?: (unproved module initialization|unsupported package export condition|unsupported module initialization)/,'$1').replace(/ at line \d+/g,'');const key=row.category+' | '+diagnostic;const current=patterns.get(key)??{category:row.category,diagnostic,count:0,examples:[]};current.count++;if(current.examples.length<3)current.examples.push({name:row.name,url:row.url});patterns.set(key,current);}
fs.writeFileSync(new URL('baseline.json',import.meta.url),JSON.stringify({repos:summary.repos.map(r=>({repository:r.repository,counts:r.counts})),histogram:summary.histogram,patterns:[...patterns.values()].sort((a,b)=>b.count-a.count)},null,2)+'\n');

for(const file of ['baseline.json','diagnostic-patterns.json']){const target=new URL(file,import.meta.url),bytes=fs.readFileSync(target);if(bytes.length>256*1024){fs.writeFileSync(new URL(file+'.gz',import.meta.url),gzipSync(bytes,{level:9,mtime:0}));fs.unlinkSync(target);}}
