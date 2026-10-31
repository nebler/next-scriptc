import { quantile, median } from "./load.mjs";
import { deriveSummary, summaryMetrics } from "./summary.mjs";

export const definitions = {
  "cold-start": "Monotonic wall time immediately before spawn to the first HTTP response with expected status and fully drained body. Fresh process each sample; readiness retries every 2 ms. Direct uses the exact generated .next/scriptc/entry-N.ts under Node 24 type stripping versus its compiled binary; no Next. End-to-end includes next start (Node) or the recorded native production command and the first execution of the specified route. OS filesystem caches are not flushed; this is process-cold, not machine-cold. Median averages the middle two values for even N; p90 uses nearest rank.",
  "memory-idle": "RSS after first successful readiness request and the configured quiet interval. Includes initialization by that route, not an untouched process. Direct: route process. End-to-end: entire owned process tree, including Next, adapter supervisor, all native binaries and descendants. Linux uses the kernel's approximate stat RSS counter; macOS uses ps RSS. Totals sum resident mappings and may double-count shared OS/library pages; not PSS or unique physical memory.",
  "cpu-fixed-count": "After untimed warmup, user+system CPU delta of the stable owned process tree over exactly N successful sequential keep-alive requests, divided by N. Linux /proc/PID/stat excludes child CPU fields to avoid double counting; Node worker threads are already in process totals. macOS ps TIME is rounded to centiseconds. The generator warms its own process and keep-alive agent before an IPC barrier; CPU snapshots bracket release through generator shutdown, excluding spawn/warmup. Boundary sampling and idle runtime CPU remain; generator CPU is excluded and reported separately. Each row carries before/after per-process CPU and RSS. N is per repetition, after prior warmup; RSS after N is not a fresh-process measurement.",
  "throughput-latency": "Separate-process HTTP/1.1 keep-alive closed-loop generator with C outstanding requests, no pipelining; dispatch until duration expires, then drain all in-flight requests. Throughput = completed responses / actual dispatch-to-final-drain seconds. Latency = dispatch to fully drained body; nearest-rank p50/p99 within a run. No coordinated-omission correction; this measures closed-loop capacity, not an external arrival-rate SLA. Each sample warms the same generator process and agent at its C before the IPC start barrier. Socket creations and reused requests are counted separately for warmup and measurement; repeats retained independently, with median and min/max across runs.",
  "peak-rss": "Largest sampled simultaneous sum of process-tree RSS, sampled every 100 ms plus the before/after boundaries. Sampler reads only the previously discovered tree (targeted ps on macOS, /proc on Linux); full discovery at both boundaries checks stable process membership. Each peak snapshot contains every process. This is a lower bound on peak RSS, not a kernel high-water mark. On a loaded host ps/scheduling can lengthen the interval.",
  "hop-cost": "Native end-to-end minus native direct median p50/p99 at identical concurrency, input and affinity. Also report end-to-end/direct throughput ratio. This is an observed topology difference including Next routing/proxy/serialization/scheduling, not a pure network-hop stopwatch. The samples are separate runs; percentile differences are not percentiles of paired hop times and may be negative under noise.",
  "isolation": "First warm heavy and probe endpoints. Baseline and loaded windows each dispatch one sequential probe per path, in parallel, waiting 20 ms after completion. Loaded window additionally holds one heavy request outstanding, back to back. Record probe p50/p99 and sample counts alongside completed heavy requests; equal offered concurrency, not equal achieved heavy RPS. Heavy load starts 100 ms before probes; drain is included. A synchronous Node handler may delay even accepting probes. Requests cannot be preempted at the deadline.",
  "threads": "One million orders, 8 regions, 12 scenarios, 60 months; exact integer-cent totals compared across all variants/counts. Fresh process per variant, growing its retained pool through 1/2/4 workers. One readiness computation at 1 worker, then two full warmups at each count before repeated internal dispatch+compute+reduction timings. Counts run ascending and share JIT/GC history. Dataset/pool setup and HTTP excluded. RSS includes the dataset and all worker threads. Marginal warmed RSS/added worker = (median post-job RSS at 4 workers - median post-job RSS at 1 worker) / 3 within that SAME process. The instantaneous dataset-construction RSS is no longer the baseline; this measures net resident growth including GC/JIT/allocator history, not exact clone allocations. Negative values, if any, remain visible as GC/noise and do not mean negative worker allocation. SAB uses four hand-filled Int32 SharedArrayBuffers; object variants share the original route and worker source. Node object workers clone workerData; native publishes ordinary object graphs. No forced GC.",
};
export const limitations = [
  "Headline application workloads are successful cost-10 bcrypt login, async scrypt login (N=32768, r=8, p=1), authenticated JWT verification, 3,000-product search, uncached Markdown rendering, RSS, 1 MiB upload integrity, gzip export, revenue aggregation, raw RGBA histogram and nearby-store search. hello is a small-response control; primes and report are synthetic. These fixtures have no database or remote I/O.",
  "Native bcrypt is a known regression: the earlier correctness probe took 26.8 s for three cost-10 operations versus 0.56 s on Node (~48× slower). Login therefore measures only three requests, C=1, one measured repetition and one separate cold request per surface. Its p99 is simply the maximum of three, not credible tail evidence. No reduced cost, invalid password or 401 shortcut is substituted. CSV and OG-image generation were refused by the probe; see examples/probe/RESULTS.md.",
  "If a route exceeds Next’s default 30-second upstream proxy timeout, production returns HTTP 500. The suite records that workload as exceeding the default 30 s proxy timeout when elapsed time and upstream-reset logs confirm it, preserves server logs, sets dataset status failed/nonzero exit and continues independent workloads. It never increases the production timeout, substitutes a faster error path or counts failed responses as throughput.",
  "Coverage static percentage is not a typed-machine-code percentage: scriptc includes dynamic-tier statements in its compile-statically total. Dynamic counts and package modes are displayed alongside speed; package mode static does not exclude untyped JS operations. Coverage describes the entry graph, not measured hot-path time, so it suggests explanations without proving causality.",
  "Node baseline is a production next build / next start with adapter disabled (.next-node), normal V8 JIT, no debug or memory flags. Direct Node uses the identical generated entry and HTTP shim, without a Next server. Native end-to-end includes the extra Next proxy and all resident route processes. Native-grouped uses the registered eight-route light group; it shares scheduling, state and failure fate, and gzip isolation measures contention inside that group.",
  "hello reads Accept-Language and feed reads a result limit from request.url: with cacheComponents these are dynamic, and both sides compute every measured response. Node prerendered paths are recorded separately; no Next optimization is disabled. Async scrypt uses Node's default libuv threadpool; scriptc 0.4.6 computes the derivation before deferring the callback. Isolation includes both async scrypt and synchronous bcrypt, so a bcrypt isolation win does not describe production-style async password hashing.",
  "Linux uses two allowed CPUs for the application tree and two disjoint CPUs for generator + controller. Both runtimes inherit the same masks. Threads alone use all four CPUs for 1/2/4-worker scaling; they have no sustained HTTP load generator. These are logical CPUs; topology/SMT and other sandbox tenants may still affect results. macOS cannot use taskset: local output is indicative only.",
  "Run order: cold runtimes alternate. Default steady blocks are direct Node, direct native, end-to-end Node, end-to-end native, end-to-end native-grouped; --reverse reverses runtime order and is recorded in the profile. All repeated steady runs share their block's process/JIT/cache/allocator state. No multiple application modes run together. Repeat on a quiet host in both orders before publishing close comparisons.",
  "Client and server share a machine and memory bandwidth. The single Node generator can bottleneck on one JS thread even with a two-CPU affinity mask. Rows flag suspected generator saturation at >=0.8 CPU-seconds per wall-second; flagged throughput is a lower bound on server capacity. CPU pinning reduces CPU contention but does not eliminate shared-resource interference. No load-generator ceiling calibration is implied.",
  "SAB is a standalone Node program to expose the strongest Node sharing baseline without adding an application route. Its internal timed region matches report, and every total must match. It has no idle HTTP shim; RSS is therefore slightly favorable to SAB. SAB and object layouts/code accesses differ by necessity. This tests sharing ergonomics + overhead, not identical-code compiler speed. Dataset construction and worker initialization costs are excluded from time. Warmed total RSS retains the dataset and resident pool; the marginal metric compares warmed 1/4-worker states within a process.",
  "Idle and after-load memory are runtime/GC-state dependent. Peak sampling can miss spikes; summed RSS overcounts shared pages. CPU ticks can make tiny-request per-request CPU noisy: increase fixed count for public claims. Active CPU here is OS user+system process CPU, not a reproduction of Vercel billing instrumentation.",
  "Responses are checked for expected status and byte-for-byte SHA-256 parity before timing and throughout load. Gzip export checks decoded bytes and representation headers, allowing valid compressed encodings to differ; client decompression CPU is separate, while latency includes it on both runtimes. Workloads must use deterministic fixtures, including a fixed clock/key for token issuance. No TLS, remote network, serverless scheduling, multi-instance autoscaling or platform cold starts are measured.",
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
  let md = `# next-scriptc benchmark\n\n**${data.label}**\n\nStatus: ${data.status}. Commit: ${data.environment.commit}. Node ${data.environment.node}; scriptc ${data.environment.scriptc}; Next ${data.environment.next}.\n\n${data.environment.cpuModel}; ${data.environment.vcpus} logical CPUs; ${data.environment.platform}/${data.environment.arch}; load averages start ${data.environment.loadAverageStart.join(", ")}, end ${data.environment.loadAverageEnd?.join(", ")}.\n\nStarted ${data.startedAt}; ended ${data.finishedAt}. Profile: ${data.profile.name}. Affinity: ${JSON.stringify(data.environment.affinity)}.\n\nFull environment, build IDs, source/binary hashes, dirty status, raw repetitions, per-process snapshots, requests, and workload configuration are in the adjacent JSON. Brackets below are [min, max] across repeated runs, not confidence intervals.\n\n`;
  const summary = deriveSummary(data);
  md += "\n## Final production summary — wins and losses together\n\nEvery HTTP workload appears below. Values are medians of measured end-to-end rows, followed by variant/Node ratios; 1× is parity. Each column states its ratio direction. Passwords have no C=64 measurement. Asterisk means suspected generator saturation in the variant or Node baseline (throughput is then a lower bound on capacity). No direct measurement fills a production cell. Missing, refused and failed cells stay explicit.\n\n";
  md += table(["Workload", "Configuration", ...summaryMetrics.map((m) => `${m.label}; ratio to Node (${m.direction})`)],
    summary.workloads.flatMap((workload) => workload.variants.map((entry) => [workload.route, entry.runtime,
      ...summaryMetrics.map((metric) => {
        const cell = entry.cells[metric.id];
        const baseline = workload.variants[0].cells[metric.id];
        return cell.status !== "measured" ? cell.status : `${f(cell.value)}; ${cell.ratio === null ? "ratio unavailable" : f(cell.ratio) + "×"}${cell.saturation || baseline.saturation ? "*" : ""}`;
      })])));
  md += "\nWhole-app summed RSS includes Next, supervisor and every resident native process. Idle follows hello readiness. Loaded is the maximum simultaneous sampled RSS across all production CPU/throughput rows in the fixed workload order, including allocator/GC history; it is not PSS or a kernel peak. Both ratios below are variant/Node, **lower is better**.\n\n";
  md += table(["Configuration", "Idle MiB; ratio to Node (lower is better)", "Loaded MiB; ratio to Node (lower is better)", "Status"],
    summary.memory.map((m) => [m.runtime, m.idleMiB === null ? "not measured" : `${f(m.idleMiB)}; ${m.idleRatio === null ? "ratio unavailable" : f(m.idleRatio) + "×"}`,
      m.loadedMiB === null ? "not measured" : `${f(m.loadedMiB)}; ${m.loadedRatio === null ? "ratio unavailable" : f(m.loadedRatio) + "×"}`, m.status]));
  md += `\nSections completed: ${data.completedSections?.join(", ") || "none"}. Omitted sections are absent, not zero. Native-grouped is production-only; direct and internal-worker rows remain Node/native.\n\n`;
  md += `\n## Limitations alongside the results\n\n${data.limitations.map((text) => `- ${text}`).join("\n")}\n\n`;
  md += "\n## Workload fixtures\n\n";
  md += `Node build prerendered paths: ${data.environment.nodePrerenderedPaths.join(", ") || "none"}.\n\n`;
  md += table(["Route", "Kind", "Request / pending"], data.workloads.map((route) => [route.id, route.category, route.enabled === false ? `DISABLED: ${route.pending}` : `${route.method ?? "GET"} ${route.path}`]));
  if (rows("workload-failure").length) {
    md += "\n## Failed workloads — dataset status FAILED\n\nNo speed result is claimed for these cases. Successful rows below are partial evidence only. Full server logs are in JSON.\n\n";
    md += table(["Scope / runtime / route", "Phase", "Failure"], rows("workload-failure").map((r) => [`${r.scope} / ${r.runtime} / ${r.route}`, r.phase, r.consequence ?? r.error.split("\n")[0]]));
  }
  md += "\n## Application workloads, C=1 (latency and single-route coverage together)\n\n";
  md += table(["Route", "Scope", "Node p50 ms", "Native p50 ms", "Native / Node latency (lower is better)", "Native-grouped p50 ms", "Grouped / Node latency (lower is better)", "Statements / static % / dynamic tier", "Package modes"], data.workloads.filter((r) => r.category === "realistic" && r.enabled !== false).flatMap((route) => {
    const c = data.coverage?.[route.id];
    return ["direct", "end-to-end"].map((scope) => {
      const p50 = (runtime) => median(rows("throughput-latency").filter((r) => r.route === route.id && r.scope === scope && r.runtime === runtime && r.concurrency === 1).map((r) => r.result.p50Ms));
      const node = p50("node"), native = p50("native");
      const display = (value, runtime) => {
        if (data.variants?.find((v) => v.id === runtime)?.status === "skipped") return "SKIPPED (build absent)";
        const failure = rows("workload-failure").find((r) => r.route === route.id && r.scope === scope && r.runtime === runtime && r.phase === "steady");
        return failure ? failure.reason === "next-proxy-timeout" ? "Next 30 s proxy timeout exceeded" : "FAILED (see failure)" : f(value);
      };
      return [route.id, scope, display(node, "node"), display(native, "native"), node && native ? f(native / node) + "×" : "—", scope === "direct" ? "production only" : display(p50("native-grouped"), "native-grouped"), scope === "end-to-end" && node && p50("native-grouped") ? f(p50("native-grouped") / node) + "×" : "—", c ? `${c.statements} / ${c.staticPercent}% / ${c.dynamicTierStatements}` : "not collected", c?.packages.map((p) => `${p.name}: ${p.mode}`).join("; ") || "none"];
    });
  }));
  md += "\n## Coverage of every measured entry (controls and synthetic included)\n\n";
  md += table(["Entry", "Statements", "Static statements / %", "Dynamic tier statements", "Package modes"], Object.entries(data.coverage ?? {}).map(([id, c]) => [id, c.statements, `${c.staticStatements} / ${c.staticPercent}%`, c.dynamicTierStatements, c.packages.map((p) => `${p.name}: ${p.mode}`).join("; ") || "none"]));
  md += "\n## Cold start (ms, process-cold)\n\n";
  md += table(["Scope / runtime / route", "N", "Median", "p90", "Min", "Max"], [...groups(rows("cold-start"), ["scope", "runtime", "route"])].map(([key, group]) => {
    const xs = group.map((r) => r.ms); return [key, xs.length, f(median(xs)), f(quantile(xs, 0.9)), f(Math.min(...xs)), f(Math.max(...xs))];
  }));
  md += "\n## Idle RSS (MiB, per process and simultaneous total)\n\n";
  md += table(["Scope / runtime", "Initialized by", "PID / role", "RSS MiB"], rows("memory-idle").flatMap((row) => [
    ...row.memory.processes.map((p) => [`${row.scope} / ${row.runtime}`, `${row.initializedBy}${row.restartedAfter ? " (restart after " + row.restartedAfter + ")" : ""}`, `${p.pid} / ${p.role}`, f(mib(p.rssBytes))]),
    [`${row.scope} / ${row.runtime}`, `${row.initializedBy}${row.restartedAfter ? " (restart after " + row.restartedAfter + ")" : ""}`, "TOTAL", f(mib(row.memory.rssBytes))],
  ]));
  md += "\n## Fixed-count process CPU and memory\n\n";
  md += table(["Scope / runtime / route", "N per run", "CPU ms/request median [min,max]", "After N total RSS MiB", "Sampled peak total MiB"], [...groups(rows("cpu-fixed-count"), ["scope", "runtime", "route"])].map(([key, group]) => [key, group[0].result.requests,
    spread(group.map((r) => r.cpuMsPerRequest)), spread(group.map((r) => mib(r.after.rssBytes))), spread(group.map((r) => mib(r.peak.rssBytes)))]));
  md += "\n## Throughput / latency\n\n";
  md += table(["Scope / runtime / route / C", "req/s median [min,max]", "p50 ms median [min,max]", "p99 ms median [min,max]", "Peak total MiB", "Measured sockets created / requests reused (each run)", "Generator CPU cores / saturation suspected"], [...groups(rows("throughput-latency"), ["scope", "runtime", "route", "concurrency"])].map(([key, group]) => [key,
    spread(group.map((r) => r.result.requestsPerSecond)), spread(group.map((r) => r.result.p50Ms)), spread(group.map((r) => r.result.p99Ms)),
    spread(group.map((r) => mib(r.peak.rssBytes))), group.map((r) => `${r.result.connectionsCreated} / ${r.result.reusedRequests} of ${r.result.requests}`).join("; "), `${spread(group.map((r) => r.result.generatorCpuCores))} / ${group.some((r) => r.result.generatorSaturationSuspected) ? "YES" : "no"}`]));
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
  md += table(["Runtime / window / repeat", "Light group relation", "Probe", "Requests", "p50 ms", "p99 ms", "Heavy completed"], data.rows.filter((r) => r.metric.startsWith("isolation-")).flatMap((r) => r.result.probes.map((probe) => [`${r.runtime} / ${r.heavyRequest?.id} / ${r.metric} / ${r.repeat}`, r.lightGroupRelation ?? "outside", probe.path, probe.requests, f(probe.p50Ms), f(probe.p99Ms), r.result.heavy?.requests ?? "none"])));
  md += "\n## Synthetic threads: sharing ergonomics and overhead\n\n";
  md += table(["Variant / workers", "Internal ms median [min,max]", "Warmed total RSS MiB median [min,max]"], [...groups(rows("threads"), ["variant", "threads"])].map(([key, group]) => [key,
    spread(group.map((r) => r.elapsedMs)), spread(group.map((r) => mib(r.rss)))]));
  md += "\nSame-process net RSS growth from 1 to 4 warmed workers; not allocation size. See the threads definition.\n\n";
  md += table(["Variant", "1-worker RSS MiB", "4-worker RSS MiB", "Marginal warmed RSS / added worker MiB"], rows("threads-memory").map((r) => [r.variant, f(mib(r.rss1)), f(mib(r.rss4)), f(mib(r.marginalRssPerAddedWorker))]));
  md += "\n## Precise metric definitions\n\n" + Object.entries(data.definitions).map(([name, text]) => `- **${name}:** ${text}`).join("\n") + "\n";
  if (data.error) md += `\n## Failure (partial data; do not publish)\n\n\`\`\`\n${data.error}\n\`\`\`\n`;
  return md;
}
