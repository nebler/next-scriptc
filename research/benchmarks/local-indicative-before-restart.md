# next-scriptc benchmark

**INDICATIVE ONLY: developer machine / reduced repetitions; not publishable performance evidence**

Status: failed. Commit: 1cd1c4d4d3a1916f8661da8ff8ac5d945db559da. Node v24.22.0; scriptc 0.4.6; Next 16.4.3.

Apple M4 Pro; 12 logical CPUs; darwin/arm64; load averages start 52.76318359375, 57.24755859375, 41.724609375, end 39.17431640625, 48.75244140625, 45.646484375.

Started 2026-10-30T22:41:01.964Z; ended 2026-10-30T22:50:39.311Z. Profile: quick. Affinity: {}.

Full environment, build IDs, source/binary hashes, dirty status, raw repetitions, per-process snapshots, requests, and workload configuration are in the adjacent JSON. Brackets below are [min, max] across repeated runs, not confidence intervals.

## Limitations alongside the results

- Headline application workloads are successful cost-10 login, authenticated JWT verification, 3,000-product search, uncached Markdown rendering and RSS. hello is a small-response control; primes and report are synthetic. These fixtures have no database or remote I/O.
- Native bcrypt is a known regression: the earlier correctness probe took 26.8 s for three cost-10 operations versus 0.56 s on Node (~48× slower). Login therefore measures only three requests, C=1, one measured repetition and one separate cold request per surface. Its p99 is simply the maximum of three, not credible tail evidence. No reduced cost, invalid password or 401 shortcut is substituted. CSV and OG-image generation were refused by the probe; see examples/probe/RESULTS.md.
- If a route exceeds Next’s default 30-second upstream proxy timeout, production returns HTTP 500. The suite records that workload as FAILED, preserves server logs, sets dataset status failed/nonzero exit and continues independent workloads. It never increases the production timeout, substitutes a faster error path or counts failed responses as throughput.
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

## Failed workloads — dataset status FAILED

No speed result is claimed for these cases. Successful rows below are partial evidence only. Full server logs are in JSON.

| Scope / runtime / route | Phase | Failure |
| --- | --- | --- |
| end-to-end / native / login | cold | Error: /api/login: HTTP 500: Internal Server Error |
| end-to-end / native / login | steady | Error: /api/login: HTTP 500: Internal Server Error |

## Application workloads, C=1 (latency and coverage together)

| Route | Scope | Node p50 ms | Native p50 ms | Native / Node latency | Statements / static % / dynamic tier | Package modes |
| --- | --- | --- | --- | --- | --- | --- |
| login | direct | 322.293 | 20145.589 | 62.507× | 2084 / 98% / 426 | bcryptjs: static; jose: static |
| login | end-to-end | 143.013 | FAILED | — | 2084 / 98% / 426 | bcryptjs: static; jose: static |
| verify | direct | 2.151 | 1.063 | 0.494× | 1698 / 97% / 241 | jose: static |
| verify | end-to-end | 4.167 | 2.225 | 0.534× | 1698 / 97% / 241 | jose: static |
| search | direct | 5.418 | 11.679 | 2.156× | 1023 / 97% / 344 | minisearch: static |
| search | end-to-end | 3.666 | 15.885 | 4.333× | 1023 / 97% / 344 | minisearch: static |
| markdown | direct | 5.896 | 74.569 | 12.648× | 1215 / 98% / 641 | marked: static |
| markdown | end-to-end | 3.606 | 99.458 | 27.583× | 1215 / 98% / 641 | marked: static |
| feed | direct | 4.001 | 79.296 | 19.820× | 1216 / 98% / 640 | marked: static |
| feed | end-to-end | 2.883 | 70.198 | 24.348× | 1216 / 98% / 640 | marked: static |

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
| end-to-end / node / verify | 1 | 1753.008 | 1753.008 | 1753.008 | 1753.008 |
| end-to-end / native / verify | 1 | 2257.958 | 2257.958 | 2257.958 | 2257.958 |
| end-to-end / node / search | 1 | 983.045 | 983.045 | 983.045 | 983.045 |
| end-to-end / native / search | 1 | 1873.307 | 1873.307 | 1873.307 | 1873.307 |
| end-to-end / node / markdown | 1 | 1487.848 | 1487.848 | 1487.848 | 1487.848 |
| end-to-end / native / markdown | 1 | 5355.842 | 5355.842 | 5355.842 | 5355.842 |
| end-to-end / node / feed | 1 | 2204.327 | 2204.327 | 2204.327 | 2204.327 |
| end-to-end / native / feed | 1 | 3074.123 | 3074.123 | 3074.123 | 3074.123 |
| end-to-end / node / hello | 1 | 1679.369 | 1679.369 | 1679.369 | 1679.369 |
| end-to-end / native / hello | 1 | 2765.214 | 2765.214 | 2765.214 | 2765.214 |
| end-to-end / node / primes | 1 | 1067.744 | 1067.744 | 1067.744 | 1067.744 |
| end-to-end / native / primes | 1 | 2320.609 | 2320.609 | 2320.609 | 2320.609 |

## Idle RSS (MiB, per process and simultaneous total)

