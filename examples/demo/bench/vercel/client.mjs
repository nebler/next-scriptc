import https from "node:https";
import { gunzipSync } from "node:zlib";
import { routes } from "../config.mjs";
import { digest, quantile } from "../load.mjs";

export const workloads = ["hello", "verify", "revenue", "gzip-export", "nearby-stores", "markdown"]
  .map((id) => routes.find((route) => route.id === id));
export const protocol = { region: "iad1", sequentialWarmup: 20, sequentialCount: 200,
  revision: 2, concurrency: 16, concurrentWarmup: 1000, concurrentWarmupMs: 2000, durationMs: 3000, concurrentCap: 900, requestTimeoutMs: 15_000 };

export async function measure(deployments, { fresh = false, secret, onRow = () => {} } = {}) {
  if (!secret) throw new Error("VERCEL_AUTOMATION_BYPASS_SECRET is required");
  const expected = new Map();
  const results = [];
  const client = createClient(secret);
  const { request, window, memory } = client;
  for (const deployment of deployments) {
    const rows = [];
    results.push({ ...deployment, firstRequestDefinition: fresh ? "operator-declared untouched fresh deployment" : "existing deployment; cold state unknown", rows });
    // All route-first samples precede warmup. Only hello is deployment-first.
    for (const spec of workloads) {
      const row = { workload: spec.id, path: spec.path, status: "running" };
      rows.push(row);
      const agent = new https.Agent({ keepAlive: true, maxSockets: 1 });
      try {
        const first = await request(deployment.url, spec, agent);
        row.first = { ...first, deploymentFirst: spec === workloads[0], confirmedCold: null };
        if (spec === workloads[0]) await sampleMemory(results.at(-1), "memoryAfterFirst", deployment.url);
        const reference = expected.get(spec.id);
        if (reference && reference !== first.digest) throw new Error("Cross-variant response digest mismatch");
        expected.set(spec.id, first.digest);
        row.status = "validated";
      } catch (error) { row.status = "failed"; row.error = error.message; }
      finally { agent.destroy(); }
    }
    for (const row of rows) {
      if (row.status === "failed") { onRow(deployment.variant, row); continue; }
      const spec = workloads.find((route) => route.id === row.workload);
      try {
        row.sequential = await window(deployment.url, spec, 1, protocol.sequentialWarmup, { count: protocol.sequentialCount }, row.first.digest);
        if (row.sequential.error) throw new Error(row.sequential.error);
        row.concurrent = await window(deployment.url, spec, protocol.concurrency, { count: protocol.concurrentWarmup, durationMs: protocol.concurrentWarmupMs },
          { count: protocol.concurrentCap, durationMs: protocol.durationMs }, row.first.digest);
        if (row.concurrent.error) throw new Error(row.concurrent.error);
        row.status = "measured";
      } catch (error) { row.status = "failed"; row.error = error.message; }
      onRow(deployment.variant, row);
    }
    await sampleMemory(results.at(-1), "memoryAfterLoad", deployment.url);
  }
  return { protocol, deployments: results, requestsIssued: client.issued,
    status: results.some((deployment) => deployment.rows.some((row) => row.status === "failed")
      || deployment.memoryAfterFirst?.status === "failed" || deployment.memoryAfterLoad?.status === "failed") ? "failed" : "complete" };

  async function sampleMemory(deployment, key, url) {
    try { deployment[key] = await memory(url); }
    catch (error) { deployment[key] = { status: "failed", error: error.message }; }
  }
}

