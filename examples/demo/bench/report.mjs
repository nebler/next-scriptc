import { quantile, median } from "./load.mjs";

export const definitions = {
  "cold-start": "Monotonic wall time immediately before spawn to the first HTTP response with expected status and fully drained body. Fresh process each sample; readiness retries every 2 ms. Direct uses the exact generated .next/scriptc/entry-N.ts under Node 24 type stripping versus its compiled binary; no Next. End-to-end includes next start (Node) or next-scriptc start (native) and the first execution of the specified route. OS filesystem caches are not flushed; this is process-cold, not machine-cold. Median averages the middle two values for even N; p90 uses nearest rank.",
  "memory-idle": "RSS after first successful readiness request and the configured quiet interval. Includes initialization by that route, not an untouched process. Direct: route process. End-to-end: entire owned process tree, including Next, adapter supervisor, all native binaries and descendants. Linux uses the kernel's approximate stat RSS counter; macOS uses ps RSS. Totals sum resident mappings and may double-count shared OS/library pages; not PSS or unique physical memory.",
  "cpu-fixed-count": "After timed warmup, user+system CPU delta of the stable owned process tree over exactly N successful sequential keep-alive requests, divided by N. Linux /proc/PID/stat excludes child CPU fields to avoid double counting; Node worker threads are already in process totals. macOS ps TIME is rounded to centiseconds. Snapshot interval includes generator startup/shutdown and idle runtime CPU; generator CPU is excluded and reported separately. Each row carries before/after per-process CPU and RSS. N is per repetition, after prior warmup; RSS after N is not a fresh-process measurement.",
  "throughput-latency": "Separate-process HTTP/1.1 keep-alive closed-loop generator with C outstanding requests, no pipelining; dispatch until duration expires, then drain all in-flight requests. Throughput = completed responses / actual dispatch-to-final-drain seconds. Latency = dispatch to fully drained body; nearest-rank p50/p99 within a run. No coordinated-omission correction; this measures closed-loop capacity, not an external arrival-rate SLA. Warmup at each C; repeats retained independently, with median and min/max across runs.",
  "peak-rss": "Largest sampled simultaneous sum of process-tree RSS, sampled every 100 ms plus the before/after boundaries. Each peak snapshot contains every process. This is a lower bound on peak RSS, not a kernel high-water mark. On a loaded host ps/scheduling can lengthen the interval.",
  "hop-cost": "Native end-to-end minus native direct median p50/p99 at identical concurrency, input and affinity. Also report end-to-end/direct throughput ratio. This is an observed topology difference including Next routing/proxy/serialization/scheduling, not a pure network-hop stopwatch. The samples are separate runs; percentile differences are not percentiles of paired hop times and may be negative under noise.",
  "isolation": "First warm heavy and probe endpoints. Baseline and loaded windows each dispatch one sequential probe per path, in parallel, waiting 20 ms after completion. Loaded window additionally holds one heavy request outstanding, back to back. Record probe p50/p99 and sample counts alongside completed heavy requests; equal offered concurrency, not equal achieved heavy RPS. Heavy load starts 100 ms before probes; drain is included. A synchronous Node handler may delay even accepting probes. Requests cannot be preempted at the deadline.",
  "threads": "One million orders, 8 regions, 12 scenarios, 60 months; exact integer-cent totals compared across all variants/counts. Fresh process per variant and thread count 1/2/4, one full warmup then repeated internal dispatch+compute+reduction timings. Dataset/pool setup and HTTP excluded. RSS includes the dataset and all worker threads. Growth/worker = (process RSS after job - RSS after dataset before workers) / resident workers: an average residual including allocator/JIT/GC/runtime costs, not exact bytes copied or marginal growth. SAB uses four hand-filled Int32 SharedArrayBuffers; object variants share the original route and worker source. Node object workers clone workerData; native publishes ordinary object graphs. No forced GC.",
};
export const limitations = [
  "Realistic route placeholders are disabled until input/output contracts are integrated. hello is a control; primes and report are synthetic. There are no headline application claims until realistic routes are enabled and correctness checked.",
  "Unmeasured cases must stay visible: the route probe refused Papa Parse CSV export, and cost-10 native bcrypt is slow enough to require a separate concurrency/time budget. Disabled or refused workloads are not native successes; see examples/probe/RESULTS.md before selecting headline workloads.",
  "Node baseline is a production next build / next start with adapter disabled (.next-node), normal V8 JIT, no debug or memory flags. Direct Node uses the identical generated entry and HTTP shim, without a Next server. Native end-to-end includes the extra Next proxy and all resident route processes.",
  "Next may prerender pure GET handlers such as hello and feed.xml in the Node production build. Its normal static optimization is retained as the strongest application baseline; that comparison can include serving a prerendered body versus computing it. The direct comparison still executes the same entry on every request. Prerendered paths are recorded in the environment.",
  "Linux uses two allowed CPUs for the application tree and two disjoint CPUs for generator + controller. Both runtimes inherit the same masks. Threads alone use all four CPUs for 1/2/4-worker scaling; they have no sustained HTTP load generator. These are logical CPUs; topology/SMT and other sandbox tenants may still affect results. macOS cannot use taskset: local output is indicative only.",
  "Run order: cold runtimes alternate. Default steady blocks are direct Node, direct native, end-to-end Node, end-to-end native; --reverse reverses runtime order and is recorded in the profile. All repeated steady runs share their block's process/JIT/cache/allocator state. No multiple application modes run together. Repeat on a quiet host in both orders before publishing close comparisons.",
  "Client and server share a machine and memory bandwidth. The single Node generator can bottleneck on one JS thread even with a two-CPU affinity mask. Rows flag suspected generator saturation at >=0.8 CPU-seconds per wall-second; flagged throughput is a lower bound on server capacity. CPU pinning reduces CPU contention but does not eliminate shared-resource interference. No load-generator ceiling calibration is implied.",
  "SAB is a standalone Node program to expose the strongest Node sharing baseline without adding an application route. Its internal timed region matches report, and every total must match. It has no idle HTTP shim; RSS is therefore slightly favorable to SAB. SAB and object layouts/code accesses differ by necessity. This tests sharing ergonomics + overhead, not identical-code compiler speed. Dataset construction and worker initialization costs are excluded from time, but retained in memory.",
  "Idle and after-load memory are runtime/GC-state dependent. Peak sampling can miss spikes; summed RSS overcounts shared pages. CPU ticks can make tiny-request per-request CPU noisy: increase fixed count for public claims. Active CPU here is OS user+system process CPU, not a reproduction of Vercel billing instrumentation.",
  "Responses are checked for expected status and byte-for-byte SHA-256 parity before timing and throughout load. Workloads must use deterministic fixtures, including a fixed clock/key for token issuance. No TLS, remote network, serverless scheduling, multi-instance autoscaling or platform cold starts are measured.",
];
const stat = (xs) => ({ median: median(xs), min: quantile(xs, 0), max: quantile(xs, 1) });
const f = (value) => value == null ? "—" : Number(value).toFixed(3);
const spread = (xs) => { const s = stat(xs); return `${f(s.median)} [${f(s.min)}, ${f(s.max)}]`; };
const mib = (bytes) => bytes / 2 ** 20;
function groups(rows, keys) {
  const result = new Map();
  for (const row of rows) {
    const key = keys.map((name) => row[name] ?? "").join(" / ");
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(row);
  }
  return result;
}
function table(headers, rows) {
  return `| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n${rows.map((row) => `| ${row.join(" | ")} |`).join("\n")}\n`;
}
export function renderReport(data) {
  const rows = (metric) => data.rows.filter((row) => row.metric === metric);
  let md = `# next-scriptc benchmark\n\n**${data.label}**\n\nStatus: ${data.status}. Commit: ${data.environment.commit}. Node ${data.environment.node}; scriptc ${data.environment.scriptc}; Next ${data.environment.next}.\n\n${data.environment.cpuModel}; ${data.environment.vcpus} logical CPUs; ${data.environment.platform}/${data.environment.arch}; load averages start ${data.environment.loadAverageStart.join(", ")}, end ${data.environment.loadAverageEnd?.join(", ")}.\n\nStarted ${data.startedAt}; ended ${data.finishedAt}. Profile: ${data.profile.name}. Affinity: ${JSON.stringify(data.environment.affinity)}.\n\nFull environment, build IDs, source/binary hashes, dirty status, raw repetitions, per-process snapshots, requests, and workload configuration are in the adjacent JSON. Brackets below are [min, max] across repeated runs, not confidence intervals.\n\n## Limitations alongside the results\n\n${data.limitations.map((text) => `- ${text}`).join("\n")}\n\n## Workloads\n\n`;
  md += table(["Route", "Kind", "Request / pending"], data.workloads.map((route) => [route.id, route.category, route.enabled === false ? `DISABLED: ${route.pending}` : `${route.method ?? "GET"} ${route.path}`]));
  md += "\n## Cold start (ms, process-cold)\n\n";
  md += table(["Scope / runtime / route", "N", "Median", "p90", "Min", "Max"], [...groups(rows("cold-start"), ["scope", "runtime", "route"])].map(([key, group]) => {
    const xs = group.map((r) => r.ms); return [key, xs.length, f(median(xs)), f(quantile(xs, 0.9)), f(Math.min(...xs)), f(Math.max(...xs))];
  }));
  md += "\n## Idle RSS (MiB, per process and simultaneous total)\n\n";
  md += table(["Scope / runtime", "Initialized by", "PID / role", "RSS MiB"], rows("memory-idle").flatMap((row) => [
    ...row.memory.processes.map((p) => [`${row.scope} / ${row.runtime}`, row.initializedBy, `${p.pid} / ${p.role}`, f(mib(p.rssBytes))]),
    [`${row.scope} / ${row.runtime}`, row.initializedBy, "TOTAL", f(mib(row.memory.rssBytes))],
  ]));
  md += "\n## Fixed-count process CPU and memory\n\n";
  md += table(["Scope / runtime / route", "N per run", "CPU ms/request median [min,max]", "After N total RSS MiB", "Sampled peak total MiB"], [...groups(rows("cpu-fixed-count"), ["scope", "runtime", "route"])].map(([key, group]) => [key, group[0].result.requests,
    spread(group.map((r) => r.cpuMsPerRequest)), spread(group.map((r) => mib(r.after.rssBytes))), spread(group.map((r) => mib(r.peak.rssBytes)))]));
  md += "\n## Throughput / latency\n\n";
  md += table(["Scope / runtime / route / C", "req/s median [min,max]", "p50 ms median [min,max]", "p99 ms median [min,max]", "Peak total MiB", "Generator CPU cores / saturation suspected"], [...groups(rows("throughput-latency"), ["scope", "runtime", "route", "concurrency"])].map(([key, group]) => [key,
    spread(group.map((r) => r.result.requestsPerSecond)), spread(group.map((r) => r.result.p50Ms)), spread(group.map((r) => r.result.p99Ms)),
    spread(group.map((r) => mib(r.peak.rssBytes))), `${spread(group.map((r) => r.result.generatorCpuCores))} / ${group.some((r) => r.result.generatorSaturationSuspected) ? "YES" : "no"}`]));
  md += "\n## Observed native proxy/topology cost\n\n";
  const hops = [];
  for (const route of data.workloads.filter((r) => r.enabled !== false)) for (const concurrency of data.profile.concurrency) {
    const select = (scope) => rows("throughput-latency").filter((r) => r.runtime === "native" && r.route === route.id && r.concurrency === concurrency && r.scope === scope);
    const direct = select("direct"), end = select("end-to-end");
    if (direct.length && end.length) {
      const value = (group, field) => median(group.map((r) => r.result[field]));
      hops.push([`${route.id} / ${concurrency}`, f(value(end, "p50Ms") - value(direct, "p50Ms")), f(value(end, "p99Ms") - value(direct, "p99Ms")), f(value(end, "requestsPerSecond") / value(direct, "requestsPerSecond")), [...direct, ...end].some((r) => r.result.generatorSaturationSuspected) ? "YES" : "no"]);
    }
  }
  md += table(["Route / C", "Δ median p50 ms", "Δ median p99 ms", "end-to-end/direct req/s", "Client saturation suspected"], hops);
  md += "\n## Event-loop isolation (each repetition)\n\n";
  md += table(["Runtime / window / repeat", "Probe", "Requests", "p50 ms", "p99 ms", "Heavy completed"], data.rows.filter((r) => r.metric.startsWith("isolation-")).flatMap((r) => r.result.probes.map((probe) => [`${r.runtime} / ${r.metric} / ${r.repeat}`, probe.path, probe.requests, f(probe.p50Ms), f(probe.p99Ms), r.result.heavy?.requests ?? "none"])));
  md += "\n## Synthetic threads: sharing ergonomics and overhead\n\n";
  md += table(["Variant / workers", "Internal ms median [min,max]", "RSS MiB median [min,max]", "Growth/worker MiB", "Dataset RSS MiB"], [...groups(rows("threads"), ["variant", "threads"])].map(([key, group]) => [key,
    spread(group.map((r) => r.elapsedMs)), spread(group.map((r) => mib(r.rss))), spread(group.map((r) => mib(r.workerRssGrowth))), spread(group.map((r) => mib(r.datasetRss)))]));
  md += "\n## Precise metric definitions\n\n" + Object.entries(data.definitions).map(([name, text]) => `- **${name}:** ${text}`).join("\n") + "\n";
  if (data.error) md += `\n## Failure (partial data; do not publish)\n\n\`\`\`\n${data.error}\n\`\`\`\n`;
  return md;
}
