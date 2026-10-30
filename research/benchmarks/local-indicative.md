# next-scriptc benchmark

**INDICATIVE ONLY: developer machine / reduced repetitions; not publishable performance evidence**

Status: complete. Commit: 5536d9f51538d5e54e56e1faefecd845f8ae944d. Node v24.22.0; scriptc 0.4.6; Next 16.4.3.

Apple M4 Pro; 12 logical CPUs; darwin/arm64; load averages start 8.89697265625, 15.388671875, 26.27294921875, end 15.2109375, 15.6328125, 24.8291015625.

Started 2026-10-30T22:09:06.785Z; ended 2026-10-30T22:11:13.915Z. Profile: quick. Affinity: {}.

Full environment, build IDs, source/binary hashes, dirty status, raw repetitions, per-process snapshots, requests, and workload configuration are in the adjacent JSON. Brackets below are [min, max] across repeated runs, not confidence intervals.

## Limitations alongside the results

- Realistic route placeholders are disabled until input/output contracts are integrated. hello is a control; primes and report are synthetic. There are no headline application claims until realistic routes are enabled and correctness checked.
- Unmeasured cases must stay visible: the route probe refused Papa Parse CSV export, and cost-10 native bcrypt is slow enough to require a separate concurrency/time budget. Disabled or refused workloads are not native successes; see examples/probe/RESULTS.md before selecting headline workloads.
- Node baseline is a production next build / next start with adapter disabled (.next-node), normal V8 JIT, no debug or memory flags. Direct Node uses the identical generated entry and HTTP shim, without a Next server. Native end-to-end includes the extra Next proxy and all resident route processes.
- Next may prerender pure GET handlers such as hello and feed.xml in the Node production build. Its normal static optimization is retained as the strongest application baseline; that comparison can include serving a prerendered body versus computing it. The direct comparison still executes the same entry on every request. Prerendered paths are recorded in the environment.
- Linux uses two allowed CPUs for the application tree and two disjoint CPUs for generator + controller. Both runtimes inherit the same masks. Threads alone use all four CPUs for 1/2/4-worker scaling; they have no sustained HTTP load generator. These are logical CPUs; topology/SMT and other sandbox tenants may still affect results. macOS cannot use taskset: local output is indicative only.
- Run order: cold runtimes alternate. Default steady blocks are direct Node, direct native, end-to-end Node, end-to-end native; --reverse reverses runtime order and is recorded in the profile. All repeated steady runs share their block's process/JIT/cache/allocator state. No multiple application modes run together. Repeat on a quiet host in both orders before publishing close comparisons.
- Client and server share a machine and memory bandwidth. The single Node generator can bottleneck on one JS thread even with a two-CPU affinity mask. Rows flag suspected generator saturation at >=0.8 CPU-seconds per wall-second; flagged throughput is a lower bound on server capacity. CPU pinning reduces CPU contention but does not eliminate shared-resource interference. No load-generator ceiling calibration is implied.
- SAB is a standalone Node program to expose the strongest Node sharing baseline without adding an application route. Its internal timed region matches report, and every total must match. It has no idle HTTP shim; RSS is therefore slightly favorable to SAB. SAB and object layouts/code accesses differ by necessity. This tests sharing ergonomics + overhead, not identical-code compiler speed. Dataset construction and worker initialization costs are excluded from time, but retained in memory.
- Idle and after-load memory are runtime/GC-state dependent. Peak sampling can miss spikes; summed RSS overcounts shared pages. CPU ticks can make tiny-request per-request CPU noisy: increase fixed count for public claims. Active CPU here is OS user+system process CPU, not a reproduction of Vercel billing instrumentation.
- Responses are checked for expected status and byte-for-byte SHA-256 parity before timing and throughout load. Workloads must use deterministic fixtures, including a fixed clock/key for token issuance. No TLS, remote network, serverless scheduling, multi-instance autoscaling or platform cold starts are measured.

