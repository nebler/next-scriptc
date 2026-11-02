import { readArtifact } from '../../../../research/lib/artifact.mjs';
// Read-only arithmetic/coverage audit. Never supplies replacement measurements.
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { quantile } from "./client.mjs";
const read = async (p) => {
  try {
    return JSON.parse(readArtifact("research/benchmarks/" + p));
  } catch {
    return null;
  }
};
const self = await read("heavy-self-path-recovery.json"),
  full = await read("heavy-vercel.json"),
  go = await read("heavy-vercel-go.json"),
  bcrypt = await read("heavy-vercel-native-bcrypt.json");
const audit = {
  self: [],
  hosted: [],
  cpu: [],
  rss: [],
  coverage: [],
  cost: {},
};
function window(w, label) {
  if (!w) return;
  assert.equal(w.requests, w.samplesMs.length, label);
  assert.equal(w.p50Ms, quantile(w.samplesMs, 0.5), label);
  assert.equal(w.p95Ms, quantile(w.samplesMs, 0.95), label);
  assert.ok(w.dispatched >= w.requests);
  if (w.status === "complete") assert.equal(w.dispatched, w.requests);
  if (w.accounting && w.status === "complete") {
    const a = w.accounting;
    assert.ok(Math.abs(a.cpuMsPerRequest * w.requests - a.cpuMs) < 1e-7);
    assert.ok(Math.abs(a.after.cpuMs - a.before.cpuMs - a.cpuMs) < 1e-7);
  }
  if (w.warmup) window(w.warmup, label + " warmup");
}
assert.ok(
  self.artifacts.nativeManifest.routes.every(
    (r) => (r.optimization ?? "release") === "release",
  ),
);
for (const v of self.variants) {
  for (const r of v.rows) {
    window(r.sequential, `self ${v.variant} ${r.id} C1`);
    window(r.concurrent, `self ${v.variant} ${r.id} C16`);
  }
  audit.self.push({
    variant: v.variant,
    cases: v.parity.cases,
    cpuValidation: v.cpuValidation,
  });
  assert.equal(v.cpuValidation.status, "complete");
  for (const r of v.parity.rows)
    assert.equal(
      r.results[0].headers["x-next-scriptc"],
      v.variant === "native" ? "native" : undefined,
    );
}
for (let i = 0; i < self.variants[0].parity.rows.length; i++) {
  const hashes = self.variants.map((v) => v.parity.rows[i].results[0].digest);
  assert.equal(new Set(hashes).size, 1);
}
for (const [label, data] of [
  ["primary", full],
  ["go-only", go],
  [
    "bcrypt-diagnostic",
    bcrypt
      ? {
          status: bcrypt.status,
          requestsIssued: bcrypt.requestsIssued,
          correctness: [],
          rows: [{ ...bcrypt, id: "bcrypt" }],
        }
      : null,
  ],
]) {
  if (!data) continue;
  for (const row of data.rows) {
    if (label === "bcrypt-diagnostic") {
      assert.equal(row.samples.length, 3);
      assert.equal(
        row.sequential.p50Ms,
        quantile(
          row.samples.map((s) => s.ms),
          0.5,
        ),
      );
      assert.equal(
        row.sequential.p95Ms,
        quantile(
          row.samples.map((s) => s.ms),
          0.95,
        ),
      );
      const expected = full.correctness.find(
        (r) => r.id === "bcrypt" && r.size === 10,
      ).results[0].digest;
      for (const response of row.samples)
        assert.equal(response.digest, expected);
    } else window(row.sequential, `${label} ${row.variant} ${row.id} C1`);
    window(row.concurrent, `${label} ${row.variant} ${row.id} C16`);
    for (const attempt of row.cpu?.attempts ?? []) {
      const a = attempt.before.body,
        b = attempt.after.body;
      for (const [boundary, body] of [
        ["before", a],
        ["after", b],
      ]) {
        const match = body.status.match(/^VmRSS:\s+(\d+)\s+kB/m);
        assert.ok(match, "RSS diagnostic procfs field");
        const procRss = Number(match[1]) * 1024;
        const differenceBytes = body.rss - procRss;
        assert.ok(
          Math.abs(differenceBytes) < 1048576,
          "RSS/procfs consistency",
        );
        audit.rss.push({
          run: label,
          variant: row.variant,
          workload: row.id,
          boundary,
          rss: body.rss,
          procRss,
          differenceBytes,
        });
      }
      const deltaUs = b.cpu.user + b.cpu.system - a.cpu.user - a.cpu.system;
      assert.equal(deltaUs, attempt.deltaUs);
      assert.ok(
        Math.abs(attempt.msPerRequest - deltaUs / 1000 / attempt.count) < 1e-8,
      );
      assert.equal(attempt.accepted, a.instance === b.instance);
      const procUs =
        (b.procCpuTicks.user +
          b.procCpuTicks.system -
          a.procCpuTicks.user -
          a.procCpuTicks.system) *
        10000;
      const differenceUs = deltaUs - procUs;
      if (attempt.accepted)
        assert.ok(
          Math.abs(differenceUs) < 50000,
          "Hosted counter/procfs consistency",
        );
      audit.cpu.push({
        run: label,
        variant: row.variant,
        workload: row.id,
        accepted: attempt.accepted,
        deltaUs,
        procUs,
        differenceUs,
      });
    }
    audit.coverage.push({
      run: label,
      variant: row.variant,
      workload: row.id,
      rowStatus: row.status,
      sequential: row.sequential?.status,
      concurrent: row.concurrent?.status,
      cpu: row.cpu?.status ?? (row.cpu ? "interrupted" : "unreached"),
    });
  }
  audit.hosted.push({
    run: label,
    workerStatus: data.status,
    requestsLastSaved: data.requestsIssued,
    correctnessCases: data.correctness.length,
  });
}
for (const record of full.correctness)
  assert.equal(new Set(record.results.map((r) => r.digest)).size, 1);