| Scope / runtime | Initialized by | PID / role | RSS MiB |
| --- | --- | --- | --- |
| direct / node | login | 74796 / node-route | 102.828 |
| direct / node | login | TOTAL | 102.828 |
| direct / node | verify | 74999 / node-route | 101.875 |
| direct / node | verify | TOTAL | 101.875 |
| direct / node | search | 75346 / node-route | 102.578 |
| direct / node | search | TOTAL | 102.578 |
| direct / node | markdown | 75942 / node-route | 96.859 |
| direct / node | markdown | TOTAL | 96.859 |
| direct / node | feed | 76878 / node-route | 97.375 |
| direct / node | feed | TOTAL | 97.375 |
| direct / node | hello | 77592 / node-route | 93.594 |
| direct / node | hello | TOTAL | 93.594 |
| direct / node | primes | 77992 / node-route | 95.672 |
| direct / node | primes | TOTAL | 95.672 |
| direct / native | login | 78934 / native-route | 4.891 |
| direct / native | login | TOTAL | 4.891 |
| direct / native | verify | 3628 / native-route | 4.844 |
| direct / native | verify | TOTAL | 4.844 |
| direct / native | search | 4008 / native-route | 28.297 |
| direct / native | search | TOTAL | 28.297 |
| direct / native | markdown | 4511 / native-route | 9.234 |
| direct / native | markdown | TOTAL | 9.234 |
| direct / native | feed | 6540 / native-route | 9.250 |
| direct / native | feed | TOTAL | 9.250 |
| direct / native | hello | 10918 / native-route | 2.969 |
| direct / native | hello | TOTAL | 2.969 |
| direct / native | primes | 11276 / native-route | 4.141 |
| direct / native | primes | TOTAL | 4.141 |
| end-to-end / node | hello | 12387 / next-server | 116.484 |
| end-to-end / node | hello | TOTAL | 116.484 |
| end-to-end / native | hello | 15172 / adapter-supervisor | 52.422 |
| end-to-end / native | hello | 15174 / native-route | 2.797 |
| end-to-end / native | hello | 15175 / native-route | 2.719 |
| end-to-end / native | hello | 15176 / native-route | 1.469 |
| end-to-end / native | hello | 15177 / native-route | 2.438 |
| end-to-end / native | hello | 15178 / native-route | 2.703 |
| end-to-end / native | hello | 15179 / native-route | 1.500 |
| end-to-end / native | hello | 15180 / native-route | 1.469 |
| end-to-end / native | hello | 15181 / native-route | 17.625 |
| end-to-end / native | hello | 15182 / native-route | 1.469 |
| end-to-end / native | hello | 15183 / native-route | 2.359 |
| end-to-end / native | hello | 15187 / next-server | 109.391 |
| end-to-end / native | hello | TOTAL | 198.359 |

## Fixed-count process CPU and memory

| Scope / runtime / route | N per run | CPU ms/request median [min,max] | After N total RSS MiB | Sampled peak total MiB |
| --- | --- | --- | --- | --- |
| direct / node / login | 3 | 126.667 [126.667, 126.667] | 103.813 [103.813, 103.813] | 103.813 [103.813, 103.813] |
| direct / node / verify | 40 | 1.000 [1.000, 1.000] | 106.797 [106.797, 106.797] | 106.797 [106.797, 106.797] |
| direct / node / search | 40 | 2.750 [2.750, 2.750] | 100.797 [100.797, 100.797] | 100.875 [100.875, 100.875] |
| direct / node / markdown | 40 | 2.250 [2.250, 2.250] | 77.344 [77.344, 77.344] | 77.344 [77.344, 77.344] |
| direct / node / feed | 40 | 2.500 [2.500, 2.500] | 102.453 [102.453, 102.453] | 102.453 [102.453, 102.453] |
| direct / node / hello | 40 | 0.750 [0.750, 0.750] | 95.859 [95.859, 95.859] | 95.859 [95.859, 95.859] |
| direct / node / primes | 40 | 5.250 [5.250, 5.250] | 134.266 [134.266, 134.266] | 134.266 [134.266, 134.266] |
| direct / native / login | 3 | 10456.667 [10456.667, 10456.667] | 4.750 [4.750, 4.750] | 4.813 [4.813, 4.813] |
| direct / native / verify | 40 | 0.250 [0.250, 0.250] | 5.328 [5.328, 5.328] | 5.328 [5.328, 5.328] |
| direct / native / search | 40 | 4.500 [4.500, 4.500] | 28.938 [28.938, 28.938] | 28.938 [28.938, 28.938] |
| direct / native / markdown | 40 | 27.500 [27.500, 27.500] | 9.328 [9.328, 9.328] | 10.203 [10.203, 10.203] |
| direct / native / feed | 40 | 35.250 [35.250, 35.250] | 8.422 [8.422, 8.422] | 9.453 [9.453, 9.453] |
| direct / native / hello | 40 | 0.250 [0.250, 0.250] | 3.391 [3.391, 3.391] | 3.391 [3.391, 3.391] |
| direct / native / primes | 40 | 5.000 [5.000, 5.000] | 6.516 [6.516, 6.516] | 6.516 [6.516, 6.516] |
| end-to-end / node / login | 3 | 126.667 [126.667, 126.667] | 115.609 [115.609, 115.609] | 115.609 [115.609, 115.609] |
| end-to-end / node / verify | 40 | 2.500 [2.500, 2.500] | 124.656 [124.656, 124.656] | 124.656 [124.656, 124.656] |
| end-to-end / node / search | 40 | 3.000 [3.000, 3.000] | 296.563 [296.563, 296.563] | 296.563 [296.563, 296.563] |
| end-to-end / node / markdown | 40 | 2.500 [2.500, 2.500] | 299.719 [299.719, 299.719] | 299.719 [299.719, 299.719] |
| end-to-end / node / feed | 40 | 1.250 [1.250, 1.250] | 300.656 [300.656, 300.656] | 300.656 [300.656, 300.656] |
| end-to-end / node / hello | 40 | 1.000 [1.000, 1.000] | 335.125 [335.125, 335.125] | 340.594 [340.594, 340.594] |
| end-to-end / node / primes | 40 | 7.750 [7.750, 7.750] | 339.656 [339.656, 339.656] | 339.656 [339.656, 339.656] |
| end-to-end / native / verify | 40 | 3.500 [3.500, 3.500] | 155.000 [155.000, 155.000] | 155.000 [155.000, 155.000] |
| end-to-end / native / search | 40 | 14.250 [14.250, 14.250] | 160.391 [160.391, 160.391] | 210.688 [210.688, 210.688] |
| end-to-end / native / markdown | 40 | 63.750 [63.750, 63.750] | 179.859 [179.859, 179.859] | 179.859 [179.859, 179.859] |
| end-to-end / native / feed | 40 | 36.250 [36.250, 36.250] | 173.781 [173.781, 173.781] | 174.938 [174.938, 174.938] |
| end-to-end / native / hello | 40 | 0.500 [0.500, 0.500] | 175.078 [175.078, 175.078] | 175.078 [175.078, 175.078] |
| end-to-end / native / primes | 40 | 6.000 [6.000, 6.000] | 234.078 [234.078, 234.078] | 253.000 [253.000, 253.000] |