## Workloads

| Route | Kind | Request / pending |
| --- | --- | --- |
| hello | control | GET /api/hello |
| primes | synthetic | GET /api/primes?limit=1000000 |
| login | realistic | DISABLED: clock/key configured; integrated parity pending; budget cost-10 native bcrypt before high concurrency or 20 cold requests |
| search | realistic | DISABLED: representative request supplied by route owner; enable after integrated HTTP parity |
| markdown | realistic | DISABLED: representative request supplied by route owner; enable after integrated HTTP parity |
| feed | realistic | DISABLED: representative request supplied by route owner; enable after integrated HTTP parity |
| csv | realistic | DISABLED: Papa Parse unparse refused in route probe; no CSV route exists |
| jwt | realistic | DISABLED: add valid precomputed Bearer token for serverEnv clock/key; do not benchmark the 401 fast path |

## Cold start (ms, process-cold)

| Scope / runtime / route | N | Median | p90 | Min | Max |
| --- | --- | --- | --- | --- | --- |
| direct / node / hello | 2 | 179.544 | 207.033 | 152.056 | 207.033 |
| direct / native / hello | 2 | 6.566 | 7.793 | 5.339 | 7.793 |
| direct / node / primes | 2 | 186.184 | 200.864 | 171.503 | 200.864 |
| direct / native / primes | 2 | 12.397 | 12.723 | 12.071 | 12.723 |
| end-to-end / node / hello | 2 | 674.763 | 819.822 | 529.705 | 819.822 |
| end-to-end / native / hello | 2 | 1057.284 | 1136.938 | 977.629 | 1136.938 |
| end-to-end / node / primes | 2 | 620.384 | 644.941 | 595.828 | 644.941 |
| end-to-end / native / primes | 2 | 1358.515 | 1421.867 | 1295.164 | 1421.867 |

## Idle RSS (MiB, per process and simultaneous total)

| Scope / runtime | Initialized by | PID / role | RSS MiB |
| --- | --- | --- | --- |
| direct / node | hello | 55468 / node-route | 95.438 |
| direct / node | hello | TOTAL | 95.438 |
| direct / node | primes | 56140 / node-route | 98.109 |
| direct / node | primes | TOTAL | 98.109 |
| direct / native | hello | 57185 / native-route | 2.953 |
| direct / native | hello | TOTAL | 2.953 |
| direct / native | primes | 58082 / native-route | 4.109 |
| direct / native | primes | TOTAL | 4.109 |
| end-to-end / node | hello | 58867 / next-server | 118.547 |
| end-to-end / node | hello | TOTAL | 118.547 |
| end-to-end / native | hello | 61096 / adapter-supervisor | 82.672 |
| end-to-end / native | hello | 61097 / native-route | 6.328 |
| end-to-end / native | hello | 61098 / native-route | 2.984 |
| end-to-end / native | hello | 61099 / native-route | 2.406 |
| end-to-end / native | hello | 61100 / native-route | 3.719 |
| end-to-end / native | hello | 61101 / native-route | 6.031 |
| end-to-end / native | hello | 61102 / native-route | 2.422 |
| end-to-end / native | hello | 61103 / native-route | 2.453 |
| end-to-end / native | hello | 61104 / native-route | 25.813 |
| end-to-end / native | hello | 61105 / native-route | 2.391 |
| end-to-end / native | hello | 61106 / native-route | 3.578 |
| end-to-end / native | hello | 61108 / next-server | 116.813 |
| end-to-end / native | hello | TOTAL | 257.609 |

## Fixed-count process CPU and memory

