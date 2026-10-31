# Realistic Redis I/O benchmark

The registered three-pair Vercel experiment and local production run are complete for cold, warm, mixed, memory and Redis RTT. One hosted CPU cell remains unavailable after its retry limit; the raw full runner/controller retain failed status. All losses, refusals and partial CPU attempts are reported.

## Method and route design

The same handlers, inputs, Redis REST transport and lockfile run through optimized Next.js on Node and release scriptc native. GET orders verifies a cookie HS256 JWT, reads 50 JSON records with LRANGE, filters/shapes them and computes counts/totals. POST orders authenticates, validates nested order data, prices SKUs from a trusted catalog, atomically LPUSH/LTRIMs the recent list and responds 201. The payment webhook verifies raw-body HMAC-SHA256 and ±300-second tolerance, validates the envelope, then atomically deduplicates the event and updates a payment ledger with a 24-hour marker. It does not call Stripe or fulfill an order. Read-through cache was not selected.

A fixed reader account and a separate writer account keep GET responses unchanged under mixed traffic. Created IDs are client correlation IDs; POST creation is not idempotent. Webhook measurements use fresh IDs and exercise writes rather than replay hits. Both variants use identical sequences and a reset of the same isolated Redis namespace between variants. Every measured response is byte-checked against independently generated expected JSON, including POST and webhook responses.

## Library and compiler outcomes

`@upstash/redis` 1.36.2 compiled, but the native executable refused at startup with `SC1090`: classes extending builtin bases as values (the inherited runtime constructor has no class-value adapter). Node completed SET/GET against SRH. Plain REST fetch is therefore used on **both** sides. No retries, fixture fallback or alternate native transport.

Zod 4.6.7 succeeds and matches Node in a standalone nested-order probe, including its error output. The real adapter's async route module refuses `SC1016`: the `CONSTANT_CATCH` binding in `zod/v4/core/util.js:871` can be accessed before its declaration runs. Default compilation instead exits needing an unavailable libnode pack. This affected both zod route entries; a singleton-enum spelling also failed. The final POST route uses **Valibot 1.5.0 on both sides**, with strict id/email/items/SKU/integer quantity constraints. Valibot minValue/maxValue also refused deferred SC2020 (number.toJSON); both use its standard check predicate for the same 1–20 bound. Both use its normal flatten error projection because raw issue function references refuse native JSON.stringify. The webhook uses the same explicit event guard on both sides. No adapter or shim behavior was changed. This is a zod route-integration refusal, despite standalone success.

The standalone zod timing probe uses 10,000 validations after warmup, three retained windows, with matching functional output. Node keeps normal zod JIT code generation; native uses the interpreted path. These microbenchmarks are not route or hosted results.

| Standalone zod | Node median µs/call | Native median µs/call | Native/Node ↓ |
| --- | ---: | ---: | ---: |
| valid | 0.894 | 11.161 | 12.489× |
| invalid | 1.928 | 16.717 | 8.671× |

Fetch's explicit `cache` option also refuses SC2020. Both variants omit it and use Next 16's default uncached fetch in these request-dependent handlers; no-store responses and full-response parity are checked. The retained musl TLS probe fetched valid HTTPS and rejected a locally self-signed certificate. Node rejected the same certificate with DEPTH_ZERO_SELF_SIGNED_CERT; the fixture recorded two failed handshakes and no HTTP requests. The uploaded musl artifact subsequently passed authenticated Redis TLS in Docker and all measured hosted Redis requests. The platform certificate filesystem itself was not inspected.

## Hosted results

Three fresh pairs were measured from frozen commit `1ff6d90f0cf95d0a00efc0a2e96d3dd8c6a9c1d5`. Build/request order: Node/native, native/Node, Node/native. Each native preview has the Linux-validated executable SHA-256 `b6f2f716e6e79e97179585f2eae6cfb1504016664d13067a805dbbc28f951828`. Both variants use iad1, x86_64, 2048 MiB, 300 seconds; Node runtime nodejs24.x, native runtime executable. The client is a 2-vCPU Linux Node 24 Sandbox in iad1, HTTPS HTTP/1.1 keep-alive, no pipelining/retries.

The approved Upstash resource became connected after local measurement; its authenticated REST PING and the exact native executable’s Docker/musl Redis/TLS/IPC/RSS validation passed before preview application requests. Native’s deployed requests then passed full expected-byte validation. The local Alpine trust bundle was present; no trust bypass or certificate disabling was used. No explicit CA bundle is added to the Function.

