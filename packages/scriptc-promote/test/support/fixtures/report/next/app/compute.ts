export function sum(values: number[]): number { let total = 0; for (const value of values) total += value; return total; }
export function tiny(n: number): number { return n + 1; }
export function noisy(n: number): number { let total = 0; for(let i=0;i<n;i++) total += Date.now(); return total; }
export async function asyncHelper(n: number) { return n; }