| Scope / runtime / route | N per run | CPU ms/request median [min,max] | After N total RSS MiB | Sampled peak total MiB |
| --- | --- | --- | --- | --- |
| direct / node / hello | 40 | 0.750 [0.250, 1.250] | 111.906 [111.906, 111.906] | 111.906 [111.906, 111.906] |
| direct / node / primes | 40 | 5.875 [4.750, 7.000] | 141.477 [136.656, 146.297] | 141.477 [136.656, 146.297] |
| direct / native / hello | 40 | 0.250 [0.250, 0.250] | 3.422 [3.422, 3.422] | 3.422 [3.422, 3.422] |
| direct / native / primes | 40 | 4.750 [4.500, 5.000] | 6.484 [6.484, 6.484] | 6.484 [6.484, 6.484] |
| end-to-end / node / hello | 40 | 1.000 [1.000, 1.000] | 138.703 [138.453, 138.953] | 138.703 [138.453, 138.953] |
| end-to-end / node / primes | 40 | 8.125 [6.750, 9.500] | 385.055 [384.781, 385.328] | 385.328 [385.328, 385.328] |
| end-to-end / native / hello | 40 | 1.125 [0.750, 1.500] | 274.070 [271.844, 276.297] | 274.070 [271.844, 276.297] |
| end-to-end / native / primes | 40 | 5.625 [5.500, 5.750] | 284.195 [281.875, 286.516] | 322.016 [284.047, 359.984] |

## Throughput / latency

