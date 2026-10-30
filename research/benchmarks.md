# next-scriptc benchmark suite — review round 2

The application workloads are successful cost-10 bcrypt login with JWT issuance, authenticated JWT verification, search over 3,000 products, uncached Markdown rendering, and full-content RSS. `hello` is a small-response control; `primes` is a synchronous CPU control; `report` is a synthetic worker/sharing experiment. CSV and OG-image generation were refused by the route probe and are not successes. See [probe limitations](../examples/probe/RESULTS.md).

The direct comparison runs **the identical generated `.next/scriptc/entry-N.ts`**, including the HTTP shim, under Node 24 type stripping and as its scriptc 0.4.6 binary. Production compares a normal optimized Next 16.4.3 `next build` / `next start` with the adapter disabled (`.next-node`) against Next plus all resident native route binaries. Keep Node's normal JIT and Next's static optimizations: Node prerenders `hello` and `feed.xml`; this is explicitly retained as the stronger application baseline. It is not a same-execution-path comparison for prerendered routes. Direct measurements still execute every handler request.

## Reproduce locally

Use Node **24.x** and pnpm **11.1.3** on PATH. Build sequentially from an unchanged checkout:

```sh
pnpm install --frozen-lockfile
pnpm --filter demo build
NEXT_SCRIPTC_BASELINE=node pnpm --filter demo build
node examples/demo/bench/check.mjs
node examples/demo/bench/run.mjs --profile quick --output research/benchmarks/local-indicative
```

The suite uses `process.execPath` for every Node server, worker controller and generator, rejects other Node majors and nonempty `NODE_OPTIONS`, and records exact versions, start mode, source/entry/binary SHA-256s, build IDs, dirty status, CPU masks and load averages. Native compilation uses the adapter's default release settings; no speed-only build flags or runtime tuning are added. Fresh builds are mandatory: source hashes cannot retroactively prove an old binary matches a new source. Final artifact/source/build-ID checks reject concurrent edits or builds.

The full suite is intentionally budgeted rather than a large statistical study. `sandbox` (the default) uses three cold repetitions, two steady repetitions, 1 s warmup and 1 s measurement windows at C=1/8/64. `quick` uses one cold/steady repetition, 300 ms warmup and 400 ms windows, and caps fixed-count CPU samples at 40 requests. Both include **every workload**, both scopes/runtimes, both isolation loads, and all three worker variants at 1/2/4 workers. Login has the separate fixed budget below in either profile.

```sh
# Partial rerun; coverage is always added automatically.
node examples/demo/bench/run.mjs --profile sandbox --sections direct,production
# A distinct order check, not pooled silently with the first run:
node examples/demo/bench/run.mjs --profile sandbox --reverse
```

Sections are `coverage,cold,direct,production,isolation,threads`. Selected sections execute in the requested order, preceded by coverage. Omitted sections remain absent in JSON; do not describe a subset as a complete suite. Each section prints its estimated duration before it starts.

Native production start handling lives in **`bench/config.mjs:productionCommand`**. The current checkout uses `--native-start=adapter` (default, `next-scriptc start`). After integrating the adapter's plain-Next supervisor, pass `--native-start=next` to use `next start`. The sandbox runner forwards the same flag; it does not maintain another start-command implementation. Direct starts are unchanged.

## Finding 1: the hello contradiction

The predecessor's 430 req/s was a median of only two **300 ms** windows: 542 and 318 req/s. Their p50s were 0.867 and 0.561 ms; their p99s were 11.32 and 71.75 ms. Averaging run percentiles produced the reported 0.71/41.5 ms. A fast median can coexist with low throughput when a small number of long stalls dominate wall time. Comparing this noisy capacity statistic against a separate 400-request median is not evidence of a stable scriptc slowdown.

Two harness problems were found:

1. Every warmup and every measurement spawned a **different generator** and destroyed its `http.Agent`. The server was warmed, but neither the measuring generator's V8 code nor its connections were warmed. Short runs disproportionately included client initialization and connection establishment. Process startup itself was already outside the generator's latency/throughput timer; it was inside the old server-CPU interval.
2. Peak-memory sampling ran a **whole-machine `ps -axo` every 100 ms**, even for a one-process route. That is unnecessary disturbance on a host with thousands of processes and heavy scheduling pressure. It was especially material in three-tick measurement windows. The before/after boundary census still discovers the full tree; periodic sampling now reads the established PIDs only (targeted `ps` on macOS, `/proc/PID/stat` on Linux). Boundary PID sets must match.

