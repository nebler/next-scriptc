// Runs in the Linux iad1 generator; job.json supplies inspected immutable previews.
import { readFile, writeFile } from "node:fs/promises";
import { workloads, metadata, spec, sizes, edgeCases } from "./fixtures.mjs";
import { createClient, quantile } from "./client.mjs";
const job = JSON.parse(await readFile("heavy-job.json"));
const client = createClient({
  secret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
  budget: job.requestBudget ?? 20000,
});
const report = {
  status: "running",
  startedAt: new Date().toISOString(),
  node: process.version,
  protocol: {
    revision: 2,
    sequentialWarmup: 20,
    sequentialCount: 200,
    concurrentWarmup: { count: 400, durationMs: 2000 },
    concurrent: { count: 400, durationMs: 3000 },
    bcrypt: "1+3 sequential; one 16-request concurrent batch",
  },
  targets: job.targets,
  rows: [],
  correctness: [],
};
const references = new Map();
async function save() {
  report.requestsIssued = client.issued;
  await writeFile("heavy-hosted.json", JSON.stringify(report, null, 2) + "\n");
}
function remap(s, t) {
  return { ...s, path: s.path.replace("/api/heavy/", t.prefix) };
}
async function diagnostic(t, pool) {
  return client.request(
    t.url,
    { path: t.prefix + "diagnostics", diagnostic: true },
    pool,
  );
}
try {
  // Correctness first for every hosted size; larger upload fixtures exceed platform limit.
  for (const s of [
    ...workloads(true),
    spec("thumbnail", 512),
    ...edgeCases(),
  ]) {
    const results = [];
    for (const t of job.targets) {
      const pool = client.agent(t.url, 1);
      try {
        results.push({
          variant: t.variant,
          ...(await client.request(t.url, remap(s, t), pool)),
        });
      } finally {
        pool.destroy();
      }
    }
    if (!results.every((r) => r.digest === results[0].digest))
      throw Object.assign(new Error(`Three-way hosted parity: ${s.path}`), {
        correctness: true,
      });
    if (s.size) references.set(`${s.id}:${s.size}`, results[0].digest);
    report.correctness.push({
      ...(s.size ? metadata(s) : { path: s.path, status: s.status }),
      results,
    });
    await save();
  }
  for (const t of job.targets) {
    const p = client.agent(t.url, 1);
    try {
      t.diagnosticBefore = await diagnostic(t, p);
    } finally {
      p.destroy();
    }
    for (const original of workloads(true)) {
      const s = remap(original, t);
      s.expected = references.get(`${s.id}:${s.size}`);
      const row = {
        variant: t.variant,
        ...metadata(original),
        status: "running",
      };
      report.rows.push(row);
      await save();
      try {
        row.sequential = await client.window(
          t.url,
          s,
          1,
          s.id === "bcrypt" ? 1 : 20,
          { count: s.id === "bcrypt" ? 3 : 200 },
        );
        if (row.sequential.error)
          throw Object.assign(new Error(row.sequential.error), {
            correctness: row.sequential.correctness,
          });
        row.concurrent = await client.window(
          t.url,
          s,
          16,
          s.id === "bcrypt" ? 0 : { count: 400, durationMs: 2000 },
          s.id === "bcrypt" ? { count: 16 } : { count: 400, durationMs: 3000 },
        );
        if (row.concurrent.error)
          throw Object.assign(new Error(row.concurrent.error), {
            correctness: row.concurrent.correctness,
          });
        row.cpu = { attempts: [], accepted: [] };
        const pool = client.agent(t.url, 1);
        try {
          const count = s.id === "bcrypt" ? 1 : 20;
          // Sequential warm window has already warmed the route; dedicated CPU connection warms once.
          await client.request(t.url, s, pool);
          for (
            let attempt = 0;
            attempt < 5 && row.cpu.accepted.length < 3;
            attempt++
          ) {
            const before = await diagnostic(t, pool);
            let reused = 0;
            const start = performance.now();
            for (let i = 0; i < count; i++)
              reused += Number(
                (await client.request(t.url, s, pool)).reusedSocket,
              );
            const after = await diagnostic(t, pool);
            const elapsedMs = performance.now() - start;
            const delta =
              after.body.cpu.user +
              after.body.cpu.system -
              before.body.cpu.user -
              before.body.cpu.system;
            if (!Number.isFinite(delta) || delta < 0)
              throw new Error("Nonmonotonic/nonfinite process CPU");
            const entry = {
              before,
              after,
              count,
              reused,
              elapsedMs,
              deltaUs: delta,
              msPerRequest: delta / count / 1000,
              accepted: before.body.instance === after.body.instance,
            };
            row.cpu.attempts.push(entry);
            if (entry.accepted) row.cpu.accepted.push(entry.msPerRequest);
            await save();
          }
          row.cpu.status =
            row.cpu.accepted.length === 3 ? "complete" : "unavailable";
          row.cpu.medianMs =
            row.cpu.status === "complete"
              ? quantile(row.cpu.accepted, 0.5)
              : null;
        } finally {
          pool.destroy();
        }
        row.status = "complete";
      } catch (e) {
        row.status = "failed";
        row.error = e.message;
        if (e.correctness) throw e;
      }
      console.log(
        t.variant,
        s.id,
        row.sequential?.p50Ms,
        row.concurrent?.requestsPerSecond,
      );
      await save();
    }
    const last = client.agent(t.url, 1);
    try {
      t.diagnosticAfter = await diagnostic(t, last);
    } finally {
      last.destroy();
    }
  }
  report.status = report.rows.some((r) => r.status !== "complete")
    ? "failed"
    : "complete";
  if (report.status !== "complete") process.exitCode = 1;
} catch (e) {
  report.status = "failed";
  report.error = e.stack;
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await save();
}
