// Scalar JSON boundary; typed storage stays inside the pure function.
export function numeric(n: number): number {
 const a = new Int32Array(1024);
 for(let j=0;j<1024;j++) a[j]=(j*17+13)|0;
 let total=0;
 for(let i=0;i<n;i++) {
  for(let j=0;j<1024;j++) {
   const x=a[j];
   a[j]=(Math.imul(x,1664525)+1013904223)|0;
   total=(total+(a[j]>>>16))|0;
  }
 }
 return total;
}