**Coverage/status:** every cold, warm, mixed, memory and Redis-RTT measurement completed without request errors. The full worker/controller remain **failed** because Node GET-orders CPU accepted only 2/3 required windows before its five-attempt token-change limit. This cell is unavailable; no replacement window or extra attempt was taken. Raw failed status and every accepted/discarded attempt are retained.

### Deployment-first GET orders

Milliseconds. First operator request on untouched immutable previews, including DNS/TCP/TLS, network, platform/handler and database work. Not certified process-cold initialization. Fresh URLs may be prewarmed. Warm reference is 10 + 40 C=1 in pairs 1–2 and 10 + 80 in pair 3. Each variant has its own reference; first-minus-warm is an end-to-end excess, not isolated initialization.

| Pair / order | Node first | Native first | Native/Node ↓ | Node / native warm p50 | Node / native excess |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 / Node first | 321.942 | 213.061 | 0.662× | 26.773 / 24.550 | 295.169 / 188.511 |
| 2 / native first | 262.865 | 224.056 | 0.852× | 32.138 / 25.397 | 230.727 / 198.659 |
| 3 / Node first | 291.935 | 209.269 | 0.717× | 26.455 / 24.774 | 265.479 / 184.495 |

Median first response: Node **291.935 ms**, native **213.061 ms**; ratio of medians **0.730×**. Three pairs are descriptive, not a confidence interval.

### Warm paired routes, final pair

10 warmups + 80 C=1 requests; 32 warmups + 256 C=16 requests on each pool. Nearest-rank percentiles. Latency stops at fully drained body before validation; throughput includes client validation. These fixed-count windows are brief and do not establish maximum sustainable capacity.

| Route | Node C=1 p50/p95/p99 ms | Native C=1 p50/p95/p99 ms | Native/Node ratios ↓ |
| --- | ---: | ---: | ---: |
| orders-get | 26.455 / 44.961 / 186.129 | 24.774 / 45.692 / 64.013 | 0.936× / 1.016× / 0.344× |
| orders-post | 25.679 / 34.564 / 51.649 | 25.070 / 46.419 / 205.148 | 0.976× / 1.343× / 3.972× |
| payment | 25.186 / 34.449 / 38.098 | 21.867 / 41.470 / 67.970 | 0.868× / 1.204× / 1.784× |

| Route | Node C=16 p50/p95/p99 ms | Native C=16 p50/p95/p99 ms | Ratios ↓ | Node / native req/s | Ratio ↑ |
| --- | ---: | ---: | ---: | ---: | ---: |
| orders-get | 31.896 / 72.377 / 181.217 | 29.127 / 53.562 / 75.355 | 0.913× / 0.740× / 0.416× | 382.212 / 489.949 | 1.282× |
| orders-post | 28.494 / 45.073 / 81.765 | 24.074 / 44.658 / 64.102 | 0.845× / 0.991× / 0.784× | 476.124 / 577.103 | 1.212× |
| payment | 27.150 / 45.358 / 122.558 | 22.731 / 40.916 / 86.093 | 0.837× / 0.902× / 0.702× | 438.274 / 587.732 | 1.341× |

**Retained warm losses:** native GET C=1 p95 is slower; native POST C=1 p95 and p99 are slower; native payment C=1 p95 and p99 are slower. No tail was removed or replaced. All measured hosted generator windows stayed below the 0.8-core saturation threshold.

| Route / variant | C=1 / C=16 generator cores | C=16 drained ms | New / reused measured connections |
| --- | ---: | ---: | ---: |
| orders-get / node | 0.046 / 0.310 | 669.786 | 0 / 256 |
| orders-post / node | 0.038 / 0.305 | 537.675 | 0 / 256 |
| payment / node | 0.044 / 0.220 | 584.109 | 0 / 256 |
| orders-get / native | 0.041 / 0.396 | 522.503 | 0 / 256 |
| orders-post / native | 0.031 / 0.229 | 443.595 | 0 / 256 |
| payment / native | 0.034 / 0.219 | 435.573 | 0 / 256 |

### Fixed-arrival mixed traffic

Each variant has 840 scheduled arrivals over 30 seconds (588 GET / 168 POST / 84 unique webhook). Steady 20 req/s; 60 req/s bursts in [8,10), [18,20), [28,30). Latency is scheduled arrival to body drain, using transport timestamps in hosted revision 2; dispatch lag is retained separately. All 840 arrivals were issued and completed per variant, with no safety-cap rejection, cancellation or request error. This bounded profile does not establish a capacity ceiling.

