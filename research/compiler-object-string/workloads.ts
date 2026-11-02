// Own-code development workloads; no held-out application source.
function generic<T>(value: T): T { return value; }
function run(kind: string, n: number): number {
  let sum = 0;
  if (kind === 'events') {
    const rows: {group: string; amount: number}[] = [];
    for (let i=0;i<n;i++) rows.push({group: 'g'+(i%64), amount:i%97});
    const totals = new Map<string,number>();
    for (const row of rows) totals.set(row.group,(totals.get(row.group) || 0)+row.amount);
    for (const v of totals.values()) sum += v;
  } else if (kind === 'strings') {
    let text = '';
    for (let i=0;i<n;i++) text += 'row,'+i+';';
    const parts = text.split(';');
    for (const part of parts) sum += part.length;
  } else if (kind === 'maps') {
    const map = new Map<string,number>(); const set = new Set<string>();
    for(let i=0;i<n;i++){const key='key'+(i%1024);map.set(key,i);set.add(key);sum+=map.get(key)||0;}
    sum += map.size+set.size;
  } else if (kind === 'copy') {
    for(let i=0;i<n;i++){const a={x:i,y:i+1,label:'row'};const b={...a,z:i%7};sum+=b.x+b.y+b.z+b.label.length;}
  } else if (kind === 'generic') {
    for(let i=0;i<n;i++){const a=generic({x:i,label:'row'});sum+=generic(a).x+generic(a.label).length;}
  } else if (kind === 'json') {
    let text='[';
    for(let i=0;i<n;i++){if(i)text+=',';text+='{"value":'+(i%97)+',"nested":{"label":"row"}}';}
    text+=']';
    const rows: any[] = JSON.parse(text);
    for(const row of rows) for(const key of Object.keys(row)) {if(key==='value')sum+=row[key] as number;else sum+=(row[key].label as string).length;}
  }
  return sum;
}
const kind=process.argv[2] || 'events';
const n=Number(process.argv[3] || '10000');
const reps=Number(process.argv[4] || '21');
for(let j=0;j<50;j++)run(kind,n);
for(let j=0;j<reps;j++){const start=performance.now();const checksum=run(kind,n);console.log(JSON.stringify({ms:performance.now()-start,checksum}));}
