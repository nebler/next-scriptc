# Round 3: production optimization and route grouping

Indicative measurements on a loaded Apple Silicon Mac, 2026-10-31. These decisions are for round 4 implementation, not new Linux performance claims. Base: `fd40dda66ca0cc13e66fd624ce1e6b238e703444`; research branch: `t3/round3-perf-decisions`. No tracked file under `packages/next-scriptc/` was changed.

## Scope and method

The brief says sixteen routes. This checkout has eighteen `route.ts` files: seventeen with `"use scriptc"`, including `static-fixture`, and the Node-only `items/new`. Next prerenders both fixtures. Thus the production resident native set is sixteen. The optimization matrix covers **all eighteen** to avoid silently omitting either interpretation; the topology matrix covers the **sixteen resident native routes**. Prerendered fixtures are additional controls, not a reason to launch unnecessary native processes.

`pnpm install` ran first in the isolated worktree. The installed scriptc 0.4.6 TypeScript helpers arrived without executable permission; setting `u+x` on dependency-local `dist/lib/typescript/lib/tsc` and `dist/lib/tsc-ts/lib/tsc-ts` fixed the initial SC3004 permission failure. The failed attempt is excluded from the three successful build repeats. Compiler/runtime code was not patched.

Hardware: Mac16,8, arm64, twelve logical CPUs, 24 GiB RAM; macOS 26.6.1 / Darwin 25.6.0. Native compiler: scriptc 0.4.6; Next: 16.4.3. Node parity reference: v24.22.0. Other work was active on the host, with no CPU affinity; the one-minute load at native timing windows ranged from 5.53 to 11.07. Ranges below are observed minimum/maximum, not confidence intervals.

The controller reuses the existing `run.py` entry generator, fixture calls, process ownership, and native build runner. Three uncached builds per route/mode run **sequentially**, in release/speed, speed/release, release/speed order. Flags: `--optimization MODE --strip --no-keep-llvm`, `SCRIPTC_NO_CACHE=1`, `SCRIPTC_CHECKER_SERVER=0`, an artifact-owned cache. Installed runtime packs and filesystem caches remain warm. Build seconds include compiler startup, type checking, code generation, linking, and stripping; they are not installation or cold-toolchain costs.

Each binary then runs in four fresh processes, alternating release/speed, speed/release, release/speed, speed/release. One successful untimed result and workload-specific warmups precede a timed window in every process. Calls create fresh Requests, invoke the real handler and drain the Response; no computed output is cached. The compact evidence records all counts, warmups, timings, build commands, binary and source hashes, and parity fingerprints. Report performs its million-order, twelve-scenario, sixty-month computation with one retained worker; successful bcrypt remains cost 10, and successful scrypt uses N=32768/r=8/p=1. Search uses all 3,000 products; upload and histogram use 1 MiB payloads; export uses 5,000 rows. `DEMO_JWT_NOW=1800000000` fixes token issuance on both runtimes.

Output parity compares status, sorted response headers, and the complete body against Node. Gzip compares SHA-256 of the complete decompressed body and its representation headers. Report compares its complete deterministic `result`, excluding intentionally variable timing/RSS/runtime fields. RSS in the mode matrix is the process's post-window RSS, including report's worker; it is not peak memory. These handler-loop numbers exclude HTTP and Next proxy cost.

## Decision 1: optimization mode

**Recommendation: retain `release` as the production default; expose `speed` only as an explicit per-route opt-in. Do not select speed automatically for any demo route.** The small local gains do not justify a global behavior change, and this matrix does not reproduce the round-1 13–22% kernel gains at the real-handler boundary.

Among the sixteen resident routes, nine median ratios favor speed and seven favor release. The largest resident median improvement is image-histogram, **3.5%** (1.049 → 1.012 ms); one of its four paired runs reverses. Primes improves **3.0%**, also with a reversed pair. Gzip improves **3.0%** and nearby-stores **1.7%**, both favorable in all four pairs. Markdown, search, JWT, report, upload and revenue are essentially unchanged here. Scrypt is nominally 0.7% slower in every pair. Bcrypt's median is **3.9% slower**, with a speed range reaching 8.811 seconds/call; retain that outlier instead of removing it. These runs do not isolate the effects of changing host state from a mode-specific regression. The prerendered static fixture's 6.9% gain is not a production native-route benefit.

