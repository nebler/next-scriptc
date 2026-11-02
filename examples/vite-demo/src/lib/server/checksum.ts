// Pure scalar workload; no directive or function registration is needed.
export function checksum(n: number): number {
 let total = 0;
 for (let i = 0; i < n; i++) total += i * i;
 return total;
}
