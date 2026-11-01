import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
const before=read('./coverage-baseline/summary.json');
const after=read('./optional-boundaries/profiles.json');
const rows=after.results.map(task=>{
 const values=task.rounds.map(r=>Object.entries(r.profile.shares).filter(([k])=>k.startsWith('a:')).reduce((sum,[,v])=>sum+v,0));
 return {name:task.name,before:before.find(x=>x.name===task.name).split.a,after:{mean:values.reduce((a,b)=>a+b,0)/values.length,min:Math.min(...values),max:Math.max(...values)}};
});
fs.writeFileSync(new URL('./optional-boundaries/shares.json',import.meta.url),JSON.stringify(rows,null,2)+'\n');
console.log('| K1 fixture | Before category a | After category a (range) |\n| --- | ---: | ---: |');
for(const r of rows)console.log(`| ${r.name} | ${r.before.mean.toFixed(1)}% | ${r.after.mean.toFixed(1)}% (${r.after.min.toFixed(1)}–${r.after.max.toFixed(1)}%) |`);
