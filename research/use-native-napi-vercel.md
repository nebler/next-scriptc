# In-process N-API revenue on Vercel

2026-11-01. Branch `t3/vercel-napi-addon-benchmark`. A1's exact serialized Linux addon loads and runs on real Vercel hardware. **GO for the median-based feasibility gate**. Every successful revenue result matches plain Node by SHA-256. The earlier warm window also wins 5k median, but loses p95. At 5k, Node takes 3.809 ms median, addon sync 2.774 ms and addon async 2.759 ms. Async saves 27.6%. The 1k workload loses. This is a restricted synchronous-core experiment, not production adapter approval.

## What runs

The prebuilt Build Output API deployment contains five plain Node Functions: one warm comparison and four first-call endpoints. This is the minimal separate application allowed by the task, on the existing next-scriptc project. There is no Next render or adapter extraction in the measured path. Explicit files in each Function bundle replace output-file tracing.

Stock scriptc 0.4.6, runtime ABI 47, stock @scriptc/runtime-linux-x64-gnu 0.4.6, Zig 0.16.0 and x86_64-linux-gnu.2.34 match A1. The reused 676,944-byte addon has SHA-256 `9f579716b498a7c74ad0f4e7d6c09a357062d3c4656be54cc9c74a69c81771c8`, identical to A1. Its archive was linked by Zig with the plain C shim in research/napi/src/addon.c. [Artifact record](napi-vercel/raw/artifacts.json) records the new stock sidecar build. The sidecar uses the current serveFunctions, createSidecar and callNative implementations with release, strip and node-islands off, targeting the same GNU pack. Historical adapter deployments used a musl pack and cpu-dispatch; this controlled A1-pack comparison does not reproduce those binary bytes.

All recorded successful hosted responses report Node 24.22.2, linux, x64, VERCEL_REGION iad1 and Intel Xeon at 2.50GHz. Each response's x-vercel-id contains ::iad1::. The first component is fra1 because the request driver runs in Europe. Two visible logical CPUs do not establish CPU entitlement. Function configuration requests 2048 MiB, x86_64, nodejs24.x, iad1 and maxDuration 300. CLI 65.8.0 deployed only previews. The project-level Node setting stayed unchanged.

## Warm comparison

Cells are **median / p95 milliseconds**, nearest-rank percentiles. Each row has **60 measured calls per variant after 15 retained warmups**. Order rotates on every iteration, sequentially, inside a single Function invocation per size. The same instance serves all four sizes. No timed sample is removed. Hashing follows the timer. Fixtures remain cached per runtime after their first call, while every call parses events, aggregates, sorts and returns the full result.

| Events | Node | Sidecar | Addon sync | Addon async | n per variant |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1000 | 0.852 / 0.889 | 2.388 / 2.738 | 1.703 / 1.966 | 1.724 / 1.970 | 60 |
| 5000 | 3.809 / 4.065 | 3.607 / 4.003 | 2.774 / 3.049 | 2.759 / 3.042 | 60 |
| 15000 | 11.344 / 15.453 | 6.698 / 7.401 | 5.573 / 6.093 | 5.482 / 6.733 | 60 |
| 200000 | 171.508 / 191.066 | 57.868 / 73.709 | 52.887 / 53.947 | 52.671 / 56.001 | 60 |

At 5k, sync saves 27.2% median and async saves 27.6%. Sidecar wins against Node. Async wins 5k p95. The kill criterion is interpreted as a median win, consistent with the earlier 4.3 versus 3.8 ms result. The earlier window loses 5k p95 for both addon modes, so a p95 win across placements is not established. At 200k, async is 3.26 times as fast at median.

The earlier complete warm window is also retained and reported. Its first-call bundles were deduplicated, but its within-instance warm comparison remains valid. No data from that window is silently pooled or discarded.

| Events | Node | Sidecar | Addon sync | Addon async | n per variant |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1000 | 0.598 / 7.120 | 2.092 / 7.999 | 1.412 / 9.823 | 1.465 / 9.418 | 60 |
| 5000 | 2.634 / 8.117 | 3.099 / 8.230 | 2.200 / 11.289 | 2.238 / 10.830 | 60 |
| 15000 | 11.799 / 16.015 | 5.688 / 12.552 | 4.311 / 11.228 | 4.349 / 12.745 | 60 |
| 200000 | 172.561 / 190.272 | 66.040 / 94.720 | 57.860 / 64.701 | 60.133 / 67.306 | 60 |

