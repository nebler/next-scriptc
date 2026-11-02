// C1b paired process windows. Each process performs the fixture's 50 warmups.
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const [baseline, patched, csvEntry, csvBaseline, csvPatched, output] = process.argv.slice(2);
const median = xs => [...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
const windows=[];
for(let window=0;window<4;window++) {
 const cells=[];
 for(const [kind,n] of ['events','strings','maps','copy','generic','json'].flatMap(k=>[1000,10000,50000].map(n=>[k,n])).concat([['csv',128],['csv',4096]])) {
  const cell={kind,n}; let expected;
  const order=window%2 ? ['node','patched','baseline'] : ['node','baseline','patched'];
  for(const lane of order) {
   const csv=kind==='csv';
   const command=lane==='node'?process.execPath:csv?(lane==='baseline'?csvBaseline:csvPatched):(lane==='baseline'?baseline:patched);
   const args=[...(lane==='node'?[csv?csvEntry:`${import.meta.dirname}/workloads.ts`]:[]),...(csv?[]:[kind]),String(n),'35'];
   const samples=execFileSync(command,args,{encoding:'utf8',timeout:180000,maxBuffer:64*1024*1024}).trim().split('\n').map(JSON.parse);
   const values=samples.map(x=>csv?x.out:x.checksum); expected??=values[0];
   if(!values.every(v=>v===expected))throw Error(`parity ${window} ${kind} ${n} ${lane}`);
   cell[lane]=samples.map(x=>x.ms);
  }
  if(kind==='csv'){cell.outputBytes=Buffer.byteLength(expected);cell.sha256=createHash('sha256').update(expected).digest('hex');} else cell.checksum=expected;
  cells.push(cell); console.log(window,kind,n,...['node','baseline','patched'].map(k=>median(cell[k])));
 }
 windows.push({window,order:window%2?'node,patched,baseline':'node,baseline,patched',cells});
 writeFileSync(output,JSON.stringify({node:process.version,reps:35,warmups:50,windows})+'\n');
}
