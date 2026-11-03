// Standalone controls, not ingredients selected to make the forecast win.
export function floatModulo(count: number): number {
 let state=43;
 for(let i=0;i<count;i++)state=(state*16807)%2147483647;
 return state;
}
export function fractionalPower(count: number): number {
 let sum=0;
 for(let i=0;i<count;i++)sum+=Math.pow(1+(i%1000)/1000,1.7);
 return sum;
}
// Two 32-bit limbs, modulo 2^64 addition with carry. No BigInt.
export function limbCarry(count: number): number {
 let lo=123456789,hi=987654321;
 for(let i=0;i<count;i++){
  const next=(lo+2654435769)>>>0;
  hi=(hi+1013904223+(next<lo?1:0))>>>0;
  lo=next;
 }
 return hi+lo;
}