// Shared transport for paired, cold-only and tail diagnostics; one request counter.
export function createClient(secret, budget = 25_476) {
  if (!secret) throw new Error("VERCEL_AUTOMATION_BYPASS_SECRET is required");
  let issued = 0;
  return { request, window, memory, get issued() { return issued; } };

  function request(base, spec, agent) {
    if (issued >= budget) throw new Error("Run invocation budget exhausted");
    issued++;
    return new Promise((resolve, reject) => {
      const start = performance.now();
      let timer;
      const req = https.request(new URL(spec.path, base), { agent, method: spec.method ?? "GET", headers: {
        "accept-encoding": spec.responseEncoding === "gzip" ? "gzip" : "identity", ...spec.headers, "x-vercel-protection-bypass": secret,
      } }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("error", (error) => { clearTimeout(timer); reject(error); });
        res.on("aborted", () => { clearTimeout(timer); reject(new Error("Response aborted")); });
        res.on("end", () => {
          clearTimeout(timer);
          const body = Buffer.concat(chunks);
          const ms = performance.now() - start;
          try {
            // Error bodies and headers can contain credentials. Preserve status,
            // platform error code and request ID, never echo response content.
            if (res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode}; x-vercel-error=${res.headers["x-vercel-error"] ?? "absent"}; request=${res.headers["x-vercel-id"] ?? "absent"}`);
            if (["HIT", "STALE", "PRERENDER"].includes(res.headers["x-vercel-cache"])) throw new Error(`Dynamic route served from CDN: ${res.headers["x-vercel-cache"]}`);
            for (const [name, value] of Object.entries(spec.responseHeaders ?? {})) {
              if (res.headers[name] !== value) throw new Error(`Unexpected ${name}: ${res.headers[name]}`);
            }
            const decoded = spec.responseEncoding === "gzip" ? gunzipSync(body) : body;
            resolve({ ms, digest: digest(decoded), bytes: decoded.length, wireBytes: body.length,
              ...(spec.diagnostic ? { body: JSON.parse(decoded) } : {}),
              reusedSocket: req.reusedSocket, headers: Object.fromEntries(
                ["x-vercel-id", "x-vercel-cache", "server-timing", "content-type", "content-encoding", "cache-control"]
                  .filter((name) => res.headers[name] !== undefined).map((name) => [name, res.headers[name]])) });
          } catch (error) { reject(error); }
        });
      });
      timer = setTimeout(() => req.destroy(new Error(`Absolute request deadline ${protocol.requestTimeoutMs} ms`)), protocol.requestTimeoutMs);
      req.on("error", (error) => { clearTimeout(timer); reject(error); });
      req.end();
    });
  }

  async function memory(base) {
    const agent = new https.Agent({ keepAlive: true, maxSockets: 1 });
    try {
      const result = await request(base, { path: "/api/diagnostics/memory", diagnostic: true }, agent);
      return { observedAt: new Date().toISOString(), ...result };
    } finally { agent.destroy(); }
  }

  async function window(base, spec, concurrency, warmupLimits, limits, reference, retainSamples = false) {
    const agent = new https.Agent({ keepAlive: true, maxSockets: concurrency });
    let connections = 0;
    const create = agent.createConnection.bind(agent);
    agent.createConnection = (...args) => { connections++; return create(...args); };
    async function run({ count, durationMs }) {
      let dispatched = 0, reused = 0, failure;
      const times = [], samples = [];
      const connectionsBefore = connections;
      const cpu = process.cpuUsage();
      const start = performance.now();
      await Promise.all(Array.from({ length: concurrency }, async () => {
        while (!failure && dispatched < count && performance.now() - start < (durationMs ?? Infinity)) {
          dispatched++;
          const dispatchMs = performance.now() - start;
          try {
            const response = await request(base, spec, agent);
            if (response.digest !== reference) throw new Error(`Response changed: ${spec.path}`);
            reused += Number(response.reusedSocket);
            times.push(response.ms);
            if (retainSamples) samples.push({ dispatchMs, ms: response.ms, requestId: response.headers["x-vercel-id"] });
          } catch (error) {
            failure ??= error;
            if (retainSamples) samples.push({ dispatchMs, ms: performance.now() - start - dispatchMs, error: error.message });
          }
        }
      }));
      // Keep failed windows and drained outstanding samples; never present their throughput as valid.
      const elapsedMs = performance.now() - start;
      const used = process.cpuUsage(cpu);
      const cpuMs = (used.user + used.system) / 1000;
      return { status: failure ? "failed" : "complete", ...(failure ? { error: failure.message } : {}),
        ...(retainSamples ? { samples } : {}), requests: times.length, elapsedMs, requestsPerSecond: times.length * 1000 / elapsedMs,
        p50Ms: quantile(times, 0.5), p95Ms: quantile(times, 0.95), p99Ms: quantile(times, 0.99),
        countLimited: dispatched === count, connectionsCreated: connections - connectionsBefore,
        connectionsBefore, reusedRequests: reused, generatorCpuMs: cpuMs,
        generatorCpuCores: cpuMs / elapsedMs, generatorSaturationSuspected: cpuMs / elapsedMs >= 0.8 };
    }
    try {
      const warmup = await run(typeof warmupLimits === "number" ? { count: warmupLimits } : warmupLimits);
      if (warmup.error) return { status: "failed", error: warmup.error, warmup };
      return { ...await run(limits), warmup };
    } finally { agent.destroy(); }
  }
}