| Scope / runtime / route / C | req/s median [min,max] | p50 ms median [min,max] | p99 ms median [min,max] | Peak total MiB | Generator CPU cores / saturation suspected |
| --- | --- | --- | --- | --- | --- |
| direct / node / hello / 1 | 2685.160 [1687.400, 3682.920] | 0.272 [0.186, 0.359] | 2.385 [1.063, 3.707] | 112.797 [112.688, 112.906] | 0.728 [0.615, 0.841] / YES |
| direct / node / hello / 8 | 4683.511 [2712.989, 6654.034] | 1.347 [0.917, 1.777] | 7.732 [4.714, 10.750] | 113.219 [113.188, 113.250] | 0.912 [0.730, 1.095] / YES |
| direct / node / hello / 64 | 10443.580 [9212.876, 11674.285] | 4.991 [4.329, 5.652] | 32.037 [22.289, 41.785] | 112.914 [112.813, 113.016] | 1.290 [1.237, 1.343] / YES |
| direct / node / primes / 1 | 178.636 [175.134, 182.137] | 5.205 [5.177, 5.233] | 11.660 [10.395, 12.926] | 159.914 [154.500, 165.328] | 0.156 [0.156, 0.156] / no |
| direct / node / primes / 8 | 199.585 [186.505, 212.665] | 33.566 [31.053, 36.080] | 75.655 [66.365, 84.945] | 186.570 [180.813, 192.328] | 0.191 [0.190, 0.192] / no |
| direct / node / primes / 64 | 159.734 [147.811, 171.658] | 338.576 [329.993, 347.159] | 426.766 [392.554, 460.977] | 196.461 [196.453, 196.469] | 0.146 [0.131, 0.161] / no |
| direct / native / hello / 1 | 429.969 [317.780, 542.157] | 0.714 [0.561, 0.867] | 41.535 [11.320, 71.750] | 3.422 [3.422, 3.422] | 0.294 [0.210, 0.377] / no |
| direct / native / hello / 8 | 1642.377 [1616.964, 1667.791] | 1.471 [1.298, 1.645] | 89.509 [49.443, 129.574] | 3.063 [3.063, 3.063] | 0.477 [0.427, 0.527] / no |
| direct / native / hello / 64 | 8538.089 [5796.767, 11279.411] | 5.894 [4.700, 7.088] | 35.106 [20.532, 49.681] | 3.875 [3.875, 3.875] | 1.133 [0.921, 1.344] / YES |
| direct / native / primes / 1 | 173.832 [171.193, 176.471] | 5.294 [5.197, 5.391] | 11.734 [11.516, 11.952] | 6.281 [6.063, 6.500] | 0.158 [0.154, 0.162] / no |
| direct / native / primes / 8 | 223.685 [215.419, 231.951] | 35.023 [33.062, 36.984] | 43.371 [42.542, 44.199] | 6.141 [6.141, 6.141] | 0.132 [0.131, 0.133] / no |
| direct / native / primes / 64 | 227.938 [222.211, 233.665] | 282.107 [270.448, 293.765] | 285.492 [276.778, 294.206] | 6.969 [6.969, 6.969] | 0.092 [0.082, 0.101] / no |
| end-to-end / node / hello / 1 | 1424.918 [1251.176, 1598.661] | 0.578 [0.517, 0.639] | 2.630 [2.121, 3.139] | 202.398 [187.641, 217.156] | 0.445 [0.421, 0.468] / no |
| end-to-end / node / hello / 8 | 3932.461 [3481.940, 4382.982] | 1.555 [1.387, 1.723] | 7.364 [6.722, 8.007] | 254.172 [237.922, 270.422] | 0.770 [0.737, 0.804] / YES |
| end-to-end / node / hello / 64 | 4697.352 [4470.646, 4924.058] | 12.391 [11.985, 12.796] | 24.358 [23.121, 25.594] | 317.008 [308.797, 325.219] | 0.878 [0.860, 0.896] / YES |
| end-to-end / node / primes / 1 | 153.852 [152.132, 155.573] | 5.700 [5.669, 5.731] | 13.335 [12.524, 14.145] | 388.547 [388.547, 388.547] | 0.147 [0.146, 0.149] / no |
| end-to-end / node / primes / 8 | 178.416 [178.216, 178.615] | 38.864 [38.392, 39.337] | 90.386 [88.198, 92.573] | 366.836 [347.906, 385.766] | 0.174 [0.171, 0.177] / no |
| end-to-end / node / primes / 64 | 173.088 [166.547, 179.629] | 317.408 [313.226, 321.589] | 389.067 [358.540, 419.593] | 370.469 [370.469, 370.469] | 0.152 [0.141, 0.163] / no |
| end-to-end / native / hello / 1 | 799.731 [592.900, 1006.562] | 1.028 [0.810, 1.245] | 4.992 [2.596, 7.387] | 237.820 [232.672, 242.969] | 0.396 [0.365, 0.427] / no |
| end-to-end / native / hello / 8 | 2189.037 [1970.083, 2407.990] | 2.786 [2.282, 3.291] | 16.097 [15.356, 16.839] | 270.906 [261.656, 280.156] | 0.659 [0.606, 0.712] / no |
| end-to-end / native / hello / 64 | 3283.929 [2781.519, 3786.339] | 16.436 [14.172, 18.699] | 53.316 [44.287, 62.344] | 346.258 [337.281, 355.234] | 0.834 [0.761, 0.908] / YES |
| end-to-end / native / primes / 1 | 142.180 [139.706, 144.654] | 6.464 [6.336, 6.593] | 13.033 [12.643, 13.424] | 277.547 [273.125, 281.969] | 0.141 [0.140, 0.142] / no |
| end-to-end / native / primes / 8 | 188.379 [167.594, 209.163] | 42.431 [36.687, 48.175] | 54.543 [49.396, 59.690] | 266.742 [264.750, 268.734] | 0.136 [0.136, 0.137] / no |
| end-to-end / native / primes / 64 | 172.723 [160.551, 184.895] | 351.653 [342.648, 360.659] | 381.956 [343.263, 420.648] | 251.945 [234.078, 269.813] | 0.113 [0.106, 0.120] / no |

## Observed native proxy/topology cost

| Route / C | Δ median p50 ms | Δ median p99 ms | end-to-end/direct req/s | Client saturation suspected |
| --- | --- | --- | --- | --- |
| hello / 1 | 0.314 | -36.543 | 1.860 | no |
| hello / 8 | 1.315 | -73.412 | 1.333 | no |
| hello / 64 | 10.542 | 18.209 | 0.385 | YES |
| primes / 1 | 1.171 | 1.299 | 0.818 | no |
| primes / 8 | 7.409 | 11.172 | 0.842 | no |
| primes / 64 | 69.547 | 96.464 | 0.758 | no |

