import {readFileSync, writeFileSync} from 'node:fs';
const root=import.meta.dirname;
const median=xs=>{const a=xs.toSorted((a,b)=>a-b);return (a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2;};
const rows=[];
function summarize(kind,n,cells){
 const row={kind,n};
 for(const lane of ['node','baseline','patched'])row[lane]=median(cells.map(c=>median(c[lane])));
 row.changePct=(row.patched/row.baseline-1)*100;
 row.windowChanges=cells.map(c=>(median(c.patched)/median(c.baseline)-1)*100);
 rows.push(row);
}
for(const [kind,file] of [['erased-path','erased-path-results.json'],['typed-path','erased-path-typed-results.json']]){
 const result=JSON.parse(readFileSync(root+'/'+file));summarize(kind,result.n,result.windows);
}
const suite=JSON.parse(readFileSync(root+'/erased-results.json'));
for(const c of suite.windows[0].cells){
 if(c.n!==50000&&c.kind!=='csv')continue;
 summarize(c.kind,c.n,suite.windows.map(w=>w.cells.find(y=>y.kind===c.kind&&y.n===c.n)));
}
writeFileSync(root+'/erased-summary.json',JSON.stringify(rows,null,2)+'\n');
console.log(rows.map(r=>`${r.kind} ${r.n}: Node ${r.node.toFixed(4)}, baseline ${r.baseline.toFixed(4)}, patched ${r.patched.toFixed(4)}, ${r.changePct.toFixed(1)}%`).join('\n'));