These are reasons to let an application measure a particular route on its deployment architecture, not to promise a universal improvement. A quiet Linux repeat is needed before making close mode comparisons public. The clean API is the central route map proposed below; opt-in is a compiler control, with no bundled list of presumed winners.

Each timing cell is the median [min, max] of four fresh-process post-warmup windows. Ratios use the two medians; the four individual speed/release pair ratios keep order effects and reversals visible. Values below one favor speed. `items-new` and `static-fixture` are extra controls.

| Route | release ms/call [range] | speed ms/call [range] | speed/release | Paired speed/release (4 runs) | Parity vs Node |
| --- | ---: | ---: | ---: | --- | --- |
| markdown | 19.289 [18.314, 19.751] | 18.984 [18.411, 19.776] | 0.984× | 0.975, 0.956, 1.080, 0.968 | True |
| search | 2.105 [2.086, 2.158] | 2.106 [2.085, 2.140] | 1.001× | 1.018, 1.026, 0.966, 0.984 | True |
| login-scrypt | 71.369 [70.521, 72.077] | 71.842 [70.936, 72.179] | 1.007× | 1.010, 1.003, 1.006, 1.001 | True |
| verify | 0.022653 [0.022187, 0.022972] | 0.022613 [0.022492, 0.022873] | 0.998× | 0.983, 1.008, 1.014, 1.002 | True |
| primes | 3.374 [3.330, 3.478] | 3.273 [3.255, 3.360] | 0.970× | 0.936, 0.957, 0.986, 1.007 | True |
| report | 1139.080 [1135.097, 1139.416] | 1140.507 [1136.629, 1141.603] | 1.001× | 1.001, 1.002, 1.006, 0.998 | True |
| hello | 0.002897 [0.002820, 0.002974] | 0.002907 [0.002861, 0.003029] | 1.003× | 1.019, 1.003, 1.004, 1.015 | True |
| url-echo | 0.002787 [0.002694, 0.002819] | 0.002760 [0.002672, 0.002794] | 0.990× | 0.948, 1.035, 0.992, 0.991 | True |
| items | 0.002539 [0.002474, 0.002592] | 0.002502 [0.002444, 0.002530] | 0.986× | 1.005, 0.973, 1.015, 0.943 | True |
| items-new | 0.000962 [0.000933, 0.001017] | 0.000975 [0.000972, 0.001010] | 1.014× | 1.082, 1.019, 1.008, 0.956 | True |
| static-fixture | 0.001027 [0.001011, 0.001067] | 0.000956 [0.000933, 0.000963] | 0.931× | 0.903, 0.951, 0.891, 0.944 | True |
| login | 7031.358 [7013.523, 7069.134] | 7305.702 [6976.591, 8811.263] | 1.039× | 1.008, 0.994, 1.256, 1.062 | True |
| feed | 19.922 [19.735, 20.824] | 19.784 [19.662, 20.961] | 0.993× | 0.989, 0.950, 0.990, 1.062 | True |
| gzip-export | 1.505 [1.472, 1.514] | 1.460 [1.419, 1.482] | 0.970× | 0.988, 0.975, 0.941, 0.979 | True |
| upload-integrity | 4.037 [4.025, 4.056] | 4.048 [4.011, 4.300] | 1.003× | 0.996, 0.998, 1.007, 1.060 | True |
| image-histogram | 1.049 [1.042, 1.070] | 1.012 [1.008, 1.094] | 0.965× | 0.955, 0.968, 0.974, 1.022 | True |
| nearby-stores | 0.906 [0.897, 0.928] | 0.890 [0.875, 0.895] | 0.983× | 0.997, 0.988, 0.978, 0.943 | True |
| revenue | 0.692 [0.690, 0.697] | 0.695 [0.691, 0.711] | 1.003× | 1.019, 1.004, 1.008, 0.997 | True |


