// Separate-process, closed-loop HTTP/1.1 generator. No pipelining. Latency runs
// from dispatch to fully drained body; failures invalidate the entire sample.
import http from "node:http";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

export function request(base, spec, agent) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const req = http.request(new URL(spec.path, base), {
      method: spec.method ?? "GET", agent: agent ?? false,
      headers: { "accept-encoding": "identity", ...spec.headers },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("error", reject);
      res.on("end", () => {
        const body = Buffer.concat(chunks);
        if (res.statusCode !== (spec.status ?? 200)) {
          reject(new Error(`${spec.path}: HTTP ${res.statusCode}: ${body.toString().slice(0, 200)}`));
        } else resolve({ ms: performance.now() - started, body, headers: res.headers });
      });
    });
    req.setTimeout(120_000, () => req.destroy(new Error(`Request timed out: ${spec.path}`)));
    req.on("error", reject);
    req.end(spec.body);
  });
}

export const quantile = (xs, p) => xs.length ? [...xs].sort((a, b) => a - b)[Math.max(0, Math.ceil(xs.length * p) - 1)] : null;
export function median(xs) {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2;
}
export const digest = (body) => createHash("sha256").update(body).digest("hex");

async function load(base, spec, { concurrency = 1, durationMs, count, intervalMs = 0 }) {
  const agent = new http.Agent({ keepAlive: true, maxSockets: concurrency });
  const times = [];
  let issued = 0;
  const start = performance.now();
  const deadline = start + (durationMs ?? Infinity);
  try {
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (performance.now() < deadline && (count === undefined || issued < count)) {
        issued++;
        const response = await request(base, spec, agent);
        if (spec.digest && digest(response.body) !== spec.digest) throw new Error(`Response changed: ${spec.path}`);
        times.push(response.ms);
        if (intervalMs) await delay(intervalMs);
      }
    }));
    const elapsedMs = performance.now() - start;
    return { requests: times.length, elapsedMs, requestsPerSecond: times.length * 1000 / elapsedMs,
      p50Ms: quantile(times, 0.5), p99Ms: quantile(times, 0.99), maxMs: quantile(times, 1) };
  } finally { agent.destroy(); }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const job = JSON.parse(process.argv[2]);
    const cpu = process.cpuUsage();
    const generatorStart = performance.now();
    let result;
    if (job.probes) {
      // Let the saturated heavy connection start before dispatching probes.
      const heavy = job.heavy ? load(job.base, job.heavy, { durationMs: job.durationMs + 200 }) : undefined;
      await delay(100);
      const probes = await Promise.all(job.probes.map(async (spec) => ({ path: spec.path,
        ...await load(job.base, spec, { durationMs: job.durationMs, intervalMs: 20 }) })));
      result = { heavy: await heavy, probes };
    } else result = await load(job.base, job.spec, job);
    const used = process.cpuUsage(cpu);
    const generatorCpuMs = (used.user + used.system) / 1000;
    const generatorWallMs = performance.now() - generatorStart;
    process.stdout.write(JSON.stringify({ ...result, generatorCpuMs, generatorWallMs,
      generatorCpuCores: generatorCpuMs / generatorWallMs,
      generatorSaturationSuspected: generatorCpuMs / generatorWallMs >= 0.8 }));
  } catch (error) { console.error(error); process.exitCode = 1; }
}
