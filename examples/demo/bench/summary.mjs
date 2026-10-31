import { median } from "./load.mjs";
import { variants } from "./variants.mjs";

export const summaryMetrics = [
  { id: "latency", label: "C=1 p50 ms", direction: "lower is better", metric: "throughput-latency", concurrency: 1, read: (r) => r.result.p50Ms },
  { id: "throughput", label: "C=64 req/s", direction: "higher is better", metric: "throughput-latency", concurrency: 64, read: (r) => r.result.requestsPerSecond },
  { id: "cpu", label: "CPU ms/request", direction: "lower is better", metric: "cpu-fixed-count", read: (r) => r.cpuMsPerRequest },
  { id: "cold", label: "Cold ms", direction: "lower is better", metric: "cold-start", read: (r) => r.ms },
];
const finiteMedian = (xs) => median(xs.filter(Number.isFinite));
const ratio = (value, baseline) => Number.isFinite(value) && Number.isFinite(baseline) && baseline > 0 ? value / baseline : null;
// Pure derivation shared by markdown rendering and self-checks. Never use direct
// rows to fill missing production cells; never impute absent/failed values.
export function deriveSummary(data) {
  const production = data.rows.filter((row) => row.scope === "end-to-end");
  const state = (runtime) => data.variants?.find((item) => item.id === runtime);
  const workloads = data.workloads.map((route) => ({ route: route.id, variants: variants.map(({ id: runtime }) => {
    const cells = Object.fromEntries(summaryMetrics.map((metric) => {
      const samples = production.filter((r) => r.runtime === runtime && r.route === route.id && r.metric === metric.metric &&
        (metric.concurrency === undefined || r.concurrency === metric.concurrency));
      const failure = production.find((r) => r.runtime === runtime && r.route === route.id && r.metric === "workload-failure" &&
        r.phase === (metric.id === "cold" ? "cold" : "steady"));
      let status = "measured";
      if (route.enabled === false) status = `refused: ${route.pending}`;
      else if (state(runtime)?.status === "skipped") status = `skipped: ${state(runtime).reason}`;
      else if (metric.id === "throughput" && route.bounded) status = "unmeasured (bounded C=1)";
      else if (failure) status = `FAILED: ${failure.reason}`;
      else if (!samples.length) status = "not measured (section absent/incomplete)";
      const value = status === "measured" ? finiteMedian(samples.map(metric.read)) : null;
      if (status === "measured" && value === null) status = "invalid measurement";
      return [metric.id, { value, status, saturation: samples.some((r) => r.result?.generatorSaturationSuspected) }];
    }));
    return { runtime, cells };
  }) }));
  for (const workload of workloads) for (const entry of workload.variants) for (const metric of summaryMetrics)
    entry.cells[metric.id].ratio = ratio(entry.cells[metric.id].value, workload.variants[0].cells[metric.id].value);
  const memory = variants.map(({ id: runtime }) => {
    const idleRows = production.filter((r) => r.runtime === runtime && r.metric === "memory-idle" && !r.restartedAfter);
    const loadedRows = production.filter((r) => r.runtime === runtime && ["cpu-fixed-count", "throughput-latency"].includes(r.metric));
    return { runtime, idleMiB: finiteMedian(idleRows.map((r) => r.memory.rssBytes / 2 ** 20)),
      loadedMiB: loadedRows.length ? Math.max(...loadedRows.map((r) => r.peak.rssBytes / 2 ** 20)) : null,
      status: state(runtime)?.status === "skipped" ? `skipped: ${state(runtime).reason}` :
        production.some((r) => r.runtime === runtime && r.metric === "workload-failure") ? "partial: workload failure (see failures)" :
          loadedRows.length ? "measured" : "not measured (production absent/incomplete)" };
  });
  for (const entry of memory) {
    entry.idleRatio = ratio(entry.idleMiB, memory[0].idleMiB);
    entry.loadedRatio = ratio(entry.loadedMiB, memory[0].loadedMiB);
  }
  return { workloads, memory };
}
