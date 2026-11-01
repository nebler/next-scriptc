// Narrow loaded-host JS-routing overhead check. No native timing claim.
import {createDispatcher} from '../packages/next-scriptc/src/functions/promotion.mjs';
import {promote} from '../packages/next-scriptc/src/functions/promotion-client.mjs';
const file='/cached-overhead-check/promotion.node';
const d=createDispatcher({mode:'js',log:()=>{}});
globalThis[Symbol.for('next-scriptc.functions.promotion')].set(file,d);
const js=n=>n+1,args=[2];let sink=0;
const plain=()=>js(...args),wrapped=()=>promote(file,'f',js,args);
function measure(fn,n){const t=performance.now();for(let i=0;i<n;i++)sink+=fn();return (performance.now()-t)/n;}
for(let i=0;i<4;i++){measure(plain,100000);measure(wrapped,100000);}
const deltas=[];for(let i=0;i<9;i++){let a,b;if(i%2){b=measure(wrapped,500000);a=measure(plain,500000);}else{a=measure(plain,500000);b=measure(wrapped,500000);}deltas.push(b-a);}
const median=deltas.toSorted((a,b)=>a-b)[4];
console.log(JSON.stringify({node:process.version,overheadMs:median,budgetMs:0.005,pass:median<=.005,deltas,sink}));
if(median>.005)process.exitCode=1;
