// Same RGBA fixture/kernel as the route; no HTTP, Next or adapter.
const bytes = new Uint8Array(512 * 512 * 4);
for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 17 + (i >>> 8)) & 255;
async function histogram(): Promise<number> {
  const rgba = await Promise.resolve(bytes);
  const bins = new Uint32Array(256);
  let sum = 0, min = 255, max = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const luma = (77 * rgba[i] + 150 * rgba[i + 1] + 29 * rgba[i + 2]) >>> 8;
    bins[luma]++;
    sum += luma;
    min = Math.min(min, luma);
    max = Math.max(max, luma);
  }
  let checksum = sum + min + max;
  for (let i = 0; i < bins.length; i++) checksum += bins[i] * (i + 1);
  return checksum;
}
async function main(): Promise<void> {
  const expected = await histogram();
  for (let i = 0; i < 100; i++) if (await histogram() !== expected) throw new Error("warmup parity");
  for (let rep = 0; rep < 3; rep++) {
    const start = performance.now();
    for (let i = 0; i < 500; i++) if (await histogram() !== expected) throw new Error("parity");
    console.log(JSON.stringify({ rep, count: 500, ms: performance.now() - start, expected }));
  }
}
main();
