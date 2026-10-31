// Synthetic, immutable corpus stands in for a loaded, versioned tenant index.
// Generate once per module/process; do not ship a 76.8 MB random fixture in the bundle.
export const dimensions = 768;
export const rows = 100_000;
const started = performance.now();
export const corpus = new Int8Array(rows * dimensions);
let state = 0x12345678;
for (let i = 0; i < corpus.length; i++) {
  state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
  corpus[i] = ((state >>> 0) % 255) - 127;
}
export const initMs = performance.now() - started;
