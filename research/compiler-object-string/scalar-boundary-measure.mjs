import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const [baseline,patched,output]=process.argv.slice(2);
const windows=[];
for(let window=0;window<4;window++){
 const cells=[];
 for(const [kind,n] of [['d1',6000],['e1',6000],['e1',60000]]){
  const cell={kind,n};let expected;
  for(const lane of window%2?['node','patched','baseline']:['node','baseline','patched']){
   const command=lane==='node'?process.execPath:lane==='baseline'?baseline:patched;
   const args=[...(lane==='node'?[`${import.meta.dirname}/scalar-boundary.ts`]:[]),kind,String(n),'35'];
   const samples=execFileSync(command,args,{encoding:'utf8',timeout:180000,maxBuffer:1024*1024}).trim().split('\n').map(JSON.parse);
   expected??=samples[0].out;if(!samples.every(x=>x.out===expected))throw Error(`parity ${kind} ${lane}`);
   cell[lane]=samples.map(x=>x.ms);
  }
  cell.out=expected;cells.push(cell);console.log(window,kind,n);
 }
 windows.push({window,cells});writeFileSync(output,JSON.stringify({node:process.version,warmups:50,reps:35,windows})+'\n');
}