## Throughput / latency

| Scope / runtime / route / C | req/s median [min,max] | p50 ms median [min,max] | p99 ms median [min,max] | Peak total MiB | Measured sockets created / requests reused (each run) | Generator CPU cores / saturation suspected |
| --- | --- | --- | --- | --- | --- | --- |
| direct / node / login / 1 | 3.234 [3.234, 3.234] | 322.293 [322.293, 322.293] | 370.528 [370.528, 370.528] | 103.813 [103.813, 103.813] | 0 / 3 of 3 | 0.005 [0.005, 0.005] / no |
| direct / node / verify / 1 | 259.281 [259.281, 259.281] | 2.151 [2.151, 2.151] | 15.453 [15.453, 15.453] | 107.094 [107.094, 107.094] | 0 / 104 of 104 | 0.146 [0.146, 0.146] / no |
| direct / node / verify / 8 | 1412.013 [1412.013, 1412.013] | 3.780 [3.780, 3.780] | 29.289 [29.289, 29.289] | 97.641 [97.641, 97.641] | 0 / 577 of 577 | 0.352 [0.352, 0.352] / no |
| direct / node / verify / 64 | 3850.681 [3850.681, 3850.681] | 12.153 [12.153, 12.153] | 63.040 [63.040, 63.040] | 96.469 [96.469, 96.469] | 0 / 1563 of 1563 | 0.508 [0.508, 0.508] / no |
| direct / node / search / 1 | 147.315 [147.315, 147.315] | 5.418 [5.418, 5.418] | 19.637 [19.637, 19.637] | 101.172 [101.172, 101.172] | 0 / 59 of 59 | 0.107 [0.107, 0.107] / no |
| direct / node / search / 8 | 556.522 [556.522, 556.522] | 10.184 [10.184, 10.184] | 83.042 [83.042, 83.042] | 114.188 [114.188, 114.188] | 0 / 230 of 230 | 0.213 [0.213, 0.213] / no |
| direct / node / search / 64 | 240.103 [240.103, 240.103] | 220.678 [220.678, 220.678] | 450.545 [450.545, 450.545] | 130.984 [130.984, 130.984] | 0 / 155 of 155 | 0.116 [0.116, 0.116] / no |
| direct / node / markdown / 1 | 70.815 [70.815, 70.815] | 5.896 [5.896, 5.896] | 71.793 [71.793, 71.793] | 80.563 [80.563, 80.563] | 0 / 30 of 30 | 0.082 [0.082, 0.082] / no |
| direct / node / markdown / 8 | 84.774 [84.774, 84.774] | 74.339 [74.339, 74.339] | 274.099 [274.099, 274.099] | 86.609 [86.609, 86.609] | 0 / 55 of 55 | 0.056 [0.056, 0.056] / no |
| direct / node / markdown / 64 | 193.271 [193.271, 193.271] | 206.480 [206.480, 206.480] | 464.478 [464.478, 464.478] | 91.359 [91.359, 91.359] | 0 / 154 of 154 | 0.108 [0.108, 0.108] / no |
| direct / node / feed / 1 | 174.837 [174.837, 174.837] | 4.001 [4.001, 4.001] | 30.973 [30.973, 30.973] | 107.656 [107.656, 107.656] | 0 / 70 of 70 | 0.139 [0.139, 0.139] / no |
| direct / node / feed / 8 | 187.978 [187.978, 187.978] | 21.489 [21.489, 21.489] | 210.552 [210.552, 210.552] | 109.453 [109.453, 109.453] | 0 / 110 of 110 | 0.092 [0.092, 0.092] / no |
| direct / node / feed / 64 | 140.972 [140.972, 140.972] | 360.217 [360.217, 360.217] | 593.565 [593.565, 593.565] | 119.094 [119.094, 119.094] | 0 / 139 of 139 | 0.078 [0.078, 0.078] / no |
| direct / node / hello / 1 | 505.210 [505.210, 505.210] | 1.091 [1.091, 1.091] | 11.951 [11.951, 11.951] | 98.438 [98.438, 98.438] | 0 / 206 of 206 | 0.231 [0.231, 0.231] / no |
| direct / node / hello / 8 | 1513.005 [1513.005, 1513.005] | 2.945 [2.945, 2.945] | 82.370 [82.370, 82.370] | 100.703 [100.703, 100.703] | 0 / 676 of 676 | 0.338 [0.338, 0.338] / no |
| direct / node / hello / 64 | 3923.293 [3923.293, 3923.293] | 12.488 [12.488, 12.488] | 60.285 [60.285, 60.285] | 98.969 [98.969, 98.969] | 0 / 1705 of 1705 | 0.457 [0.457, 0.457] / no |
| direct / node / primes / 1 | 55.243 [55.243, 55.243] | 13.988 [13.988, 13.988] | 58.978 [58.978, 58.978] | 147.828 [147.828, 147.828] | 0 / 23 of 23 | 0.037 [0.037, 0.037] / no |
| direct / node / primes / 8 | 53.932 [53.932, 53.932] | 124.563 [124.563, 124.563] | 282.080 [282.080, 282.080] | 135.109 [135.109, 135.109] | 0 / 31 of 31 | 0.038 [0.038, 0.038] / no |
| direct / node / primes / 64 | 32.132 [32.132, 32.132] | 1049.143 [1049.143, 1049.143] | 2729.673 [2729.673, 2729.673] | 152.719 [152.719, 152.719] | 0 / 88 of 88 | 0.018 [0.018, 0.018] / no |
| direct / native / login / 1 | 0.041 [0.041, 0.041] | 20145.589 [20145.589, 20145.589] | 36819.988 [36819.988, 36819.988] | 4.813 [4.813, 4.813] | 0 / 3 of 3 | 0.000 [0.000, 0.000] / no |
| direct / native / verify / 1 | 481.002 [481.002, 481.002] | 1.063 [1.063, 1.063] | 9.767 [9.767, 9.767] | 5.328 [5.328, 5.328] | 0 / 193 of 193 | 0.217 [0.217, 0.217] / no |
| direct / native / verify / 8 | 2454.123 [2454.123, 2454.123] | 1.654 [1.654, 1.654] | 25.639 [25.639, 25.639] | 5.984 [5.984, 5.984] | 0 / 987 of 987 | 0.297 [0.297, 0.297] / no |
| direct / native / verify / 64 | 3556.441 [3556.441, 3556.441] | 13.582 [13.582, 13.582] | 59.435 [59.435, 59.435] | 9.703 [9.703, 9.703] | 0 / 1443 of 1443 | 0.452 [0.452, 0.452] / no |
| direct / native / search / 1 | 77.374 [77.374, 77.374] | 11.679 [11.679, 11.679] | 36.452 [36.452, 36.452] | 28.953 [28.953, 28.953] | 0 / 31 of 31 | 0.069 [0.069, 0.069] / no |
| direct / native / search / 8 | 102.848 [102.848, 102.848] | 68.702 [68.702, 68.702] | 147.912 [147.912, 147.912] | 29.047 [29.047, 29.047] | 0 / 43 of 43 | 0.065 [0.065, 0.065] / no |
| direct / native / search / 64 | 124.767 [124.767, 124.767] | 560.806 [560.806, 560.806] | 565.821 [565.821, 565.821] | 28.672 [28.672, 28.672] | 0 / 79 of 79 | 0.037 [0.037, 0.037] / no |
| direct / native / markdown / 1 | 14.818 [14.818, 14.818] | 74.569 [74.569, 74.569] | 90.528 [90.528, 90.528] | 8.750 [8.750, 8.750] | 0 / 7 of 7 | 0.024 [0.024, 0.024] / no |
| direct / native / markdown / 8 | 4.228 [4.228, 4.228] | 1891.389 [1891.389, 1891.389] | 1891.598 [1891.598, 1891.598] | 9.156 [9.156, 9.156] | 0 / 8 of 8 | 0.002 [0.002, 0.002] / no |
| direct / native / markdown / 64 | 14.244 [14.244, 14.244] | 2737.084 [2737.084, 2737.084] | 4489.281 [4489.281, 4489.281] | 11.094 [11.094, 11.094] | 28 / 36 of 64 | 0.007 [0.007, 0.007] / no |
| direct / native / feed / 1 | 7.328 [7.328, 7.328] | 79.296 [79.296, 79.296] | 203.965 [203.965, 203.965] | 8.422 [8.422, 8.422] | 0 / 4 of 4 | 0.011 [0.011, 0.011] / no |
| direct / native / feed / 8 | 7.389 [7.389, 7.389] | 1085.371 [1085.371, 1085.371] | 1148.594 [1148.594, 1148.594] | 9.594 [9.594, 9.594] | 0 / 9 of 9 | 0.004 [0.004, 0.004] / no |
| direct / native / feed / 64 | 13.381 [13.381, 13.381] | 4800.445 [4800.445, 4800.445] | 4801.842 [4801.842, 4801.842] | 13.188 [13.188, 13.188] | 0 / 66 of 66 | 0.005 [0.005, 0.005] / no |
| direct / native / hello / 1 | 469.804 [469.804, 469.804] | 0.903 [0.903, 0.903] | 14.636 [14.636, 14.636] | 3.391 [3.391, 3.391] | 0 / 191 of 191 | 0.208 [0.208, 0.208] / no |
| direct / native / hello / 8 | 4143.357 [4143.357, 4143.357] | 0.819 [0.819, 0.819] | 13.551 [13.551, 13.551] | 3.469 [3.469, 3.469] | 0 / 1688 of 1688 | 0.443 [0.443, 0.443] / no |
| direct / native / hello / 64 | 4970.257 [4970.257, 4970.257] | 10.722 [10.722, 10.722] | 39.999 [39.999, 39.999] | 4.313 [4.313, 4.313] | 0 / 2004 of 2004 | 0.583 [0.583, 0.583] / no |
| direct / native / primes / 1 | 91.337 [91.337, 91.337] | 9.382 [9.382, 9.382] | 27.444 [27.444, 27.444] | 6.531 [6.531, 6.531] | 0 / 37 of 37 | 0.077 [0.077, 0.077] / no |
| direct / native / primes / 8 | 38.324 [38.324, 38.324] | 207.794 [207.794, 207.794] | 294.327 [294.327, 294.327] | 6.359 [6.359, 6.359] | 0 / 19 of 19 | 0.022 [0.022, 0.022] / no |
| direct / native / primes / 64 | 96.435 [96.435, 96.435] | 649.261 [649.261, 649.261] | 729.223 [729.223, 729.223] | 7.047 [7.047, 7.047] | 0 / 91 of 91 | 0.028 [0.028, 0.028] / no |
| end-to-end / node / login / 1 | 6.711 [6.711, 6.711] | 143.013 [143.013, 143.013] | 167.108 [167.108, 167.108] | 115.609 [115.609, 115.609] | 0 / 3 of 3 | 0.012 [0.012, 0.012] / no |
| end-to-end / node / verify / 1 | 171.573 [171.573, 171.573] | 4.167 [4.167, 4.167] | 61.502 [61.502, 61.502] | 129.219 [129.219, 129.219] | 0 / 69 of 69 | 0.114 [0.114, 0.114] / no |
| end-to-end / node / verify / 8 | 827.569 [827.569, 827.569] | 7.790 [7.790, 7.790] | 50.920 [50.920, 50.920] | 216.797 [216.797, 216.797] | 0 / 335 of 335 | 0.251 [0.251, 0.251] / no |
| end-to-end / node / verify / 64 | 1700.319 [1700.319, 1700.319] | 33.016 [33.016, 33.016] | 67.462 [67.462, 67.462] | 282.922 [282.922, 282.922] | 0 / 766 of 766 | 0.342 [0.342, 0.342] / no |
| end-to-end / node / search / 1 | 189.889 [189.889, 189.889] | 3.666 [3.666, 3.666] | 38.312 [38.312, 38.312] | 297.438 [297.438, 297.438] | 0 / 76 of 76 | 0.124 [0.124, 0.124] / no |
| end-to-end / node / search / 8 | 226.877 [226.877, 226.877] | 23.984 [23.984, 23.984] | 133.559 [133.559, 133.559] | 295.656 [295.656, 295.656] | 0 / 96 of 96 | 0.134 [0.134, 0.134] / no |
| end-to-end / node / search / 64 | 149.375 [149.375, 149.375] | 388.150 [388.150, 388.150] | 536.551 [536.551, 536.551] | 295.641 [295.641, 295.641] | 0 / 120 of 120 | 0.074 [0.074, 0.074] / no |
| end-to-end / node / markdown / 1 | 128.180 [128.180, 128.180] | 3.606 [3.606, 3.606] | 47.513 [47.513, 47.513] | 301.766 [301.766, 301.766] | 0 / 53 of 53 | 0.101 [0.101, 0.101] / no |
| end-to-end / node / markdown / 8 | 346.939 [346.939, 346.939] | 12.211 [12.211, 12.211] | 82.243 [82.243, 82.243] | 303.344 [303.344, 303.344] | 0 / 153 of 153 | 0.145 [0.145, 0.145] / no |
| end-to-end / node / markdown / 64 | 514.447 [514.447, 514.447] | 112.376 [112.376, 112.376] | 238.091 [238.091, 238.091] | 301.453 [301.453, 301.453] | 0 / 264 of 264 | 0.154 [0.154, 0.154] / no |
| end-to-end / node / feed / 1 | 283.502 [283.502, 283.502] | 2.883 [2.883, 2.883] | 9.007 [9.007, 9.007] | 331.172 [331.172, 331.172] | 0 / 114 of 114 | 0.173 [0.173, 0.173] / no |
| end-to-end / node / feed / 8 | 706.492 [706.492, 706.492] | 6.054 [6.054, 6.054] | 89.407 [89.407, 89.407] | 333.891 [333.891, 333.891] | 0 / 296 of 296 | 0.288 [0.288, 0.288] / no |
| end-to-end / node / feed / 64 | 1959.177 [1959.177, 1959.177] | 29.884 [29.884, 29.884] | 63.139 [63.139, 63.139] | 341.109 [341.109, 341.109] | 0 / 815 of 815 | 0.636 [0.636, 0.636] / no |
| end-to-end / node / hello / 1 | 150.844 [150.844, 150.844] | 4.555 [4.555, 4.555] | 39.736 [39.736, 39.736] | 306.641 [306.641, 306.641] | 0 / 61 of 61 | 0.112 [0.112, 0.112] / no |
| end-to-end / node / hello / 8 | 645.530 [645.530, 645.530] | 7.155 [7.155, 7.155] | 95.984 [95.984, 95.984] | 306.875 [306.875, 306.875] | 0 / 271 of 271 | 0.208 [0.208, 0.208] / no |
| end-to-end / node / hello / 64 | 906.036 [906.036, 906.036] | 40.172 [40.172, 40.172] | 192.155 [192.155, 192.155] | 302.094 [302.094, 302.094] | 0 / 377 of 377 | 0.284 [0.284, 0.284] / no |
| end-to-end / node / primes / 1 | 47.033 [47.033, 47.033] | 10.233 [10.233, 10.233] | 152.204 [152.204, 152.204] | 285.125 [285.125, 285.125] | 0 / 19 of 19 | 0.034 [0.034, 0.034] / no |
| end-to-end / node / primes / 8 | 87.244 [87.244, 87.244] | 74.755 [74.755, 74.755] | 221.383 [221.383, 221.383] | 207.547 [207.547, 207.547] | 0 / 44 of 44 | 0.074 [0.074, 0.074] / no |
| end-to-end / node / primes / 64 | 93.011 [93.011, 93.011] | 550.736 [550.736, 550.736] | 740.249 [740.249, 740.249] | 217.844 [217.844, 217.844] | 0 / 103 of 103 | 0.055 [0.055, 0.055] / no |
| end-to-end / native / verify / 1 | 140.427 [140.427, 140.427] | 2.225 [2.225, 2.225] | 131.880 [131.880, 131.880] | 169.875 [169.875, 169.875] | 0 / 59 of 59 | 0.099 [0.099, 0.099] / no |
| end-to-end / native / verify / 8 | 460.803 [460.803, 460.803] | 5.566 [5.566, 5.566] | 152.981 [152.981, 152.981] | 185.047 [185.047, 185.047] | 0 / 190 of 190 | 0.176 [0.176, 0.176] / no |
| end-to-end / native / verify / 64 | 676.803 [676.803, 676.803] | 62.818 [62.818, 62.818] | 252.078 [252.078, 252.078] | 213.109 [213.109, 213.109] | 0 / 420 of 420 | 0.199 [0.199, 0.199] / no |
| end-to-end / native / search / 1 | 25.963 [25.963, 25.963] | 15.885 [15.885, 15.885] | 175.841 [175.841, 175.841] | 159.531 [159.531, 159.531] | 0 / 11 of 11 | 0.027 [0.027, 0.027] / no |
| end-to-end / native / search / 8 | 50.834 [50.834, 50.834] | 86.902 [86.902, 86.902] | 482.954 [482.954, 482.954] | 162.047 [162.047, 162.047] | 0 / 44 of 44 | 0.029 [0.029, 0.029] / no |
| end-to-end / native / search / 64 | 26.937 [26.937, 26.937] | 2347.351 [2347.351, 2347.351] | 2361.232 [2361.232, 2361.232] | 207.563 [207.563, 207.563] | 0 / 64 of 64 | 0.013 [0.013, 0.013] / no |
| end-to-end / native / markdown / 1 | 8.293 [8.293, 8.293] | 99.458 [99.458, 99.458] | 214.301 [214.301, 214.301] | 180.828 [180.828, 180.828] | 0 / 5 of 5 | 0.010 [0.010, 0.010] / no |
| end-to-end / native / markdown / 8 | 6.773 [6.773, 6.773] | 1180.280 [1180.280, 1180.280] | 1180.548 [1180.548, 1180.548] | 185.297 [185.297, 185.297] | 0 / 8 of 8 | 0.004 [0.004, 0.004] / no |
| end-to-end / native / markdown / 64 | 7.954 [7.954, 7.954] | 6936.648 [6936.648, 6936.648] | 8030.976 [8030.976, 8030.976] | 176.188 [176.188, 176.188] | 0 / 64 of 64 | 0.004 [0.004, 0.004] / no |
| end-to-end / native / feed / 1 | 14.229 [14.229, 14.229] | 70.198 [70.198, 70.198] | 91.860 [91.860, 91.860] | 173.750 [173.750, 173.750] | 0 / 7 of 7 | 0.024 [0.024, 0.024] / no |
| end-to-end / native / feed / 8 | 15.187 [15.187, 15.187] | 514.104 [514.104, 514.104] | 525.488 [525.488, 525.488] | 163.906 [163.906, 163.906] | 0 / 8 of 8 | 0.010 [0.010, 0.010] / no |
| end-to-end / native / feed / 64 | 13.550 [13.550, 13.550] | 4715.372 [4715.372, 4715.372] | 4718.545 [4718.545, 4718.545] | 165.047 [165.047, 165.047] | 0 / 64 of 64 | 0.007 [0.007, 0.007] / no |
| end-to-end / native / hello / 1 | 246.777 [246.777, 246.777] | 2.623 [2.623, 2.623] | 48.482 [48.482, 48.482] | 221.313 [221.313, 221.313] | 0 / 99 of 99 | 0.148 [0.148, 0.148] / no |
| end-to-end / native / hello / 8 | 749.927 [749.927, 749.927] | 8.303 [8.303, 8.303] | 48.277 [48.277, 48.277] | 248.531 [248.531, 248.531] | 0 / 311 of 311 | 0.265 [0.265, 0.265] / no |
| end-to-end / native / hello / 64 | 1174.601 [1174.601, 1174.601] | 30.522 [30.522, 30.522] | 162.586 [162.586, 162.586] | 270.859 [270.859, 270.859] | 0 / 479 of 479 | 0.308 [0.308, 0.308] / no |
| end-to-end / native / primes / 1 | 61.396 [61.396, 61.396] | 14.151 [14.151, 14.151] | 45.351 [45.351, 45.351] | 222.359 [222.359, 222.359] | 0 / 25 of 25 | 0.042 [0.042, 0.042] / no |
| end-to-end / native / primes / 8 | 75.689 [75.689, 75.689] | 74.720 [74.720, 74.720] | 213.619 [213.619, 213.619] | 199.297 [199.297, 199.297] | 0 / 32 of 32 | 0.050 [0.050, 0.050] / no |
| end-to-end / native / primes / 64 | 56.733 [56.733, 56.733] | 1155.677 [1155.677, 1155.677] | 1160.503 [1160.503, 1160.503] | 169.984 [169.984, 169.984] | 0 / 66 of 66 | 0.021 [0.021, 0.021] / no |

