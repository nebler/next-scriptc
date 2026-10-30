// Threads are a synthetic, internal compute / sharing microbenchmark, never a
// headline application result. Invoked by run.mjs, not against a foreign server.
import assert from "node:assert/strict";
import path from "node:path";
import { start, ready, stop, finish, portsFree } from "./processes.mjs";
import { request, digest } from "./load.mjs";

export async function threadsBenchmark({ demo, manifest, profile, cpus, record }) {
  const { regionCount, scenarioCount, monthCount, totalsLength } = await import("../app/api/report/orders.ts");
  const dimensions = { regionCount, scenarioCount, monthCount, totalsLength };
  const index = manifest.routes.findIndex((route) => route.pattern === "/api/report");
  if (index < 0) throw new Error("Threads benchmark requires /api/report in the native manifest");
  const route = manifest.routes[index];
  const port = route.port;
  const base = `http://127.0.0.1:${port}`;
  let expected;
  for (const threads of profile.threads) {
    for (const variant of ["node-objects-clone", "node-sab", "native-published-objects"]) {
      console.log(`threads/${variant}/${threads}: fresh process, one warmup + ${profile.repeats} samples`);
      let samples;
      if (variant === "node-sab") {
        samples = await finish(start(process.execPath, [path.join(demo, "bench/report-sab.mjs"),
          JSON.stringify({ threads, repeats: profile.repeats, dimensions })], { cwd: demo, cpus }));
      } else {
        await portsFree([port]);
        const native = variant.startsWith("native");
        const proc = start(native ? path.join(demo, ".next/scriptc", route.binary) : process.execPath,
          native ? [] : [path.join(demo, ".next/scriptc", `entry-${index}.ts`)],
          { cwd: demo, cpus, env: { PORT: String(port) } });
        try {
          const spec = { path: `/api/report?threads=${threads}` };
          await ready(proc, base, spec); // Initialize dataset, pool, and one full warmup.
          samples = [];
          for (let repeat = 0; repeat < profile.repeats; repeat++) {
            const sample = JSON.parse((await request(base, spec)).body);
            assert.equal(sample.workers, threads);
            assert.equal(sample.sharedByReference, native);
            samples.push(sample);
          }
        } finally { await stop(proc); await portsFree([port]); }
      }
      for (const [repeat, sample] of samples.entries()) {
        expected ??= sample.result;
        assert.deepEqual(sample.result, expected, `Thread totals differ: ${variant}/${threads}`);
        const { result, ...metrics } = sample;
        record({ metric: "threads", scope: "internal-worker-dispatch-and-reduction", category: "synthetic",
          variant, threads, repeat, ...metrics, resultDigest: digest(Buffer.from(JSON.stringify(result))) });
      }
    }
  }
}
