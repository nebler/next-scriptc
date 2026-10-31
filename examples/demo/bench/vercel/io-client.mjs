// Transport and fixed-arrival generator for the realistic I/O suite. Supports
// loopback HTTP for tests; hosted measurements use HTTPS from iad1.
import http from "node:http";
import https from "node:https";
import { workloads, spec, digest } from "../io/fixtures.mjs";
import { cpuDelta } from "./cpu.mjs";

export const ioProtocol = { revision: 1, warmup: 10, sequentialCount: 80, concurrentWarmup: 32, concurrentCount: 256,
  concurrency: 16, requestTimeoutMs: 15000, cpuRequests: 100, cpuWindows: 3, cpuMaxAttempts: 5,
  openLoopSeconds: 30, steadyRate: 20, burstRate: 60, maxSockets: 128, maxInFlight: 256 };
export const quantile = (values, q) => values.length ? [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * q) - 1)] : null;
export function stats(values) { return { p50Ms: quantile(values, .5), p95Ms: quantile(values, .95), p99Ms: quantile(values, .99) }; }
const correctness = (message) => Object.assign(new Error(message), { correctness: true });

export function createIoClient({ secret, budget = 12000, timeoutMs = ioProtocol.requestTimeoutMs } = {}) {
  let issued = 0;
  function agent(base, maxSockets) { return new (new URL(base).protocol === "https:" ? https : http).Agent({ keepAlive: true, maxSockets }); }
  async function request(base, fixture, pool) {
    if (issued >= budget) throw new Error("I/O invocation budget exhausted");
    issued++;
    const started = performance.now();
    return new Promise((resolve, reject) => {
      let timer;
      const url = new URL(fixture.path, base);
      const transport = url.protocol === "https:" ? https : http;
      const req = transport.request(url, { agent: pool, method: fixture.method ?? "GET", headers: {
        "accept-encoding": "identity", ...fixture.headers,
        ...(fixture.body === undefined ? {} : { "content-length": Buffer.byteLength(fixture.body) }),
        ...(secret ? { "x-vercel-protection-bypass": secret } : {}),
      } }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        const fail = (error) => { clearTimeout(timer); reject(error); };
        res.on("error", fail); res.on("aborted", () => fail(new Error("Response aborted")));
        res.on("end", () => {
          clearTimeout(timer);
          const ms = performance.now() - started;
          const body = Buffer.concat(chunks);
          const headers = Object.fromEntries(["x-vercel-id", "x-vercel-cache", "server-timing", "content-type", "cache-control"].filter((key) => res.headers[key] !== undefined).map((key) => [key, res.headers[key]]));
          try {
            if (res.statusCode !== (fixture.status ?? 200)) throw correctness(`HTTP ${res.statusCode}; expected ${fixture.status ?? 200}`);
            if (["HIT", "STALE", "PRERENDER"].includes(res.headers["x-vercel-cache"])) throw correctness("Dynamic request served from CDN");
            if (res.headers["cache-control"] !== "no-store") throw correctness("Missing no-store response header");
            if (!String(res.headers["content-type"]).startsWith("application/json")) throw correctness("Unexpected content-type");
            const hash = digest(body);
            if (fixture.expected && fixture.expected !== hash) throw correctness("Response bytes differ from independent fixture");
            resolve({ ms, digest: hash, bytes: body.length, headers, reusedSocket: req.reusedSocket,
              ...(fixture.diagnostic ? { body: JSON.parse(body) } : {}) });
          } catch (error) { error.ms = ms; error.headers = headers; reject(error); }
        });
      });
      timer = setTimeout(() => req.destroy(new Error("Absolute request deadline")), timeoutMs);
      req.on("error", (error) => { clearTimeout(timer); error.ms ??= performance.now() - started; reject(error); });
      req.end(fixture.body);
    });
  }
  return { request, agent, get issued() { return issued; } };
}

export function arrivalSchedule() {
  const arrivals = [];
  for (let second = 0; second < ioProtocol.openLoopSeconds; second++) {
    const rate = [8, 9, 18, 19, 28, 29].includes(second) ? ioProtocol.burstRate : ioProtocol.steadyRate;
    for (let j = 0; j < rate; j++) {
      const i = arrivals.length, slot = i % 10;
      arrivals.push({ index: i, scheduledMs: second * 1000 + j * 1000 / rate, workload: slot < 7 ? "orders-get" : slot < 9 ? "orders-post" : "payment" });
    }
  }
  return arrivals;
}