## Observed native proxy/topology cost

| Route / C | Δ median p50 ms | Δ median p99 ms | end-to-end/direct req/s | Client saturation suspected |
| --- | --- | --- | --- | --- |
| verify / 1 | 1.162 | 122.113 | 0.292 | no |
| verify / 8 | 3.912 | 127.342 | 0.188 | no |
| verify / 64 | 49.236 | 192.643 | 0.190 | no |
| search / 1 | 4.206 | 139.389 | 0.336 | no |
| search / 8 | 18.200 | 335.042 | 0.494 | no |
| search / 64 | 1786.544 | 1795.411 | 0.216 | no |
| markdown / 1 | 24.889 | 123.773 | 0.560 | no |
| markdown / 8 | -711.109 | -711.050 | 1.602 | no |
| markdown / 64 | 4199.564 | 3541.695 | 0.558 | no |
| feed / 1 | -9.098 | -112.105 | 1.942 | no |
| feed / 8 | -571.267 | -623.106 | 2.055 | no |
| feed / 64 | -85.073 | -83.297 | 1.013 | no |
| hello / 1 | 1.720 | 33.847 | 0.525 | no |
| hello / 8 | 7.484 | 34.726 | 0.181 | no |
| hello / 64 | 19.800 | 122.587 | 0.236 | no |
| primes / 1 | 4.769 | 17.907 | 0.672 | no |
| primes / 8 | -133.074 | -80.708 | 1.975 | no |
| primes / 64 | 506.415 | 431.280 | 0.588 | no |