| Route | Binary MiB release / speed | Warm RSS MiB release [range] / speed [range] | Build seconds release [range] / speed [range] |
| --- | ---: | ---: | ---: |
| markdown | 4.513 / 4.592 | 9.56 [9.55, 9.64] / 9.62 [9.59, 9.66] | 18.16 [18.05, 18.70] / 18.99 [18.28, 19.05] |
| search | 2.309 / 2.324 | 27.80 [27.62, 27.92] / 27.78 [27.73, 28.02] | 3.13 [3.11, 3.32] / 3.26 [3.16, 3.37] |
| login-scrypt | 2.910 / 2.957 | 36.29 [36.28, 36.31] / 36.38 [36.34, 36.39] | 3.93 [3.90, 4.25] / 3.83 [3.83, 4.38] |
| verify | 2.989 / 3.036 | 4.57 [4.56, 4.59] / 4.72 [4.70, 4.75] | 4.62 [4.29, 5.66] / 4.79 [4.38, 5.56] |
| primes | 1.428 / 1.428 | 5.16 [4.66, 5.67] / 4.60 [4.59, 4.62] | 0.52 [0.51, 0.53] / 0.55 [0.54, 0.56] |
| report | 1.600 / 1.600 | 105.74 [104.69, 106.77] / 104.68 [104.64, 106.70] | 0.53 [0.52, 0.56] / 0.57 [0.55, 0.57] |
| hello | 1.302 / 1.302 | 2.70 [2.69, 2.70] / 2.70 [2.70, 2.70] | 0.52 [0.52, 0.81] / 0.55 [0.55, 0.57] |
| url-echo | 1.302 / 1.302 | 2.72 [2.70, 2.72] / 2.72 [2.70, 2.75] | 0.53 [0.53, 0.53] / 0.55 [0.55, 0.56] |
| items | 1.303 / 1.319 | 2.67 [2.67, 2.69] / 2.63 [2.61, 2.64] | 0.50 [0.50, 0.50] / 0.54 [0.53, 0.54] |
| items-new | 1.286 / 1.286 | 2.52 [2.50, 2.55] / 2.52 [2.52, 2.53] | 0.45 [0.45, 0.46] / 0.48 [0.47, 0.48] |
| static-fixture | 1.286 / 1.286 | 2.54 [2.53, 2.56] / 2.52 [2.50, 2.52] | 0.44 [0.44, 0.45] / 0.48 [0.47, 0.49] |
| login | 3.226 / 3.289 | 4.55 [4.23, 4.61] / 4.53 [4.53, 4.58] | 4.95 [4.85, 5.07] / 4.99 [4.97, 5.11] |
| feed | 4.656 / 4.750 | 9.51 [9.42, 9.77] / 10.01 [9.97, 10.03] | 17.19 [15.38, 17.48] / 18.12 [18.02, 18.35] |
| gzip-export | 1.509 / 1.509 | 7.54 [7.53, 7.56] / 7.52 [7.34, 7.53] | 0.60 [0.59, 0.68] / 0.61 [0.61, 0.64] |
| upload-integrity | 1.431 / 1.431 | 10.95 [10.94, 10.95] / 10.97 [10.97, 14.98] | 0.57 [0.57, 0.57] / 0.62 [0.61, 0.62] |
| image-histogram | 1.445 / 1.445 | 11.92 [10.89, 12.94] / 11.42 [10.91, 14.92] | 0.52 [0.51, 0.56] / 0.56 [0.55, 0.57] |
| nearby-stores | 1.461 / 1.477 | 4.74 [4.72, 4.75] / 4.73 [4.70, 4.73] | 0.60 [0.58, 0.83] / 0.71 [0.59, 0.88] |
| revenue | 1.574 / 1.574 | 5.10 [5.06, 5.12] / 5.10 [5.09, 5.11] | 0.61 [0.60, 0.70] / 0.67 [0.65, 0.77] |

Binary sizes were identical across each mode's three successful builds, so only their median is shown. These are **in-process probe entry binaries**, including parity instrumentation, not the HTTP adapter binaries or deployment package totals. Across the sixteen resident entries, summed median sizes are 34.956 → 35.334 MiB (**+1.1%**), and the sum of per-entry median build times is 57.47 → 59.89 seconds (**+4.2%**). The latter is a summary of separate builds, not a measured full Next build. Mode RSS shows no systematic reduction; feed rises from 9.51 to 10.01 MiB. Do not sum sequential per-entry RSS into a simultaneous app total.

