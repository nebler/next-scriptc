const dimensions = 768;
export function dot(a: Int8Array, b: Int8Array): number {
  let sum = 0;
  for (let i = 0; i < dimensions; i++) sum = (sum + Math.imul(a[i], b[i])) | 0;
  return sum;
}