## Event-loop isolation (each repetition)

| Runtime / window / repeat | Probe | Requests | p50 ms | p99 ms | Heavy completed |
| --- | --- | --- | --- | --- | --- |
| node / login / isolation-idle / 0 | / | 23 | 5.406 | 195.967 | none |
| node / login / isolation-idle / 0 | /api/hello | 25 | 5.679 | 78.373 | none |
| node / login / isolation-loaded / 0 | / | 5 | 155.426 | 164.647 | 6 |
| node / login / isolation-loaded / 0 | /api/hello | 5 | 152.259 | 164.558 | 6 |
| node / primes / isolation-idle / 0 | / | 24 | 5.434 | 40.450 | none |
| node / primes / isolation-idle / 0 | /api/hello | 24 | 5.702 | 99.999 | none |
| node / primes / isolation-loaded / 0 | / | 7 | 71.311 | 245.376 | 10 |
| node / primes / isolation-loaded / 0 | /api/hello | 6 | 93.562 | 245.626 | 10 |
| native / login / isolation-idle / 0 | / | 1 | 10408.441 | 10408.441 | none |
| native / login / isolation-idle / 0 | /api/hello | 9 | 76.939 | 148.875 | none |
| native / login / isolation-loaded / 0 | / | 29 | 3.096 | 79.181 | 1 |
| native / login / isolation-loaded / 0 | /api/hello | 28 | 3.734 | 75.290 | 1 |
| native / primes / isolation-idle / 0 | / | 30 | 4.112 | 25.208 | none |
| native / primes / isolation-idle / 0 | /api/hello | 28 | 5.904 | 25.075 | none |
| native / primes / isolation-loaded / 0 | / | 26 | 7.439 | 23.848 | 9 |
| native / primes / isolation-loaded / 0 | /api/hello | 25 | 8.850 | 26.068 | 9 |