Every measured sample now warms **the same generator process and keep-alive pool** that it will measure. An IPC barrier lets the controller take CPU/RSS boundaries after warmup and release the generator afterward. The generator records warmup and measured `connectionsCreated`, `reusedRequests`, request counts, elapsed time, p50/p99/max and CPU. Latency includes socket acquisition, body draining and local scheduling. It does not include spawn or warmup. The suite never subtracts a connection cost or changes native results to match expectations.

[First diagnostic JSON](benchmarks/transport-check-before.json) preserves a focused run before narrowing the sampler. At C=1:

| Runtime / case | Requests | req/s | p50 ms | p99 ms | New sockets / reused requests |
| --- | ---: | ---: | ---: | ---: | ---: |
| Node, original 300 ms + global sampler | 642 | 2,139 | 0.258 | 2.452 | 1 / 641 |
| Native, original 300 ms + global sampler | 227 | 753 | 0.627 | 10.625 | 1 / 226 |
| Native, original 300 ms without sampler | 985 | 3,282 | 0.216 | 1.325 | 1 / 984 |
| Native, 400 sequential requests | 400 | 1,988 | 0.299 | 2.252 | 1 / 399 |
| Native, same-client warmup + 400, sampled | 400 | 2,278 | 0.222 | 2.754 | 0 / 400 (1 warmup socket) |

**Connection reuse works in both runtimes.** All 400-request cases used one connection; every request after the first reused it. Reconnecting is ruled out in these checks. The focused [second diagnostic](benchmarks/transport-check.json), using the targeted sampler, also retains one connection; absolute rates changed substantially as machine load changed. These are sequential observations on a loaded Mac, not a randomized causal estimate of sampler cost. They identify harness defects and demonstrate that the historical multi-fold gap is not stable. They cannot uniquely attribute every historical 41 ms tail stall to the sampler, runtime, GC or scheduler. There is no reproducible native-only transport regression here to claim or file upstream; a quiet Linux repeat is still needed.

Reproduce the focused transport check separately from a complete suite:

```sh
node examples/demo/bench/diagnose.mjs > research/benchmarks/transport-check.json
```

It compares old-style short windows with/without sampling, 400 sequential requests, and same-client warmed fixed-count/duration samples. The retained `transport-check-before.json` used the original global sampler. `check.mjs` independently validates generator socket counts against server-side `connection` events for a keep-alive server and one deliberately closing every response, including exact request counts at C=8 and response-digest failure.

## Findings 3–5: representative requests, bcrypt and coverage

All successful request fixtures come from `examples/demo/test/routes.mjs`:

- Login: `POST /api/login`, JSON email ` ADA@example.com ` and password `correct horse battery staple`. Normalization and successful bcrypt verification/signing are exercised.
- Verify: `GET /api/verify`, a precomputed HS256 Bearer token with `role=editor`, `sub=user-42`, `iss=next-scriptc-demo`, `aud=demo-api`, `iat=1793318400`, `exp=1793322000`. The measured response must be **200**, never the missing/invalid-token fast path.
- Search: `GET /api/search?q=desk%20lamp&limit=7`. The index is initialized once and retained; cold start includes initialization, warmed requests do not rebuild it.
- Markdown: `GET /api/posts/reliable-webhooks`, rendering the full long guide on every request.
- Feed: `GET /api/feed.xml`, rendering and escaping both posts on every native/direct request; Node production can serve Next's prerendered body.

Every server receives `DEMO_JWT_NOW=1793318400` and the public test key `DEMO_JWT_SECRET=next-scriptc-parity-test-signing-secret-32-bytes`. They are recorded in JSON. Token construction is outside the workload; the literal token is committed in the registry. Full body SHA-256 must match across all four surfaces and on every load response; unexpected status or changed bytes fail the run. There is no normalization escape hatch.

**Bcrypt is an explicit native regression.** The previous probe needed 26.8 s native versus 0.56 s Node for three cost-10 operations (~48× slower); 201/435 statements in that standalone probe were reported in the dynamic tier. That probe includes hash plus correct/incorrect comparison, while the application does one successful stored-hash comparison and JWT signing. Do not present its ratio as this route's measured ratio.

