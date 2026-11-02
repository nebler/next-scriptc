import { readArtifact } from '../lib/artifact.mjs';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const read=name=>JSON.parse(readArtifact(new URL(name,import.meta.url)));
const result={};
for(const kind of ['sync','async']){
 const before=read(kind==='sync'?'sync-before/census.json':'async-before.json'),after=read(kind==='sync'?'sync-after/census.json':'async-after.json');result[kind]={};
 for(const app of Object.keys(before.apps)){
  const b=before.apps[app],a=after.apps[app],key=r=>kind==='sync'?r.file+':'+r.name:r.file+':'+r.function+':'+r.line+':'+r.endLine;
  const bs=kind==='sync'?b.actual.accepted:b.rows.filter(r=>r.accepted),as=kind==='sync'?a.actual.accepted:a.rows.filter(r=>r.accepted);
  result[kind][app]={before:bs.length,after:as.length,newlyAccepted:as.filter(r=>!bs.some(x=>key(x)===key(r))),rejectionsBefore:kind==='sync'?b.actual.counts:b.rejections,rejectionsAfter:kind==='sync'?a.actual.counts:a.rejections};
 }
}
result.getElementSummary=read('async-after.json').apps.formbricks.rows.filter(r=>r.function==='getElementSummary');
result.implementationHashes={};
for(const file of ['dependency-closure','construction-proof','construction-local','promotion-discovery','promotion-signature'])result.implementationHashes[file]=createHash('sha256').update(fs.readFileSync(new URL(`../../packages/scriptc-promote/src/functions/${file}.mjs`,import.meta.url))).digest('hex');
fs.writeFileSync(new URL('comparison.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
