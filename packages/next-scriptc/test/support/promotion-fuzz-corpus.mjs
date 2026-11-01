// Permanent native differential corpus, including the existing construction fixtures.
export const sources=[
 'export function closureRows(x:{n:number;s:string}[]){return x.map(v=>({n:v.n*2,s:field(v.s)}));} function field(s:string){return `quoted:${s}`;}',
 'export function optional(x:{v?:string|null;n:number|undefined}[]){return x.map(v=>({v:v.v??"missing",n:v.n??0}));}',
 'export function optionalParameter(x?:number){return {value:x??7};}',
 'export function immutable(x:{n:number;s:string}[]){return {a:x.map(v=>({n:v.n,s:v.s})),input:x};}',
 'export function strings(s:string){return {s:`value=${s}`};}',
 'export function bounded(x:{a:{b:{c:{d:{e:{f:{g:{h:{i:{j:{k:{n:number;s:string}}}}}}}}}}}}){return {n:x.a.b.c.d.e.f.g.h.i.j.k.n,s:x.a.b.c.d.e.f.g.h.i.j.k.s};}',
 'export function rows(x:{n:number;s:string}[]){return {a:x.map(v=>({n:v.n,s:v.s}))};}',
 'export function arithmetic(n:number){const a:number[]=[];a.push(n*n);a.push(n/n);a.push(-n);return {a};}',
 'export function scalar(n:number){return n*n;}',
 'export function parsed(x:string){const v=JSON.parse(x) as {n:number;s:string};return {n:v.n,s:v.s};}',
 'export function collections(x:{n:number;s:string}[]){const m=new Map<string,number>();const s=new Set<string>();for(const v of x){m.set(v.s,(m.get(v.s)||0)+v.n);s.add(v.s);}return {values:Array.from(m.values()).sort((a,b)=>a-b),keys:Array.from(s.values()).sort((a,b)=>a<b?-1:a>b?1:0)};}',
 'export function nested(x:{rows:{n:number;s:string}[]}[]){return {groups:x.map(g=>({items:g.rows.map(v=>({value:{n:v.n,s:`text=${v.s}`}}))}))};}',
 'export function loops(x:{n:number}[]){let sum=0;const values:number[]=[];for(const v of x){sum+=v.n;values.push(Math.sqrt(v.n));}return {sum,values};}',
 'export function sum(x:{n:number}[]){let n=0;for(const v of x)n+=v.n;return n;}',
];