| Variant | Errors / scheduled | Scheduled p50/p95/p99 ms | Dispatch lag p50/p95/p99 ms | Peak in flight / connections | Generator cores |
| --- | ---: | ---: | ---: | ---: | ---: |
| node | 0 / 840 | 30.489 / 61.129 / 152.204 | 0.583 / 1.064 / 1.162 | 5 / 5 | 0.035 |
| native | 0 / 840 | 23.368 / 41.008 / 65.256 | 0.608 / 1.070 / 1.117 | 4 / 4 | 0.034 |

Native/Node scheduled latency p50/p95/p99: **0.766× / 0.671× / 0.429×**. Error rate: 0% in each. Arrivals do not wait for completions. No closed-loop correction is applied; planned timestamps and dispatch lag are retained so delayed sends do not become on-time samples.

### Self-reported process CPU/request

One keep-alive maxSockets=1 pool per route/variant, 10 warmups, immediate diagnostics around 100 requests, three accepted windows, at most five attempts for boundary-token changes only. Cumulative user+system microsecond deltas / 100. No idle/background subtraction. Includes framework/diagnostic/background and all process threads, excludes separate platform processes. Not Vercel billed Active CPU or total infrastructure efficiency. Matching boundary tokens cannot prove every intervening request hit that process.

| Route | Node accepted ms/request | Native accepted ms/request | Node / native median | Median ratio ↓ | Attempts Node / native |
| --- | ---: | ---: | ---: | ---: | ---: |
| orders-get | 6.463 / 5.931 | 1.582 / 1.580 / 1.463 | unavailable / 1.580 | unavailable | 5 / 3 |
| orders-post | 5.419 / 5.612 / 5.922 | 1.158 / 1.160 / 1.086 | 5.612 / 1.158 | 0.206× | 4 / 4 |
| payment | 5.498 / 5.198 / 4.624 | 0.845 / 0.884 / 0.888 | 5.198 / 0.884 | 0.170× | 3 / 3 |

Node GET has two accepted windows and three discarded token changes; its median and ratio remain unavailable. Partial accepted values are shown for transparency, not substituted for the registered three-window median.

### Process memory

MiB. RSS/VmRSS and lifetime VmHWM of the serving process, not allocated memory, whole-instance peak, or PSS. Native is one executable/HTTP/IPC process; Node includes Next, V8, user code and all in-process threads. Separate platform processes are excluded in both. Samples may reach different processes, particularly after C=16 scale-out.

| Pair / moment | Node RSS / VmHWM | Native RSS / VmHWM | RSS ratio ↓ | Same token as first: Node / native |
| --- | ---: | ---: | ---: | --- |
| 1 / after first | 84.258 / 84.258 | 9.195 / 9.223 | 0.109× | true / true |
| 2 / after first | 83.617 / 83.617 | 9.199 / 9.227 | 0.110× | true / true |
| 3 / after first | 83.941 / 83.941 | 9.195 / 9.223 | 0.110× | true / true |
| 3 / after load | 119.977 / 119.977 | 11.824 / 11.875 | 0.099× | false / false |

### Redis round-trip diagnostic

Separate post-load LRANGE of the same 50 seeded JSON orders, 20 samples per variant. Includes outbound HTTP/TLS if applicable, response drain and envelope parse; excludes parsing each stored order and shaping the route response. No timing headers or counters were added to measured handlers.

| Variant | Redis RTT p50/p95/p99 ms | Rows per sample |
| --- | ---: | ---: |
| node | 2.567 / 3.084 / 4.861 | 50 |
| native | 1.959 / 2.626 / 3.144 | 50 |

Redis itself is only about 2–3 ms in this colocated, warm, single-command workload. The 22–26 ms warm end-to-end medians include client/platform network and framework work. These separate probes cannot decompose latency by subtraction or establish that database wait dominates server execution. This suite does not model joins, slow queries, multiple upstream services or distant regions.

### Topology, logs and verification

Control-plane inspection found two Node Functions and three native-deployment Functions, below Hobby’s 12-Function limit. The measured routes, both new diagnostics and retained memory diagnostic share the same deployed functionName in each variant. Native grouping shares cold-start/failure/resource domains; there is no per-route native isolation. Uploaded executable bytes match across all three native previews. See deployed mappings and sizes in the raw artifacts.