Login runs C=1, one warmup request and **three measured requests once per runtime/scope**. The same fixed sample supplies CPU and throughput/latency rows; it is not executed twice. Its cold section has one fresh-process request per runtime/scope. Readiness adds one execution in each steady process, and isolation separately warms login then holds one heavy request outstanding. Total normal suite login work is bounded (no C=8/64 duration window). The three-request p99 is the maximum of three and supports no tail claim. No reduced bcrypt cost, wrong password, skipped workload or asymmetric request count is used.

`scriptc coverage <generated entry>` runs sequentially before measurements with the same default policy as the adapter build. JSON contains the exact command, complete stdout/stderr, statements analyzed, static statements, static percentage, **dynamic-tier statement count**, and each npm package's compilation mode for all seven HTTP workloads plus `report`. The generated Markdown places these next to application C=1 speed ratios and provides a table for controls/report too. Importantly, “98% static” and package mode `static` do **not** mean 98% typed machine operations: the static total can include untyped dynamic-tier statements. Coverage describes the entry graph (shim and dependencies included), not sampled hot-path time. It suggests an explanation for slow untyped npm code without proving that all dynamic statements execute or that every dynamic operation is costly. The application entry's totals therefore differ from the smaller standalone bcrypt probe.

## Finding 2: worker memory

The old `(RSS after job − RSS just after dataset construction) / workers` divided a GC-sensitive residual by the worker count. Dataset construction garbage could be reclaimed later, yielding absurd negative “worker allocation” values.

Each variant now starts once and grows its retained pool **1 → 2 → 4** within that process. All counts run the same two complete warmup computations; one additional readiness computation at count 1 is matched in SAB. Each measured response records warmed total process RSS, including the dataset, workers and runtime. The replacement metric is:

```text
marginal warmed RSS per added worker =
    (median post-job process RSS at 4 workers − median post-job process RSS at 1 worker) / 3
```

The baseline is now a warmed process with one resident worker, rather than a dataset-construction high-water mark. This is valid **net resident growth across adding three workers to one process**. It includes GC, allocator and JIT history; it is not exact clone size, unique physical memory, or a causal allocation counter. Negative net differences would remain visible as GC/noise and must not be described as negative worker allocation. Raw 1/2/4-worker RSS and all repetitions are retained. The dataset-before-workers residual is discarded from suite rows and no longer rendered.

One million orders, eight regions, twelve scenarios and sixty months use identical integer-cent arithmetic and exact result totals. Node ordinary object workers clone `workerData`; native publishes the same ordinary object graph. The **Node hand-flattened SharedArrayBuffer baseline** remains alongside them; it uses pure JS parent/workers and avoids loading a TypeScript parser per worker. It is a stronger Node baseline than cloning alone. Its data layout and accesses necessarily differ, so the result concerns sharing ergonomics and overhead, not same-source compiler speed. SAB has no idle HTTP shim, slightly favoring its RSS. Compute time excludes dataset construction, pool initialization and HTTP. Counts ascend and share JIT/GC history; variants run in separate processes. No forced GC or hidden runtime flags are used.

## Metrics and resource isolation

