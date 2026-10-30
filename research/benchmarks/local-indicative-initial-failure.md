# next-scriptc benchmark

**INDICATIVE ONLY: developer machine / reduced repetitions; not publishable performance evidence**

Status: failed. Commit: f4d324964c7fb0882cf84be18a6f83f8cd67813d. Node v24.22.0; scriptc 0.4.6; Next 16.4.3.

Apple M4 Pro; 12 logical CPUs; darwin/arm64; load averages start 45.4677734375, 31.80712890625, 24.60302734375, end 78.921875, 59.0283203125, 38.3447265625.

Started 2026-10-30T22:34:19.276Z; ended 2026-10-30T22:38:01.005Z. Profile: quick. Affinity: {}.

Full environment, build IDs, source/binary hashes, dirty status, raw repetitions, per-process snapshots, requests, and workload configuration are in the adjacent JSON. Brackets below are [min, max] across repeated runs, not confidence intervals.

## Limitations alongside the results

- Headline application workloads are successful cost-10 login, authenticated JWT verification, 3,000-product search, uncached Markdown rendering and RSS. hello is a small-response control; primes and report are synthetic. These fixtures have no database or remote I/O.
- Native bcrypt is a known regression: the earlier correctness probe took 26.8 s for three cost-10 operations versus 0.56 s on Node (~48× slower). Login therefore measures only three requests, C=1, one measured repetition and one separate cold request per surface. Its p99 is simply the maximum of three, not credible tail evidence. No reduced cost, invalid password or 401 shortcut is substituted. CSV and OG-image generation were refused by the probe; see examples/probe/RESULTS.md.
- Coverage static percentage is not a typed-machine-code percentage: scriptc includes dynamic-tier statements in its compile-statically total. Dynamic counts and package modes are displayed alongside speed; package mode static does not exclude untyped JS operations. Coverage describes the entry graph, not measured hot-path time, so it suggests explanations without proving causality.
- Node baseline is a production next build / next start with adapter disabled (.next-node), normal V8 JIT, no debug or memory flags. Direct Node uses the identical generated entry and HTTP shim, without a Next server. Native end-to-end includes the extra Next proxy and all resident route processes.
- Next may prerender pure GET handlers such as hello and feed.xml in the Node production build. Its normal static optimization is retained as the strongest application baseline; that comparison can include serving a prerendered body versus computing it. The direct comparison still executes the same entry on every request. Prerendered paths are recorded in the environment.
- Linux uses two allowed CPUs for the application tree and two disjoint CPUs for generator + controller. Both runtimes inherit the same masks. Threads alone use all four CPUs for 1/2/4-worker scaling; they have no sustained HTTP load generator. These are logical CPUs; topology/SMT and other sandbox tenants may still affect results. macOS cannot use taskset: local output is indicative only.
- Run order: cold runtimes alternate. Default steady blocks are direct Node, direct native, end-to-end Node, end-to-end native; --reverse reverses runtime order and is recorded in the profile. All repeated steady runs share their block's process/JIT/cache/allocator state. No multiple application modes run together. Repeat on a quiet host in both orders before publishing close comparisons.
- Client and server share a machine and memory bandwidth. The single Node generator can bottleneck on one JS thread even with a two-CPU affinity mask. Rows flag suspected generator saturation at >=0.8 CPU-seconds per wall-second; flagged throughput is a lower bound on server capacity. CPU pinning reduces CPU contention but does not eliminate shared-resource interference. No load-generator ceiling calibration is implied.
- SAB is a standalone Node program to expose the strongest Node sharing baseline without adding an application route. Its internal timed region matches report, and every total must match. It has no idle HTTP shim; RSS is therefore slightly favorable to SAB. SAB and object layouts/code accesses differ by necessity. This tests sharing ergonomics + overhead, not identical-code compiler speed. Dataset construction and worker initialization costs are excluded from time. Warmed total RSS retains the dataset and resident pool; the marginal metric compares warmed 1/4-worker states within a process.
- Idle and after-load memory are runtime/GC-state dependent. Peak sampling can miss spikes; summed RSS overcounts shared pages. CPU ticks can make tiny-request per-request CPU noisy: increase fixed count for public claims. Active CPU here is OS user+system process CPU, not a reproduction of Vercel billing instrumentation.
- Responses are checked for expected status and byte-for-byte SHA-256 parity before timing and throughout load. Workloads must use deterministic fixtures, including a fixed clock/key for token issuance. No TLS, remote network, serverless scheduling, multi-instance autoscaling or platform cold starts are measured.

## Workloads

| Route | Kind | Request / pending |
| --- | --- | --- |
| login | realistic | POST /api/login |
| verify | realistic | GET /api/verify |
| search | realistic | GET /api/search?q=desk%20lamp&limit=7 |
| markdown | realistic | GET /api/posts/reliable-webhooks |
| feed | realistic | GET /api/feed.xml |
| hello | control | GET /api/hello |
| primes | synthetic | GET /api/primes?limit=1000000 |
| csv | refused | DISABLED: Papa Parse unparse refused in route probe; no CSV route exists |

