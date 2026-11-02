// Run after the K1 census. Retain diagnostics and type metadata, never app source.
import fs from 'node:fs';
const here=new URL('./',import.meta.url);
const census=JSON.parse(fs.readFileSync(new URL('census.json',here)));
const before=JSON.parse(fs.readFileSync(new URL('../nonstrict-apps/census.json',here)));
const comparison={baseline:'research/nonstrict-apps/census.json (K3)',apps:{}};
for(const [app,row] of Object.entries(census.apps)){
 const key=f=>f.file+':'+f.name;
 const old=before.apps[app].actual.accepted,now=row.actual.accepted;
 comparison.apps[app]={before:old.length,after:now.length,added:now.filter(f=>!old.some(p=>key(p)===key(f))),removed:old.filter(f=>!now.some(p=>key(p)===key(f))),specialized:now.filter(f=>f.specialization)};
 if(row.early){
  row.earlyCounts=Object.fromEntries([...new Set(row.early.map(x=>x.category))].map(k=>[k,row.early.filter(x=>x.category===k).length]));
  row.pathBlockers=row.early.filter(x=>/convertToCSV|flattenJSON|getStoredStringValue/.test(x.message));
  delete row.early;
 }
 for(const name of ['actual','strictCounterfactual']){
  const stage=row[name];if(!stage?.logs)continue;
  for(const entry of stage.logs)if(entry.message.includes('call-site specialization:'))entry.category='call-site specialization';
  stage.counts=Object.fromEntries([...new Set(stage.logs.map(x=>x.category))].map(k=>[k,stage.logs.filter(x=>x.category===k).length]));
  stage.specializationRejections=stage.logs.filter(x=>x.category==='call-site specialization');
  delete stage.logs;
 }
}
fs.writeFileSync(new URL('census.json',here),JSON.stringify(census,null,2)+'\n');
fs.writeFileSync(new URL('comparison.json',here),JSON.stringify(comparison,null,2)+'\n');
console.log(JSON.stringify(comparison,null,2));