These are caller-side function intervals, excluding network and framework work. Node measures await revenue. Sidecar includes strict arguments, readiness access, loopback RPC and result parsing. Addon sync and async include strict argument encoding, native parse, aggregation, strict native result encoding, UTF-8 copies, JSON.parse and the permanent-owner-thread queue. Async also includes libuv scheduling. Server-Timing reports the whole batch interval; each individual interval is in the response JSON and raw data. NATIVE_VERCEL_TIMING is not used because this application measures the function directly.

The driver did not use the existing near-client: all comparisons run within the target Function, so server-side timing removes WAN latency. WAN request wall times are retained but are not the comparison metric. Sustained in-invocation loops can encounter CPU scheduling or quota effects unlike isolated HTTP requests. Tail spikes are included. Two warm instance placements and short windows do not establish fleet performance, sustainable throughput or an absence of scheduling bias.

## Fresh deployment first calls

Each final preview gives each first-call Function a different module file to prevent Vercel deduplication. The four UUIDs per deployment must be distinct. There are eight distinct cold instances across two fresh previews, with order reversed on the second. No first-call Function is warmed or probed before measurement. Size is 5k for all these calls. n is **2 per variant**, and both observations are shown instead of a misleading small-sample percentile.

| Variant | Preview | Module load ms | First call with init ms | Load plus first call ms |
| --- | ---: | ---: | ---: | ---: |
| node | 1 | 8.243 | 14.040 | 22.283 |
| node | 2 | 8.623 | 11.302 | 19.925 |
| sidecar | 1 | 85.316 | 27.024 | 112.340 |
| sidecar | 2 | 69.099 | 22.153 | 91.251 |
| sync | 1 | 8.997 | 7.650 | 16.648 |
| sync | 2 | 9.273 | 8.021 | 17.293 |
| async | 1 | 8.768 | 12.952 | 21.720 |
| async | 2 | 20.182 | 14.080 | 34.263 |

Load starts immediately before dynamic workload imports or require of the addon. Addon first call includes pthread creation, runtime initialization and fixture generation. Sidecar load includes importing its client and spawning its child; first call includes waiting for readiness and the first RPC. These totals exclude Node process startup, platform activation and request routing, so they are not end-to-end cold-start latency. Common handler imports precede the timer for every variant. SHA-256 matches for every successful first call.

## Correctness and retained failures

Arguments are [2026-01-01, 2026-01-31, size, false]. Node runs the original async revenue function with types stripped at build time. The addon is A1's synchronous facade with the serialized permanent owner thread. Both addon modes share that owner during the warm comparison. The workload generator and strict result encoder are unchanged. Profile false keeps timings null.

| Events | SHA-256 of complete result JSON |
| ---: | --- |
| 1000 | 1f2cc28bb6e3d0bf7460cf02ce2ec26cdceb0feeb889a21f0df64e2ad09e1907 |
| 5000 | 58e99230368693d8899627a9c334b197a66005e8504ac2874e55fb6596ef720c |
| 15000 | 840f7945ea97344d82dfbfaacd0e3af6a2621303a84b634e101f2be7c2ef7a61 |
| 200000 | 7d29e6b712a858e37b760f58635f403259481c586c30cad9f4e2642cff0d1819 |

The server compares every result against its first Node warmup. The driver independently compares every retained result against A1's recorded plain-Node result bytes, including each complete cold result. Raw warmups and all outliers remain in [raw data](napi-vercel/raw). Each complete warm window contains 1,200 checked calls. The two complete windows and 17 successful first calls produce 2,417 verified results; the failed sidecar response is retained separately.

Attempt 1 imported the stock sidecar module without the adapter bootstrap flag. Its automatic singleton tried /var/task/scriptc-functions while the explicit test binary was named functions. Node succeeded, sidecar returned HTTP 500, and the run stopped and paused. The correction sets NEXT_SCRIPTC_VERCEL=1 inside the measurement process before dynamic imports, as the adapter does. No project environment variable changed.

Attempt 2 passed all warm comparisons but Vercel deduplicated byte-identical Function directories. Its first-call records share one UUID per preview, so later paths reuse modules and native initialization. Those eight records are retained as invalid cold evidence. Final packaging appends a distinct exported identifier to each Function module, and the driver asserts four distinct cold UUIDs. The final full warm run was repeated after this packaging correction. No deployment or sample was selected for speed.

