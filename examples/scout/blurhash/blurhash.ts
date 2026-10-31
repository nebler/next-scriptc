// BlurHash 4x3, opaque decoded RGBA; byte LUT and cosine tables mirror
// buckket/go-blurhash v1.1.0. This entire file runs unchanged in Node/scriptc.
const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~";
const linear = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const v = i / 255;
  linear[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function base83(value: number, length: number): string {
  let result = "";
  for (let i = length - 1; i >= 0; i--) result += alphabet[Math.floor(value / Math.pow(83, i)) % 83];
  return result;
}
function srgb(value: number): number {
  const v = Math.max(0, Math.min(1, value));
  return Math.floor((v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255 + 0.5);
}
function quant(value: number, maximum: number): number {
  const v = value / maximum;
  const signed = (v < 0 ? -1 : 1) * Math.pow(Math.abs(v), 0.5);
  return Math.max(0, Math.min(18, Math.floor(signed * 9 + 9.5)));
}
function encode(rgba: Uint8Array, width: number, height: number): string {
  const xs = new Float64Array(4 * width);
  const ys = new Float64Array(3 * height);
  const factors = new Float64Array(36);
  for (let xc = 0; xc < 4; xc++) for (let x = 0; x < width; x++) xs[xc * width + x] = Math.cos(Math.PI * xc * x / width);
  for (let yc = 0; yc < 3; yc++) for (let y = 0; y < height; y++) ys[yc * height + y] = Math.cos(Math.PI * yc * y / height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const r = linear[rgba[p]], g = linear[rgba[p + 1]], b = linear[rgba[p + 2]];
      for (let yc = 0; yc < 3; yc++) {
        for (let xc = 0; xc < 4; xc++) {
          const scale = xc === 0 && yc === 0 ? 1 / (width * height) : 2 / (width * height);
          const basis = xs[xc * width + x] * ys[yc * height + y];
          const f = (xc + yc * 4) * 3;
          factors[f] += r * basis * scale;
          factors[f + 1] += g * basis * scale;
          factors[f + 2] += b * basis * scale;
        }
      }
    }
  }
  let actualMaximum = 0;
  for (let i = 3; i < 36; i++) actualMaximum = Math.max(Math.abs(factors[i]), actualMaximum);
  const q = Math.max(0, Math.min(82, Math.floor(actualMaximum * 166 - 0.5)));
  const maximum = (q + 1) / 166;
  let hash = base83(21, 1) + base83(q, 1) + base83((srgb(factors[0]) << 16) + (srgb(factors[1]) << 8) + srgb(factors[2]), 4);
  for (let i = 3; i < 36; i += 3) hash += base83(quant(factors[i], maximum) * 361 + quant(factors[i + 1], maximum) * 19 + quant(factors[i + 2], maximum), 2);
  return hash;
}
const size = Number(process.argv[2] || "512");
const iterations = Number(process.argv[3] || "30");
const warmup = Number(process.argv[4] || "5");
const pixels = new Uint8Array(size * size * 4);
for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
  const p = (y * size + x) * 4;
  pixels[p] = Math.floor(x * 255 / (size - 1));
  pixels[p + 1] = Math.floor(y * 255 / (size - 1));
  pixels[p + 2] = ((x ^ y) + ((x * y) >>> 8)) & 255;
  pixels[p + 3] = 255;
}
const expected = encode(pixels, size, size);
for (let i = 0; i < warmup; i++) if (encode(pixels, size, size) !== expected) throw new Error("warmup parity");
const samples: number[] = [];
for (let i = 0; i < iterations; i++) {
  const begin = performance.now();
  const hash = encode(pixels, size, size);
  const elapsed = performance.now() - begin;
  if (hash !== expected) throw new Error("hash parity");
  samples.push(elapsed);
}
console.log(JSON.stringify({ size, iterations, warmup, hash: expected, samples }));
