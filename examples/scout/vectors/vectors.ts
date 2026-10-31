// Identical entry and kernels under Node 24's TS stripping and scriptc 0.4.6.
// Row-major preloaded embeddings; higher scores win, ties prefer smaller IDs.
function insert(score: number, id: number, scores: Float64Array, ids: Int32Array): void {
  if (score <= scores[9]) return; // ascending scan makes equal-score IDs stable
  let j = 9;
  while (j > 0 && score > scores[j - 1]) {
    scores[j] = scores[j - 1]; ids[j] = ids[j - 1]; j--;
  }
  scores[j] = score; ids[j] = id;
}
function floatSearch(data: Float32Array, query: Float32Array, n: number, d: number, scores: Float64Array, ids: Int32Array): void {
  for (let row = 0; row < n; row++) {
    let sum = 0;
    const base = row * d;
    for (let j = 0; j < d; j++) sum += data[base + j] * query[j];
    insert(sum, row, scores, ids);
  }
}
function int8Search(data: Int8Array, query: Int8Array, n: number, d: number, scores: Float64Array, ids: Int32Array): void {
  for (let row = 0; row < n; row++) {
    let sum = 0;
    const base = row * d;
    for (let j = 0; j < d; j++) sum += data[base + j] * query[j];
    insert(sum, row, scores, ids);
  }
}
function int8i32Search(data: Int8Array, query: Int8Array, n: number, d: number, scores: Float64Array, ids: Int32Array): void {
  for (let row = 0; row < n; row++) {
    let sum = 0;
    const base = row * d;
    for (let j = 0; j < d; j++) sum = (sum + data[base + j] * query[j]) | 0;
    insert(sum, row, scores, ids);
  }
}
function popcount(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return (Math.imul(x, 0x01010101) >>> 24);
}
function binarySearch(data: Uint32Array, query: Uint32Array, n: number, words: number, scores: Float64Array, ids: Int32Array): void {
  for (let row = 0; row < n; row++) {
    let distance = 0;
    const base = row * words;
    for (let j = 0; j < words; j++) distance += popcount(data[base + j] ^ query[j]);
    insert(-distance, row, scores, ids);
  }
}
let state = 0x12345678;
function sample(): number {
  state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
  return ((state >>> 0) % 255) - 127;
}
const kind = process.argv[2] || 'float';
const n = Number(process.argv[3] || '20000');
const d = Number(process.argv[4] || '384');
const iterations = Number(process.argv[5] || '30');
const warmup = Number(process.argv[6] || '10');
if (n < 10 || d < 32 || d % 32 !== 0 || d > 768 || iterations < 1) throw new Error('invalid size');
// Allocate only the representation being measured, outside the timed region.
const f = new Float32Array(kind === 'float' ? n * d : 0);
const fq = new Float32Array(kind === 'float' ? d : 0);
const i = new Int8Array(kind === 'int8' || kind === 'int8-i32' ? n * d : 0);
const iq = new Int8Array(kind === 'int8' || kind === 'int8-i32' ? d : 0);
const b = new Uint32Array(kind === 'binary' ? n * (d / 32) : 0);
const bq = new Uint32Array(kind === 'binary' ? d / 32 : 0);
for (let j = 0; j < d; j++) {
  const x = sample();
  if (kind === 'float') fq[j] = x / 127;
  else if (kind === 'binary') { if (x > 0) bq[j >>> 5] |= 1 << (j & 31); }
  else iq[j] = x;
}
for (let j = 0; j < n * d; j++) {
  const x = sample();
  if (kind === 'float') f[j] = x / 127;
  else if (kind === 'binary') { if (x > 0) b[j >>> 5] |= 1 << (j & 31); }
  else i[j] = x;
}
const scores = new Float64Array(10);
const ids = new Int32Array(10);
function search(): void {
  scores.fill(-Infinity); ids.fill(-1);
  if (kind === 'float') floatSearch(f, fq, n, d, scores, ids);
  else if (kind === 'int8') int8Search(i, iq, n, d, scores, ids);
  else if (kind === 'int8-i32') int8i32Search(i, iq, n, d, scores, ids);
  else if (kind === 'binary') binarySearch(b, bq, n, d / 32, scores, ids);
  else throw new Error('unknown kind');
}
search();
const expected = JSON.stringify({ ids: Array.from(ids), scores: Array.from(scores) });
for (let rep = 0; rep < warmup; rep++) search();
const times: number[] = [];
for (let rep = 0; rep < iterations; rep++) {
  const start = performance.now(); search(); times.push(performance.now() - start);
  if (JSON.stringify({ ids: Array.from(ids), scores: Array.from(scores) }) !== expected) throw new Error('unstable result');
}
times.sort((a, b) => a - b);
console.log(JSON.stringify({ kind, n, d, iterations, warmup, medianMs: times[Math.floor(times.length / 2)], p95Ms: times[Math.ceil(times.length * 0.95) - 1], times, ids: Array.from(ids), scores: Array.from(scores) }));
