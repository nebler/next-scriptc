import { readFileSync } from "node:fs";

// Diagnostic only: excluded from the benchmark registry and timed handlers.
const instance = `${Date.now()}-${Math.random()}`;

export function GET(request: Request) {
  // Depend on the request so Next cannot prerender this process observation.
  new URL(request.url);
  const rss = process.memoryUsage().rss;
  const status = readFileSync("/proc/self/status", "utf8");
  const field = (name: string) => {
    const line = status.split("\n").find((entry) => entry.startsWith(`${name}:`));
    return line ? Number(line.split(":")[1].trim().split(/\s+/)[0]) * 1024 : null;
  };
  return Response.json({ instance, pid: process.pid, rss, procRss: field("VmRSS"), peakRss: field("VmHWM") }, {
    headers: { "cache-control": "no-store" },
  });
}