## Application workloads, C=1 (latency and coverage together)

| Route | Scope | Node p50 ms | Native p50 ms | Native / Node latency | Statements / static % / dynamic tier | Package modes |
| --- | --- | --- | --- | --- | --- | --- |
| login | direct | — | — | — | 2084 / 98% / 426 | bcryptjs: static; jose: static |
| login | end-to-end | — | — | — | 2084 / 98% / 426 | bcryptjs: static; jose: static |
| verify | direct | — | — | — | 1698 / 97% / 241 | jose: static |
| verify | end-to-end | — | — | — | 1698 / 97% / 241 | jose: static |
| search | direct | — | — | — | 1023 / 97% / 344 | minisearch: static |
| search | end-to-end | — | — | — | 1023 / 97% / 344 | minisearch: static |
| markdown | direct | — | — | — | 1215 / 98% / 641 | marked: static |
| markdown | end-to-end | — | — | — | 1215 / 98% / 641 | marked: static |
| feed | direct | — | — | — | 1216 / 98% / 640 | marked: static |
| feed | end-to-end | — | — | — | 1216 / 98% / 640 | marked: static |

## Coverage of every measured entry (controls and synthetic included)

| Entry | Statements | Static statements / % | Dynamic tier statements | Package modes |
| --- | --- | --- | --- | --- |
| login | 2084 | 2049 / 98% | 426 | bcryptjs: static; jose: static |
| verify | 1698 | 1663 / 97% | 241 | jose: static |
| search | 1023 | 999 / 97% | 344 | minisearch: static |
| markdown | 1215 | 1191 / 98% | 641 | marked: static |
| feed | 1216 | 1192 / 98% | 640 | marked: static |
| hello | 316 | 292 / 92% | 25 | none |
| primes | 332 | 308 / 92% | 28 | none |
| report | 408 | 384 / 94% | 36 | none |

## Cold start (ms, process-cold)

| Scope / runtime / route | N | Median | p90 | Min | Max |
| --- | --- | --- | --- | --- | --- |
| direct / node / login | 1 | 1413.693 | 1413.693 | 1413.693 | 1413.693 |
| direct / native / login | 1 | 41629.297 | 41629.297 | 41629.297 | 41629.297 |
| direct / node / verify | 1 | 343.657 | 343.657 | 343.657 | 343.657 |
| direct / native / verify | 1 | 587.475 | 587.475 | 587.475 | 587.475 |
| direct / node / search | 1 | 658.005 | 658.005 | 658.005 | 658.005 |
| direct / native / search | 1 | 1351.738 | 1351.738 | 1351.738 | 1351.738 |
| direct / node / markdown | 1 | 495.306 | 495.306 | 495.306 | 495.306 |
| direct / native / markdown | 1 | 587.174 | 587.174 | 587.174 | 587.174 |
| direct / node / feed | 1 | 330.038 | 330.038 | 330.038 | 330.038 |
| direct / native / feed | 1 | 592.765 | 592.765 | 592.765 | 592.765 |
| direct / node / hello | 1 | 217.500 | 217.500 | 217.500 | 217.500 |
| direct / native / hello | 1 | 22.251 | 22.251 | 22.251 | 22.251 |
| direct / node / primes | 1 | 266.844 | 266.844 | 266.844 | 266.844 |
| direct / native / primes | 1 | 599.597 | 599.597 | 599.597 | 599.597 |
| end-to-end / node / login | 1 | 1760.589 | 1760.589 | 1760.589 | 1760.589 |

## Idle RSS (MiB, per process and simultaneous total)

| Scope / runtime | Initialized by | PID / role | RSS MiB |
| --- | --- | --- | --- |


## Fixed-count process CPU and memory

| Scope / runtime / route | N per run | CPU ms/request median [min,max] | After N total RSS MiB | Sampled peak total MiB |
| --- | --- | --- | --- | --- |


## Throughput / latency

| Scope / runtime / route / C | req/s median [min,max] | p50 ms median [min,max] | p99 ms median [min,max] | Peak total MiB | Measured sockets created / requests reused (each run) | Generator CPU cores / saturation suspected |
| --- | --- | --- | --- | --- | --- | --- |


## Observed native proxy/topology cost

| Route / C | Δ median p50 ms | Δ median p99 ms | end-to-end/direct req/s | Client saturation suspected |
| --- | --- | --- | --- | --- |


## Event-loop isolation (each repetition)

| Runtime / window / repeat | Probe | Requests | p50 ms | p99 ms | Heavy completed |
| --- | --- | --- | --- | --- | --- |


## Synthetic threads: sharing ergonomics and overhead

| Variant / workers | Internal ms median [min,max] | Warmed total RSS MiB median [min,max] |
| --- | --- | --- |


Same-process net RSS growth from 1 to 4 warmed workers; not allocation size. See the threads definition.

