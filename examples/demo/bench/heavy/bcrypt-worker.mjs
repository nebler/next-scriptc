import { readFile, writeFile } from "node:fs/promises";
import { createClient, quantile } from "./client.mjs";
import { spec, metadata } from "./fixtures.mjs";
const { target, expected } = JSON.parse(await readFile("bcrypt-job.json"));
const client = createClient({
  secret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
  budget: 10,
});
const s = spec("bcrypt", 10);
s.expected = expected;
const pool = client.agent(target.url, 1);
const result = {
  status: "running",
  method: "C1/CPU share the same three measured requests, 1 warmup; no C16",
  variant: "native",
  ...metadata(s),
  samples: [],
  cpu: { attempts: [], accepted: [] },
};
async function save() {
  result.requestsIssued = client.issued;
  await writeFile("bcrypt-result.json", JSON.stringify(result, null, 2) + "\n");
}
async function diagnostic() {
  return client.request(
    target.url,
    { path: target.prefix + "diagnostics", diagnostic: true },
    pool,
  );
}
try {
  await save();
  await client.request(target.url, s, pool);
  for (let i = 0; i < 3; i++) {
    const before = await diagnostic();
    const response = await client.request(target.url, s, pool);
    const after = await diagnostic();
    if (before.body.instance !== after.body.instance)
      throw new Error("Instance token changed; no budget to retry");
    const deltaUs =
      after.body.cpu.user +
      after.body.cpu.system -
      before.body.cpu.user -
      before.body.cpu.system;
    if (!Number.isFinite(deltaUs) || deltaUs < 0)
      throw new Error("Invalid CPU counter");
    result.samples.push(response);
    result.cpu.attempts.push({
      before,
      after,
      count: 1,
      deltaUs,
      msPerRequest: deltaUs / 1000,
      accepted: true,
    });
    result.cpu.accepted.push(deltaUs / 1000);
    await save();
  }
  const times = result.samples.map((r) => r.ms);
  result.sequential = {
    status: "complete",
    requests: 3,
    p50Ms: quantile(times, 0.5),
    p95Ms: quantile(times, 0.95),
    samplesMs: times,
  };
  result.cpu.status = "complete";
  result.cpu.medianMs = quantile(result.cpu.accepted, 0.5);
  result.status = "complete";
} catch (e) {
  result.status = "failed";
  result.error = e.message;
  process.exitCode = 1;
} finally {
  pool.destroy();
  await save();
  console.log(result.status, result.sequential?.p50Ms, result.cpu.medianMs);
}