- **Cold start:** monotonic spawn-to-first-fully-drained successful response, fresh process per sample, 2 ms retry polling. It includes route initialization and work, with filesystem caches retained; process-cold, not machine-cold or a platform/serverless cold start. Median averages the middle values; p90 uses nearest rank.
- **Idle RSS:** each owned process and simultaneous total after readiness plus the profile quiet interval, with the initializing route named. Native production includes Next, all ten binaries and the current supervisor, even for uncalled routes. RSS is not PSS; shared pages can be counted more than once.
- **CPU/request:** stable application-tree user+system delta over exactly N sequential successful requests after generator warmup, divided by N. Linux `/proc/PID/stat` uses `utime+stime` and the host's `CLK_TCK`, excluding child-CPU counters; worker-thread CPU is already in process totals. macOS `ps TIME` has centisecond resolution. Generator CPU is separate. CPU boundaries still include census and generator shutdown gaps; tiny fixed counts are noisy. This is not a reproduction of Vercel's Active CPU billing instrumentation.
- **Peak RSS:** largest simultaneous known-tree RSS total sampled every 100 ms and at boundaries, with each process retained. It is a sampled lower bound, not a kernel high-water mark. Boundary discovery verifies stable PID membership; sampling cannot capture every transient subprocess or spike.
- **Throughput and latency:** HTTP/1.1 keep-alive, no pipelining; C closed-loop outstanding requests, dispatch until deadline then drain in-flight bodies. Throughput divides completions by actual dispatch-to-last-drain time, including drain. Latency includes request scheduling/socket acquisition/body draining. Nearest-rank per-run p50/p99, with median [min,max] across repetitions, not confidence intervals. No coordinated-omission correction or open-loop SLA claim. Login uses a fixed count instead of a deadline.
- **Topology cost:** native production minus native direct median p50/p99 and throughput ratio. Separate-run percentile differences are descriptive, not paired hop percentiles. They can be negative under noise and include Next routing/proxy effects.
- **Isolation:** separate login (realistic) and primes (synthetic) heavy loads. Warm heavy first; baseline/loaded probe `/` and `/api/hello` in parallel, one outstanding request per path, 20 ms pause after completion. Loaded holds one heavy request outstanding, starting 100 ms before probes. Record heavy completions; equal offered concurrency, not equal achieved RPS. An expensive request can outlive the window and is drained, not abandoned.

On Linux, discover four allowed logical CPUs from `/proc/self/status`. Both runtimes' entire application trees inherit the first two through `taskset`; the generator/controller/sampler use the next two. Thread experiments use all four without a sustained external generator. This fits Hobby's **four-vCPU** limit. CPU topology, SMT, memory bandwidth, shared-host interference and container resource accounting remain limitations. macOS cannot pin through taskset, so all local results are indicative. A single Node generator can saturate one JS core; rows flag CPU/wall ratios ≥0.8, marking throughput as a possible client-limited lower bound. This is not a calibrated generator ceiling.

Cold runtime order alternates by repetition. Default steady blocks are direct Node/native then production Node/native; `--reverse` reverses each runtime block. Run quiet sandbox passes in both orders before publishing close comparisons. Fixed fixture work and per-runtime budgets remain identical.

An HTTP failure or timeout is recorded as a `workload-failure` with the server log, and the dataset remains **failed** with a nonzero exit. Independent workloads continue. A failed production/isolation route causes its entire production tree to restart before the next workload, so abandoned bcrypt computation cannot contaminate later CPU/RSS/latency samples. Byte-parity and artifact-integrity failures still invalidate the run. Production keeps Next’s normal 30-second proxy timeout: it is never raised to make slow native login pass.

All processes started by the suite are owned and shut down in `finally`, including detached descendants. It refuses occupied ports rather than killing unrelated servers; checks port 3417 and every manifest port after each block and final cleanup. Failed measurements preserve partial JSON/Markdown labelled `failed`. SIGINT/SIGTERM abort through cleanup; SIGKILL cannot execute cleanup.

## Findings 6–7: sandbox budget and runner

After the reviewer merges and commits the implementation, use Node 24 with the existing Sandbox authentication in `.env.local`:

```sh
node --env-file=.env.local scripts/sandbox-bench.mjs
# With the integrated plain-next-start supervisor:
node --env-file=.env.local scripts/sandbox-bench.mjs --native-start=next
# Subset or separate order check:
node --env-file=.env.local scripts/sandbox-bench.mjs --native-start=next --sections direct,production
node --env-file=.env.local scripts/sandbox-bench.mjs --native-start=next --reverse
```

The runner archives **HEAD of the branch it runs from**, never a hardcoded base commit or uncommitted overlay. It verifies suite presence before provisioning, records the full commit/archive SHA-256 and verifies the uploaded archive remotely. `.env.local`, credentials, ignored files and node_modules are not uploaded. Source/build snapshots and artifact hashes stay in the suite's JSON.

The requested image is `vercel/sandbox/node:24`, **four vCPUs**, 30-minute lifetime, below Hobby's 45-minute session maximum. Install clang (missing on the Ubuntu image) and util-linux/taskset with apt or dnf, install exact pnpm 11.1.3/frozen lockfile, then build native and Node sequentially (`NEXT_SCRIPTC_BASELINE=node`). No compiler failure is hidden by a grep pipeline. Every setup/build/suite section prints its estimated duration in advance.

