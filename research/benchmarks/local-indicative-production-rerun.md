# next-scriptc benchmark

**INDICATIVE ONLY: developer machine / reduced repetitions; not publishable performance evidence**

Status: failed. Commit: 2d499673cb7a2644774ce7e544c97888013448e0. Node v24.22.0; scriptc 0.4.6; Next 16.4.3.

Apple M4 Pro; 12 logical CPUs; darwin/arm64; load averages start 37.70556640625, 48.1318359375, 45.462890625, end 32.97265625, 42.28515625, 43.70166015625.

Started 2026-10-30T22:50:48.712Z; ended 2026-10-30T22:53:59.735Z. Profile: quick. Affinity: {}.

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
| end-to-end / native / login | steady | Error: /api/login: HTTP 500: Internal Server Error |
| end-to-end / native / login | isolation | Error: /api/login: HTTP 500: Internal Server Error |

## Application workloads, C=1 (latency and coverage together)

| Route | Scope | Node p50 ms | Native p50 ms | Native / Node latency | Statements / static % / dynamic tier | Package modes |
| --- | --- | --- | --- | --- | --- | --- |
| login | direct | — | — | — | 2084 / 98% / 426 | bcryptjs: static; jose: static |
| login | end-to-end | 264.641 | FAILED | — | 2084 / 98% / 426 | bcryptjs: static; jose: static |
| verify | direct | — | — | — | 1698 / 97% / 241 | jose: static |
| verify | end-to-end | 3.681 | 3.982 | 1.082× | 1698 / 97% / 241 | jose: static |
| search | direct | — | — | — | 1023 / 97% / 344 | minisearch: static |
| search | end-to-end | 5.080 | 14.436 | 2.841× | 1023 / 97% / 344 | minisearch: static |
| markdown | direct | — | — | — | 1215 / 98% / 641 | marked: static |
| markdown | end-to-end | 5.285 | 37.721 | 7.137× | 1215 / 98% / 641 | marked: static |
| feed | direct | — | — | — | 1216 / 98% / 640 | marked: static |
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


## Idle RSS (MiB, per process and simultaneous total)

| Scope / runtime | Initialized by | PID / role | RSS MiB |
| --- | --- | --- | --- |
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
- **threads:** One million orders, 8 regions, 12 scenarios, 60 months; exact integer-cent totals compared across all variants/counts. Fresh process per variant, growing its retained pool through 1/2/4 workers. One readiness computation at 1 worker, then two full warmups at each count before repeated internal dispatch+compute+reduction timings. Counts run ascending and share JIT/GC history. Dataset/pool setup and HTTP excluded. RSS includes the dataset and all worker threads. Marginal warmed RSS/added worker = (median post-job RSS at 4 workers - median post-job RSS at 1 worker) / 3 within that SAME process. The instantaneous dataset-construction RSS is no longer the baseline; this measures net resident growth including GC/JIT/allocator history, not exact clone allocations. Negative values, if any, remain visible as GC/noise and do not mean negative worker allocation. SAB uses four hand-filled Int32 SharedArrayBuffers; object variants share the original route and worker source. Node object workers clone workerData; native publishes ordinary object graphs. No forced GC.
