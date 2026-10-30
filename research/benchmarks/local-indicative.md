# next-scriptc benchmark

**INDICATIVE ONLY: developer machine / reduced repetitions; not publishable performance evidence**

Status: failed. Commit: 2d499673cb7a2644774ce7e544c97888013448e0. Node v24.22.0; scriptc 0.4.6; Next 16.4.3.

Apple M4 Pro; 12 logical CPUs; darwin/arm64; load averages start 45.4677734375, 31.80712890625, 24.60302734375, end 32.97265625, 42.28515625, 43.70166015625.

Started 2026-10-30T22:34:19.276Z; ended 2026-10-30T22:53:59.735Z. Profile: quick. Affinity: {}.

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

Source runs: local-indicative-before-restart.json (1cd1c4d4d3a1916f8661da8ff8ac5d945db559da); local-indicative-production-rerun.json (2d499673cb7a2644774ce7e544c97888013448e0). Sections are replaced as whole blocks; repetitions are never pooled.

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
| end-to-end / native / login | isolation | Error: /api/login: HTTP 500: Internal Server Error |

## Application workloads, C=1 (latency and coverage together)

| Route | Scope | Node p50 ms | Native p50 ms | Native / Node latency | Statements / static % / dynamic tier | Package modes |
| --- | --- | --- | --- | --- | --- | --- |
| login | direct | 322.293 | 20145.589 | 62.507× | 2084 / 98% / 426 | bcryptjs: static; jose: static |
| login | end-to-end | 264.641 | FAILED | — | 2084 / 98% / 426 | bcryptjs: static; jose: static |
| verify | direct | 2.151 | 1.063 | 0.494× | 1698 / 97% / 241 | jose: static |
| verify | end-to-end | 3.681 | 3.982 | 1.082× | 1698 / 97% / 241 | jose: static |
| search | direct | 5.418 | 11.679 | 2.156× | 1023 / 97% / 344 | minisearch: static |
| search | end-to-end | 5.080 | 14.436 | 2.841× | 1023 / 97% / 344 | minisearch: static |
| markdown | direct | 5.896 | 74.569 | 12.648× | 1215 / 98% / 641 | marked: static |
| markdown | end-to-end | 5.285 | 37.721 | 7.137× | 1215 / 98% / 641 | marked: static |
| feed | direct | 4.001 | 79.296 | 19.820× | 1216 / 98% / 640 | marked: static |
| feed | end-to-end | 4.246 | 60.688 | 14.293× | 1216 / 98% / 640 | marked: static |

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
| end-to-end / node | hello | 34765 / next-server | 112.703 |
| end-to-end / node | hello | TOTAL | 112.703 |
| end-to-end / native | hello | 38735 / adapter-supervisor | 69.094 |
| end-to-end / native | hello | 38736 / native-route | 2.797 |
| end-to-end / native | hello | 38737 / native-route | 2.750 |
| end-to-end / native | hello | 38738 / native-route | 1.531 |
| end-to-end / native | hello | 38739 / native-route | 2.578 |
| end-to-end / native | hello | 38740 / native-route | 3.250 |
| end-to-end / native | hello | 38741 / native-route | 1.578 |
| end-to-end / native | hello | 38743 / native-route | 1.563 |
| end-to-end / native | hello | 38745 / native-route | 18.625 |
| end-to-end / native | hello | 38746 / native-route | 1.703 |
| end-to-end / native | hello | 38747 / native-route | 2.406 |
| end-to-end / native | hello | 38761 / next-server | 116.734 |
| end-to-end / native | hello | TOTAL | 224.609 |
| end-to-end / native | hello (restart after login) | 40735 / adapter-supervisor | 71.234 |
| end-to-end / native | hello (restart after login) | 40817 / native-route | 3.500 |
| end-to-end / native | hello (restart after login) | 40825 / native-route | 2.719 |
| end-to-end / native | hello (restart after login) | 40830 / native-route | 1.563 |
| end-to-end / native | hello (restart after login) | 40831 / native-route | 2.594 |
| end-to-end / native | hello (restart after login) | 40833 / native-route | 3.531 |
| end-to-end / native | hello (restart after login) | 40834 / native-route | 1.578 |
| end-to-end / native | hello (restart after login) | 40835 / native-route | 1.750 |
| end-to-end / native | hello (restart after login) | 40836 / native-route | 23.625 |
| end-to-end / native | hello (restart after login) | 40837 / native-route | 1.656 |
| end-to-end / native | hello (restart after login) | 40838 / native-route | 2.484 |
| end-to-end / native | hello (restart after login) | 41118 / next-server | 118.719 |
| end-to-end / native | hello (restart after login) | TOTAL | 234.953 |

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
| end-to-end / node / login | 3 | 126.667 [126.667, 126.667] | 105.203 [105.203, 105.203] | 111.375 [111.375, 111.375] |
| end-to-end / node / verify | 40 | 2.750 [2.750, 2.750] | 114.047 [114.047, 114.047] | 116.547 [116.547, 116.547] |
| end-to-end / node / search | 40 | 3.500 [3.500, 3.500] | 203.172 [203.172, 203.172] | 203.172 [203.172, 203.172] |
| end-to-end / node / markdown | 40 | 3.000 [3.000, 3.000] | 189.047 [189.047, 189.047] | 219.094 [219.094, 219.094] |
| end-to-end / node / feed | 40 | 1.250 [1.250, 1.250] | 172.438 [172.438, 172.438] | 174.797 [174.797, 174.797] |
| end-to-end / node / hello | 40 | 1.500 [1.500, 1.500] | 275.891 [275.891, 275.891] | 275.891 [275.891, 275.891] |
| end-to-end / node / primes | 40 | 5.750 [5.750, 5.750] | 254.297 [254.297, 254.297] | 254.297 [254.297, 254.297] |
| end-to-end / native / verify | 40 | 2.000 [2.000, 2.000] | 223.938 [223.938, 223.938] | 223.938 [223.938, 223.938] |
| end-to-end / native / search | 40 | 6.250 [6.250, 6.250] | 275.000 [275.000, 275.000] | 278.938 [278.938, 278.938] |
| end-to-end / native / markdown | 40 | 30.000 [30.000, 30.000] | 165.609 [165.609, 165.609] | 200.891 [200.891, 200.891] |
| end-to-end / native / feed | 40 | 37.500 [37.500, 37.500] | 181.953 [181.953, 181.953] | 187.781 [187.781, 187.781] |
| end-to-end / native / hello | 40 | 1.000 [1.000, 1.000] | 191.563 [191.563, 191.563] | 191.563 [191.563, 191.563] |
| end-to-end / native / primes | 40 | 5.250 [5.250, 5.250] | 260.344 [260.344, 260.344] | 269.672 [269.672, 269.672] |

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
| end-to-end / node / login / 1 | 4.276 [4.276, 4.276] | 264.641 [264.641, 264.641] | 265.951 [265.951, 265.951] | 111.375 [111.375, 111.375] | 0 / 3 of 3 | 0.006 [0.006, 0.006] / no |
| end-to-end / node / verify / 1 | 170.566 [170.566, 170.566] | 3.681 [3.681, 3.681] | 22.752 [22.752, 22.752] | 108.563 [108.563, 108.563] | 0 / 69 of 69 | 0.120 [0.120, 0.120] / no |
| end-to-end / node / verify / 8 | 386.625 [386.625, 386.625] | 13.497 [13.497, 13.497] | 95.257 [95.257, 95.257] | 154.531 [154.531, 154.531] | 0 / 156 of 156 | 0.140 [0.140, 0.140] / no |
| end-to-end / node / verify / 64 | 851.792 [851.792, 851.792] | 70.299 [70.299, 70.299] | 118.858 [118.858, 118.858] | 182.375 [182.375, 182.375] | 0 / 347 of 347 | 0.239 [0.239, 0.239] / no |
| end-to-end / node / search / 1 | 128.092 [128.092, 128.092] | 5.080 [5.080, 5.080] | 27.576 [27.576, 27.576] | 204.969 [204.969, 204.969] | 0 / 53 of 53 | 0.100 [0.100, 0.100] / no |
| end-to-end / node / search / 8 | 332.069 [332.069, 332.069] | 20.185 [20.185, 20.185] | 69.124 [69.124, 69.124] | 231.656 [231.656, 231.656] | 0 / 154 of 154 | 0.164 [0.164, 0.164] / no |
| end-to-end / node / search / 64 | 262.042 [262.042, 262.042] | 185.949 [185.949, 185.949] | 494.972 [494.972, 494.972] | 220.781 [220.781, 220.781] | 0 / 188 of 188 | 0.122 [0.122, 0.122] / no |
| end-to-end / node / markdown / 1 | 149.926 [149.926, 149.926] | 5.285 [5.285, 5.285] | 20.812 [20.812, 20.812] | 168.672 [168.672, 168.672] | 0 / 61 of 61 | 0.119 [0.119, 0.119] / no |
| end-to-end / node / markdown / 8 | 252.584 [252.584, 252.584] | 25.142 [25.142, 25.142] | 73.731 [73.731, 73.731] | 195.063 [195.063, 195.063] | 0 / 111 of 111 | 0.143 [0.143, 0.143] / no |
| end-to-end / node / markdown / 64 | 170.444 [170.444, 170.444] | 312.952 [312.952, 312.952] | 430.182 [430.182, 430.182] | 204.594 [204.594, 204.594] | 0 / 115 of 115 | 0.092 [0.092, 0.092] / no |
| end-to-end / node / feed / 1 | 176.549 [176.549, 176.549] | 4.246 [4.246, 4.246] | 16.434 [16.434, 16.434] | 143.797 [143.797, 143.797] | 0 / 72 of 72 | 0.131 [0.131, 0.131] / no |
| end-to-end / node / feed / 8 | 156.941 [156.941, 156.941] | 44.435 [44.435, 44.435] | 119.044 [119.044, 119.044] | 232.813 [232.813, 232.813] | 0 / 72 of 72 | 0.075 [0.075, 0.075] / no |
| end-to-end / node / feed / 64 | 758.130 [758.130, 758.130] | 75.823 [75.823, 75.823] | 192.505 [192.505, 192.505] | 273.563 [273.563, 273.563] | 0 / 366 of 366 | 0.260 [0.260, 0.260] / no |
| end-to-end / node / hello / 1 | 154.029 [154.029, 154.029] | 2.461 [2.461, 2.461] | 78.499 [78.499, 78.499] | 250.000 [250.000, 250.000] | 0 / 62 of 62 | 0.090 [0.090, 0.090] / no |
| end-to-end / node / hello / 8 | 480.160 [480.160, 480.160] | 5.403 [5.403, 5.403] | 128.956 [128.956, 128.956] | 207.109 [207.109, 207.109] | 0 / 194 of 194 | 0.150 [0.150, 0.150] / no |
| end-to-end / node / hello / 64 | 348.094 [348.094, 348.094] | 166.702 [166.702, 166.702] | 271.700 [271.700, 271.700] | 203.109 [203.109, 203.109] | 0 / 192 of 192 | 0.128 [0.128, 0.128] / no |
| end-to-end / node / primes / 1 | 63.231 [63.231, 63.231] | 12.947 [12.947, 12.947] | 44.643 [44.643, 44.643] | 274.000 [274.000, 274.000] | 0 / 26 of 26 | 0.046 [0.046, 0.046] / no |
| end-to-end / node / primes / 8 | 76.503 [76.503, 76.503] | 84.463 [84.463, 84.463] | 215.249 [215.249, 215.249] | 232.953 [232.953, 232.953] | 0 / 41 of 41 | 0.064 [0.064, 0.064] / no |
| end-to-end / node / primes / 64 | 63.101 [63.101, 63.101] | 710.928 [710.928, 710.928] | 1058.178 [1058.178, 1058.178] | 203.625 [203.625, 203.625] | 0 / 82 of 82 | 0.036 [0.036, 0.036] / no |
| end-to-end / native / verify / 1 | 156.651 [156.651, 156.651] | 3.982 [3.982, 3.982] | 48.961 [48.961, 48.961] | 215.313 [215.313, 215.313] | 0 / 63 of 63 | 0.110 [0.110, 0.110] / no |
| end-to-end / native / verify / 8 | 376.837 [376.837, 376.837] | 6.566 [6.566, 6.566] | 212.657 [212.657, 212.657] | 209.328 [209.328, 209.328] | 0 / 160 of 160 | 0.124 [0.124, 0.124] / no |
| end-to-end / native / verify / 64 | 1857.736 [1857.736, 1857.736] | 26.183 [26.183, 26.183] | 80.499 [80.499, 80.499] | 255.484 [255.484, 255.484] | 0 / 836 of 836 | 0.288 [0.288, 0.288] / no |
| end-to-end / native / search / 1 | 35.653 [35.653, 35.653] | 14.436 [14.436, 14.436] | 103.432 [103.432, 103.432] | 260.531 [260.531, 260.531] | 0 / 16 of 16 | 0.026 [0.026, 0.026] / no |
| end-to-end / native / search / 8 | 48.370 [48.370, 48.370] | 123.011 [123.011, 123.011] | 204.760 [204.760, 204.760] | 257.406 [257.406, 257.406] | 0 / 24 of 24 | 0.028 [0.028, 0.028] / no |
| end-to-end / native / search / 64 | 53.310 [53.310, 53.310] | 1100.227 [1100.227, 1100.227] | 1195.848 [1195.848, 1195.848] | 241.297 [241.297, 241.297] | 0 / 64 of 64 | 0.017 [0.017, 0.017] / no |
| end-to-end / native / markdown / 1 | 18.299 [18.299, 18.299] | 37.721 [37.721, 37.721] | 159.604 [159.604, 159.604] | 159.063 [159.063, 159.063] | 0 / 8 of 8 | 0.030 [0.030, 0.030] / no |
| end-to-end / native / markdown / 8 | 19.763 [19.763, 19.763] | 393.194 [393.194, 393.194] | 417.170 [417.170, 417.170] | 157.406 [157.406, 157.406] | 0 / 16 of 16 | 0.011 [0.011, 0.011] / no |
| end-to-end / native / markdown / 64 | 20.212 [20.212, 20.212] | 3158.833 [3158.833, 3158.833] | 3161.068 [3161.068, 3161.068] | 176.359 [176.359, 176.359] | 6 / 58 of 64 | 0.008 [0.008, 0.008] / no |
| end-to-end / native / feed / 1 | 14.140 [14.140, 14.140] | 60.688 [60.688, 60.688] | 104.721 [104.721, 104.721] | 177.000 [177.000, 177.000] | 0 / 7 of 7 | 0.026 [0.026, 0.026] / no |
| end-to-end / native / feed / 8 | 10.090 [10.090, 10.090] | 792.081 [792.081, 792.081] | 792.361 [792.361, 792.361] | 257.922 [257.922, 257.922] | 0 / 8 of 8 | 0.005 [0.005, 0.005] / no |
| end-to-end / native / feed / 64 | 14.693 [14.693, 14.693] | 4241.727 [4241.727, 4241.727] | 4395.600 [4395.600, 4395.600] | 257.359 [257.359, 257.359] | 0 / 67 of 67 | 0.007 [0.007, 0.007] / no |
| end-to-end / native / hello / 1 | 386.827 [386.827, 386.827] | 1.631 [1.631, 1.631] | 16.987 [16.987, 16.987] | 209.422 [209.422, 209.422] | 0 / 156 of 156 | 0.204 [0.204, 0.204] / no |
| end-to-end / native / hello / 8 | 1195.561 [1195.561, 1195.561] | 5.519 [5.519, 5.519] | 18.600 [18.600, 18.600] | 230.063 [230.063, 230.063] | 0 / 481 of 481 | 0.344 [0.344, 0.344] / no |
| end-to-end / native / hello / 64 | 1439.590 [1439.590, 1439.590] | 30.489 [30.489, 30.489] | 109.130 [109.130, 109.130] | 266.906 [266.906, 266.906] | 0 / 606 of 606 | 0.305 [0.305, 0.305] / no |
| end-to-end / native / primes / 1 | 68.207 [68.207, 68.207] | 8.425 [8.425, 8.425] | 64.457 [64.457, 64.457] | 230.406 [230.406, 230.406] | 0 / 28 of 28 | 0.049 [0.049, 0.049] / no |
| end-to-end / native / primes / 8 | 32.846 [32.846, 32.846] | 165.374 [165.374, 165.374] | 399.544 [399.544, 399.544] | 232.188 [232.188, 232.188] | 0 / 21 of 21 | 0.014 [0.014, 0.014] / no |
| end-to-end / native / primes / 64 | 46.327 [46.327, 46.327] | 1377.069 [1377.069, 1377.069] | 1378.219 [1378.219, 1378.219] | 225.984 [225.984, 225.984] | 0 / 64 of 64 | 0.015 [0.015, 0.015] / no |

