import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const file='packages/compiler/dist/index.js';const original=readFileSync(file,'utf8');
const enabled=original.replaceAll('process.env["SCRIPTC_SCALAR_RECORDS"] === "1"','process.env["SCRIPTC_SCALAR_RECORDS"] !== "0"');
if(enabled===original)throw Error('default edit did not match');
try{
 writeFileSync(file,enabled);
 execFileSync(process.execPath,['packages/cli/dist/main.js','build','/Users/noah/code/next-scriptc/research/compiler-object-string/workloads.ts','-o','.c1c/suite-default'],{stdio:'inherit',env:{...process.env,SCRIPTC_CHECKER_SERVER:'0'}});
}finally{writeFileSync(file,original);}
const windows=[];
for(let window=0;window<4;window++){
 const cells=[];
 for(const kind of ['generic','copy']){
  const cell={kind,n:50000};let expected;
  for(const lane of window%2?['default','optIn']:['optIn','default']){
   const samples=execFileSync(lane==='default'?'.c1c/suite-default':'.c1c/suite-patch',[kind,'50000','35'],{encoding:'utf8'}).trim().split('\n').map(JSON.parse);
   expected??=samples[0].checksum;if(!samples.every(x=>x.checksum===expected))throw Error('parity');cell[lane]=samples.map(x=>x.ms);
  }cells.push(cell);
 }windows.push({window,cells});
}
writeFileSync('/Users/noah/.t3/worktrees/next-scriptc/c1c-escape/research/compiler-object-string/scalar-default-results.json',JSON.stringify({node:process.version,windows})+'\n');