The first gzip parity attempt emitted a large decoded body and Node's immediate exit truncated its stdout. That cell was discarded and repeated after changing only the parity record to SHA-256 of the complete decoded body. Timing still performs the original gzip handler and drains its compressed bytes; decoding/hash validation is outside the timed window.


## Decision 2: grouping and worker feasibility

The topology experiment imports the existing `shim/grouped.ts` request/response transport unchanged. Sixteen single-route binaries use the same transport as the grouped binaries, isolating topology from shim changes. Servers start concurrently within each topology, matching the adapter's process-spawn policy; builds remain sequential. Three fresh repetitions reverse topology order in the middle repeat. Every route receives one successful full-size initialization request before initialized RSS is sampled.

Topologies:

- **separate**: sixteen resident native route processes.
- **light**: one group containing hello, verify, url-echo, items, nearby-stores, revenue, gzip-export, upload-integrity; eight other processes contain login, login-scrypt, search, Markdown, feed, primes, report, image-histogram. No prerendered fixture is forced into a native group. Scrypt is kept separate because its scriptc implementation blocks before callback deferral.
- **all**: one binary containing all sixteen resident routes.
- **worker**: the same all-sixteen route set in one binary, with Markdown executed in one retained native worker thread. Other handlers stay on the main event loop; report still retains its own existing worker after initialization. This tests feasibility, not a general worker pool.

Readiness is spawn-to-all-TCP-listeners-open, including the controller's concurrent-spawn/polling overhead. These prototype entries import route modules eagerly. Today's adapter uses a bind-first asynchronous route loader, so the listener times here must **not** be presented as a regression or improvement in production Next readiness. First successful initialization of all routes is measured separately. Memory is simultaneous **summed RSS**, not PSS/unique physical memory; shared pages can be counted more than once and macOS residency/compression can change with host pressure. The Next server and load generators are excluded. These measurements cannot be added to the Linux Node baseline to invent a new end-to-end app total.

**Recommendation: keep one native process per route by default. Offer explicit named groups for users who accept shared latency and failure behavior; do not auto-group the proposed light set. Defer a general worker-backed grouping mode until its transport and supervision are complete.**

The all-route process saves **40.67 MiB idle (54.2%)** and **60.77 MiB initialized (25.1%)** versus sixteen separate processes. That buys a large isolation regression: hello under Markdown rises from **0.126/0.242 ms p50/p99** separately to **18.745/22.207 ms** grouped. Shared module state, globals, environment, memory pressure, crashes and restarts are additional grouping costs; the same imported helper becomes a shared instance across routes. A group is one failure and scheduling domain.

The tested light topology is a smaller compromise: **16.70 MiB idle (22.2%)**, **22.08 MiB initialized (9.1%)** saved, with nine processes. Keeping Markdown outside the group preserves hello under that load, but grouping gzip export with hello raises p99 from **0.253 to 1.827 ms** during the same gzip load (about **7.2×**). “Light” is not an isolation guarantee: upload, aggregation and geo computation also consume the common thread, and their contention tails were not separately tested here. An explicit group can be useful for a memory budget and modest/low-concurrency traffic; a sub-millisecond interactive tail budget argues for keeping these routes separate.

The worker prototype demonstrates a viable future direction: initialized summed RSS **183.22 MiB**, only **1.61 MiB** above the all-route main-thread median, and hello during Markdown **0.137/0.245 ms p50/p99**. That keeps nearly all the measured process-memory savings while removing this parser's head-of-line blocking. It moves **only Markdown**: gzip still raises p99 to **1.920 ms**, and synchronous login, feed and other main-thread handlers remain potential blockers. Do not extrapolate the memory increment to a pool for every route, or call this a complete grouped-worker adapter.

These measurements address the mechanism behind round 2's **229 MiB native versus 128 MiB Node whole-app idle totals** ([Linux report](benchmarks/sandbox-2026-10-31T01-16-13.905Z.md)). They do not replace those totals: this experiment excludes Next, uses macOS RSS, and initializes the memory-heavy report dataset/worker plus every other route for the second snapshot. A single grouped native process still leaves the Next frontend in the application. No new native/Node whole-app ratio is claimed.

