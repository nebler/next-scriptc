const n=Number(process.argv[2]||'50000');
const reps=Number(process.argv[3]||'35');
const rows: any[]=[];
for(let i=0;i<n;i++)rows.push(JSON.parse('{"z":1,"10":2,"2":3,"label":4}'));
function run(): number { let sum=0;for(const row of rows){const keys=Object.keys(row);for(const key of keys)sum+=key.length;}return sum; }
for(let i=0;i<50;i++)run();
for(let i=0;i<reps;i++){const start=performance.now();const checksum=run();console.log(JSON.stringify({ms:performance.now()-start,checksum}));}
