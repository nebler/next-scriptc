import {performance} from 'node:perf_hooks';
import {readFileSync,writeFileSync} from 'node:fs';
const raw=JSON.parse(readFileSync('results/measurement.json'));
const urls=['/trivial?lane=worker','/trivial','/trivial?fail=1','/binding?lane=worker','/binding','/state'];
raw.checks.forEach((c,i)=>c.requestUrl=urls[i]);
raw.extra={};
for(const [name,url]of Object.entries({trivialNode:'http://127.0.0.1:18992/trivial',...Object.fromEntries([1000,5000,10000].flatMap(n=>[['smallWorker-'+n,`http://127.0.0.1:18991/numeric?n=${n}&lane=worker`],['smallForward-'+n,`http://127.0.0.1:18991/numeric?n=${n}`]]))})){
 const a=[];for(let i=0;i<70;i++){const t=performance.now(),r=await fetch(url);if(r.status!==200)throw Error(await r.text());await r.text();if(i>=10)a.push(performance.now()-t);}a.sort((a,b)=>a-b);raw.extra[name]={n:a.length,p10:a[5],p50:a[29],p90:a[53],values:a};
}
writeFileSync('results/measurement.json',JSON.stringify(raw,null,2));console.log(raw.extra);
