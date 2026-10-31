import { readFileSync } from "node:fs";

// Diagnostic only: excluded from the benchmark registry and timed handlers.
const instance = `${Date.now()}-${Math.random()}`;

export function GET(request: Request) {
  // Depend on the request so Next cannot prerender this process observation.
  new URL(request.url);
  const cpu = process.cpuUsage();
  const rss = process.memoryUsage().rss;
  const status = readFileSync("/proc/self/status", "utf8");
  const field = (name: string) => {
    const line = status.split("\n").find((entry) => entry.startsWith(`${name}:`));
    return line ? Number(line.split(":")[1].trim().split(/\s+/)[0]) * 1024 : null;
  };
  const stat = readFileSync("/proc/self/stat", "utf8");
  const fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
  return Response.json({ instance, pid: process.pid, cpu,
    procCpuTicks: { user: Number(fields[11]), system: Number(fields[12]) },
    ppid: Number(fields[1]), rss, procRss: field("VmRSS"), peakRss: field("VmHWM") }, {
    headers: { "cache-control": "no-store" },
  });
}