export async function openLoop(client, base, { arrivals = arrivalSchedule(), maxInFlight = ioProtocol.maxInFlight } = {}) {
  const pool = client.agent(base, ioProtocol.maxSockets);
  const samples = [], tasks = [];
  let inFlight = 0, peakInFlight = 0, connections = 0, fatal = false;
  const create = pool.createConnection.bind(pool);
  pool.createConnection = (...args) => { connections++; return create(...args); };
  const start = performance.now(), cpu = process.cpuUsage();
  try {
    for (const arrival of arrivals) {
      if (fatal) { samples.push({ ...arrival, status: "cancelled", error: "cancelled after correctness failure", scheduledLatencyMs: null, dispatchLagMs: null }); continue; }
      let wait;
      while ((wait = start + arrival.scheduledMs - performance.now()) > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      if (fatal) { samples.push({ ...arrival, status: "cancelled", error: "cancelled after correctness failure", scheduledLatencyMs: null, dispatchLagMs: null }); continue; }
      const dispatchMs = performance.now() - start;
      const row = { ...arrival, dispatchMs, dispatchLagMs: Math.max(0, dispatchMs - arrival.scheduledMs) };
      samples.push(row);
      if (inFlight >= maxInFlight) { Object.assign(row, { status: "rejected", error: "in-flight safety cap", scheduledLatencyMs: null }); continue; }
      inFlight++; peakInFlight = Math.max(peakInFlight, inFlight);
      tasks.push((async () => {
        try {
          const response = await client.request(base, spec(arrival.workload, arrival.index, "mixed"), pool);
          Object.assign(row, { status: "complete", ...response, scheduledLatencyMs: performance.now() - start - arrival.scheduledMs });
        } catch (error) {
          if (error.correctness) fatal = true;
          Object.assign(row, { status: "failed", error: error.message, correctness: Boolean(error.correctness), serviceMs: error.ms,
            scheduledLatencyMs: performance.now() - start - arrival.scheduledMs, headers: error.headers });
        } finally { inFlight--; }
      })());
    }
    await Promise.all(tasks);
    const elapsedMs = performance.now() - start, used = process.cpuUsage(cpu), errors = samples.filter((s) => s.status !== "complete").length;
    const completedLatencies = samples.filter((s) => s.scheduledLatencyMs !== null).map((s) => s.scheduledLatencyMs);
    return { status: errors ? "failed" : "complete", planned: arrivals.length, issued: samples.filter((s) => s.status !== "rejected" && s.status !== "cancelled").length,
      errors, errorRate: errors / arrivals.length, elapsedMs, peakInFlight, connectionsCreated: connections,
      scheduledLatency: stats(completedLatencies), scheduledLatencyCoverage: completedLatencies.length,
      successLatency: stats(samples.filter((s) => s.status === "complete").map((s) => s.scheduledLatencyMs)),
      dispatchLag: stats(samples.filter((s) => s.dispatchLagMs !== null).map((s) => s.dispatchLagMs)), generatorCpuMs: (used.user + used.system) / 1000,
      generatorCpuCores: (used.user + used.system) / 1000 / elapsedMs, generatorSaturationSuspected: (used.user + used.system) / 1000 / elapsedMs >= .8,
      samples };
  } finally { await Promise.allSettled(tasks); pool.destroy(); }
}

export async function closedLoop(client, base, workload, concurrency, warmups, count, phase) {
  const pool = client.agent(base, concurrency);
  let connections = 0;
  const create = pool.createConnection.bind(pool);
  pool.createConnection = (...args) => { connections++; return create(...args); };
  async function run(limit, label) {
    let dispatched = 0, failure;
    const samples = [], cpu = process.cpuUsage(), start = performance.now(), before = connections;
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (!failure && dispatched < limit) {
        const index = dispatched++;
        try { samples.push({ index, status: "complete", ...await client.request(base, spec(workload, index, label), pool) }); }
        catch (error) { failure ??= error; samples.push({ index, status: "failed", error: error.message, ms: error.ms }); }
      }
    }));
    const elapsedMs = performance.now() - start, used = process.cpuUsage(cpu), success = samples.filter((s) => s.status === "complete");
    return { status: failure ? "failed" : "complete", ...(failure ? { error: failure.message, correctness: Boolean(failure.correctness) } : {}),
      planned: limit, dispatched, requests: success.length, elapsedMs, requestsPerSecond: failure ? null : success.length * 1000 / elapsedMs,
      ...stats(success.map((s) => s.ms)), generatorCpuMs: (used.user + used.system) / 1000,
      generatorCpuCores: (used.user + used.system) / 1000 / elapsedMs, generatorSaturationSuspected: (used.user + used.system) / 1000 / elapsedMs >= .8,
      connectionsCreated: connections - before, reusedRequests: success.filter((s) => s.reusedSocket).length, samples };
  }
  try {
    const warmup = await run(warmups, `${phase}-w`);
    if (warmup.status !== "complete") return { status: "failed", error: warmup.error, correctness: warmup.correctness, warmup };
    return { ...await run(count, phase), warmup };
  } finally { pool.destroy(); }
}

