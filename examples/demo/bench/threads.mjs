// Threads are a synthetic, internal compute / sharing microbenchmark, never a
// headline application result. Invoked by run.mjs, not against a foreign server.
import assert from "node:assert/strict";
import path from "node:path";
import { start, ready, stop, finish, portsFree } from "./processes.mjs";
import { request, digest, median } from "./load.mjs";

export async function threadsBenchmark({ demo, manifest, profile, cpus, record }) {
  const { regionCount, scenarioCount, monthCount, totalsLength } = await import("../app/api/report/orders.ts");
  const dimensions = { regionCount, scenarioCount, monthCount, totalsLength };
  const index = manifest.routes.findIndex((route) => route.pattern === "/api/report");
  if (index < 0) throw new Error("Threads benchmark requires /api/report in the native manifest");
  const route = manifest.routes[index];
  const port = route.port;
  const base = `http://127.0.0.1:${port}`;
  let expected;
  for (const variant of ["node-objects-clone", "node-sab", "native-published-objects"]) {
    console.log(`threads/${variant}: estimated 20–60 s; same-process 1/2/4-worker sweep`);
    let samples;
    if (variant === "node-sab") {
      samples = await finish(start(process.execPath, [path.join(demo, "bench/report-sab.mjs"),
        JSON.stringify({ counts: profile.threads, repeats: profile.repeats, dimensions })], { cwd: demo, cpus }));
    } else {
      await portsFree([port]);
      const native = variant.startsWith("native");
      const proc = start(native ? path.join(demo, ".next/scriptc", route.binary) : process.execPath,
        native ? [] : [path.join(demo, ".next/scriptc", `entry-${index}.ts`)],
        { cwd: demo, cpus, env: { PORT: String(port) } });
      try {
        await ready(proc, base, { path: "/api/report?threads=1" });
        samples = [];
        for (const threads of profile.threads) {
          const spec = { path: `/api/report?threads=${threads}` };
          // Two complete untimed jobs at every count. The first count also had
          // readiness, so explicitly perform the same two jobs for SAB below.
          for (let warmup = 0; warmup < 2; warmup++) await request(base, spec);
          for (let repeat = 0; repeat < profile.repeats; repeat++) {
            const sample = JSON.parse((await request(base, spec)).body);
            assert.equal(sample.workers, threads);
            assert.equal(sample.sharedByReference, native);
            samples.push({ ...sample, threads, repeat });
          }
        }
      } finally { await stop(proc); await portsFree([port]); }
    }
    for (const sample of samples) {
      expected ??= sample.result;
      assert.deepEqual(sample.result, expected, `Thread totals differ: ${variant}/${sample.threads}`);
      const { result, ...metrics } = sample;
      record({ metric: "threads", scope: "internal-worker-dispatch-and-reduction", category: "synthetic",
        variant, ...metrics, resultDigest: digest(Buffer.from(JSON.stringify(result))) });
    }
    const rss = (count) => median(samples.filter((s) => s.threads === count).map((s) => s.rss));
    const rss1 = rss(1), rss4 = rss(4);
    record({ metric: "threads-memory", scope: "same-process-warmed-worker-sweep", category: "synthetic", variant,
      rss1, rss4, marginalRssPerAddedWorker: (rss4 - rss1) / 3 });
  }
}
