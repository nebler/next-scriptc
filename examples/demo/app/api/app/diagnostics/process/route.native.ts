import { readFileSync } from "node:fs";
import { json } from "../../common.ts";
const instance = `${Date.now()}-${Math.random()}`;

// Unmeasured process diagnostic, portable for local parity. Linux adds procfs
// evidence; neither RSS nor VmHWM includes separate platform processes.
export function GET(request: Request) {
  new URL(request.url);
  const cpu = process.cpuUsage();
  const rss = process.memoryUsage().rss;
  let procRss: number | null = null;
  let peakRss: number | null = null;
  try {
    const status = readFileSync("/proc/self/status", "utf8");
    for (const line of status.split("\n")) {
      if (line.startsWith("VmRSS:")) procRss = Number(line.split(":")[1].trim().split(/\s+/)[0]) * 1024;
      if (line.startsWith("VmHWM:")) peakRss = Number(line.split(":")[1].trim().split(/\s+/)[0]) * 1024;
    }
  } catch {}
  return json({ instance, pid: process.pid, cpu, rss, procRss, peakRss });
}