| Pair / variant | Observed listener starts through measurement end | Runtime records |
| --- | ---: | ---: |
| 1 / node | unavailable (no listener logging) | 0 |
| 1 / native | 1 | 1 |
| 2 / node | unavailable (no listener logging) | 0 |
| 2 / native | 1 | 1 |
| 3 / node | unavailable (no listener logging) | 0 |
| 3 / native | 16 | 16 |

Native listener entries are consistent with process starts/scale-out; they do not establish every request’s start type or platform instance identity. Node’s absence of listener records is unavailable, not zero starts. Exact-deployment HTTP ≥500 queries returned zero records, with no pagination or excluded intervals. Hosted parity passed **124/124 cases** after all measurements, including exact error bodies and payment-ledger replay side effects; see the retained transcript and verification artifact below.

## Local production results

Source commit: `b3bce2767aaec7badecd84ec5cea07d886009fd2`; initial dirty flag: false. darwin/arm64, Apple M4 Pro, Node v24.22.0, Docker SRH + Redis on loopback, Next 16.4.3/scriptc 0.4.6. Node is built and measured first; native uses the explicit vercel group. One paired local run, no confidence interval or capacity claim. Overall status: **complete**.

### First local request and startup

These are single local process/readiness observations after production build and seed, not deployment-first Vercel or certified process-cold samples. Readiness excludes the first database request.

| Metric | Node ms | Native ms | Native/Node ↓ |
| --- | ---: | ---: | ---: |
| Server ready | 508.463 | 610.907 | 1.201× |
| First GET orders | 108.067 | 831.933 | 7.698× |

### Warm latency and throughput

10 warmups + 80 C=1 requests; 32 warmups + 256 C=16 requests. Latency is dispatch to fully drained body before hash validation; throughput includes validation. HTTP/1.1 keep-alive, no pipelining/retries. Nearest-rank quantiles. All samples, warmups, generator CPU and connection counts are retained.

| Route | Node C=1 p50/p95/p99 ms | Native C=1 p50/p95/p99 ms | Ratios ↓ | Node / native C=16 req/s | Throughput ratio ↑ |
| --- | ---: | ---: | ---: | ---: | ---: |
| orders-get | 3.284 / 4.991 / 6.140 | 2.252 / 2.664 / 7.335 | 0.686× / 0.534× / 1.195× | 1085.041 / 2666.566 | 2.458× |
| orders-post | 2.082 / 2.656 / 4.424 | 1.281 / 1.481 / 1.797 | 0.616× / 0.557× / 0.406× | 1837.134 / 5246.583 | 2.856× |
| payment | 1.589 / 1.987 / 3.153 | 0.987 / 1.360 / 3.131 | 0.621× / 0.685× / 0.993× | 2183.985 / 5770.878 | 2.642× |

| Route | Node C=16 p50/p95/p99 ms | Native C=16 p50/p95/p99 ms | Ratios ↓ |
| --- | ---: | ---: | ---: |
| orders-get | 13.831 / 20.611 / 22.515 | 5.513 / 8.328 / 8.751 | 0.399× / 0.404× / 0.389× |
| orders-post | 8.110 / 13.019 / 14.989 | 2.763 / 5.277 / 6.063 | 0.341× / 0.405× / 0.404× |
| payment | 6.905 / 10.947 / 12.221 | 2.576 / 3.841 / 4.530 | 0.373× / 0.351× / 0.371× |

### Open-loop mixed bursts

840 scheduled arrivals over 30 seconds: 20 req/s steady, 60 req/s in [8,10), [18,20), [28,30). Mix: 588 GET / 168 POST / 84 webhook. Local revision-1 latency starts at scheduled send time and ends after client hash validation, a disclosed deviation from the registered body-drain endpoint; hosted revision 2 fixes that endpoint before any hosted measurement. Dispatch lag is retained; completion does not control arrivals. Every planned arrival is represented. Failed HTTP outcomes contribute to completed-outcome latency; safety-cap rejections would have null latency and reduced coverage, remain errors and never become successful samples.

| Variant | Issued / planned | Errors / rate | Scheduled p50/p95/p99 ms | Dispatch lag p50/p95/p99 ms | Peak in flight |
| --- | ---: | ---: | ---: | ---: | ---: |
| node | 840 / 840 | 0 / 0.000 | 5.622 / 9.397 / 14.133 | 0.610 / 1.249 / 1.839 | 2 |
| native | 840 / 840 | 0 / 0.000 | 6.328 / 11.553 / 13.983 | 0.763 / 1.258 / 1.705 | 1 |

Mixed native/Node scheduled-latency ratios p50/p95/p99: 1.126× / 1.229× / 0.989×.