if (go) {
  for (const record of go.correctness.filter((r) => r.size)) {
    const reference = full.correctness.find(
      (r) => r.id === record.id && r.size === record.size,
    );
    assert.equal(record.results[0].digest, reference.results[0].digest);
  }
}
const controls = await Promise.all(
  [
    "heavy-self-controller.json",
    "heavy-self-setup-recovery-controller.json",
    "heavy-self-path-recovery-controller.json",
    "heavy-vercel-controller.json",
    "heavy-vercel-go-controller.json",
    "heavy-vercel-native-bcrypt-controller.json",
  ].map(read),
);
audit.cost.selfStoppedWallVcpuHours = controls
  .slice(0, 3)
  .reduce((s, d) => s + d.sandbox.observedWallVcpuHours, 0);
audit.cost.selfActiveCpuMs = controls
  .slice(0, 3)
  .reduce((s, d) => s + d.sandbox.activeCpuDurationMs, 0);
audit.cost.hostedStoppedWallVcpuHours = controls
  .slice(3)
  .reduce((s, d) => s + (d?.sandbox?.observedWallVcpuHours ?? 0), 0);
audit.cost.hostedActiveCpuMs = controls
  .slice(3)
  .reduce((s, d) => s + (d?.sandbox?.activeCpuDurationMs ?? 0), 0);
audit.cost.previewDeployments = 2;
audit.cost.hostedPrimaryLastSaved = full.requestsIssued;
audit.cost.hostedPrimaryUnknownRequestAllowance = 22;
audit.cost.hostedAllocationProbes = 3;
audit.cost.hostedGoLastSaved = go?.requestsIssued ?? 0;
audit.cost.hostedBcryptDiagnosticLastSaved = bcrypt?.requestsIssued ?? 0;
audit.cost.hostedAttemptUpperBound =
  full.requestsIssued +
  22 +
  3 +
  (go?.requestsIssued ?? controls[4]?.requestsCharged ?? 0) +
  (bcrypt?.requestsIssued ?? controls[5]?.requestsCharged ?? 0);
assert.ok(audit.cost.selfStoppedWallVcpuHours <= 0.6);
assert.ok(audit.cost.hostedStoppedWallVcpuHours <= 0.35);
assert.ok(audit.cost.hostedAttemptUpperBound <= 20000);
audit.status = "complete";
await writeFile(
  "research/benchmarks/heavy-audit.json",
  JSON.stringify(audit, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    { status: audit.status, cost: audit.cost, cpuWindows: audit.cpu.length },
    null,
    2,
  ),
);