## Synthetic threads: sharing ergonomics and overhead

| Variant / workers | Internal ms median [min,max] | Warmed total RSS MiB median [min,max] |
| --- | --- | --- |
| node-objects-clone / 1 | 4690.709 [4690.709, 4690.709] | 124.766 [124.766, 124.766] |
| node-objects-clone / 2 | 2022.350 [2022.350, 2022.350] | 725.844 [725.844, 725.844] |
| node-objects-clone / 4 | 1573.264 [1573.264, 1573.264] | 1296.828 [1296.828, 1296.828] |
| node-sab / 1 | 2879.295 [2879.295, 2879.295] | 83.859 [83.859, 83.859] |
| node-sab / 2 | 2224.198 [2224.198, 2224.198] | 72.547 [72.547, 72.547] |
| node-sab / 4 | 1313.371 [1313.371, 1313.371] | 77.469 [77.469, 77.469] |
| native-published-objects / 1 | 4044.695 [4044.695, 4044.695] | 72.219 [72.219, 72.219] |
| native-published-objects / 2 | 1851.839 [1851.839, 1851.839] | 72.734 [72.734, 72.734] |
| native-published-objects / 4 | 1196.956 [1196.956, 1196.956] | 73.188 [73.188, 73.188] |

Same-process net RSS growth from 1 to 4 warmed workers; not allocation size. See the threads definition.