## Observed native proxy/topology cost

| Route / C | Δ median p50 ms | Δ median p99 ms | end-to-end/direct req/s | Client saturation suspected |
| --- | --- | --- | --- | --- |
| verify / 1 | 2.919 | 39.193 | 0.326 | no |
| verify / 8 | 4.912 | 187.018 | 0.154 | no |
| verify / 64 | 12.601 | 21.064 | 0.522 | no |
| search / 1 | 2.757 | 66.979 | 0.461 | no |
| search / 8 | 54.310 | 56.849 | 0.470 | no |
| search / 64 | 539.421 | 630.027 | 0.427 | no |
| markdown / 1 | -36.848 | 69.077 | 1.235 | no |
| markdown / 8 | -1498.195 | -1474.428 | 4.675 | no |
| markdown / 64 | 421.749 | -1328.213 | 1.419 | no |
| feed / 1 | -18.608 | -99.244 | 1.930 | no |
| feed / 8 | -293.290 | -356.233 | 1.365 | no |
| feed / 64 | -558.718 | -406.242 | 1.098 | no |
| hello / 1 | 0.728 | 2.352 | 0.823 | no |
| hello / 8 | 4.700 | 5.049 | 0.289 | no |
| hello / 64 | 19.767 | 69.131 | 0.290 | no |
| primes / 1 | -0.957 | 37.013 | 0.747 | no |
| primes / 8 | -42.420 | 105.217 | 0.857 | no |
| primes / 64 | 727.808 | 648.995 | 0.480 | no |

