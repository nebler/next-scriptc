import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const [nodeEntry,stock,baseline,patched,output]=process.argv.slice(2);
const cells=[];
for(const n of [128,4096]){
 const cell={n};let expected;
 for(const [label,cmd,args] of [['node',process.execPath,[nodeEntry]],['stock',stock,[]],['baseline',baseline,[]],['patched',patched,[]]]){
  const samples=execFileSync(cmd,[...args,String(n),'35'],{encoding:'utf8',timeout:180000,maxBuffer:64*1024*1024}).trim().split('\n').map(JSON.parse);
  expected??=samples[0].out;
  if(!samples.every(x=>x.out===expected))throw Error(`CSV byte parity ${n} ${label}`);
  cell[label]=samples.map(x=>x.ms);
 }
 cell.outputBytes=Buffer.byteLength(expected);cell.outputSha256=createHash('sha256').update(expected).digest('hex');cells.push(cell);writeFileSync(output,JSON.stringify({node:process.version,cells},null,2)+'\n');console.log(n,Object.fromEntries(['node','stock','baseline','patched'].map(k=>[k,cell[k].toSorted((a,b)=>a-b)[17]])));
}
