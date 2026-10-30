# next-scriptc benchmark suite

This suite separates runtime costs from application topology. The direct comparison runs the **same generated `.next/scriptc/entry-N.ts`** with Node 24 type stripping and with scriptc's compiled binary. The production comparison uses an adapter-disabled production Next server (`.next-node`) versus `next-scriptc start`, including Next's proxy, the adapter supervisor, and every resident native route binary.

There are **no headline application claims yet**. `hello` is a small-response control, `primes` is synthetic, and `report` is only a threads/sharing microbenchmark. The workload registry deliberately leaves realistic workloads disabled pending integration with the route author's final contracts. Every generated report puts these limitations before the result tables.

## Files

- `examples/demo/bench/config.mjs`: the single workload registry, request inputs, categories, fixed CPU request counts, concurrency levels, repeat/warmup windows, and isolation probes. Realistic placeholders are marked `enabled: false` with the missing contract.
- `examples/demo/bench/run.mjs`: sequential process-cold and steady-state measurements; response parity checks; metadata, artifact hashes, raw JSON, and Markdown output.
- `examples/demo/bench/load.mjs`: dependency-free, separate-process HTTP/1.1 generator using Node's `http.Agent` with keep-alive, no pipelining, full body draining, request timeouts, status checks, and deterministic response hashes.
- `examples/demo/bench/processes.mjs`: owned-process lifecycle, descendant discovery, CPU/RSS accounting, sampled peaks, signal handling, bounded shutdown, and port checks.
- `examples/demo/bench/threads.mjs`: fresh processes for Node objects/clone, Node SAB, and native published objects at 1/2/4 threads; validates all result totals.
- `examples/demo/bench/report-sab.mjs`: Node's manually flattened SharedArrayBuffer implementation of the report algorithm. The unmeasured controller reads the report's dimensions and passes them to this pure JavaScript program; neither its parent nor its workers load a TypeScript parser. It uses the same integer arithmetic and partitions.
- `examples/demo/bench/report.mjs`: precise definitions, limitations, aggregation, and Markdown rendering. Each JSON row names its metric, scope, runtime or variant, route, concurrency/count where relevant, and repetition.
- `scripts/sandbox-bench.mjs`: HEAD-only, four-vCPU Node 24 sandbox, sequential builds, download and unconditional stop. It does not change `sandbox-smoke.mjs`.

## Run locally

Use Node **24.x** on PATH; the controller refuses other majors and uses its exact executable for every Node server and generator. Install the lockfile, then build the two outputs **sequentially** from the same unchanged source tree:

```sh
pnpm install --frozen-lockfile
pnpm --filter demo build
NEXT_SCRIPTC_BASELINE=node pnpm --filter demo build
node examples/demo/bench/run.mjs --profile quick --output research/benchmarks/local-indicative
```

`quick` still exercises direct Node/native, both production modes, concurrency 1/8/64, isolation, and all three thread variants at 1/2/4 workers. It uses two cold starts per case, two steady repetitions, 150 ms warmups, 300 ms load windows, and at most 40 requests per CPU sample. Those settings prove the plumbing, not performance. Full settings use 20 cold starts, three steady repetitions, one-second warmups, two-second load windows, five-second isolation probes, and each route's configured fixed request count.

```sh
node examples/demo/bench/run.mjs --output research/benchmarks/local-full
node examples/demo/bench/run.mjs --reverse --output research/benchmarks/local-full-reversed
```

`--reverse` reverses steady runtime block order; cold runtimes already alternate. `--skip-threads` is available for isolating application measurements and is recorded in the output. A complete application-plus-threads result should omit it.

Run without other builds touching `.next` or `.next-node`. The suite checks application/benchmark/adapter source snapshots, generated entry and binary hashes, plus build IDs again before accepting a completed result. This catches a concurrent build replacing artifacts; it cannot make an old binary match a newly edited source. **Fresh sequential builds are a prerequisite.** Local dirty status and artifact hashes identify the working copy, while only the sandbox's HEAD archive provides a complete immutable source snapshot.