## Event-loop isolation (each repetition)

| Runtime / window / repeat | Probe | Requests | p50 ms | p99 ms | Heavy completed |
| --- | --- | --- | --- | --- | --- |
| node / login / isolation-idle / 0 | / | 30 | 3.525 | 19.622 | none |
| node / login / isolation-idle / 0 | /api/hello | 30 | 4.022 | 15.424 | none |
| node / login / isolation-loaded / 0 | / | 2 | 355.719 | 467.158 | 3 |
| node / login / isolation-loaded / 0 | /api/hello | 2 | 355.515 | 466.182 | 3 |
| node / primes / isolation-idle / 0 | / | 32 | 2.912 | 14.790 | none |
| node / primes / isolation-idle / 0 | /api/hello | 32 | 3.780 | 9.560 | none |
| node / primes / isolation-loaded / 0 | / | 3 | 275.504 | 565.273 | 5 |
| node / primes / isolation-loaded / 0 | /api/hello | 2 | 310.986 | 502.423 | 5 |
| native / primes / isolation-idle / 0 | / | 26 | 5.704 | 25.379 | none |
| native / primes / isolation-idle / 0 | /api/hello | 25 | 7.716 | 43.669 | none |
| native / primes / isolation-loaded / 0 | / | 30 | 4.001 | 29.938 | 5 |
| native / primes / isolation-loaded / 0 | /api/hello | 30 | 3.809 | 11.955 | 5 |

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
- **threads:** One million orders, 8 regions, 12 scenarios, 60 months; exact integer-cent totals compared across all variants/counts. Fresh process per variant, growing its retained pool through 1/2/4 workers. One readiness computation at 1 worker, then two full warmups at each count before repeated internal dispatch+compute+reduction timings. Counts run ascending and share JIT/GC history. Dataset/pool setup and HTTP excluded. RSS includes the dataset and all worker threads. Marginal warmed RSS/added worker = (median post-job RSS at 4 workers - median post-job RSS at 1 worker) / 3 within that SAME process. The instantaneous dataset-construction RSS is no longer the baseline; this measures net resident growth including GC/JIT/allocator history, not exact clone allocations. Negative values, if any, remain visible as GC/noise and do not mean negative worker allocation. SAB uses four hand-filled Int32 SharedArrayBuffers; object variants share the original route and worker source. Node object workers clone workerData; native publishes ordinary object graphs. No forced GC.
