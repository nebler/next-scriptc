import { readFileSync, openSync, readSync, closeSync } from "node:fs";
import { vectorInstance } from "../vectors/measure.ts";
import { availableParallelism } from "node:os";
const instance = `${Date.now()}-${Math.random()}`;
function file(name: string): string {
  try {
    return readFileSync(name, "utf8");
  } catch {
    return "unavailable";
  }
}
// A fixed build-time ELF symbol address is supplied only on native benchmark previews.
// Reading our own four-byte global observes CPUID/XGETBV dispatch without changing it.
function dispatchLevel(): number {
  const address = process.env.VECTOR_DISPATCH_ADDRESS;
  if (!address) return -1;
  try {
    const fd = openSync("/proc/self/mem", "r");
    const bytes = Buffer.alloc(4);
    try { readSync(fd, bytes, 0, 4, Number(address)); } finally { closeSync(fd); }
    return bytes[0] + bytes[1] * 256 + bytes[2] * 65536 + bytes[3] * 16777216;
  } catch { return -2; }
}
export function GET(request: Request) {
  new URL(request.url);
  const stat = file("/proc/self/stat");
  const parts = stat
    .slice(stat.lastIndexOf(")") + 2)
    .trim()
    .split(/\s+/);
  return Response.json(
    {
      instance,
      vectorInstance,
      dispatchLevel: dispatchLevel(),
      dispatchAddress: process.env.VECTOR_DISPATCH_ADDRESS ?? "unset",
      cpuInfo: file("/proc/cpuinfo"),
      cpuLevelOverride: process.env.SCRIPTC_CPU_LEVEL ?? "unset",
      timingEnabled: process.env.VECTOR_VERCEL_TIMING,
      pid: process.pid,
      cpu: process.cpuUsage(),
      rss: process.memoryUsage().rss,
      procCpuTicks: { user: Number(parts[11]), system: Number(parts[12]) },
      availableParallelism: availableParallelism(),
      status: file("/proc/self/status"),
      cpuMax: file("/sys/fs/cgroup/cpu.max"),
      cgroup: file("/proc/self/cgroup"),
      cpuQuota: file("/sys/fs/cgroup/cpu/cpu.cfs_quota_us"),
      cpuPeriod: file("/sys/fs/cgroup/cpu/cpu.cfs_period_us"),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
