import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const [baseline, patched, output] = process.argv.slice(2);
const root=import.meta.dirname;
const windows=[];
for(let w=0;w<4;w++) {
 const cell={};let expected;
 for(const lane of w%2?['node','patched','baseline']:['node','baseline','patched']) {
 const samples=execFileSync(lane==='node'?process.execPath:(lane==='baseline'?baseline:patched),[...(lane==='node'?[root+'/erased-path.ts']:[]),'50000','35'],{encoding:'utf8'}).trim().split('\n').map(JSON.parse);
 expected??=samples[0].checksum;if(!samples.every(s=>s.checksum===expected))throw Error('parity');cell[lane]=samples.map(s=>s.ms);
 }
 windows.push(cell);
}
writeFileSync(output,JSON.stringify({node:process.version,n:50000,reps:35,warmups:50,windows})+'\n');
console.log(windows.map(c=>Object.fromEntries(Object.entries(c).map(([k,a])=>[k,a.toSorted((a,b)=>a-b)[17]]))));
