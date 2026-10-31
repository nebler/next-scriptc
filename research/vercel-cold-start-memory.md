# Vercel fresh deployment, scale-out tail and process memory

Measured 2026-10-31 on next-scriptc, Next 16.4.3 / scriptc 0.4.6. Preview only, Linux x86-64, iad1, 2048 MiB / 300 seconds in both variants. **Untouched deployment-first responses are slower natively in all three pairs**: medians 834 ms native and 228 ms Node. The former 101-request verification history is absent from these six samples. This still measures first-response latency, not certified process-cold initialization.

The native hello concurrency tail is transient: a separate retained repeat falls from p99 578 ms after the short warmup to 54 ms after the longer warmup. Runtime logs from the initial failed concurrency probe show 14 additional native listeners starting. The revised full paired run passes all six workloads; Markdown still loses substantially. Process RSS is lower in the sampled native user-server, but excludes its Go proxy and cannot establish whole-deployment memory savings.

## Provenance and method

Three interleaved measured pairs were deployed Node/native, Node/native, then native/Node. Measurement order was Node/native, native/Node, Node/native. No operator application request, browser visit, health probe or parity suite preceded each deployment-first hello; build and control-plane inspect calls do not invoke routes. Platform prewarming/internal probes cannot be ruled out. An extra unused Node preview was deleted so the final pair could have identical source-commit metadata. Seven deployments were created: four Node, three native; six referenced measurement previews are retained.

The first two pairs use the cold-only mode: hello first, memory diagnostic, verify/revenue route-first, then 20 warmup + 40 measured C=1 hello requests. The full pair uses all six registered route-first samples, the same memory probe after hello, and 20 + 200 C=1 samples per workload. Each first route response uses a new HTTPS pool, so DNS/TCP/TLS and body drain are included. Warm p50 uses a warmed keep-alive pool. First minus warm p50 is therefore an end-to-end excess estimate including connection setup, network, scheduling and initialization; it is not isolated server startup.

All three pairs use identical committed application/adapter/dependency/fixture trees. Pairs 1/2 were built at `96fd550`; the final pair at `ea0c859`. Those commits differ only in benchmark tooling/documentation. [Deployment manifest](benchmarks/vercel-cold-deployments.json) includes their equal application-tree hashes, build metadata, deployed Function mappings and resource pins. Dirty flags are retained: generated result artifacts, diagnostic tests and controller provenance work were present; deployed application sources have no uncommitted differences. All requests use the same protected-access header and unchanged registry code/data. No runtime tuning, native speed flags or measured-handler instrumentation was added.

The diagnostic is a `route.native.ts` explicitly in the demo `vercel` group. Deployed mappings verify memory and hello share the same Function for **all six previews**; Node has two Functions overall and native three. Native now groups 17 dynamic routes including the diagnostic. It is excluded from the workload registry. The diagnostic itself initializes its module; later route-first rows can already use a warm shared Function.

## Untouched deployment-first results

Milliseconds; three observations per variant. Warm p50 is 40 samples for pairs 1/2 and 200 for pair 3. No sample is certified process-cold.