Expected total is **16–25 minutes**, including tools/install and both builds; suite alone is budgeted at **8–17 minutes**. These are estimates, **not sandbox measurements**. Repetitions are cut (3 cold / 2 steady), not workloads. Native build has a 10-minute ceiling, Node build 3 minutes, install 3 minutes. An overall **28-minute abort** reserves download/stop time; the sandbox's 30-minute lifetime is the final backstop. A timeout remains a failed run with partial reports if available. There is no guarantee a complete result will fit on an arbitrarily overloaded host; the lifetime guarantees resources do not outlive the budget.

Downloads go to **`research/benchmarks/sandbox-<timestamp>.json`**, `.md` and `.provenance.json`. Provenance retains commit/archive identity, section/start flags, each completed step's elapsed time/status and stop metadata. Downloads have bounded timeouts and are inside a nested `try/finally` so even download failure or interruption attempts `sandbox.stop()`. Stop prints **active CPU seconds used** (or explicitly `unavailable` if the SDK omits the field), records the raw value, and reports any stop failure. Never represent a failed stop as successful cleanup. The reviewer runs this command; **no sandbox was provisioned for this implementation task**.

## Local indicative validation

The quick-profile validation dataset is stored in [JSON](benchmarks/local-indicative.json) and [generated Markdown](benchmarks/local-indicative.md). Implementation commits and source snapshots are recorded in JSON. This run is a heavily loaded Apple M4 Pro plumbing check, with no CPU pinning and only one repetition. It is not public performance evidence. The dataset status, workload results, socket counts, coverage, worker memory and elapsed time are in those artifacts; highlights follow below.

The single quick-suite attempt initially stopped at native production login (HTTP 500). Its direct cold login took **41.63 s**, exceeding Next’s default **30 s** proxy timeout. That default is visible in the pinned `next/dist/server/lib/router-utils/proxy-request.js`. The initial failed JSON/Markdown are preserved as `local-indicative-initial-failure.{json,md}`. After adding failure capture, `--resume-cold` imported only its 15 successful cold observations and unchanged coverage, requiring identical source/entry/binary hashes, build IDs and runtime versions. The original environment/error/source snapshot remains under `resumedCold`; no steady-state windows are imported or pooled across harness revisions. This resumes an interrupted attempt rather than repeating completed cold measurements. It is deliberately limited to failures inside the cold section.

```sh
node examples/demo/bench/run.mjs --profile quick \
  --resume-cold research/benchmarks/local-indicative-initial-failure.json \
  --output research/benchmarks/local-indicative
```

The very high host load (about **79** during the initial failure, on 12 logical CPUs) is part of the evidence. A production timeout is a failure, not a low-throughput success; its cells are labelled FAILED. A quiet sandbox may complete this request within the default deadline, but that has not been measured here.

The resumed attempt reached every section in **577.35 s**, with exact thread-total parity and final source/artifact/build-ID/port checks passing. Its earlier production and isolation blocks were then replaced by a **191.02 s** `--sections production,isolation` rerun after fixing process restart and warming both probes. The initial interrupted cold attempt took **221.73 s**. These durations are separate executions, not a continuous timed benchmark. No complete suite was repeated to select a favorable result.

```sh
node examples/demo/bench/run.mjs --profile quick --sections production,isolation \
  --output research/benchmarks/local-indicative-production-rerun
node research/benchmarks/compose-local.mjs
```

`compose-local.mjs` reproducibly assembles the report from the retained raw inputs, asserting identical artifacts/runtime/build identities and that the restart path was exercised. It retains cold/direct/threads from `local-indicative-before-restart.json`, replaces **entire** production/isolation blocks from `local-indicative-production-rerun.json`, tags every row with its source run, and preserves both environments/source snapshots. It never pools or selects repetitions. A historical counter key (`agentSocketsAtStart`) is renamed to the accurate `connectionsCreatedBeforeWindow`; its cumulative numeric value is unchanged. The raw inputs remain unmodified. The final report's time span includes the interruption and harness fixes.

