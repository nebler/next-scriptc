import fs from 'node:fs';
const read=name=>JSON.parse(fs.readFileSync(new URL(name,import.meta.url)));
const result={};
for(const kind of ['sync','async']){
 const before=read(kind+'-before.json'),after=read(kind+'-after.json');result[kind]={};
 for(const app of Object.keys(before.apps)){
  const b=before.apps[app],a=after.apps[app];
  const key=r=>kind==='sync'?r.file+':'+r.name:r.file+':'+r.function+':'+r.line+':'+r.endLine;
  const bs=kind==='sync'?b.actual.accepted:b.rows.filter(r=>r.accepted),as=kind==='sync'?a.actual.accepted:a.rows.filter(r=>r.accepted);
  result[kind][app]={before:bs.length,after:as.length,newlyAccepted:as.filter(r=>!bs.some(x=>key(x)===key(r))),rejectionsBefore:kind==='sync'?b.actual.counts:b.rejections,rejectionsAfter:kind==='sync'?a.actual.counts:a.rejections};
 }
}
fs.writeFileSync(new URL('comparison.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
