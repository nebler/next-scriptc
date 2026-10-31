# Vercel latency from an iad1 client

From inside Vercel iad1, patched TS vector search took 36.0 vs 39.8 ms p50 for Go SIMD, 9.7% lower, but lost p95 (70.5 vs 63.7 ms). Native /reports cut 200k-event p50 from 203.3 to 97.4 ms, 52.1% lower. At 5k it lost. Same-region previews, short windows, exact results checked.

2026-10-31. Branch `bench/near-client`, based on main at `68704f4066598ba764ccd7a7b1728cab0cae4d72`. This measures the end-to-end gap left open by [L1](vector-vercel.md) and [N1](use-native-vercel.md), using their existing previews. All nine L1 previews and both N1 timing previews were inspected READY, with Functions deployed to iad1. Set 1 was selected before any timing requests, for six vector variants and small Hobby load. Sets 2 and 3 were inspected but not measured. No target redeploy, production deployment, project-setting change, new project, Sandbox or Docker operation.

## C=1 results

Times are milliseconds. Each row contains 60 measured requests after 10 warmups, plus a separate first-observed request. Percentiles use nearest rank; p95 is the 57th ordered sample. Every measured sample remains included, including tails.

| Variant | End-to-end p50 / p95 ms | Server compute p50 ms | Overhead p50 ms |
| --- | ---: | ---: | ---: |
| Patched native, natural TS | 35.975 / 70.506 | 10.157 | 25.925 |
| Stock native, Math.imul | 34.733 / 50.753 | 10.369 | 24.350 |
| Stock native, natural TS | 440.120 / 489.308 | 415.883 | 23.849 |
| Go experimental SIMD | 39.836 / 63.711 | 14.334 | 25.431 |
| Go plain | 83.633 / 100.302 | 55.750 | 27.401 |
| Node, natural TS | 93.126 / 119.734 | 67.739 | 25.600 |
| /reports 5k, Node fallback | 40.527 / 82.781 | 3.994 | 36.723 |
| /reports 5k, native sidecar | 42.132 / 70.874 | 6.318 | 35.517 |
| /reports 200k, Node fallback | 203.320 / 221.029 | 171.571 | 31.056 |
| /reports 200k, native sidecar | 97.353 / 166.935 | 62.220 | 33.614 |

End-to-end ends after the complete identity-encoded body drains, before client hashing/validation. TTFB is also retained, through receipt of response headers. Overhead is the **median of paired end-to-end minus server-compute intervals**. Separate medians need not add. It includes same-region HTTPS/CDN routing, request/response transport, framework/runtime/IPC work outside the measured handler and scheduling. It is not a pure network measurement. Vector median overhead is still 23.849 to 27.401 ms, even inside iad1, so this is not a zero-hop or direct Function-to-Function connection.

Patched native saves 3.862 ms end-to-end p50 against Go SIMD, **9.7% lower** (1.11x), while its compute p50 is **29.1% lower**, 10.157 versus 14.334 ms. The near-client window makes the small full-route advantage visible in the medians, but does not establish a statistically significant fleet-wide win. Patched native **loses p95**, 70.506 versus 63.711 ms, and loses to stock imul in both p50 and p95. Stock imul already reaches the fast path. Node's compute p50 here is 67.739 ms versus L1's pooled 108.593 ms; JIT, placement, scheduling and instance history remain uncontrolled. This is a new window, not the old compute samples with WAN subtracted.

At 5k, native /reports **loses p50**, 42.132 versus 40.527 ms, and its function interval loses, 6.318 versus 3.994 ms. Its end-to-end p95 happens to win, 70.874 versus 82.781 ms. At 200k, native wins both end-to-end percentiles, saving 105.968 ms p50 (**52.1% lower**, 2.09x). This is smaller than the 2.76x function-interval ratio, because the whole route includes additional work. Native 200k's 166.935 ms p95 and all other tails are retained.

For reports, server compute is N1's full caller-side `await revenue(...)` interval, including sidecar readiness, validation, serialization, loopback transport and parsing where applicable. It is not isolated native kernel CPU. The launcher/render medians are Node/native **11.563 / 10.296 ms at 5k**, and **178.068 / 65.567 ms at 200k**. Paired end-to-end-minus-render medians are **29.527 / 31.904 ms at 5k**, and **24.917 / 30.155 ms at 200k**. No rendering-CPU claim follows from subtracting these timings.