Processes run one mode at a time. No benchmark server is expected to exist beforehand. The suite checks port 3417 and every manifest binary port, terminates its owned process groups and detached descendants, waits for shutdown, and verifies ports are free. It never kills an unrelated existing server to take its port. A failed measurement produces partial JSON/Markdown with `status: failed` when initialization got far enough to establish the output. SIGINT/SIGTERM follows the same cleanup path; SIGKILL cannot run cleanup.

## Run in Vercel Sandbox

After the reviewer has integrated **and committed** the benchmark and route work:

```sh
node --env-file=.env.local scripts/sandbox-bench.mjs
# Separate sandbox/run to check order effects:
node --env-file=.env.local scripts/sandbox-bench.mjs --reverse
```

Use the existing sandbox SDK authentication setup from `sandbox-smoke.mjs`. The runner never uploads `.env.local`: it uploads exactly `git archive HEAD`, verifies that archive's SHA-256 remotely, and records the full commit and archive hash. It refuses to provision if HEAD lacks the suite. It intentionally excludes all uncommitted changes; this implementation leaves its changes uncommitted as requested.

The runner requests `vercel/sandbox/node:24`, four vCPUs (8 GiB at the SDK's documented 2 GiB/vCPU), and a 30-minute maximum lifetime. It installs clang and util-linux if missing, installs pnpm 11.1.3 against the frozen lockfile, builds native then Node, and runs the full profile. Build failures preserve their real exit status. Expected runtime is approximately **10–25 minutes** for the small route set, depending on native compilation and shared-host load; this is an estimate, not a timed sandbox result. Native build / Node build / suite have 10 / 5 / 15 minute individual ceilings; an overall **28-minute abort budget** reserves time for result download and stop, and the 30-minute sandbox lifetime is a final backstop. Adding workloads can exhaust that budget; a timeout is a failed run, never a partial success.

The runner downloads `research/benchmarks/<timestamp>-sandbox-<commit>.json`, `.md`, and `.provenance.json`. Provenance records step times/statuses, requested resources, archive identity, total elapsed time, and sandbox active CPU returned at stop. Partial suite results are downloaded if present on failure. All paths through remote build/run/download errors enter `sandbox.stop()` in `finally`. The sandbox benchmark has **not been run by this implementation task**.

## Metric definitions

The same definitions are embedded in every JSON and generated Markdown report.

| Metric | Exact measurement |
| --- | --- |
| A: route-process cold start | Monotonic time immediately before spawn until first successful HTTP response has been fully read, using identical generated entry under Node 24 versus native binary, without Next. Fresh process each repetition. Two-millisecond connection retry polling. Full profile: 20 repetitions, median (averaging the middle two for even N), nearest-rank p90, min/max. Filesystem caches are retained: process-cold, not machine-cold. |
| A: production startup context | Same spawn-to-first-response measurement for `next start` of the configured route, adapter disabled. The native production startup is also reported, including supervisor/Next/binaries. Route initialization and first request execution are included. |
| B: idle RSS | After one readiness request and the profile's quiet interval, each owned process's RSS and the simultaneous sum. Direct: route process. Production: entire process tree including Next, every native binary, supervisor and other descendants. The initialized route is recorded. |
| B: RSS after N | Per-process and total RSS immediately after each C=1 fixed-count CPU sample. N excludes earlier readiness/warmup/measurement requests; it is not lifetime requests since spawn. Raw before/after snapshots are retained. |
| B: peak RSS | Largest simultaneous process-tree RSS sum sampled every 100 ms and at boundaries, with every process at that snapshot retained. A sampled lower bound; not a kernel high-water mark. Linux uses the kernel's approximate `/proc/PID/stat` RSS counter, while macOS uses `ps RSS`. Sum of RSS may double-count shared pages, and is not PSS. |
| C: CPU/request | Delta of user+system CPU for the stable owned process tree divided by exactly N successful requests, at concurrency 1 after warmup. Linux uses `/proc/PID/stat` utime+stime divided by `getconf CLK_TCK`, excluding child-CPU fields to prevent double counting. Worker threads are included in their process. macOS uses `ps TIME` with centisecond resolution. Both direct route process and production tree are measured. Client CPU is excluded and reported separately. |
| D: throughput | Completed responses divided by dispatch-to-last-drained-response wall time. Closed-loop, C simultaneous HTTP/1.1 keep-alive requests, no pipelining. Dispatch ends at the duration deadline; in-flight requests drain afterward and remain in the denominator. Warmup at every C; three independent measured windows, same warmed process. |
| D: latency | Dispatch to complete body read, including socket acquisition/scheduling, response body and local transport. Nearest-rank p50/p99 within each run. Markdown shows median [min,max] of run statistics; raw request counts and per-run statistics stay in JSON. No coordinated-omission correction or open-loop SLA claim. |
| D: native hop/topology cost | Native production minus native direct median p50/p99 at identical input and C, plus production/direct throughput ratio. Includes all Next proxy/routing/scheduling effects. Subtracting separate percentiles is descriptive; it is not the percentile of paired network-hop measurements. No clamping of negative differences. |
| E: event-loop isolation | Warm heavy route and both probes. Baseline probes have no heavy load. Loaded probes run alongside one continuously outstanding heavy request. Probe `/` and light API sequentially per path, both paths in parallel, with 20 ms after each completion. Heavy starts 100 ms before probes. Report each probe's p50/p99/count and heavy completions. Same offered heavy concurrency, not equal achieved RPS; slow blocking requests can outlive the window. |
| F: threads | Same million orders, 8 regions, 12 scenarios, 60 months and exact integer-cent results for Node objects/clone, Node hand-flattened SAB, native published objects. Fresh process per variant/count, one complete warmup, repeated dispatch+compute+reduction timings. Exclude dataset/pool setup and HTTP from time. Process RSS includes dataset/workers. Average growth/worker = (RSS after computation − dataset RSS before workers)/resident workers. Includes allocator/JIT/GC overhead; not exact clone size or marginal worker allocation. |

CPU intervals include process CPU during the generator's startup/shutdown and boundary snapshots. That residual is especially material for tiny Node requests and low N. Public comparisons should increase N until tick resolution and background CPU are small relative to measured work. This OS CPU metric is relevant to Active CPU economics but does not reproduce Vercel billing instrumentation. Field numbers, clock-tick units and approximate RSS accounting follow the [Linux process-stat manual](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html).

## Fairness choices

The strongest practical Node sharing baseline is included. Ordinary object cloning is useful only to describe the ergonomic tradeoff, never as the sole Node comparator. SAB stays a plain Node program because adding an application route solely for this sharing experiment would complicate application results. Its internal timed region matches the object route; all totals must match exactly. It lacks the HTTP shim in idle RSS, a small advantage for SAB explicitly disclosed alongside its results. The controller passes the original dimensional constants into plain JavaScript SAB workers, avoiding unnecessary per-worker TypeScript-stripping memory. Typed-array access necessarily differs from object access. This comparison is about sharing ergonomics and overhead, not a same-source compiler speedup.

Production Node uses the same route sources through a normal optimized `next build` and `next start`, with adapter disabled, normal V8 JIT and no debug/GC/memory tuning flags. Nonempty `NODE_OPTIONS` is rejected to avoid hidden inherited runtime tuning. The direct comparison uses exactly the same generated entry/shim. Every production native route stays resident, and every one counts toward native mode's memory total even when the tested endpoint does not use it. Idle RSS after `hello` does not claim to be the fully warmed application footprint: fixed-count/load snapshots show growth as more routes initialize.

On Linux the first two allowed logical CPUs are assigned to **both modes' entire application process tree**; the next two go to generator and controller/sampling. Masks are discovered from `/proc/self/status`, validated by taskset, and recorded. The application therefore has a two-vCPU budget; 64 clients do not imply 64 server cores. Four-vCPU thread scaling is a distinct experiment: all variants there use the same first four allowed CPUs, without a sustained external generator. macOS cannot use taskset; its results are always labelled indicative.

The client still shares memory bandwidth and caches with servers. Generator CPU and CPU/wall ratio are recorded in each load result. Although its affinity mask has two CPUs, the generator has one JavaScript event loop and may bottleneck on one core. Throughput rows flag suspected client saturation at a CPU/wall ratio of at least 0.8; treat those rates as lower bounds on server capacity. This diagnostic is not a calibrated generator ceiling. Linux process CPU is measured outside the server without instrumenting either runtime's hot path. Sampling/ps overhead runs on load CPUs. Public runs should be quiet, repeated in both runtime orders, and treated as noisy when spreads overlap.

Responses must match across direct Node, direct native, production Node and production native before timings are accepted. Status errors fail a run; response bodies are SHA-256 checked under load too. Workload fixtures must produce identical bytes, including fixed clocks and keys for token issuance. The suite has no body-normalization escape hatch.

## Realistic-route integration

Edit only the registry when adding a workload. Supply `id`, manifest `pattern`, concrete request `path`, `category: "realistic"`, optional method/headers/body/expected `status`, and a fixed `cpuRequests` count large enough for meaningful CPU accounting. Enable it only after a successful same-source build and cross-surface output check. Set representative deterministic inputs with no external service dependencies. Warmup occurs before timing, so a module-level search index is not charged once per request.

Current placeholders cover login/bcrypt+JWT, search, Markdown, CSV, JWT verification, and RSS. The route owner supplied representative search, article, feed and login inputs; those are prefilled but disabled pending integrated HTTP parity. CSV was refused by the route probe and has no enabled workload. Native cost-10 bcrypt is slow: measure its request cost before choosing concurrency, fixed counts or 20 cold repetitions so it cannot silently exhaust the sandbox budget. The report must retain that limitation; no fast 401 or reduced bcrypt-cost substitute is acceptable. The registry's `serverEnv` pins `DEMO_JWT_NOW=1793318400` and a public benchmark-only signing key uniformly in all direct and production servers; these fixture values are recorded in JSON. Verification must use a valid precomputed token for that key/clock, not a measured token-issuance request or a 401 shortcut. Update the isolation heavy request to login once available, retaining primes as a documented synchronous CPU control if login uses asynchronous bcrypt. No automatic route discovery silently promotes synthetic or incomplete workloads into headline results.

## Local indicative validation

The completed local quick-profile run is stored in [raw JSON](benchmarks/local-indicative.json) and the [generated report](benchmarks/local-indicative.md). It ran for **127.13 seconds**, producing **112 observations**, with Node **24.22.0**, scriptc **0.4.6**, and Next **16.4.3** on an Apple M4 Pro (12 logical CPUs, 24 GiB). Load averages started at 8.90 / 15.39 / 26.27 and ended at 15.21 / 15.63 / 24.83. This is a loaded Mac plumbing check: its p99 sample sizes, CPU tick resolution, unconstrained affinity, and short warmup/windows prohibit public performance claims.

The production idle RSS scope check counted **118.55 MiB in one Node server process**, and **257.61 MiB across the native mode's 12 processes** (10 binaries, Next, and supervisor). These are post-hello initialization snapshots, not fully warmed application footprints.

The four-worker microbenchmark rows below are indicative only; the generated report also contains 1/2-worker rows, ranges, and all application metrics:

| Variant, four workers | Median internal ms | Median process RSS MiB | Average residual growth/worker MiB |
| --- | --- | --- | --- |
| Node ordinary objects / clone | 716.96 | 993.53 | 139.63 |
| Node hand-flattened SAB | 759.04 | 118.26 | 12.38 |
| Native published objects | 589.44 | 106.05 | 0.40 |

All 18 thread observations returned identical totals. The complete run includes 16 cold-start observations, 6 idle snapshots, 16 fixed-count CPU/memory samples, 48 throughput/latency windows, and 8 baseline/loaded isolation windows. Cross-surface body hashes and final source/artifact/build-ID checks passed. All manifest ports, Next port 3417, and the generator regression-test port 3518 were verified free after cleanup.

Additional development checks passed for fixed request counts at concurrency 8, digest-mismatch rejection, process accounting, failed-spawn cleanup, median/p90 aggregation, and failed-report rendering. The final SAB program and its workers are pure JavaScript; dimensions are passed by the unmeasured controller so importing a TypeScript constants file cannot inflate Node worker RSS.

An initial development attempt reached both direct runtimes and both production modes, then a concurrent build replaced `.next/scriptc` during the threads stage. That attempt was invalidated and is not performance evidence. The suite now rejects artifact/build changes and preserves failed-run reports even if cleanup verification fails.

The demo README still references the retired `bench/threads.mjs` command and its old memory scope. That file is outside this task's ownership; integration should replace those instructions with `node examples/demo/bench/run.mjs` and link this methodology. `threads.mjs` is now an internal module of the suite.
