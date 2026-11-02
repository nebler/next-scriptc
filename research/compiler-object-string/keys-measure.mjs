import {execFileSync} from 'node:child_process';import {writeFileSync} from 'node:fs';
const [baseline,patched,output]=process.argv.slice(2);const windows=[];
for(let i=0;i<4;i++){
 const window={};for(const label of i%2?['patched','baseline']:['baseline','patched']){
  const xs=execFileSync(label==='baseline'?baseline:patched,['50000','75'],{encoding:'utf8'}).trim().split('\n').map(JSON.parse);if(!xs.every(x=>x.checksum===450000))throw Error('key parity');window[label]=xs.map(x=>x.ms);
 }windows.push(window);
}
writeFileSync(output,JSON.stringify({windows},null,2)+'\n');console.log(windows.map(w=>Object.fromEntries(Object.entries(w).map(([k,xs])=>[k,xs.toSorted((a,b)=>a-b)[37]]))));
