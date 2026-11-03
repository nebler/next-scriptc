import http from "node:http";
import { performance } from "node:perf_hooks";
export async function load(url, concurrency, seconds) {
  const agent = new http.Agent({ keepAlive: true, maxSockets: concurrency });
  const latencies = [];
  const statuses = {};
  let bytes = 0;
  const begin = performance.now(),
    end = begin + seconds * 1000;
  async function worker() {
    while (performance.now() < end) {
      const t = performance.now();
      await new Promise((resolve, reject) => {
        http
          .get(
            url,
            {
              agent,
              headers: {
                "user-agent": "ssr-profile/1.0",
                accept: "text/html",
                "accept-encoding": "identity",
              },
            },
            (res) => {
              statuses[res.statusCode] = (statuses[res.statusCode] || 0) + 1;
              res.on("data", (b) => (bytes += b.length));
              res.on("end", resolve);
              res.on("error", reject);
            },
          )
          .on("error", reject);
      });
      latencies.push(performance.now() - t);
    }
  }
  try {
    await Promise.all(Array.from({ length: concurrency }, worker));
  } finally {
    agent.destroy();
  }
  const wallMs = performance.now() - begin;
  latencies.sort((a, b) => a - b);
  return {
    n: latencies.length,
    wallMs,
    rps: latencies.length / (wallMs / 1000),
    p50: latencies[Math.floor(latencies.length * 0.5)],
    p95: latencies[Math.floor(latencies.length * 0.95)],
    statuses,
    bytes,
    latencies,
  };
}
