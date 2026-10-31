import { openSync, readSync, closeSync } from "node:fs";

let selected = "";
export function publicDispatch(): string {
  if (selected) return selected;
  selected = "unknown";
  // The build records this binary's sc_cpu_level symbol before stripping it.
  // Observe only our own four-byte dispatch global, once per instance. Never
  // expose its address, procfs, CPU flags, PID, memory or environment values.
  const address = Number(process.env.VECTOR_DISPATCH_ADDRESS);
  if (!Number.isSafeInteger(address) || address <= 0) return selected;
  try {
    const fd = openSync("/proc/self/mem", "r");
    const bytes = Buffer.alloc(4);
    try { readSync(fd, bytes, 0, 4, address); } finally { closeSync(fd); }
    const level = bytes[0] + bytes[1] * 256 + bytes[2] * 65536 + bytes[3] * 16777216;
    selected = level === 3 ? "avx2" : "baseline";
  } catch {}
  return selected;
}