## Event-loop isolation (each repetition)

| Runtime / window / repeat | Probe | Requests | p50 ms | p99 ms | Heavy completed |
| --- | --- | --- | --- | --- | --- |
| node / isolation-idle / 0 | / | 60 | 2.814 | 16.301 | none |
| node / isolation-idle / 0 | /api/hello | 60 | 3.117 | 16.390 | none |
| node / isolation-loaded / 0 | / | 14 | 48.945 | 371.147 | 20 |
| node / isolation-loaded / 0 | /api/hello | 13 | 54.803 | 377.449 | 20 |
| node / isolation-idle / 1 | / | 66 | 1.814 | 8.187 | none |
| node / isolation-idle / 1 | /api/hello | 65 | 1.693 | 10.383 | none |
| node / isolation-loaded / 1 | / | 17 | 73.814 | 139.933 | 27 |
| node / isolation-loaded / 1 | /api/hello | 16 | 72.362 | 139.375 | 27 |
| native / isolation-idle / 0 | / | 65 | 1.880 | 13.145 | none |
| native / isolation-idle / 0 | /api/hello | 65 | 2.244 | 11.329 | none |
| native / isolation-loaded / 0 | / | 64 | 1.786 | 11.232 | 33 |
| native / isolation-loaded / 0 | /api/hello | 64 | 1.972 | 12.061 | 33 |
| native / isolation-idle / 1 | / | 65 | 1.663 | 11.512 | none |
| native / isolation-idle / 1 | /api/hello | 65 | 1.949 | 26.996 | none |
| native / isolation-loaded / 1 | / | 61 | 2.061 | 29.679 | 30 |
| native / isolation-loaded / 1 | /api/hello | 60 | 1.981 | 21.872 | 30 |

## Synthetic threads: sharing ergonomics and overhead

| Variant / workers | Internal ms median [min,max] | RSS MiB median [min,max] | Growth/worker MiB | Dataset RSS MiB |
| --- | --- | --- | --- | --- |
| node-objects-clone / 1 | 2608.063 [2393.702, 2822.423] | 133.383 [108.031, 158.734] | -329.102 [-354.453, -303.750] | 462.484 [462.484, 462.484] |
| node-sab / 1 | 2637.259 [2356.440, 2918.077] | 67.625 [62.406, 72.844] | -1.234 [-6.453, 3.984] | 68.859 [68.859, 68.859] |
| native-published-objects / 1 | 1901.108 [1692.372, 2109.843] | 62.656 [54.688, 70.625] | -41.797 [-49.766, -33.828] | 104.453 [104.453, 104.453] |
| node-objects-clone / 2 | 1373.985 [1260.410, 1487.561] | 333.836 [180.547, 487.125] | -58.824 [-135.469, 17.820] | 451.484 [451.484, 451.484] |
| node-sab / 2 | 1209.314 [1162.246, 1256.383] | 84.797 [74.609, 94.984] | 8.086 [2.992, 13.180] | 68.625 [68.625, 68.625] |
| native-published-objects / 2 | 933.484 [917.180, 949.788] | 88.109 [86.594, 89.625] | -9.188 [-9.945, -8.430] | 106.484 [106.484, 106.484] |
| node-objects-clone / 4 | 716.961 [713.786, 720.136] | 993.531 [932.672, 1054.391] | 139.629 [124.414, 154.844] | 435.016 [435.016, 435.016] |
| node-sab / 4 | 759.036 [747.409, 770.662] | 118.258 [118.234, 118.281] | 12.385 [12.379, 12.391] | 68.719 [68.719, 68.719] |
| native-published-objects / 4 | 589.437 [584.165, 594.709] | 106.055 [106.031, 106.078] | 0.400 [0.395, 0.406] | 104.453 [104.453, 104.453] |

