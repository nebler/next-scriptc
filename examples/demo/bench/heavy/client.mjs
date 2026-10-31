import http from "node:http";
import https from "node:https";
import { digest } from "./fixtures.mjs";
export const quantile = (values, p) =>
  values.length
    ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1]
    : null;
export function createClient({
  secret,
  budget = 20000,
  deadlineMs = 180000,
} = {}) {
  let issued = 0;
  function agent(base, concurrency) {
    const module = base.startsWith("https:") ? https : http;
    return new module.Agent({ keepAlive: true, maxSockets: concurrency });
  }
  function request(base, spec, pool) {
    if (issued >= budget) throw new Error("Invocation budget exhausted");
    issued++;
    return new Promise((resolve, reject) => {
      const module = base.startsWith("https:") ? https : http;
      const start = performance.now();
      let timer;
      const req = module.request(
        new URL(spec.path, base),
        {
          agent: pool,
          method: spec.method ?? "GET",
          headers: {
            "accept-encoding": "identity",
            ...spec.headers,
            ...(spec.body ? { "content-length": spec.body.length } : {}),
            ...(secret ? { "x-vercel-protection-bypass": secret } : {}),
          },
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("error", reject);
          res.on("aborted", () => reject(new Error("Response aborted")));
          res.on("end", () => {
            clearTimeout(timer);
            const ms = performance.now() - start;
            const body = Buffer.concat(chunks);
            try {
              if (res.statusCode !== (spec.status ?? 200))
                throw new Error(
                  `HTTP ${res.statusCode}; route=${spec.path}; platform=${res.headers["x-vercel-error"] ?? "absent"}; request=${res.headers["x-vercel-id"] ?? "absent"}`,
                );
              if (
                ["HIT", "STALE", "PRERENDER"].includes(
                  res.headers["x-vercel-cache"],
                )
              )
                throw Object.assign(new Error("CDN hit on dynamic route"), {
                  correctness: true,
                });
              if (
                spec.responseType &&
                res.headers["content-type"]?.split(";")[0] !== spec.responseType
              )
                throw Object.assign(
                  new Error("Response representation changed"),
                  { correctness: true },
                );
              if (res.headers["cache-control"] !== "no-store")
                throw Object.assign(new Error("Unexpected cache-control"), {
                  correctness: true,
                });
              const hash = digest(body);
              if (spec.expected && hash !== spec.expected)
                throw Object.assign(
                  new Error(`Digest mismatch: ${spec.path}`),
                  { correctness: true },
                );
              resolve({
                ms,
                digest: hash,
                bytes: body.length,
                reusedSocket: req.reusedSocket,
                ...(spec.diagnostic ? { body: JSON.parse(body) } : {}),
                headers: Object.fromEntries(
                  [
                    "x-vercel-id",
                    "x-vercel-cache",
                    "content-type",
                    "cache-control",
                    "x-next-scriptc",
                    "x-vector-init-ms",
                    "server-timing",
                    "x-vector-cpu-us",
                    "x-vector-rss",
                    "x-vector-instance",
                  ]
                    .filter((k) => res.headers[k] !== undefined)
                    .map((k) => [k, res.headers[k]]),
                ),
              });
            } catch (e) {
              reject(e);
            }
          });
        },
      );
      timer = setTimeout(
        () =>
          req.destroy(new Error(`Absolute request deadline ${deadlineMs} ms`)),
        deadlineMs,
      );
      req.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      req.end(spec.body);
    });
  }
  async function window(
    base,
    spec,
    concurrency,
    warmup,
    limits,
    around = async (fn) => ({ result: await fn() }),
  ) {
    const pool = agent(base, concurrency);
    let connections = 0;
    const create = pool.createConnection.bind(pool);
    pool.createConnection = (...args) => {
      connections++;
      return create(...args);
    };
    async function run({ count, durationMs }) {
      let dispatched = 0,
        failure,
        reused = 0;
      const times = [];
      const before = connections;
      const cpu = process.cpuUsage();
      const start = performance.now();
      await Promise.all(
        Array.from({ length: concurrency }, async () => {
          while (
            !failure &&
            dispatched < count &&
            performance.now() - start < (durationMs ?? Infinity)
          ) {
            dispatched++;
            try {
              const r = await request(base, spec, pool);
              times.push(r.ms);
              reused += Number(r.reusedSocket);
            } catch (e) {
              failure ??= e;
            }
          }
        }),
      );
      const elapsedMs = performance.now() - start;
      const used = process.cpuUsage(cpu);
      const cpuMs = (used.user + used.system) / 1000;
      return {
        status: failure ? "failed" : "complete",
        ...(failure
          ? {
              error: failure.message,
              correctness: Boolean(failure.correctness),
            }
          : {}),
        dispatched,
        requests: times.length,
        elapsedMs,
        p50Ms: quantile(times, 0.5),
        p95Ms: quantile(times, 0.95),
        requestsPerSecond: (times.length * 1000) / elapsedMs,
        countLimited: dispatched === count,
        connectionsCreated: connections - before,
        reusedRequests: reused,
        generatorCpuMs: cpuMs,
        generatorCpuCores: cpuMs / elapsedMs,
        generatorSaturationSuspected: cpuMs / elapsedMs >= 0.8,
        samplesMs: times,
      };
    }
    try {
      const warm = await run(
        typeof warmup === "number" ? { count: warmup } : warmup,
      );
      if (warm.error)
        return {
          status: "failed",
          warmup: warm,
          error: warm.error,
          correctness: warm.correctness,
        };
      const measured = await around(() => run(limits));
      return {
        ...measured.result,
        warmup: warm,
        accounting: measured.accounting,
      };
    } finally {
      pool.destroy();
    }
  }
  return {
    agent,
    request,
    window,
    get issued() {
      return issued;
    },
  };
}
