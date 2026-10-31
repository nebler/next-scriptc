import { readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
const instance = `${Date.now()}-${Math.random()}`;
function file(name: string): string {
  try {
    return readFileSync(name, "utf8");
  } catch {
    return "unavailable";
  }
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