| Variant | 1-worker RSS MiB | 4-worker RSS MiB | Marginal warmed RSS / added worker MiB |
| --- | --- | --- | --- |
| node-objects-clone | 124.766 | 1296.828 | 390.688 |
| node-sab | 83.859 | 77.469 | -2.130 |
| native-published-objects | 72.219 | 73.188 | 0.323 |

## Precise metric definitions

- **cold-start:** Monotonic wall time immediately before spawn to the first HTTP response with expected status and fully drained body. Fresh process each sample; readiness retries every 2 ms. Direct uses the exact generated .next/scriptc/entry-N.ts under Node 24 type stripping versus its compiled binary; no Next. End-to-end includes next start (Node) or the recorded native production command and the first execution of the specified route. OS filesystem caches are not flushed; this is process-cold, not machine-cold. Median averages the middle two values for even N; p90 uses nearest rank.
- **memory-idle:** RSS after first successful readiness request and the configured quiet interval. Includes initialization by that route, not an untouched process. Direct: route process. End-to-end: entire owned process tree, including Next, adapter supervisor, all native binaries and descendants. Linux uses the kernel's approximate stat RSS counter; macOS uses ps RSS. Totals sum resident mappings and may double-count shared OS/library pages; not PSS or unique physical memory.
- **cpu-fixed-count:** After untimed warmup, user+system CPU delta of the stable owned process tree over exactly N successful sequential keep-alive requests, divided by N. Linux /proc/PID/stat excludes child CPU fields to avoid double counting; Node worker threads are already in process totals. macOS ps TIME is rounded to centiseconds. The generator warms its own process and keep-alive agent before an IPC barrier; CPU snapshots bracket release through generator shutdown, excluding spawn/warmup. Boundary sampling and idle runtime CPU remain; generator CPU is excluded and reported separately. Each row carries before/after per-process CPU and RSS. N is per repetition, after prior warmup; RSS after N is not a fresh-process measurement.
- **throughput-latency:** Separate-process HTTP/1.1 keep-alive closed-loop generator with C outstanding requests, no pipelining; dispatch until duration expires, then drain all in-flight requests. Throughput = completed responses / actual dispatch-to-final-drain seconds. Latency = dispatch to fully drained body; nearest-rank p50/p99 within a run. No coordinated-omission correction; this measures closed-loop capacity, not an external arrival-rate SLA. Each sample warms the same generator process and agent at its C before the IPC start barrier. Socket creations and reused requests are counted separately for warmup and measurement; repeats retained independently, with median and min/max across runs.
- **peak-rss:** Largest sampled simultaneous sum of process-tree RSS, sampled every 100 ms plus the before/after boundaries. Sampler reads only the previously discovered tree (targeted ps on macOS, /proc on Linux); full discovery at both boundaries checks stable process membership. Each peak snapshot contains every process. This is a lower bound on peak RSS, not a kernel high-water mark. On a loaded host ps/scheduling can lengthen the interval.
- **hop-cost:** Native end-to-end minus native direct median p50/p99 at identical concurrency, input and affinity. Also report end-to-end/direct throughput ratio. This is an observed topology difference including Next routing/proxy/serialization/scheduling, not a pure network-hop stopwatch. The samples are separate runs; percentile differences are not percentiles of paired hop times and may be negative under noise.
- **isolation:** First warm heavy and probe endpoints. Baseline and loaded windows each dispatch one sequential probe per path, in parallel, waiting 20 ms after completion. Loaded window additionally holds one heavy request outstanding, back to back. Record probe p50/p99 and sample counts alongside completed heavy requests; equal offered concurrency, not equal achieved heavy RPS. Heavy load starts 100 ms before probes; drain is included. A synchronous Node handler may delay even accepting probes. Requests cannot be preempted at the deadline.
- **threads:** One million orders, 8 regions, 12 scenarios, 60 months; exact integer-cent totals compared across all variants/counts. Fresh process per variant, growing its retained pool through 1/2/4 workers. One readiness computation at 1 worker, then two full warmups at each count before repeated internal dispatch+compute+reduction timings. Counts run ascending and share JIT/GC history. Dataset/pool setup and HTTP excluded. RSS includes the dataset and all worker threads. Marginal warmed RSS/added worker = (median post-job RSS at 4 workers - median post-job RSS at 1 worker) / 3 within that SAME process. Dataset construction garbage is excluded from the baseline; this measures net resident growth including GC/JIT/allocator history, not exact clone allocations. Negative values, if any, remain visible as GC/noise and do not mean negative worker allocation. SAB uses four hand-filled Int32 SharedArrayBuffers; object variants share the original route and worker source. Node object workers clone workerData; native publishes ordinary object graphs. No forced GC.