| Variant | 1-worker RSS MiB | 4-worker RSS MiB | Marginal warmed RSS / added worker MiB |
| --- | --- | --- | --- |


## Precise metric definitions

- **cold-start:** Monotonic wall time immediately before spawn to the first HTTP response with expected status and fully drained body. Fresh process each sample; readiness retries every 2 ms. Direct uses the exact generated .next/scriptc/entry-N.ts under Node 24 type stripping versus its compiled binary; no Next. End-to-end includes next start (Node) or the recorded native production command and the first execution of the specified route. OS filesystem caches are not flushed; this is process-cold, not machine-cold. Median averages the middle two values for even N; p90 uses nearest rank.
- **memory-idle:** RSS after first successful readiness request and the configured quiet interval. Includes initialization by that route, not an untouched process. Direct: route process. End-to-end: entire owned process tree, including Next, adapter supervisor, all native binaries and descendants. Linux uses the kernel's approximate stat RSS counter; macOS uses ps RSS. Totals sum resident mappings and may double-count shared OS/library pages; not PSS or unique physical memory.
- **cpu-fixed-count:** After untimed warmup, user+system CPU delta of the stable owned process tree over exactly N successful sequential keep-alive requests, divided by N. Linux /proc/PID/stat excludes child CPU fields to avoid double counting; Node worker threads are already in process totals. macOS ps TIME is rounded to centiseconds. The generator warms its own process and keep-alive agent before an IPC barrier; CPU snapshots bracket release through generator shutdown, excluding spawn/warmup. Boundary sampling and idle runtime CPU remain; generator CPU is excluded and reported separately. Each row carries before/after per-process CPU and RSS. N is per repetition, after prior warmup; RSS after N is not a fresh-process measurement.
- **throughput-latency:** Separate-process HTTP/1.1 keep-alive closed-loop generator with C outstanding requests, no pipelining; dispatch until duration expires, then drain all in-flight requests. Throughput = completed responses / actual dispatch-to-final-drain seconds. Latency = dispatch to fully drained body; nearest-rank p50/p99 within a run. No coordinated-omission correction; this measures closed-loop capacity, not an external arrival-rate SLA. Each sample warms the same generator process and agent at its C before the IPC start barrier. Socket creations and reused requests are counted separately for warmup and measurement; repeats retained independently, with median and min/max across runs.
- **peak-rss:** Largest sampled simultaneous sum of process-tree RSS, sampled every 100 ms plus the before/after boundaries. Sampler reads only the previously discovered tree (targeted ps on macOS, /proc on Linux); full discovery at both boundaries checks stable process membership. Each peak snapshot contains every process. This is a lower bound on peak RSS, not a kernel high-water mark. On a loaded host ps/scheduling can lengthen the interval.
- **hop-cost:** Native end-to-end minus native direct median p50/p99 at identical concurrency, input and affinity. Also report end-to-end/direct throughput ratio. This is an observed topology difference including Next routing/proxy/serialization/scheduling, not a pure network-hop stopwatch. The samples are separate runs; percentile differences are not percentiles of paired hop times and may be negative under noise.
- **isolation:** First warm heavy and probe endpoints. Baseline and loaded windows each dispatch one sequential probe per path, in parallel, waiting 20 ms after completion. Loaded window additionally holds one heavy request outstanding, back to back. Record probe p50/p99 and sample counts alongside completed heavy requests; equal offered concurrency, not equal achieved heavy RPS. Heavy load starts 100 ms before probes; drain is included. A synchronous Node handler may delay even accepting probes. Requests cannot be preempted at the deadline.
- **threads:** One million orders, 8 regions, 12 scenarios, 60 months; exact integer-cent totals compared across all variants/counts. Fresh process per variant, growing its retained pool through 1/2/4 workers. One readiness computation at 1 worker, then two full warmups at each count before repeated internal dispatch+compute+reduction timings. Counts run ascending and share JIT/GC history. Dataset/pool setup and HTTP excluded. RSS includes the dataset and all worker threads. Marginal warmed RSS/added worker = (median post-job RSS at 4 workers - median post-job RSS at 1 worker) / 3 within that SAME process. Dataset construction garbage is excluded from the baseline; this measures net resident growth including GC/JIT/allocator history, not exact clone allocations. Negative values, if any, remain visible as GC/noise and do not mean negative worker allocation. SAB uses four hand-filled Int32 SharedArrayBuffers; object variants share the original route and worker source. Node object workers clone workerData; native publishes ordinary object graphs. No forced GC.

## Failure (partial data; do not publish)

```
Error: /api/login: HTTP 500: Internal Server Error
    at IncomingMessage.<anonymous> (file:///Users/noah/.t3/worktrees/next-scriptc/t3-ff123962/examples/demo/bench/load.mjs:21:18)
    at IncomingMessage.emit (node:events:526:24)
    at endReadableNT (node:internal/streams/readable:1783:12)
    at process.processTicksAndRejections (node:internal/process/task_queues:90:21)
```
