// Own-code boundary probes. JSON encode/decode is inside each timed call.
import {forecast} from '../../examples/shared-native/lib/forecast.ts';
import {aggregate} from '../boundary-encoders/fixture.ts';
const kind=process.argv[2] || 'd1';
const n=Number(process.argv[3] || '6000');
const reps=Number(process.argv[4] || '35');
let input='';
if(kind==='d1') input=JSON.stringify({trials:n,seed:42,cash:100000,revenue:12000,costs:10000});
else {
 const rows:{category:string;amount:number;weight:number;enabled:boolean;label:string;region:string;sequence:number;timestamp:number}[]=[];
 for(let i=0;i<n;i++)rows.push({category:'g'+(i%64),amount:i%97,weight:0.5,enabled:i%2===0,label:'row',region:'eu',sequence:i,timestamp:1000+i});
 input=JSON.stringify(rows);
}
function run(text:string):string {
 if(kind==='d1')return JSON.stringify(forecast(JSON.parse(text) as Parameters<typeof forecast>[0]));
 return JSON.stringify(aggregate(JSON.parse(text) as Parameters<typeof aggregate>[0],2));
}
for(let i=0;i<50;i++)run(input);
for(let i=0;i<reps;i++){const start=performance.now();const out=run(input);console.log(JSON.stringify({ms:performance.now()-start,out}));}
