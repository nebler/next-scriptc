// Optional fairness controls; never run concurrently with bench.mjs.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const dir=import.meta.dirname;
const go=process.env.VECTOR_GO || '/opt/homebrew/bin/go';
const original=readFileSync(path.join(dir,'vectors.go'),'utf8');
const reference=JSON.parse(readFileSync(path.join(dir,'mac-results.json'))).runs.find(r=>r.n===100000 && r.kind==='float');
const variants={
 fma:original.replace("// Explicit rounding prevents Go's permitted FMA from changing JS semantics.\n\t\t\tproduct := float64(float64(x) * float64(query[j]))\n\t\t\tsum += product",'sum += float64(x) * float64(query[j])'),
 'query-bounds':original.replace('for row := 0; row < n; row++ {\n\t\tsum := 0.0','query = query[:d]\n\tfor row := 0; row < n; row++ {\n\t\tsum := 0.0').replaceAll('data[row*d : (row+1)*d]','data[row*d : row*d+d]'),
};
const results=[];
for(const [variant,source] of Object.entries(variants)){
 if(source===original)throw new Error('control rewrite did not match');
 const file=path.join(dir,'.artifacts',`control-${variant}.go`);
 const binary=file.slice(0,-3);
 writeFileSync(file,source);
 execFileSync(go,['build','-o',binary,file]);
 const run=spawnSync('/usr/bin/time',['-l',binary,'float','100000','768','30','15'],{encoding:'utf8'});
 if(run.status!==0)throw new Error(run.stderr);
 const data=JSON.parse(run.stdout);
 if(JSON.stringify(data.ids)!==JSON.stringify(reference.ids)||JSON.stringify(data.scores)!==JSON.stringify(reference.scores))throw new Error('control parity');
 results.push({variant,sourceSha256:createHash('sha256').update(source).digest('hex'),...data,peakRssBytes:Number(run.stderr.match(/(\d+)\s+maximum resident set size/)[1])});
 writeFileSync(`${binary}.s`,execFileSync(go,['tool','objdump','-s','main.floatSearch',binary]));
}
writeFileSync(path.join(dir,'go-controls.json'),JSON.stringify({go:execFileSync(go,['version']).toString().trim(),results},null,2)+'\n');
console.log(results.map(r=>({variant:r.variant,medianMs:r.medianMs,p95Ms:r.p95Ms})));
