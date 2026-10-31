// Opt-in hosted benchmark observations. Both TS variants use these boundaries.
const enabled = process.env.VECTOR_VERCEL_TIMING === "1";
export const vectorInstance = `${Date.now()}-${Math.random()}`;
export function measured(work: () => Response): Response {
  if (!enabled) return work();
  const cpu = process.cpuUsage();
  const start = performance.now();
  const result = work();
  const computeMs = performance.now() - start;
  const after = process.cpuUsage();
  result.headers.set("server-timing", `compute;dur=${computeMs}`);
  result.headers.set("x-vector-cpu-us", String(after.user + after.system - cpu.user - cpu.system));
  result.headers.set("x-vector-rss", String(process.memoryUsage().rss));
  result.headers.set("x-vector-instance", vectorInstance);
  return result;
}
