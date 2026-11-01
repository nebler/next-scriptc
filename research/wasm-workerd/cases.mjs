export const cases=[
 ...[5000,15000,200000].map(size=>({kind:'revenue',size,args:['2026-01-01','2026-01-31',size,false]})),
 ...[5000,15000,200000].map(size=>({kind:'regex',size,args:[size]})),
 {kind:'vector',size:100000,args:[100000,Array.from({length:768},(_,i)=>((i*31+17)%255)-127)]},
];
export const stats=values=>{const s=[...values].sort((a,b)=>a-b);return {n:s.length,p50:s[Math.ceil(s.length*.5)-1],p95:s[Math.ceil(s.length*.95)-1],min:s[0],max:s.at(-1),mean:values.reduce((a,b)=>a+b,0)/values.length};};