## Same-region evidence

Every one of the **842 retained response records**, including failed instrumentation attempts, has `x-vercel-id` beginning **`iad1::iad1::`**. All 20 client invocation records report **`VERCEL_REGION=iad1`**, running Node 24.22.2. Examples retained verbatim:

- Patched vector C=1 first: `iad1::iad1::fxtdn-1793479168768-1960d1194091`.
- Go SIMD C=1 first: `iad1::iad1::kzwxx-1793479171405-49b2c385694d`.
- Native /reports 200k first: `iad1::iad1::rrx42-1793479239488-9ac9c84477b8`.

[Vercel's response-header definition](https://vercel.com/docs/headers/response-headers#x-vercel-id) identifies the request region and the region executing the Function. Both are iad1 here. The Function's own region and read-only deployment metadata corroborate that evidence. It proves regional routing, not the same physical host or availability zone. The outer Mac-to-client requests retain `fra1::iad1::...`; that WAN is outside every target latency sample.

The original client deployed as [https://next-scriptc-3g9wscye6-noahs-projects-8a075d15.vercel.app](https://next-scriptc-3g9wscye6-noahs-projects-8a075d15.vercel.app/bench), deployment `dpl_2q8pCyJmgbZ2uU9xA6pEnSYhBeMm`. All C=1 samples came from one client instance, `a09cd350-9b32-4085-965b-730dfccf8653`. Corrected C=4 samples came from one new client instance, `7699c5e6-f3f4-4b73-98ff-92bf13143624`, at [https://next-scriptc-asjapiuii-noahs-projects-8a075d15.vercel.app](https://next-scriptc-asjapiuii-noahs-projects-8a075d15.vercel.app/bench), deployment `dpl_ACNv8pCr8WeFudoFJ6yka8QRqzPn`. These phases use two actual instances, each with one serially invoked load generator. The intervening failed instrumentation client used a third instance. This is not multiple independent client placements or a fleet sample.

## Protocol, validation and caching

The client is a single Node 24 Build Output API Function, launcherType Nodejs, regions [iad1], requested memory 2048 MiB and maxDuration 60 seconds. The final inspected bundle is 461,814 bytes. Its [source and scripts](../examples/demo/bench/vercel/near-client/) use Undici 7.16.0 Agents, HTTP/1.1 keep-alive, no RetryAgent, no application retries and no redirects. A pool is keyed by origin and concurrency; variants sharing one deployment share origin connections. All **600 warm C=1 samples reused a socket**, and so did all 96 final C=4 measured samples. This is actual dispatch/socket observation, not inferred from a keep-alive setting.

Vector C=1 requests rotate variant order after each pass. Three invocations contribute 20 measured samples each; only the first has 10 warmups. Report sizes run separately in 5k then 200k order, alternating Node/native order within each size. Report instances retain the same token across both sizes. All vector C=1 variants retain one serving instance token each; stock imul and natural share a Function. No request adds a cache-busting query parameter or changes the target workload.

All 830 planned protocol responses passed status, full result hash, timing/instance, CDN and same-region checks. Vector bytes exactly match L1's top-10 SHA-256 `f572c0e53ba7a53f6afe4f32bbc80168fbec17853b0add069fd1d230a3c1429a`, with the same 2,813-byte query fixture and request SHA-256 `2b76366ea1c876b589c134c61cb68fda5882a29e86b92ba797503c7f6436ab80`. Reports decode the complete result JSON from the HTML and compare it to N1's hashes, identical across Node/native: 5k `58e99230368693d8899627a9c334b197a66005e8504ac2874e55fb6596ef720c`; 200k `7d29e6b712a858e37b760f58635f403259481c586c30cad9f4e2642cff0d1819`. Event counts, report timings and native spawn attempt count 1 are also checked. The complete raw HTML hash is recorded separately because streamed HTML contains request-varying material.

Every retained target response has **`x-vercel-cache: MISS`**, including reports. Vector responses also have `cache-control: no-store`. N1's timing previews disable PPR and retain their function/render timing headers. There is no observed cached report result substituting for compute.

The Mac loads the ignored main-checkout `.env.local` and passes the bypass only in request headers. The client forwards it only to HTTPS hosts matching `next-scriptc-[a-z0-9]+-noahs-projects-8a075d15.vercel.app`, with restricted benchmark paths, no credentials/ports and no redirects. The client has the same preview protection. No secret is logged, returned, persisted or committed. Temporary deployment trees are removed immediately after upload/inspection; only compact JSON and source remain.

## Short C=4 windows and retained failures

Each corrected variant window uses four concurrent warmups, then up to 16 measured dispatches or two seconds, first limit wins, draining outstanding requests. All six hit the 16-request cap. The stock-natural window drains in 2.318 seconds. Measured elapsed/throughput includes client validation, and does not include the four warmups. C=4 uses a distinct pool from C=1, shared between stock routes and between Node/Go routes on their origins.

| Variant | Count | End-to-end p50 / p95 ms | Compute p50 ms | Observed req/s | Target instances |
| --- | ---: | ---: | ---: | ---: | ---: |
| Patched native, natural TS | 16 | 38.080 / 228.488 | 10.115 | 69.471 | 3 |
| Stock native, Math.imul | 16 | 39.055 / 1320.339 | 10.027 | 12.108 | 4 |
| Stock native, natural TS | 16 | 472.255 / 607.094 | 428.724 | 6.903 | 4 |
| Go experimental SIMD | 16 | 36.553 / 691.279 | 14.433 | 23.054 | 4 |
| Go plain | 16 | 99.401 / 202.013 | 68.253 | 31.267 | 4 |
| Node, natural TS | 16 | 204.571 / 707.573 | 178.424 | 18.367 | 4 |

Patched native **loses C=4 p50** to Go SIMD, 38.080 versus 36.553 ms. Its corrected p95 is lower, but that is not a controlled capacity win: the earlier failed native window had already triggered scale-out and warmed additional native instances. Stock imul's 1320.339 ms p95 and Node's 707.573 ms p95 remain losses in these short windows. Fluid instance placement, scale-out and corpus initialization are not held equal.

Two instrumentation failures preceded the final C=4 windows. They are preserved, not overwritten:

1. [Original failed window](vercel-near-client/vector-c4-patched-natural.json): four warmups and seven measured responses, all correct bodies and region IDs. Four measured responses lost socket metadata because Undici pool dispatch ran in another request's async context. The partial measured end-to-end p50/p95 was **71.972 / 881.038 ms**. These slow results remain visible; the window stopped on metadata validation and is not pooled with the completed protocol.
2. [First correction](vercel-near-client/vector-c4-v2-patched-natural.json): request-ID correlation assumed string headers, while pinned Undici uses a flat array. It failed during concurrent warmup and retained one correct result with missing socket metadata. Four warmups were dispatched, but the old fail-fast Promise.all returned before three in-flight results could be persisted. Their validation outcomes are unknown. The final implementation uses the actual array format and drains all warmup promises before failing.

The intermediate preview is [https://next-scriptc-38qrv2b9s-noahs-projects-8a075d15.vercel.app](https://next-scriptc-38qrv2b9s-noahs-projects-8a075d15.vercel.app/bench), deployment `dpl_C3KNDeLaSuMGjJRQ21wj7c5WT8hJ`. Final correlation has a real local HTTP regression test with 24 queued C=4 requests and four actual reused sockets, plus the completed hosted windows. No C=1 measurement was repeated or replaced. These were instrumentation corrections, not automatic retries or reruns selected for faster timings. There are **845 dispatched target requests: 830 protocol responses plus 15 in failed attempts; 842 response records retained**, all retained bodies/statuses correct, five socket-metadata validation failures and three unretained warmup outcomes. The latter are a limitation of the initial harness, not evidence of successful responses.

## Client CPU and limits

Across all 20 invocations, including the failed attempts, the client's user+system CPU delta totals **2863.008 ms over 100967.348 ms of invocation wall time**, **0.0284 cores** on average. Maximum C=1 invocation average is **0.0926 cores**; maximum corrected C=4 measured-window average is **0.1275 cores**. Maximum successful whole-invocation average is **0.2859 cores** (including initial client setup). The failed short first-correction invocation peaks at **0.5841 cores** over 86.127 ms. Maximum observed event-loop utilization is 0.5623, and maximum timer delay is 25.428 ms. Longest invocation is **22.657 seconds**, well below maxDuration 60 seconds.

No sustained client saturation is observed at C=1 or C=4 by these CPU/wall and event-loop measures. They cannot rule out brief instantaneous saturation or establish billed Active CPU. CPU includes hashing and validation, and is process-wide, so overlapping background work can enter it. The Function exposes two available logical CPUs, which does not establish two entitled vCPUs or physical colocated cores; enforced quota was not measured and no project resources were changed.

One client instance per measurement phase, existing preview history, one preselected vector deployment set, one report deployment pair, short closed-loop windows and Fluid placement limit inference. Four warmups do not guarantee every scaled-out instance is warm. C=4 tails include new corpus/Function activation. There is no open-loop load, coordinated-omission correction, sustainable-throughput claim, confidence interval or paired hardware control. First-observed requests below are not certified cold starts. The 200k first requests follow the warmed 5k report Function. The ordinary European WAN is removed from the measured interval, but HTTPS/CDN routing and platform overhead remain.

## First-observed requests

These requests are excluded from the warm tables. Existing previews could have been idle, frozen, prewarmed or recycled. Stock-natural follows stock-imul on their shared Function, and Node/Go paths share an origin connection.

| Variant | End-to-end ms | Compute ms |
| --- | ---: | ---: |
| Patched native, natural TS | 1136.011 | 13.158 |
| Stock native, Math.imul | 1089.866 | 9.989 |
| Stock native, natural TS | 431.155 | 408.815 |
| Go experimental SIMD | 995.112 | 14.047 |
| Go plain | 920.363 | 57.905 |
| Node, natural TS | 859.335 | 80.005 |
| /reports 5k, Node fallback | 1184.222 | 5.785 |
| /reports 5k, native sidecar | 1337.083 | 55.982 |
| /reports 200k, Node fallback | 242.483 | 211.480 |
| /reports 200k, native sidecar | 105.641 | 65.814 |

## Deployment identities and reproduction

| Target | Preview | Deployment ID |
| --- | --- | --- |
| vector node, set 1 | [next-scriptc-2e1l1jug1](https://next-scriptc-2e1l1jug1-noahs-projects-8a075d15.vercel.app) | `dpl_6wauuGfRLK7ujq9RpS5xLS9jCye3` |
| vector stock, set 1 | [next-scriptc-jaqgnxg73](https://next-scriptc-jaqgnxg73-noahs-projects-8a075d15.vercel.app) | `dpl_cEfhCSAV3fx9vVoYHeRv8URULyeb` |
| vector patched, set 1 | [next-scriptc-111gfu3t7](https://next-scriptc-111gfu3t7-noahs-projects-8a075d15.vercel.app) | `dpl_CkmnPNeaJSys4g5aS1GzTJPY7FLL` |
| report node | [next-scriptc-in7eplui1](https://next-scriptc-in7eplui1-noahs-projects-8a075d15.vercel.app) | `dpl_48jMQxVF3LQNmRzaprYtJZvmDec4` |
| report native | [next-scriptc-mfslscoju](https://next-scriptc-mfslscoju-noahs-projects-8a075d15.vercel.app) | `dpl_9NrjA5AnECgqyDfMWqvzqnUmz8PR` |

All nine L1 identities and both N1 identities are in [targets.json](vercel-near-client/targets.json). Client configurations/source hashes are in [client-deployment.json](vercel-near-client/client-deployment.json) and its v1/v2 companions. The source commit is the main base plus the working-tree source identified by those SHA-256 hashes. [run.json](vercel-near-client/run.json) indexes all batches, including failures; v1/v2 manifests preserve stopped states. [summary.json](vercel-near-client/summary.json) is derived with nearest-rank percentiles and asserts all requested C=1 counts, hashes and regions.

Run from the repo root with Node 24 and an authenticated CLI. The [README](../examples/demo/bench/vercel/near-client/README.md) documents environment-file/project-link paths and a fresh-output reproduction. The final scripts refuse duplicate deployment labels and measurement runs. For the historical corrections, `finish-c4` resumed only C=4 and used `NEAR_CORRECTION=3` for the final windows. Local allowlist/path/load tests, out-of-order trace regression, real queued HTTP regression and the hosted validation all pass. No repository-wide compiler test or unrelated long Docker validation was run for this benchmark-only change.
