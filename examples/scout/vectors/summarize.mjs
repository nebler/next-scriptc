import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const dir = import.meta.dirname;
const read = file => JSON.parse(readFileSync(path.join(dir, file)));
const median = values => {
  const x = [...values].sort((a,b)=>a-b);
  return (x[(x.length-1)>>1] + x[x.length>>1])/2;
};
const files = ['mac-results.json', 'linux-results.json', 'linux-imul-results.json'];
const summary = {};
let assertions = 0;
for (const file of files) {
  const data = read(file);
  for (const row of data.runs) {
    const keyKind = row.kind === 'binary-plain' ? 'binary' : row.kind;
    const ref = data.runs.find(r=>r.n===row.n && r.d===row.d && (r.kind===keyKind));
    for (const key of ['ids','scores']) {
      if (JSON.stringify(ref[key]) !== JSON.stringify(row[key])) throw new Error(`${file}: parity ${row.runtime} ${row.kind} ${key}`);
      assertions++;
    }
    if (row.ids.length !== 10 || new Set(row.ids).size !== 10) throw new Error('top k size');
    for (let j=1;j<10;j++) if (row.scores[j]>row.scores[j-1] || (row.scores[j]===row.scores[j-1] && row.ids[j]<row.ids[j-1])) throw new Error('top k order');
    if (row.kind.startsWith('int8')) {
      const other = data.runs.find(r=>r.n===row.n && r.d===row.d && r.kind==='int8');
      if (other && (JSON.stringify(other.ids)!==JSON.stringify(row.ids) || JSON.stringify(other.scores)!==JSON.stringify(row.scores))) throw new Error('int8 algorithm parity');
    }
  }
  const groups = new Map();
  for (const run of data.runs) {
    const kind = run.kind === 'binary-plain' ? 'binary' : run.kind;
    const key = `${run.n}/${run.d}/${kind}/${run.runtime}`;
    if (!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(run);
  }
  summary[file] = [...groups].map(([key,runs])=>{
    const times=runs.flatMap(r=>r.times).sort((a,b)=>a-b);
    return {key,n:runs[0].n,d:runs[0].d,kind:runs[0].kind==='binary-plain'?'binary':runs[0].kind,runtime:runs[0].runtime,count:times.length,medianMs:median(times),p95Ms:times[Math.ceil(times.length*.95)-1],peakRssMiB:Math.max(...runs.map(r=>r.peakRssBytes))/1048576,processMediansMs:runs.map(r=>median(r.times))};
  });
}
for (const [file,rows] of Object.entries(summary)) {
  console.log(`\n${file}`);
  for (const n of [...new Set(rows.map(r=>r.n))]) for(const kind of ['float','int8','int8-i32','int8-imul','binary']) {
    const group=rows.filter(r=>r.n===n && r.kind===kind);
    if(!group.length) continue;
    console.log(`${n} ${kind}: ${group.map(r=>`${r.runtime} ${r.medianMs.toFixed(3)}/${r.p95Ms.toFixed(3)} ms ${r.peakRssMiB.toFixed(1)} MiB`).join('; ')}`);
    const native=group.find(r=>r.runtime==='release');
    for(const other of group.filter(r=>r.runtime==='node'||r.runtime==='go'))console.log(`  release/${other.runtime} ${(native.medianMs/other.medianMs).toFixed(4)}; ${other.runtime}/release ${(other.medianMs/native.medianMs).toFixed(2)}x`);
  }
}
writeFileSync(path.join(dir,'summary.json'),JSON.stringify({assertions,summary},null,2)+'\n');
console.log(`\n${assertions} exact cross-runtime ID/score comparisons passed; all int8 variants agree.`);