| Pair | Variant | Immutable deployment | First hello | Warm hello p50 | First minus warm p50 |
| --- | --- | --- | ---: | ---: | ---: |
| 1 | node | [next-scriptc-lsauumxx2-noahs-projects-8a075d15](https://next-scriptc-lsauumxx2-noahs-projects-8a075d15.vercel.app) | 255.967 | 26.998 | 228.969 |
| 1 | native | [next-scriptc-5rulskckx-noahs-projects-8a075d15](https://next-scriptc-5rulskckx-noahs-projects-8a075d15.vercel.app) | 800.197 | 22.841 | 777.355 |
| 2 | node | [next-scriptc-9i6bnaisc-noahs-projects-8a075d15](https://next-scriptc-9i6bnaisc-noahs-projects-8a075d15.vercel.app) | 217.771 | 23.887 | 193.884 |
| 2 | native | [next-scriptc-14mfluvcf-noahs-projects-8a075d15](https://next-scriptc-14mfluvcf-noahs-projects-8a075d15.vercel.app) | 834.307 | 22.203 | 812.104 |
| 3 | node | [next-scriptc-oh4dr4zl9-noahs-projects-8a075d15](https://next-scriptc-oh4dr4zl9-noahs-projects-8a075d15.vercel.app) | 228.315 | 24.260 | 204.055 |
| 3 | native | [next-scriptc-fdcxfd5ec-noahs-projects-8a075d15](https://next-scriptc-fdcxfd5ec-noahs-projects-8a075d15.vercel.app) | 850.077 | 24.744 | 825.332 |

| Variant | First median [range] ms | Warm p50 median [range] ms | Excess median [range] ms |
| --- | ---: | ---: | ---: |
| node | 228.315 [217.771, 255.967] | 24.260 [23.887, 26.998] | 204.055 [193.884, 228.969] |
| native | 834.307 [800.197, 850.077] | 22.841 [22.203, 24.744] | 812.104 [777.355, 825.332] |

Only hello is deployment-first. Remaining route-first observations (ms), retained rather than called cold:

| Pair | Variant | Verify | Revenue | Gzip | Nearby | Markdown |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | node | 95.186 | 91.426 | unmeasured | unmeasured | unmeasured |
| 1 | native | 79.334 | 75.372 | unmeasured | unmeasured | unmeasured |
| 2 | native | 66.488 | 93.653 | unmeasured | unmeasured | unmeasured |
| 2 | node | 82.891 | 90.755 | unmeasured | unmeasured | unmeasured |
| 3 | node | 87.329 | 62.483 | 69.181 | 89.594 | 144.555 |
| 3 | native | 53.382 | 45.008 | 92.023 | 55.880 | 83.006 |

Raw records: [pair 1](benchmarks/vercel-cold-pair-1.json), [pair 2](benchmarks/vercel-cold-pair-2.json), [full pair 3](benchmarks/vercel-revision-2-full.json). Each retains first-response IDs/cache headers/digests and deployment mappings. All cross-variant workload digests match. The small sample and differing warm sample counts limit precision; the result contradicts the earlier warmed-preview first-request advantage, not a universal native cold-start claim.

## Idle observation

A five-minute exploratory gap was chosen because [Vercel’s lifecycle explanation](https://vercel.com/blog/the-real-serverless-compute-to-database-connection-problem-solved) describes suspension/deletion on minute scales. Neither it nor the [Fluid docs](https://vercel.com/docs/fluid-compute) promises an eviction deadline. No Sandbox was provisioned while waiting. Gaps below are from the end of the last operator load experiment to the start of the idle request; no operator application traffic intervened.

| Variant | No-traffic gap seconds | First after idle ms | Warm hello p50 ms | Excess ms | Returned diagnostic module initialized |
| --- | ---: | ---: | ---: | ---: | --- |
| node | 417.902 | 103.940 | 25.044 | 78.896 | 2026-10-31T08:49:17.117000+00:00 |
| native | 319.906 | 63.928 | 23.308 | 40.619 | 2026-10-31T08:42:05.961000+00:00 |

Native returned a module initialized before the idle interval, so at least that initialized capacity remained available. It is a different token from the immediately preceding post-load sample. Node returned a token initialized during the idle probe, but its lazy diagnostic-module loading and load-balanced routing mean this does not prove process creation or prior-instance eviction. Neither response can identify the instance that served the preceding hello. [Raw idle observations](benchmarks/vercel-idle.json) retain the exact tokens. No claim of guaranteed warm retention or cold eviction follows.

## Hello C=16 tail

The first diagnostic runs native first/hello first; Node runs a small verify C=16 window before hello. Both use 32-request warmup + target 3 seconds (cap 700), then a new pool with target 3-second warmup (cap 1,500) + target 10-second measurement (cap 4,500). Windows stop at the first limit. The caps shortened successful long windows to about 6–7 seconds; these are **not full 10-second runs**.

| Experiment | Variant | Window | Warmup count / ms | Measured count / ms | req/s | p50 / p95 / p99 ms |
| --- | --- | --- | ---: | ---: | ---: | --- |
| initial | native | original | failed | unavailable | invalid | HTTP 500; stopped |
| initial | node | original | 32 / 229.437 | 700 / 1192.725 | 586.892 | 24.440 / 42.806 / 61.092 |
| initial | node | longWarmup | 1500 / 2454.187 | 4500 / 7057.403 | 637.628 | 21.606 / 40.224 / 68.894 |
| separate repeat | native | original | 32 / 379.681 | 700 / 1746.964 | 400.695 | 21.996 / 49.934 / 577.822 |
| separate repeat | native | longWarmup | 1500 / 2164.033 | 4500 / 6070.628 | 741.274 | 19.003 / 34.106 / 54.455 |

The native failure was HTTP 500 with request `iad1::n66xb-1793436125672-c12c177be4bb`. It happened in the short initial window; subsequent native windows were skipped. That early harness version preserved the issued count/error but not partial timing samples. The amended harness retains drained outstanding samples and invalidates failed windows. This failure stays in [the original result](benchmarks/vercel-tail.json); [the native-only repeat](benchmarks/vercel-tail-native-repeat.json) is separate and is not stitched into a paired run.

New evidence from [runtime logs](benchmarks/vercel-tail-runtime-logs.json): one listener at 08:41:50.514Z followed by **14 distinct new listening ports at 08:42:05.927–05.991Z**, coincident with the first C=16 warmup. The failed request ID is itself attached to one startup listener. Thus scale-out actually occurred, not merely inferred from a long latency. There is no exported per-request start type or server-duration field. The [later log export](benchmarks/vercel-tail-runtime-logs-repeat.json) still has those 15 listener records and no additional startup messages during the repeat; suspension/resumption, platform scheduling and existing-instance activation remain possible explanations for its transient tail.

In the repeat’s short-warmup measured window, 20/700 requests were ≥100 ms and 16 were ≥300 ms (maximum 715 ms); all 16 ≥300 ms requests were dispatched in the first 500 ms. The longer-warmup measured window has 13/4,500 ≥100 ms, **zero ≥300 ms**, maximum 170 ms. All 700 and 4,500 measured requests reused sockets and created no connections, ruling out new client DNS/TLS setup as the explanation for those measured spikes. Generator CPU was only 0.159 / 0.134 cores. Both windows are count-limited, with actual elapsed times retained.

At pinned Vercel commit [`84878e5`](https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/internals/ipc-proxy/bootstrap/proxy.go#L261), the Go proxy uses `httputil.NewSingleHostReverseProxy` and an ordinary `http.Server` handler. No request semaphore, queue size or explicit per-instance concurrency cap is present. [IPC StartPayload](https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/internals/ipc-proxy/bootstrap/ipc/messages.go) advertises only `initDuration` and `httpPort`; the real Linux handshake was `{"type":"server-started","payload":{"initDuration":4,"httpPort":3000}}`. The IPC client mutex serializes message writes, not whole HTTP requests. Announcement precedes `ListenAndServe`; a readiness race is a source-level candidate for the startup-associated HTTP 500, **not a demonstrated cause**.

**Conclusion supported by these observations:** the short initial concurrency window includes a scale-out/activation transient. It does not demonstrate a steady-state native throughput deficit or a Go-enforced request limit. Platform executable-runtime concurrency may still differ: [current Fluid documentation](https://vercel.com/docs/fluid-compute#optimized-concurrency) specifically describes optimized in-function concurrency for Node/Python and does not establish executable-runtime guarantees. We did not measure per-instance active concurrency or receive start-type telemetry, so “all slow requests are process-cold starts” and “native supports the same in-instance concurrency as Node” remain unproven.

## Symmetric protocol revision and full comparison

The [explicit protocol revision 2 and failure-retention amendment](benchmarks.md#vercel-protocol-revision-2--coldmemorytail-follow-up-2026-10-31) preserve the earlier result. Both variants now get C=16 warmup of up to 2 seconds / 1,000 requests on the measured pool, then up to 3 seconds / 900 measured requests. The reduced measurement cap reserves this task’s invocation budget for the separate diagnostics. C=1 remains 20 + 200, workload order and fixtures unchanged. Full-run warmup statistics and count caps are in JSON; most warmups hit the count cap before two seconds. This is a practical transient-reduction protocol, not a guarantee all future scale-out is warm.

The final native preview logs [15 additional listeners starting at 08:49:53.611–53.689Z](benchmarks/vercel-revision-2-runtime-logs.json), during hello’s concurrent warmup, after its initial listener at 08:49:46.018Z. The two-second hello warmups contain the startup tails on **both** variants: Node 889 requests / 2,031 ms, p99 **528 ms**; native 637 / 2,026 ms, p99 **1,097 ms**. Measured p99 then drops to **88 / 56 ms**. The complete warmup distributions remain in JSON rather than being hidden. This is direct corroboration that the symmetric warmup moved transient startup work out of these measured windows.

All 12 rows validate. Ratios are native/Node: lower better for C=1 latency, higher better for req/s. C=16 p50/p95/p99 are shown to avoid hiding remaining tails.

| Workload | Node/native C=1 p50 ms | Native/Node latency | Node/native C=16 req/s | Native/Node rate | Node/native C=16 p50/p95/p99 ms |
| --- | ---: | ---: | ---: | ---: | --- |
| hello | 24.26 / 24.74 | 1.020× | 603.1 / 622.2 | 1.032× | 23.6/41.5/88.1 / 21.6/38.0/56.2 |
| verify | 23.04 / 23.61 | 1.024× | 502.2 / 617.9 | 1.230× | 21.7/38.3/61.1 / 22.1/42.2/82.8 |
| revenue | 25.74 / 24.28 | 0.943× | 525.7 / 588.0 | 1.118× | 26.1/44.8/90.6 / 23.7/41.8/69.8 |
| gzip-export | 29.78 / 27.24 | 0.915× | 408.2 / 437.5 | 1.072× | 30.6/50.9/98.6 / 30.1/47.4/96.6 |
| nearby-stores | 23.90 / 21.84 | 0.914× | 586.1 / 557.0 | 0.950× | 23.3/44.4/75.8 / 23.6/49.7/104.6 |
| markdown | 22.29 / 64.07 | 2.875× | 630.5 / 82.8 | 0.131× | 22.2/36.5/55.1 / 132.6/445.8/526.2 |

Every C=16 window hits 900 requests except native Markdown (275 requests / 3,321 ms including drain). The other windows lasted 1,427–2,205 ms; their rates are short, count-limited observations, not sustained capacity estimates. **Gzip generator saturation is flagged on both sides** (0.856 Node / 0.925 native cores); its req/s difference cannot establish a server-throughput advantage. Other concurrent client CPU values are below 0.8 cores. Native C=1 verify p99 is still 193 ms versus 45 ms Node; native gzip p99 is 157 versus 69 ms. The longer warmup does not remove all variability. Markdown’s 2.875× C=1 latency and 0.131× rate remain explicit losses.

[Full generated report](benchmarks/vercel-revision-2-full.md) and [raw JSON](benchmarks/vercel-revision-2-full.json) include every row, first response, warmup, cap, client CPU, connection count and resources. No rows are borrowed from earlier runs.

## Process memory without Observability

scriptc 0.4.6’s [RSS implementation](https://github.com/vercel-labs/scriptc/blob/v0.4.6/packages/runtime/src/scr_lib.c#L2608) reads resident pages from `/proc/self/stat` and multiplies by page size on Linux; it is current RSS, not `getrusage` peak. The grouped final Linux artifact was tested in an iad1 Sandbox: native API values 35,631,104 / 35,762,176 / 35,762,176 bytes versus in-process VmRSS 35,631,104 / 35,835,904 / 35,835,904. Differences are 0 / −73,728 / −73,728 bytes. External `/proc/<pid>/status` agrees within 197 KiB. Node in that Sandbox reports 65,691,648 versus VmRSS 65,757,184 bytes. Sequential sampling, allocations and Linux RSS accounting explain small differences; this is a practical consistency check, not bit-identical sampling. The checker enforces <2 MiB discrepancy on native/internal/external readings. [Raw check](benchmarks/vercel-memory-linux.json) includes artifact hashes and the handshake; [initial independent check](benchmarks/vercel-memory-linux-initial.json) is also retained.

MiB below = bytes / 1,048,576. API RSS and procfs VmRSS are exactly equal in every hosted sample. VmHWM is the returned process’s lifetime high-water mark, not the peak for a particular load window.

| Pair / phase | Variant | API RSS MiB | VmRSS MiB | VmHWM MiB |
| --- | --- | ---: | ---: | ---: |
| 1: after deployment-first hello | node | 79.898 | 79.898 | 79.898 |
| 1: after deployment-first hello | native | 33.594 | 33.594 | 33.594 |
| 2: after deployment-first hello | native | 33.598 | 33.598 | 33.598 |
| 2: after deployment-first hello | node | 80.027 | 80.027 | 80.027 |
| 3: after deployment-first hello | node | 80.078 | 80.078 | 80.078 |
| 3: after full six-workload load | node | 132.551 | 132.551 | 181.727 |
| 3: after deployment-first hello | native | 33.594 | 33.594 | 33.594 |
| 3: after full six-workload load | native | 50.812 | 50.812 | 50.852 |

After-first RSS across the three pairs: Node median **80.027 MiB**, range 79.898–80.078; native median **33.594 MiB**, range 33.594–33.598. In the full run the after-load samples are **132.551 MiB Node / 50.812 MiB native**, process peaks **181.727 / 50.852 MiB**. Node’s two full-run samples returned the same token; native’s returned different tokens. Therefore native’s apparent growth is not a same-process before/after measurement. Native-only hello-tail post-load RSS was 33.383 MiB, a different and much lighter history; it is not substituted for the six-workload number.

These are real **process** RSS observations from the measured Function’s serving process. Native excludes the Go proxy, Node excludes platform launcher/sidecars, and neither includes all concurrently running instances or kernel/platform overhead. Routing can return any instance; the many native listener records make multiplying or comparing a single sample as whole-deployment usage particularly misleading. Allocator/GC history and scheduling affect samples. No PSS, whole-process-tree, aggregate instance-population or Vercel peak-memory claim is made. After-load samples were taken before the later parity/smoke suites initialize other workloads, including report workers.

## Verification, cost and remaining questions

Local benchmark safety tests cover concurrent budget enforcement, failed-window draining/retention and parity failure invalidation, plus preservation of rows/counts when a memory probe fails; 4/4 pass. Package tests pass 9/9 (13 passing local tests total). Six deployed topology/resource checks pass. The final grouped Linux checker passes its RSS and real-handshake assertions. Hosted post-measurement verification is recorded separately below; it does not contaminate any first-request or after-load sample.

Hosted verification: **85/85 parity cases + 25/25 smoke checks pass**; 85 + 16 requests per variant, 202 total, all after measurement. [Parity log](benchmarks/vercel-revision-2-parity.txt), [smoke log](benchmarks/vercel-revision-2-smoke.txt), [structured smoke result](benchmarks/vercel-revision-2-smoke.json).

| Experiment | HTTP attempts | Sandbox vCPU-h upper bound |
| --- | ---: | ---: |
| vercel-cold-pair-1.json | 128 | 0.004182 |
| vercel-cold-pair-2.json | 128 | 0.004403 |
| vercel-tail.json | 6834 | 0.009393 |
| vercel-tail-native-repeat.json | 6800 | 0.007653 |
| vercel-idle.json | 124 | 0.003375 |
| vercel-revision-2-full.json | 23318 | 0.074454 |
| vercel-memory-linux-initial.json | 0 | 0.004342 |
| vercel-memory-linux.json | 0 | 0.004978 |
| Hosted parity + smoke, after measurements | 202 | 0 (local client) |
| **Total** | **37,534** | **0.112779** |

**Budget used:** 7/12 deployments (4 Node, 3 native; at most 3 measured untouched samples per variant), 37,534/40,000 HTTP attempts as a conservative Function-invocation upper bound, 0.112779/0.4 Sandbox vCPU-h upper bound. Platform active CPU summed to 58,646 ms; it is a different metric. Eight Sandbox runs were stopped in finally, without snapshots. The unused preview was deleted successfully; the six URLs cited above are retained. [Cost ledger](benchmarks/vercel-cold-cost.json) records every run and the deleted deployment is in the provenance manifest.

Retained artifacts include the failed tail result; no outliers, losses or failed deployments were replaced in a headline comparison. The final same-commit full pair is the only revised-protocol paired comparison. After measurements, an additional tested error-path fix preserves full-run rows/counts if a memory diagnostic fails and clears response-abort timers. It does not change the successful-run protocol; the uploaded client hash and source commit identify the measured version.

Open questions: exact Vercel start types and server durations remain unavailable without Observability Plus; whole-instance/process-tree and aggregate memory remain unmeasured; executable-runtime platform concurrency is undocumented here; the startup-associated HTTP 500 needs a readiness/transport investigation. Three preview samples do not generalize to production prewarming or prove cold-start distributions. The longer warmup has evidence for reducing this transient, not for eliminating every tail. No package/runtime/proxy change was made for these measurements.
