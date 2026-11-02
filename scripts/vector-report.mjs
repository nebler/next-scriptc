import { readArtifact } from '../research/lib/artifact.mjs';
// Offline only: recompute every published vector cell from retained samples.
import { writeFileSync, existsSync } from "node:fs";
import { quantile } from "../examples/demo/bench/heavy/client.mjs";
const dir = new URL("../research/benchmarks/", import.meta.url);
const read = (name) => JSON.parse(readArtifact(new URL(name + ".json", dir)));
const fmt = (n) => Number.isFinite(n) ? n.toFixed(3) : "unavailable";
const mac = read("vector-scout-mac"), linux = read("vector-scout-linux");
const audit = { scout: [], routes: [], controllers: [] };
function scoutRows(kind, n) {
  const order = kind === "int8"
    ? ["node-number", "node-i32", "node-imul", "go-plain", "go-unrolled", "go-simd", "native-natural", "native-imul"]
    : ["node-float", "go-plain", "go-unrolled", "go-simd", "native-float"];
  return order.map((runtime) => {
    const values = [];
    for (const [platform, data] of [["Mac", mac], ["Linux", linux]]) {
      const runs = data.runs.filter(r => r.runtime === runtime && r.n === n && (kind === "float" ? r.kind === "float" : r.kind !== "float"));
      if (runs.length !== 2) throw new Error(`Missing ${platform}/${runtime}/${kind}/${n}`);
      const samples = runs.flatMap(r => r.times);
      const reference = data.runs.find(r => r.n === n && (kind === "float" ? r.kind === "float" : r.kind !== "float"));
      let maxError = 0;
      for (const r of runs) {
        if (JSON.stringify(r.ids) !== JSON.stringify(reference.ids)) throw new Error("IDs changed");
        for (let i = 0; i < 10; i++) {
          const error = Math.abs(r.scores[i] - reference.scores[i]);
          maxError = Math.max(maxError, error);
          if (error > (kind === "float" ? 1e-10 + 1e-12 * Math.abs(reference.scores[i]) : 0)) throw new Error("Scores changed");
        }
      }
      const p50 = quantile(samples, .5), p95 = quantile(samples, .95);
      audit.scout.push({ platform, runtime, kind, n, samples: samples.length, p50Ms: p50, p95Ms: p95, maxScoreError: maxError, peakRssBytes: Math.max(...runs.map(r => r.peakRssBytes)) });
      values.push(`${fmt(p50)} / ${fmt(p95)}`);
    }
    return `| ${runtime} | ${values.join(" | ")} |`;
  });
}
const lines = [];
for (const n of [100000, 20000]) for (const kind of ["int8", "float"]) {
  lines.push(`### ${kind}, ${n.toLocaleString("en-US")} × ${n === 100000 ? 768 : 384}`, "", "| Variant | Mac p50 / p95 ms | Linux p50 / p95 ms |", "| --- | ---: | ---: |", ...scoutRows(kind, n), "");
}
for (const [experiment, title] of [["vector-route-before", "Initial async-loop HTTP implementation (stock 0.4.6)"], ["vector-route-sync-before", "Final synchronous-kernel HTTP implementation (stock 0.4.6)"]]) if (existsSync(new URL(experiment + ".json", dir)) || existsSync(new URL(experiment + ".json.gz", dir))) {
  const before = read(experiment);
  lines.push(`### ${title}`, "", "| Variant / route | C=1 p50 / p95 ms | C=16 req/s | CPU ms/request | Tree RSS MiB |", "| --- | ---: | ---: | ---: | ---: |");
  const reference = before.variants[0]?.parity?.rows;
  for (const variant of before.variants) {
    if (variant.cpuValidation?.status !== "complete") throw new Error("CPU validation incomplete");
    if (reference && variant.parity?.rows.some((r, i) => r.results[0].digest !== reference[i].results[0].digest)) throw new Error("HTTP parity changed");
    for (const row of variant.rows) {
      const s = row.sequential, c = row.concurrent;
      for (const w of [s, c].filter(Boolean)) {
        if (w.samplesMs.length !== w.requests || quantile(w.samplesMs, .5) !== w.p50Ms || quantile(w.samplesMs, .95) !== w.p95Ms) throw new Error("HTTP percentiles/count changed");
        if (Math.abs(w.requests * 1000 / w.elapsedMs - w.requestsPerSecond) > 1e-9) throw new Error("HTTP throughput changed");
        const a = w.accounting;
        if (a) {
          const delta = a.after.cpuMs - a.before.cpuMs;
          if (delta !== a.cpuMs || delta / w.requests !== a.cpuMsPerRequest) throw new Error("CPU arithmetic changed");
          for (const boundary of [a.before, a.after, a.peak]) {
            if (boundary.cpuMs !== boundary.trees.reduce((sum, t) => sum + t.cpuMs, 0) || boundary.rssBytes !== boundary.trees.reduce((sum, t) => sum + t.rssBytes, 0)) throw new Error("Process-tree arithmetic changed");
          }
        }
      }
      const cpu = s?.accounting?.cpuMsPerRequest, rss = s?.accounting?.peak.rssBytes / 1048576;
      audit.routes.push({ experiment, variant: variant.variant, id: row.id, status: row.status, p50Ms: s?.p50Ms, p95Ms: s?.p95Ms, cpuMsPerRequest: cpu, rssMiB: rss, sequentialCount: s?.requests, concurrentCount: c?.requests, concurrentRps: c?.requestsPerSecond, initMs: Number(row.routeFirst?.headers["x-vector-init-ms"]), firstMs: row.routeFirst?.ms });
      lines.push(`| ${variant.variant} / ${row.id} | ${fmt(s?.p50Ms)} / ${fmt(s?.p95Ms)} | ${fmt(c?.requestsPerSecond)} | ${fmt(cpu)} | ${fmt(rss)} |`);
    }
  }
  (audit.routeStatus ??= {})[experiment] = before.status;
  (audit.cpuValidation ??= {})[experiment] = before.variants.map(v => ({ variant: v.variant, ...v.cpuValidation }));
  lines.push("");
}
for (const label of ["scout-linux", "route-before", "route-sync-before"]) if (existsSync(new URL(`vector-${label}-controller.json`, dir))) {
  const c = read(`vector-${label}-controller`);
  audit.controllers.push({ label, status: c.status, stopped: c.stopped, observedWallVcpuHours: c.observedWallVcpuHours, activeCpuDurationMs: c.activeCpuDurationMs, reservation: c.provisionedVcpuHoursReservation });
}
const routeWall = audit.controllers.filter(c => c.label.startsWith("route-")).reduce((s, c) => s + c.observedWallVcpuHours, 0);
const scoutWall = audit.controllers.filter(c => c.label === "scout-linux").reduce((s, c) => s + c.observedWallVcpuHours, 0);
if (routeWall > .3 || scoutWall > .1 || audit.controllers.some(c => !c.stopped)) throw new Error("Budget/lifecycle check failed");
audit.budgets = { routeWallVcpuHours: routeWall, routeLimit: .3, scoutWallVcpuHours: scoutWall, scoutLimit: .1 };
writeFileSync(new URL("vector-audit.json", dir), JSON.stringify(audit, null, 2) + "\n");
console.log(lines.join("\n"));
