import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const [binary, output, reps='21'] = process.argv.slice(2);
const rows=[];
for(const kind of ['events','strings','maps','copy','generic','json'])for(const n of [1000,10000,50000]){
 const cell={kind,n};
 for(const [label,cmd,args] of [['node',process.execPath,[`${import.meta.dirname}/workloads.ts`]],['native',binary,[]]]){
  const samples=execFileSync(cmd,[...args,kind,String(n),reps],{encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024}).trim().split('\n').map(JSON.parse);
  cell[label]=samples;
 }
 if(!cell.node.every(x=>x.checksum===cell.native[0].checksum)||!cell.native.every(x=>x.checksum===cell.node[0].checksum))throw Error(`parity ${kind} ${n}`);
 rows.push(cell);writeFileSync(output,JSON.stringify({node:process.version,binary,rows},null,2)+'\n');
 const median=xs=>xs.map(x=>x.ms).sort((a,b)=>a-b)[Math.floor(xs.length/2)];console.log(kind,n,median(cell.node),median(cell.native));
}