export async function processCpu(client, base, workload) {
  const pool = client.agent(base, 1), attempts = [];
  const diagnostic = { path: "/api/app/diagnostics/process", diagnostic: true };
  try {
    for (let i = 0; i < ioProtocol.warmup; i++) await client.request(base, spec(workload, i, "cpu-w"), pool);
    for (let i = 0; i < ioProtocol.cpuMaxAttempts && attempts.filter((a) => a.status === "accepted").length < ioProtocol.cpuWindows; i++) {
      const attempt = { status: "running", requests: 0, attempt: i + 1 };
      attempts.push(attempt);
      try {
        attempt.before = await client.request(base, diagnostic, pool);
        for (let j = 0; j < ioProtocol.cpuRequests; j++) { await client.request(base, spec(workload, j, `cpu-${i}`), pool); attempt.requests++; }
        attempt.after = await client.request(base, diagnostic, pool);
        Object.assign(attempt, cpuDelta(attempt.before.body, attempt.after.body, attempt.requests));
      } catch (error) { Object.assign(attempt, { status: "failed", error: error.message }); throw error; }
    }
    const accepted = attempts.filter((a) => a.status === "accepted");
    return { status: accepted.length === ioProtocol.cpuWindows ? "complete" : "unavailable", attempts,
      medianMsPerRequest: accepted.length === ioProtocol.cpuWindows ? quantile(accepted.map((a) => a.cpuMsPerRequest), .5) : null };
  } catch (error) { return { status: "failed", error: error.message, attempts }; }
  finally { pool.destroy(); }
}

export async function measureIo(deployment, { secret, mode = "full", fresh = false, budget = 12000, reset } = {}) {
  const client = createIoClient({ secret, budget });
  const result = { ...deployment, mode, fresh, confirmedCold: null, protocol: ioProtocol, rows: [], status: "running", startedAt: new Date().toISOString() };
  const pool = client.agent(deployment.url, 1);
  async function diagnostic(path) { return client.request(deployment.url, { path, diagnostic: true }, pool); }
  try {
    if (reset) result.seed = await reset();
    // This request must remain first on an untouched hosted preview.
    result.first = await client.request(deployment.url, spec("orders-get", 0, "first"), pool);
    result.memoryAfterFirst = await diagnostic("/api/app/diagnostics/process");
    if (mode === "cold") {
      result.warm = await closedLoop(client, deployment.url, "orders-get", 1, 10, 40, "cold");
      if (result.warm.status !== "complete") throw new Error(result.warm.error);
    } else {
      for (const workload of workloads) {
        const row = { workload, status: "running" }; result.rows.push(row);
        row.first = workload === "orders-get" ? result.first : await client.request(deployment.url, spec(workload, 0, "route-first"), pool);
        row.sequential = await closedLoop(client, deployment.url, workload, 1, ioProtocol.warmup, ioProtocol.sequentialCount, "c1");
        if (row.sequential.status !== "complete") throw new Error(row.sequential.error);
        row.concurrent = await closedLoop(client, deployment.url, workload, 16, ioProtocol.concurrentWarmup, ioProtocol.concurrentCount, "c16");
        if (row.concurrent.status !== "complete") throw new Error(row.concurrent.error);
        row.status = "complete";
      }
      result.openLoop = await openLoop(client, deployment.url);
      if (result.openLoop.status !== "complete") throw new Error("Open-loop failures (all scheduled outcomes retained)");
      result.memoryAfterLoad = await diagnostic("/api/app/diagnostics/process");
      result.redisRtt = [];
      for (let i = 0; i < 20; i++) result.redisRtt.push(await diagnostic("/api/app/diagnostics/redis"));
      for (const row of result.rows) {
        row.cpu = await processCpu(client, deployment.url, row.workload);
        if (row.cpu.status === "failed") throw new Error(row.cpu.error);
      }
    }
    result.status = result.rows.some((r) => r.cpu?.status === "unavailable") ? "incomplete" : "complete";
  } catch (error) { result.status = "failed"; result.error = error.message;
    const running = result.rows.find((row) => row.status === "running");
    if (running) { running.status = "failed"; running.error = error.message; }
  }
  finally { pool.destroy(); result.requestsIssued = client.issued; result.finishedAt = new Date().toISOString(); }
  return result;
}