## Preview identities and project pause

| Attempt | Deployment ID | Preview URL |
| --- | --- | --- |
| Failed auto-start | dpl_6t6m837NbEygQmxghuZLdRM8BkPU | https://next-scriptc-pee18yk1i-noahs-projects-8a075d15.vercel.app |
| Deduplicated 1 | dpl_Bsz1CsBbC9AwHy6YekyMVbtXACm5 | https://next-scriptc-85bekrjsc-noahs-projects-8a075d15.vercel.app |
| Deduplicated 2 | dpl_FqQhzNTm1qHpkJNcH2pGnu5pqXVi | https://next-scriptc-n4o9ewjw3-noahs-projects-8a075d15.vercel.app |
| Final 1 | dpl_FGPoGu5YuNc75QSPYUhXikWcDiwo | https://next-scriptc-19tptdyx8-noahs-projects-8a075d15.vercel.app |
| Final 2 | dpl_E1f1NFba49jqsiMyC4JAFHGqEt3M | https://next-scriptc-go1c53wvg-noahs-projects-8a075d15.vercel.app |

| Window | Unpause completed UTC | Pause completed UTC | Production check |
| --- | --- | --- | --- |
| 1 | 2026-11-01T10:51:05.324Z | 2026-11-01T10:51:23.950Z | 200 at 2026-11-01T10:51:25.017Z |
| 2 | 2026-11-01T10:51:52.769Z | 2026-11-01T10:52:47.399Z | 503 at 2026-11-01T10:52:47.567Z |
| 3 | 2026-11-01T10:53:17.435Z | 2026-11-01T10:54:16.309Z | 503 at 2026-11-01T10:54:16.760Z |

After attempt 1, the immediate production check still returned 200. A repeated pause POST and subsequent curl returned 503, with API paused=true; [confirmation](napi-vercel/raw/attempt-1/pause-confirmation.json) records the observation by 10:51:51.547 UTC. Final pause completes at 2026-11-01T10:54:16.309Z. The final production /api/hello check returns **503**. All pause and unpause operations used authenticated vercel api, never a raw auth.json token.

The private bypass was read from the main checkout's ignored .env.local and sent only as a header to the new preview URLs. It was never printed or committed. No production deploy, promotion, explicit alias/domain change, new project, environment setting change, Sandbox, Docker, push or upstream PR was performed. No pull/env-pull command changed .gitignore. Generated outputs are removed within this worktree after measurements.

## Remaining work

A1 now has Linux execution evidence and a hosted median comparison. It still needs restricted synchronous-core extraction, addon lifecycle cleanup, queue backpressure and cancellation, panic policy, ABI/build matrix and architecture-aware artifact tracing before adapter integration. The serialized design limits throughput and its async implementation occupies libuv workers while the owner computes. This experiment adds no concurrency soak, crash recovery proof or memory-growth certification on Vercel. A1's local soak remains separate evidence.

The first-call sample is small and omits platform activation. Warm timings come from a continuously busy custom Function, with no independent CPU quota measurement. The 1k loss and all p95 losses remain constraints on where this approach helps.

Scripts are [prepare.mjs](napi-vercel/prepare.mjs), [package.mjs](napi-vercel/package.mjs), [run.mjs](napi-vercel/run.mjs), [summarize.mjs](napi-vercel/summarize.mjs), and [report.mjs](napi-vercel/report.mjs). Preparation expects the stock GNU pack extracted into .checks/napi-vercel/package, reuses A1_ADDON after a hash check, strips JS with Node 24, and builds the sidecar. Fetch the pack with npm pack @scriptc/runtime-linux-x64-gnu@0.4.6 and extract its tarball there. Copy the existing project link into .checks/napi-vercel/.vercel/project.json. Run prepare.mjs and package.mjs before run.mjs. After the runner pauses, summarize.mjs derives the results. report.mjs formats this retained three-attempt investigation. run.mjs refuses existing lifecycle data, unpauses immediately before the first upload, and pauses in finally and on SIGINT/SIGTERM. To reproduce, use a fresh raw-data directory or preserve the prior raw directory first. Do not overwrite earlier measurements.