All cells are medians [min, max] across three fresh topology repetitions. All initialization statuses and body hashes matched across all twelve runs.

| Topology | Processes | Idle summed RSS MiB | Initialized summed RSS MiB | All listeners ready ms | Initialize all routes ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| separate | 16 | 75.08 [74.91, 75.11] | 242.38 [240.25, 242.53] | 304.12 [299.14, 6288.36] | 8310.73 [8254.66, 8329.67] |
| light | 9 | 58.38 [58.20, 58.48] | 220.30 [217.75, 220.48] | 300.85 [299.73, 366.31] | 8327.64 [8154.11, 8354.69] |
| all | 1 | 34.41 [34.00, 34.56] | 181.61 [178.73, 182.00] | 434.26 [431.37, 948.05] | 9240.10 [9219.11, 9276.41] |
| worker | 1 | 36.12 [36.12, 36.62] | 183.22 [182.39, 183.34] | 436.23 [432.31, 906.96] | 9283.67 [9251.54, 9391.23] |

| Topology | hello idle p50 / p99 ms | hello with Markdown C=1 p50 / p99 ms | hello with gzip C=1 p50 / p99 ms |
| --- | ---: | ---: | ---: |
| separate | 0.130 [0.122, 0.131] / 0.278 [0.232, 0.299] | 0.126 [0.122, 0.142] / 0.242 [0.235, 0.262] | 0.135 [0.123, 0.146] / 0.253 [0.245, 0.282] |
| light | 0.130 [0.129, 0.131] / 0.249 [0.238, 0.268] | 0.128 [0.124, 0.138] / 0.236 [0.229, 0.697] | 0.178 [0.173, 0.179] / 1.827 [1.820, 1.857] |
| all | 0.136 [0.134, 0.145] / 0.337 [0.272, 0.643] | 18.745 [18.712, 18.918] / 22.207 [21.396, 22.739] | 0.199 [0.190, 0.205] / 1.929 [1.867, 1.986] |
| worker | 0.140 [0.136, 0.141] / 0.296 [0.266, 0.312] | 0.137 [0.135, 0.141] / 0.245 [0.234, 0.253] | 0.193 [0.190, 0.276] / 1.920 [1.880, 2.360] |

Topology full-body initialization parity: True.

Grouping did not establish a readiness benefit in this eager-import prototype: the all-route and worker listener medians are about 434–436 ms versus 304 ms separately. The first separate launch took **6288 ms** and remains in its range; do not discard the first-launch/host-state outlier. Initialization includes real bcrypt work and construction/execution of report, so its ~8–9 seconds are not pure startup overhead.


For blocking, two independent Node keep-alive clients issue one request at a time. The heavy client warms ten real requests, then remains active throughout the hello window. Hello warms thirty requests, then measures 300; the table summarizes each repetition's empirical p50 and nearest-rank p99 across three fresh topology processes. Markdown is inside all/worker and outside separate/light. Gzip export is inside all/light/worker and outside separate. Thus the light group is checked both against an excluded heavy route and against one of its own CPU-consuming members. These short local tails describe this workload, not an SLA or saturation/arrival-rate model.

