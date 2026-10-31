import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { box, bilinear } from './kernel.ts';

const width = Number(process.env.WIDTH ?? '1024');
const size = Number(process.env.SIZE ?? '256');
const kind = process.env.KIND ?? 'box';
const warmup = Number(process.env.WARMUP ?? '20');
const iterations = Number(process.env.ITERATIONS ?? '40');
if (width % size !== 0 || width < size || size < 1 || (kind !== 'box' && kind !== 'bilinear')) throw new Error('arguments');
const src = new Uint8Array(width * width * 4), dst = new Uint8Array(size * size * 4);
let state = 42;
for (let i = 0; i < src.length; i += 4) {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  src[i] = state >>> 24; src[i + 1] = state >>> 16; src[i + 2] = state >>> 8; src[i + 3] = 255;
}
for (let i = 0; i < warmup; i++) {
  if (kind === 'box') box(src, dst, width, size); else bilinear(src, dst, width, size);
}
const samples: number[] = [];
let sink = 0;
for (let i = 0; i < iterations; i++) {
  const start = performance.now();
  if (kind === 'box') box(src, dst, width, size); else bilinear(src, dst, width, size);
  samples.push(performance.now() - start);
  sink += dst[(i * 997) % dst.length];
}
const sha256 = createHash('sha256').update(dst).digest('hex');
if (process.env.OUTPUT) writeFileSync(process.env.OUTPUT, dst);
console.log(JSON.stringify({kind, width, size, warmup, iterations, samples, sink, sha256}));
