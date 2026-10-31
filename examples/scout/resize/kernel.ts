// Decoded, tightly packed RGBA. Callers supply a reusable output buffer.
// Box is the thumbnail route's exact integer average, generalized from 4 to 8.
export function box(src: Uint8Array, dst: Uint8Array, width: number, size: number): void {
  const scale = width / size;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let dy = 0; dy < scale; dy++)
          for (let dx = 0; dx < scale; dx++)
            sum += src[((y * scale + dy) * width + x * scale + dx) * 4 + c];
        dst[(y * size + x) * 4 + c] = Math.floor(sum / (scale * scale));
      }
}

// Center-sampled bilinear, clamp-to-edge, round to nearest integer.
// Four taps per output pixel; unlike a box/area filter it does not antialias
// aggressive downscales. Kept as a separate algorithm, never a box substitute.
export function bilinear(src: Uint8Array, dst: Uint8Array, width: number, size: number): void {
  const scale = width / size;
  for (let y = 0; y < size; y++) {
    const sy = (y + 0.5) * scale - 0.5;
    const y0 = Math.max(0, Math.floor(sy)), y1 = Math.min(width - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < size; x++) {
      const sx = (x + 0.5) * scale - 0.5;
      const x0 = Math.max(0, Math.floor(sx)), x1 = Math.min(width - 1, x0 + 1);
      const fx = sx - x0;
      for (let c = 0; c < 4; c++) {
        const a = src[(y0 * width + x0) * 4 + c];
        const b = src[(y0 * width + x1) * 4 + c];
        const d = src[(y1 * width + x0) * 4 + c];
        const e = src[(y1 * width + x1) * 4 + c];
        const top = a + (b - a) * fx, bottom = d + (e - d) * fx;
        dst[(y * size + x) * 4 + c] = Math.floor(top + (bottom - top) * fy + 0.5);
      }
    }
  }
}