The [upstream worker restrictions](https://github.com/vercel-labs/scriptc/blob/main/docs/content/limitations/native-worker-threads.mdx) document build-time-resolvable worker entries, separate per-thread module state/event loops/heaps, and typed message cloning. These docs track upstream main and can lead installed releases; the compiled 0.4.6 prototype is the support evidence here. It uses a source-relative `new Worker(new URL(..., import.meta.url))`, typed request/reply messages, and the real Markdown handler on every request. It forwards URL, headers, slug, response status, headers, and text. One admitted job is retained; overflow gets 503, and worker error/exit invalidates the slot. There is no unbounded application queue.

This codec is GET/text-only. A production worker adapter would need binary request/response transport, streaming and cancellation, repeated cookies, bounded admission/queue policy, worker readiness, error propagation/restart, shutdown, and equivalent Node behavior. `Request` and `Response` objects are not assumed to be directly transferable. Worker threads share a process's crash/address-space fate and do not recover process isolation.

## Round 4 API recommendation

Use one static, serializable route-pattern map in a **second** `withScriptc` argument, retaining the existing first `NextConfig` argument:

```ts
withScriptc(nextConfig, {
  routes: {
    "/api/primes": { optimization: "speed" }, // only after measuring this deployment
    "/api/hello": { group: "public-light" },
    "/api/verify": { group: "public-light" },
    "/api/url-echo": { group: "public-light" },
    "/api/items/[id]": { group: "public-light" },
    "/api/stores/nearby": { group: "public-light" },
    "/api/analytics/revenue": { group: "public-light" },
    "/api/export.json.gz": { group: "public-light" },
    "/api/uploads/verify": { group: "public-light" },
  },
});
```

The eight named group members reproduce the measured light topology; the speed setting is illustrative and does not change the recommendation to leave the demo defaults on release.

This is a **proposed API**, not an option currently accepted by this branch. Default optimization remains `release`; an omitted group keeps one route per binary/process. Use normalized discovered Next route patterns, not source-file globs or request URLs. Reject unknown route keys, unsupported optimization values, and conflicting optimization choices inside a group: a binary has one build mode. Resolve omitted optimization to the default before conflict checking. Keep declaration order out of routing semantics and retain Next's static/dynamic/catch-all precedence. Remove prerendered routes from native group plans.

The central map avoids extra route-module exports that must fit Next's route export validation, and lets the build inspect cross-route grouping. Carry options through the build plan and persist group/binary/process membership plus mode in the build manifest; supervise and restart one child per group, with all its routes sharing a port. Manifest validation and supervision must count **processes**, not spawn the shared binary once per route. Settings belong to the build artifact, with no new runtime environment toggle required. Do not automatically classify a route as light by filename, sync/async syntax, or library name. A memory-constrained user should choose grouping after measuring their concurrency and latency budget.

## Reproduction and retained evidence

From this worktree root, run phases sequentially, without another sustained benchmark:

```sh
pnpm install
export PROBE_NODE=/path/to/node24
python3 examples/probe/perf/round3.py
python3 examples/probe/perf/round3.py http-build
python3 examples/probe/perf/round3-topology.py
python3 examples/probe/perf/round3-summary.py
```

The mode controller resumes completed cells in `examples/probe/.artifacts/perf-levers/round3/modes.json`. Use a fresh/moved artifact directory to repeat the whole experiment. `round3.py generate` emits ignored probe entries without building. The two production mode commands generated for every entry are:

```sh
packages/next-scriptc/node_modules/.bin/scriptc build \
  examples/probe/perf/round3-generated/hello.ts \
  -o examples/probe/.artifacts/perf-levers/round3/hello-release \
  --optimization release --strip --no-keep-llvm
# Replace release with speed in both the output name and flag.
```

Committed compact evidence: [round3-results.json](../examples/probe/perf/round3-results.json). Local full compiler logs, complete mode parity records, individual runtime stdout/stderr, binaries, topology client runs and server logs are under the ignored artifact directory above. The report tables are regenerated from those JSON measurements, not manually transcribed.

Validation: 108 successful mode builds, 144 native timing windows, eighteen Node parity references, nineteen successful HTTP binaries, and twelve topology runs. Python syntax checks, the HTTP client's Node syntax check, parity/completeness assertions in the summarizer, and `git diff --check` passed. The bounded worker prototype's initial SC1090 union-to-string refusal was corrected by narrowing the slug to a string before posting it; no compiler/runtime patch was used.

Cleanup checked owned process command paths and all listener ports 46173–46188 after the final run: no research compiler, native server or load generator remained. The controllers own their child process groups and stop server/load processes in `finally`; report and Markdown worker threads terminate with their owning process. Other agents' processes were not stopped.

Research branch: `t3/round3-perf-decisions`, based on `fd40dda66ca0cc13e66fd624ce1e6b238e703444`. Commit identifiers are recorded below; nothing was pushed.

- `4ca6fa9673f25c0419f8fdae9cc94bbeef60df6a` — Add round 3 optimization and grouping research probes.
- `Record measured round 3 decisions and evidence` — the following commit, containing this report and compact results. Resolve its identifier with `git log -1 --format=%H -- research/round3-decisions.md`; its hash is also supplied in the handoff message.