## Precise metric definitions

- **cold-start:** Monotonic wall time immediately before spawn to the first HTTP response with expected status and fully drained body. Fresh process each sample; readiness retries every 2 ms. Direct uses the exact generated .next/scriptc/entry-N.ts under Node 24 type stripping versus its compiled binary; no Next. End-to-end includes next start (Node) or next-scriptc start (native) and the first execution of the specified route. OS filesystem caches are not flushed; this is process-cold, not machine-cold. Median averages the middle two values for even N; p90 uses nearest rank.
- **memory-idle:** RSS after first successful readiness request and the configured quiet interval. Includes initialization by that route, not an untouched process. Direct: route process. End-to-end: entire owned process tree, including Next, adapter supervisor, all native binaries and descendants. Linux uses the kernel's approximate stat RSS counter; macOS uses ps RSS. Totals sum resident mappings and may double-count shared OS/library pages; not PSS or unique physical memory.
- **cpu-fixed-count:** After timed warmup, user+system CPU delta of the stable owned process tree over exactly N successful sequential keep-alive requests, divided by N. Linux /proc/PID/stat excludes child CPU fields to avoid double counting; Node worker threads are already in process totals. macOS ps TIME is rounded to centiseconds. Snapshot interval includes generator startup/shutdown and idle runtime CPU; generator CPU is excluded and reported separately. Each row carries before/after per-process CPU and RSS. N is per repetition, after prior warmup; RSS after N is not a fresh-process measurement.
- **throughput-latency:** Separate-process HTTP/1.1 keep-alive closed-loop generator with C outstanding requests, no pipelining; dispatch until duration expires, then drain all in-flight requests. Throughput = completed responses / actual dispatch-to-final-drain seconds. Latency = dispatch to fully drained body; nearest-rank p50/p99 within a run. No coordinated-omission correction; this measures closed-loop capacity, not an external arrival-rate SLA. Warmup at each C; repeats retained independently, with median and min/max across runs.
- **peak-rss:** Largest sampled simultaneous sum of process-tree RSS, sampled every 100 ms plus the before/after boundaries. Each peak snapshot contains every process. This is a lower bound on peak RSS, not a kernel high-water mark. On a loaded host ps/scheduling can lengthen the interval.
- **hop-cost:** Native end-to-end minus native direct median p50/p99 at identical concurrency, input and affinity. Also report end-to-end/direct throughput ratio. This is an observed topology difference including Next routing/proxy/serialization/scheduling, not a pure network-hop stopwatch. The samples are separate runs; percentile differences are not percentiles of paired hop times and may be negative under noise.
- **isolation:** First warm heavy and probe endpoints. Baseline and loaded windows each dispatch one sequential probe per path, in parallel, waiting 20 ms after completion. Loaded window additionally holds one heavy request outstanding, back to back. Record probe p50/p99 and sample counts alongside completed heavy requests; equal offered concurrency, not equal achieved heavy RPS. Heavy load starts 100 ms before probes; drain is included. A synchronous Node handler may delay even accepting probes. Requests cannot be preempted at the deadline.
- **threads:** One million orders, 8 regions, 12 scenarios, 60 months; exact integer-cent totals compared across all variants/counts. Fresh process per variant and thread count 1/2/4, one full warmup then repeated internal dispatch+compute+reduction timings. Dataset/pool setup and HTTP excluded. RSS includes the dataset and all worker threads. Growth/worker = (process RSS after job - RSS after dataset before workers) / resident workers: an average residual including allocator/JIT/GC/runtime costs, not exact bytes copied or marginal growth. SAB uses four hand-filled Int32 SharedArrayBuffers; object variants share the original route and worker source. Node object workers clone workerData; native publishes ordinary object graphs. No forced GC.
