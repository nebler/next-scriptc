// Bundled externally by csv-build.mjs; dependency sources are never retained here.
import {json2csv} from 'json-2-csv';
const n=Number(process.argv[2] || '4096');
const reps=Number(process.argv[3] || '35');
const rows: {id:number;name:string;nested:{note:string}}[]=[];
for(let i=0;i<n;i++)rows.push({id:i,name:'row '+i,nested:{note:'note '+(i%17)}});
const input=JSON.stringify(rows);
function run(): string { return json2csv(JSON.parse(input)); }
for(let i=0;i<50;i++)run();
for(let i=0;i<reps;i++){const start=performance.now();const out=run();console.log(JSON.stringify({ms:performance.now()-start,out}));}