### Process CPU, memory and Redis RTT

Process CPU/request is self-reported using the existing cpuDelta method: one maxSockets=1 pool, 10 warmups, three accepted 100-request windows, at most five attempts for token changes only. Counter deltas include diagnostic/framework/background work, all in-process threads; they exclude separate processes. These are not billed Active CPU or infrastructure efficiency. Matching boundary tokens do not establish per-request routing affinity on Vercel. Local grouping shares the diagnostic process.

| Route | Node CPU ms/request | Native CPU ms/request | Native/Node ↓ |
| --- | ---: | ---: | ---: |
| orders-get | 2.205 | 0.379 | 0.172× |
| orders-post | 1.416 | 0.200 | 0.141× |
| payment | 1.641 | 0.146 | 0.089× |

| Moment | Node RSS MiB | Native RSS MiB | Native/Node ↓ |
| --- | ---: | ---: | ---: |
| memoryAfterFirst | 123.375 | 38.172 | 0.309× |
| memoryAfterLoad | 170.328 | 29.156 | 0.171× |

The local native POST C=16 warmup exceeded the 0.8-core generator threshold; no measured local window did. Brief fixed-count windows do not establish capacity. RSS is the responding process, not whole-app/instance memory. macOS has no procfs VmRSS/VmHWM, so those fields remain null. This local comparison excludes Node's native-function helper and other separate processes in both variants. The post-load sample precedes CPU windows.

| Separate Redis diagnostic | p50/p95/p99 ms |
| --- | ---: |
| node (20 samples) | 3.221 / 4.182 / 4.310 |
| native (20 samples) | 2.019 / 2.959 / 3.693 |

RTT includes the actual LRANGE REST call, HTTP/TLS if applicable, body drain and envelope parsing. It excludes order JSON parsing/shaping. It is a separate post-load probe, not subtraction from route latency. Local emulator RTT has no remote database network distance.

## Losses, failures and limitations

All ratio >1 latency/CPU/RSS cells and <1 throughput cells above are native losses and remain shown. Zod's standalone valid and invalid paths are native losses, and its route module integration is refused. The Redis SDK startup is refused. Initial preflight failures (Docker readiness content-type, TypeScript probe global names, zod/libnode startup) are retained; they were fixed or replaced symmetrically before route measurements. No failed performance window is replaced or stitched into a successful run.

The route suite compares Node development responses with native production responses, including full validation error bodies, auth failures, bad/future/stale signatures, replay success and retained payment side effects. The separate local benchmark uses production builds for both variants. SRH implements the selected Upstash REST commands but does not reproduce Upstash persistence, replication, limits, TLS/network paths or database scheduling. Isolated platform activation, billed CPU, whole-instance memory, per-request process attribution and broader I/O-dominated production behavior remain unproven. Any explanation of runtime differences is inference; the observed local timings do not establish a general performance claim.

## Cost, verification and artifacts

