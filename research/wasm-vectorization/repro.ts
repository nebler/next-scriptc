export function imul(a: Int8Array, b: Int8Array): number {
 let sum = 0;
 for (let i = 0; i < a.length; i++) sum = (sum + Math.imul(a[i], b[i])) | 0;
 return sum;
}
export function natural(a: Int8Array, b: Int8Array): number {
 let sum = 0;
 for (let i = 0; i < a.length; i++) sum = (sum + a[i] * b[i]) | 0;
 return sum;
}
export function float(a: Float32Array, b: Float32Array): number {
 let sum = 0;
 for (let i = 0; i < a.length; i++) sum = sum + a[i] * b[i];
 return sum;
}
export function sum(a: Int32Array, b: Int32Array): number {
 let sum = 0;
 for (let i = 0; i < a.length; i++) sum = (sum + a[i]) | 0;
 return sum;
}
export function run(n: number): number { const a = new Int8Array(n); const b = new Int8Array(n); const f = new Float32Array(n); const j = new Int32Array(n); return imul(a,b)+natural(a,b)+float(f,f)+sum(j,j); }