**Final local dataset status is FAILED**, with 167 observations: 27 successful cold samples, 27 fixed-count CPU samples, 75 throughput/latency windows, 17 idle snapshots, six isolation windows, nine worker timing/RSS samples, three derived worker-memory rows and three explicit workload failures. Native production login failed cold, steady and isolation; the latter two rerun failures happened before a fresh production tree was started for the next independent workload. The server log records the proxy's `ECONNRESET` / `socket hang up`, consistent with Next's normal 30-second deadline. Failed requests are never included as successful low-throughput samples. All other configured route/runtime cases returned the expected body bytes; all nine worker results shared the same exact result digest. No hidden timeout increase was used.

Indicative direct C=1 results (one short sample; **not publication evidence**):

| Application workload | Node p50 ms | Native p50 ms | Native / Node latency | Entry statements / static / dynamic tier |
| --- | ---: | ---: | ---: | --- |
| Cost-10 login + JWT | 322.293 | 20,145.589 | 62.5× slower | 2,084 / 98% / 426; bcryptjs and jose static |
| Authenticated verify | 2.151 | 1.063 | 0.49× | 1,698 / 97% / 241; jose static |
| Search | 5.418 | 11.679 | 2.16× slower | 1,023 / 97% / 344; minisearch static |
| Markdown | 5.896 | 74.569 | 12.65× slower | 1,215 / 98% / 641; marked static |
| RSS | 4.001 | 79.296 | 19.82× slower | 1,216 / 98% / 640; marked static |

Login's fixed-count CPU cost was **126.7 ms/request Node versus 10,456.7 ms/request native**. Its p50 is based on three requests, and its p99 is merely their maximum. The measured application result and previous three-operation standalone bcrypt probe are different experiments. Both show a large regression; neither is hidden behind a 401 or reduced work factor. Untyped dynamic operations are a plausible explanation, not a hot-path profile proving causation.

The corrected direct hello control shows why p50 alone cannot predict capacity: Node/native p50 **1.091/0.903 ms**, p99 **11.951/14.636 ms**, throughput **505/470 req/s**. Both had **zero measured socket creations** and reused their one warmed socket for **206/206 Node** and **191/191 native** requests. Every direct/application C=1 throughput sample reused all measured requests with no new socket. Production counters describe generator-to-Next sockets, not the additional Next-to-native upstream pool. Connection reuse is therefore demonstrated directly rather than inferred from a keep-alive flag.

The production C=1 verify p50 was **3.681/3.982 ms Node/native**, while production RSS feed was **4.246/60.688 ms**, retaining Next's prerendered Node baseline. Production idle RSS after hello was **112.70 MiB / one process Node** versus **224.61 MiB / twelve processes native**; the restarted native tree was **234.95 MiB**. These are initialized idle snapshots, not fully warmed application footprints.

| Worker variant | Warmed 1-worker RSS MiB | Warmed 4-worker RSS MiB | Net warmed RSS / added worker MiB |
| --- | ---: | ---: | ---: |
| Node objects / clone | 124.766 | 1,296.828 | 390.688 |
| Node hand-flattened SAB | 83.859 | 77.469 | −2.130 |
| Native published objects | 72.219 | 73.188 | 0.323 |

The small **negative SAB net delta** remains visible: even a warmed process's RSS can fall due to GC, allocator or OS residency changes while workers are added. This is not negative worker allocation or an allocation-saving claim. It illustrates the remaining noise floor and why warmed total RSS and raw count states accompany the net metric. A quiet Linux repeat is needed for any memory comparison. The former construction-high-water-mark subtraction is gone.

Load averages started at **45.47 / 31.81 / 24.60**, reached about **79** around the first failure, and ended at **32.97 / 42.29 / 43.70** on the 12-core M4 Pro. Short samples, scheduling noise, GC/RSS drift, and no affinity make all local ratios indicative. The quiet four-vCPU sandbox pass in both runtime orders remains the reviewer's job.

Harness checks passed for server-side versus generator socket counts (both keep-alive and deliberate close), exact C=8 request counts, digest rejection, coverage parsing, section validation and centralized start selection. Mocked runner success/build-failure/download-failure paths all called stop and printed active CPU; no real Sandbox was created. Local syntax checks and final owned-port/process cleanup were also verified. The checked-in benchmark sources do not change any application or adapter source.