Hosted usage: **6/10 previews, 6758/40,000 Function attempts** (6510 benchmark + 248 parity; 2 additional Docker IPC HTTP probes are not Function invocations). Shared ledger reserves 8128 attempts and **35512 Redis commands**, including pessimistic EVAL/internal-call accounting, seed, verification and cleanup: below 125,000 (25% of the free monthly tier). **0.2/0.3 provisioned Sandbox vCPU-hours reserved**; observed creation-to-stopped-status upper bound 0.091 vCPU-h. All three Sandboxes independently confirmed stopped with resume disabled. Platform active CPU is 21665 ms, a separate quantity. Local benchmark attempts: 5894. Local Docker/SRH commands do not consume Upstash quota. The current [Upstash free plan](https://upstash.com/pricing/redis) is 500k commands/month; the registered hosted ceiling is <125k, including seed/cleanup.

Raw artifacts:

- [Local complete samples/build provenance](benchmarks/realistic-io-local.json).
- [Package tests](benchmarks/realistic-io-package-tests.txt), [harness tests](benchmarks/realistic-io-harness-tests.txt).
- [Zod Node](benchmarks/realistic-io-zod-node.jsonl), [zod native](benchmarks/realistic-io-zod-native.jsonl), [zod async repro](benchmarks/realistic-io-zod-async-repro.txt), [order-entry refusal](benchmarks/realistic-io-orders-server-build.txt).
- [SDK Node](benchmarks/realistic-io-upstash-node.stdout), [SDK native refusal](benchmarks/realistic-io-upstash-native.stderr), [fetch cache refusal](benchmarks/realistic-io-fetch-cache-refusal.txt).
- [Musl TLS evidence](benchmarks/realistic-io-tls.json), [TLS build](benchmarks/realistic-io-tls-build.txt).

Open questions: isolated platform activation and billed CPU; process attribution under Fluid routing; the compiler’s async-module/circular-binding limitations; SQL, multi-service and higher-latency database behavior; whether this burst profile represents user traffic. The orchestrator must review these results before publication. No push or merge to main.

Proven here: identical exercised request/response behavior, the observed three deployment-first pairs and warm/mixed distributions, process diagnostics and separate Redis RTT. Runtime-cause explanations remain inference. Local losses include 1.201× readiness, 7.698× first GET, 1.195× GET C=1 p99, and 1.126×/1.229× mixed p50/p95; local revision 1 includes client validation. These are retained alongside hosted wins and tail losses.

Verification: package suite 20/20; local route parity 124/124; existing e2e against that production build; hosted parity 124/124; final harness regression tests 7/7. The independent audit reconciles response hashes, percentiles, scheduled body-drain timestamps, counts and CPU deltas. [Local parity](benchmarks/realistic-io-parity-sixth.txt), [e2e](benchmarks/realistic-io-e2e.txt), [final harness tests](benchmarks/realistic-io-harness-tests-final.txt), [secret audit](benchmarks/realistic-io-secret-audit.json).

Four measurement-only previews were deleted by exact ID. The final pair is retained for review; the isolated Redis namespace was reset to its 100 seed orders. No adapter/shim behavior, hosted project settings, production domains, main branch or remote Git refs changed.
- Retained node: [preview](https://next-scriptc-hwaq4zrlb-noahs-projects-8a075d15.vercel.app) (`dpl_3qDu7vFk9xSbHGnYMWxHr4YeMxYP`).
- Retained native: [preview](https://next-scriptc-nggqzw4na-noahs-projects-8a075d15.vercel.app) (`dpl_4vVa14UzSoGGBzzDj8xh9wSQnBw8`).

## Hosted artifact index

- Pair 1: [measurements](benchmarks/realistic-io-hosted-pair-1.json), [Node deployment](benchmarks/realistic-io-hosted-pair-1-node-deployment.json), [native deployment](benchmarks/realistic-io-hosted-pair-1-native-deployment.json), [Node sizes](benchmarks/realistic-io-hosted-pair-1-node-sizes.json), [native sizes](benchmarks/realistic-io-hosted-pair-1-native-sizes.json), [Node runtime](benchmarks/realistic-io-hosted-pair-1-node-runtime.jsonl), [native runtime](benchmarks/realistic-io-hosted-pair-1-native-runtime.jsonl).
- Pair 2: [measurements](benchmarks/realistic-io-hosted-pair-2.json), [Node deployment](benchmarks/realistic-io-hosted-pair-2-node-deployment.json), [native deployment](benchmarks/realistic-io-hosted-pair-2-native-deployment.json), [Node sizes](benchmarks/realistic-io-hosted-pair-2-node-sizes.json), [native sizes](benchmarks/realistic-io-hosted-pair-2-native-sizes.json), [Node runtime](benchmarks/realistic-io-hosted-pair-2-node-runtime.jsonl), [native runtime](benchmarks/realistic-io-hosted-pair-2-native-runtime.jsonl).
- Pair 3: [measurements](benchmarks/realistic-io-hosted-pair-3.json), [Node deployment](benchmarks/realistic-io-hosted-pair-3-node-deployment.json), [native deployment](benchmarks/realistic-io-hosted-pair-3-native-deployment.json), [Node sizes](benchmarks/realistic-io-hosted-pair-3-node-sizes.json), [native sizes](benchmarks/realistic-io-hosted-pair-3-native-sizes.json), [Node runtime](benchmarks/realistic-io-hosted-pair-3-node-runtime.jsonl), [native runtime](benchmarks/realistic-io-hosted-pair-3-native-runtime.jsonl).
- [Provenance](benchmarks/realistic-io-hosted-provenance.json), [Linux IPC/TLS/RSS validation](benchmarks/realistic-io-hosted-linux.json), [cost ledger](benchmarks/realistic-io-cost.json), [Sandbox status](benchmarks/realistic-io-sandbox-status.json), [hosted parity](benchmarks/realistic-io-hosted-parity.txt), [verification audit](benchmarks/realistic-io-verification.json), [cleanup](benchmarks/realistic-io-cleanup.json).
