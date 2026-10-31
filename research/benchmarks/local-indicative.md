# next-scriptc benchmark

**INDICATIVE ONLY: developer machine / reduced repetitions; not publishable performance evidence**

Status: complete. Commit: 925ce491982d18ddebd8b874c508ed9c30fb6ab4. Node v24.22.0; scriptc 0.4.6; Next 16.4.3.

Apple M4 Pro; 12 logical CPUs; darwin/arm64; load averages start 23.55078125, 32.6171875, 35.48291015625, end 18.97509765625, 27.56494140625, 32.28515625.

Started 2026-10-30T23:51:52.663Z; ended 2026-10-30T23:58:31.003Z. Profile: quick. Affinity: {}.

Full environment, build IDs, source/binary hashes, dirty status, raw repetitions, per-process snapshots, requests, and workload configuration are in the adjacent JSON. Brackets below are [min, max] across repeated runs, not confidence intervals.

## Limitations alongside the results

- Headline application workloads are successful cost-10 bcrypt login, async scrypt login (N=32768, r=8, p=1), authenticated JWT verification, 3,000-product search, uncached Markdown rendering and RSS. hello is a small-response control; primes and report are synthetic. These fixtures have no database or remote I/O.
- Native bcrypt is a known regression: the earlier correctness probe took 26.8 s for three cost-10 operations versus 0.56 s on Node (~48× slower). Login therefore measures only three requests, C=1, one measured repetition and one separate cold request per surface. Its p99 is simply the maximum of three, not credible tail evidence. No reduced cost, invalid password or 401 shortcut is substituted. CSV and OG-image generation were refused by the probe; see examples/probe/RESULTS.md.
- If a route exceeds Next’s default 30-second upstream proxy timeout, production returns HTTP 500. The suite records that workload as exceeding the default 30 s proxy timeout when elapsed time and upstream-reset logs confirm it, preserves server logs, sets dataset status failed/nonzero exit and continues independent workloads. It never increases the production timeout, substitutes a faster error path or counts failed responses as throughput.
- Coverage static percentage is not a typed-machine-code percentage: scriptc includes dynamic-tier statements in its compile-statically total. Dynamic counts and package modes are displayed alongside speed; package mode static does not exclude untyped JS operations. Coverage describes the entry graph, not measured hot-path time, so it suggests explanations without proving causality.
- Node baseline is a production next build / next start with adapter disabled (.next-node), normal V8 JIT, no debug or memory flags. Direct Node uses the identical generated entry and HTTP shim, without a Next server. Native end-to-end includes the extra Next proxy and all resident route processes.
- hello reads Accept-Language and feed reads a result limit from request.url: with cacheComponents these are dynamic, and both sides compute every measured response. Node prerendered paths are recorded separately; no Next optimization is disabled. Async scrypt uses Node's default libuv threadpool; scriptc 0.4.6 computes the derivation before deferring the callback. Isolation includes both async scrypt and synchronous bcrypt, so a bcrypt isolation win does not describe production-style async password hashing.
- Linux uses two allowed CPUs for the application tree and two disjoint CPUs for generator + controller. Both runtimes inherit the same masks. Threads alone use all four CPUs for 1/2/4-worker scaling; they have no sustained HTTP load generator. These are logical CPUs; topology/SMT and other sandbox tenants may still affect results. macOS cannot use taskset: local output is indicative only.
- Run order: cold runtimes alternate. Default steady blocks are direct Node, direct native, end-to-end Node, end-to-end native; --reverse reverses runtime order and is recorded in the profile. All repeated steady runs share their block's process/JIT/cache/allocator state. No multiple application modes run together. Repeat on a quiet host in both orders before publishing close comparisons.
- Client and server share a machine and memory bandwidth. The single Node generator can bottleneck on one JS thread even with a two-CPU affinity mask. Rows flag suspected generator saturation at >=0.8 CPU-seconds per wall-second; flagged throughput is a lower bound on server capacity. CPU pinning reduces CPU contention but does not eliminate shared-resource interference. No load-generator ceiling calibration is implied.
- SAB is a standalone Node program to expose the strongest Node sharing baseline without adding an application route. Its internal timed region matches report, and every total must match. It has no idle HTTP shim; RSS is therefore slightly favorable to SAB. SAB and object layouts/code accesses differ by necessity. This tests sharing ergonomics + overhead, not identical-code compiler speed. Dataset construction and worker initialization costs are excluded from time. Warmed total RSS retains the dataset and resident pool; the marginal metric compares warmed 1/4-worker states within a process.
- Idle and after-load memory are runtime/GC-state dependent. Peak sampling can miss spikes; summed RSS overcounts shared pages. CPU ticks can make tiny-request per-request CPU noisy: increase fixed count for public claims. Active CPU here is OS user+system process CPU, not a reproduction of Vercel billing instrumentation.
- Responses are checked for expected status and byte-for-byte SHA-256 parity before timing and throughout load. Workloads must use deterministic fixtures, including a fixed clock/key for token issuance. No TLS, remote network, serverless scheduling, multi-instance autoscaling or platform cold starts are measured.

## Workloads

Node build prerendered paths: /, /_global-error, /_not-found, /api/items/new, /favicon.ico.

| Route | Kind | Request / pending |
| --- | --- | --- |
| login | realistic | POST /api/login |
| login-scrypt | realistic | POST /api/login-scrypt |
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
| login | direct | 120.442 | 13726.338 | 113.967× | 2094 / 98% / 427 | bcryptjs: static; jose: static |
| login | end-to-end | 134.053 | 10805.138 | 80.604× | 2094 / 98% / 427 | bcryptjs: static; jose: static |
| login-scrypt | direct | 91.054 | 111.367 | 1.223× | 1680 / 97% / 228 | jose: static |
| login-scrypt | end-to-end | 129.924 | 104.601 | 0.805× | 1680 / 97% / 228 | jose: static |
| verify | direct | 1.358 | 2.005 | 1.476× | 1708 / 97% / 242 | jose: static |
| verify | end-to-end | 2.512 | 0.920 | 0.366× | 1708 / 97% / 242 | jose: static |
| search | direct | 2.379 | 6.038 | 2.538× | 1033 / 97% / 345 | minisearch: static |
| search | end-to-end | 1.759 | 7.632 | 4.340× | 1033 / 97% / 345 | minisearch: static |
| markdown | direct | 2.444 | 187.042 | 76.527× | 1225 / 98% / 642 | marked: static |
| markdown | end-to-end | 2.009 | 33.191 | 16.519× | 1225 / 98% / 642 | marked: static |
| feed | direct | 2.099 | 35.672 | 16.994× | 1229 / 98% / 643 | marked: static |
| feed | end-to-end | 3.499 | 43.601 | 12.460× | 1229 / 98% / 643 | marked: static |

## Coverage of every measured entry (controls and synthetic included)

| Entry | Statements | Static statements / % | Dynamic tier statements | Package modes |
| --- | --- | --- | --- | --- |
| login | 2094 | 2059 / 98% | 427 | bcryptjs: static; jose: static |
| login-scrypt | 1680 | 1645 / 97% | 228 | jose: static |
| verify | 1708 | 1673 / 97% | 242 | jose: static |
| search | 1033 | 1009 / 97% | 345 | minisearch: static |
| markdown | 1225 | 1201 / 98% | 642 | marked: static |
| feed | 1229 | 1205 / 98% | 643 | marked: static |
| hello | 328 | 304 / 92% | 28 | none |
| primes | 342 | 318 / 92% | 29 | none |
| report | 414 | 390 / 94% | 37 | none |

## Cold start (ms, process-cold)

| Scope / runtime / route | N | Median | p90 | Min | Max |
| --- | --- | --- | --- | --- | --- |
| direct / node / login | 1 | 373.367 | 373.367 | 373.367 | 373.367 |
| direct / native / login | 1 | 10420.367 | 10420.367 | 10420.367 | 10420.367 |
| direct / node / login-scrypt | 1 | 375.434 | 375.434 | 375.434 | 375.434 |
| direct / native / login-scrypt | 1 | 582.560 | 582.560 | 582.560 | 582.560 |
| direct / node / verify | 1 | 226.170 | 226.170 | 226.170 | 226.170 |
| direct / native / verify | 1 | 432.989 | 432.989 | 432.989 | 432.989 |
| direct / node / search | 1 | 252.529 | 252.529 | 252.529 | 252.529 |
| direct / native / search | 1 | 736.624 | 736.624 | 736.624 | 736.624 |
| direct / node / markdown | 1 | 161.002 | 161.002 | 161.002 | 161.002 |
| direct / native / markdown | 1 | 425.255 | 425.255 | 425.255 | 425.255 |
| direct / node / feed | 1 | 179.682 | 179.682 | 179.682 | 179.682 |
| direct / native / feed | 1 | 454.508 | 454.508 | 454.508 | 454.508 |
| direct / node / hello | 1 | 126.867 | 126.867 | 126.867 | 126.867 |
| direct / native / hello | 1 | 352.518 | 352.518 | 352.518 | 352.518 |
| direct / node / primes | 1 | 145.150 | 145.150 | 145.150 | 145.150 |
| direct / native / primes | 1 | 516.065 | 516.065 | 516.065 | 516.065 |
| end-to-end / node / login | 1 | 768.935 | 768.935 | 768.935 | 768.935 |
| end-to-end / native / login | 1 | 9484.578 | 9484.578 | 9484.578 | 9484.578 |
| end-to-end / node / login-scrypt | 1 | 711.301 | 711.301 | 711.301 | 711.301 |
| end-to-end / native / login-scrypt | 1 | 1094.824 | 1094.824 | 1094.824 | 1094.824 |
| end-to-end / node / verify | 1 | 384.958 | 384.958 | 384.958 | 384.958 |
| end-to-end / native / verify | 1 | 1029.089 | 1029.089 | 1029.089 | 1029.089 |
| end-to-end / node / search | 1 | 593.892 | 593.892 | 593.892 | 593.892 |
| end-to-end / native / search | 1 | 984.064 | 984.064 | 984.064 | 984.064 |
| end-to-end / node / markdown | 1 | 496.585 | 496.585 | 496.585 | 496.585 |
| end-to-end / native / markdown | 1 | 924.531 | 924.531 | 924.531 | 924.531 |
| end-to-end / node / feed | 1 | 593.247 | 593.247 | 593.247 | 593.247 |
| end-to-end / native / feed | 1 | 938.631 | 938.631 | 938.631 | 938.631 |
| end-to-end / node / hello | 1 | 445.910 | 445.910 | 445.910 | 445.910 |
| end-to-end / native / hello | 1 | 835.174 | 835.174 | 835.174 | 835.174 |
| end-to-end / node / primes | 1 | 497.540 | 497.540 | 497.540 | 497.540 |
| end-to-end / native / primes | 1 | 1044.269 | 1044.269 | 1044.269 | 1044.269 |

## Idle RSS (MiB, per process and simultaneous total)

| Scope / runtime | Initialized by | PID / role | RSS MiB |
| --- | --- | --- | --- |
| direct / node | login | 71400 / node-route | 102.156 |
| direct / node | login | TOTAL | 102.156 |
| direct / node | login-scrypt | 71514 / node-route | 134.578 |
| direct / node | login-scrypt | TOTAL | 134.578 |
| direct / node | verify | 71602 / node-route | 100.859 |
| direct / node | verify | TOTAL | 100.859 |
| direct / node | search | 71942 / node-route | 115.109 |
| direct / node | search | TOTAL | 115.109 |
| direct / node | markdown | 72324 / node-route | 96.563 |
| direct / node | markdown | TOTAL | 96.563 |
| direct / node | feed | 72677 / node-route | 96.656 |
| direct / node | feed | TOTAL | 96.656 |
| direct / node | hello | 73022 / node-route | 93.391 |
| direct / node | hello | TOTAL | 93.391 |
| direct / node | primes | 73379 / node-route | 97.078 |
| direct / node | primes | TOTAL | 97.078 |
| direct / native | login | 73788 / native-route | 5.000 |
| direct / native | login | TOTAL | 5.000 |
| direct / native | login-scrypt | 82847 / native-route | 36.828 |
| direct / native | login-scrypt | TOTAL | 36.828 |
| direct / native | verify | 82961 / native-route | 4.953 |
| direct / native | verify | TOTAL | 4.953 |
| direct / native | search | 83324 / native-route | 27.453 |
| direct / native | search | TOTAL | 27.453 |
| direct / native | markdown | 83797 / native-route | 9.234 |
| direct / native | markdown | TOTAL | 9.234 |
| direct / native | feed | 85828 / native-route | 9.203 |
| direct / native | feed | TOTAL | 9.203 |
| direct / native | hello | 87008 / native-route | 3.016 |
| direct / native | hello | TOTAL | 3.016 |
| direct / native | primes | 87377 / native-route | 4.109 |
| direct / native | primes | TOTAL | 4.109 |
| end-to-end / node | hello | 87812 / next-server | 117.594 |
| end-to-end / node | hello | TOTAL | 117.594 |
| end-to-end / native | hello | 90268 / next-server | 107.938 |
| end-to-end / native | hello | 90270 / native-route | 3.797 |
| end-to-end / native | hello | 90271 / native-route | 2.781 |
| end-to-end / native | hello | 90272 / native-route | 1.516 |
| end-to-end / native | hello | 90273 / native-route | 2.844 |
| end-to-end / native | hello | 90274 / native-route | 2.609 |
| end-to-end / native | hello | 90275 / native-route | 3.406 |
| end-to-end / native | hello | 90276 / native-route | 1.563 |
| end-to-end / native | hello | 90277 / native-route | 1.516 |
| end-to-end / native | hello | 90278 / native-route | 16.688 |
| end-to-end / native | hello | 90279 / native-route | 1.813 |
| end-to-end / native | hello | 90280 / native-route | 2.484 |
| end-to-end / native | hello | TOTAL | 148.953 |

## Fixed-count process CPU and memory

| Scope / runtime / route | N per run | CPU ms/request median [min,max] | After N total RSS MiB | Sampled peak total MiB |
| --- | --- | --- | --- | --- |
| direct / node / login | 3 | 116.667 [116.667, 116.667] | 102.484 [102.484, 102.484] | 102.484 [102.484, 102.484] |
| direct / node / login-scrypt | 3 | 86.667 [86.667, 86.667] | 135.078 [135.078, 135.078] | 135.078 [135.078, 135.078] |
| direct / node / verify | 40 | 0.500 [0.500, 0.500] | 105.797 [105.797, 105.797] | 105.797 [105.797, 105.797] |
| direct / node / search | 40 | 1.750 [1.750, 1.750] | 120.797 [120.797, 120.797] | 120.797 [120.797, 120.797] |
| direct / node / markdown | 40 | 1.750 [1.750, 1.750] | 105.469 [105.469, 105.469] | 105.469 [105.469, 105.469] |
| direct / node / feed | 40 | 1.750 [1.750, 1.750] | 89.406 [89.406, 89.406] | 90.125 [90.125, 90.125] |
| direct / node / hello | 40 | 0.250 [0.250, 0.250] | 98.984 [98.984, 98.984] | 98.984 [98.984, 98.984] |
| direct / node / primes | 40 | 5.250 [5.250, 5.250] | 122.391 [122.391, 122.391] | 122.391 [122.391, 122.391] |
| direct / native / login | 3 | 9800.000 [9800.000, 9800.000] | 4.813 [4.813, 4.813] | 4.938 [4.938, 4.938] |
| direct / native / login-scrypt | 3 | 90.000 [90.000, 90.000] | 36.828 [36.828, 36.828] | 36.828 [36.828, 36.828] |
| direct / native / verify | 40 | 0.250 [0.250, 0.250] | 5.203 [5.203, 5.203] | 5.250 [5.250, 5.250] |
| direct / native / search | 40 | 3.750 [3.750, 3.750] | 27.953 [27.953, 27.953] | 28.047 [28.047, 28.047] |
| direct / native / markdown | 40 | 27.500 [27.500, 27.500] | 9.094 [9.094, 9.094] | 9.406 [9.406, 9.406] |
| direct / native / feed | 40 | 29.500 [29.500, 29.500] | 8.484 [8.484, 8.484] | 8.484 [8.484, 8.484] |
| direct / native / hello | 40 | 0.000 [0.000, 0.000] | 3.406 [3.406, 3.406] | 3.406 [3.406, 3.406] |
| direct / native / primes | 40 | 4.500 [4.500, 4.500] | 6.500 [6.500, 6.500] | 6.500 [6.500, 6.500] |
| end-to-end / node / login | 3 | 120.000 [120.000, 120.000] | 117.125 [117.125, 117.125] | 119.078 [119.078, 119.078] |
| end-to-end / node / login-scrypt | 3 | 96.667 [96.667, 96.667] | 143.922 [143.922, 143.922] | 150.938 [150.938, 150.938] |
| end-to-end / node / verify | 40 | 2.000 [2.000, 2.000] | 153.766 [153.766, 153.766] | 154.297 [154.297, 154.297] |
| end-to-end / node / search | 40 | 2.500 [2.500, 2.500] | 318.641 [318.641, 318.641] | 318.641 [318.641, 318.641] |
| end-to-end / node / markdown | 40 | 1.500 [1.500, 1.500] | 312.484 [312.484, 312.484] | 312.484 [312.484, 312.484] |
| end-to-end / node / feed | 40 | 2.250 [2.250, 2.250] | 252.438 [252.438, 252.438] | 254.547 [254.547, 254.547] |
| end-to-end / node / hello | 40 | 0.250 [0.250, 0.250] | 347.750 [347.750, 347.750] | 349.250 [349.250, 349.250] |
| end-to-end / node / primes | 40 | 5.500 [5.500, 5.500] | 403.828 [403.828, 403.828] | 403.828 [403.828, 403.828] |
| end-to-end / native / login | 3 | 9886.667 [9886.667, 9886.667] | 93.828 [93.828, 93.828] | 98.281 [98.281, 98.281] |
| end-to-end / native / login-scrypt | 3 | 96.667 [96.667, 96.667] | 135.016 [135.016, 135.016] | 135.016 [135.016, 135.016] |
| end-to-end / native / verify | 40 | 1.500 [1.500, 1.500] | 171.406 [171.406, 171.406] | 171.406 [171.406, 171.406] |
| end-to-end / native / search | 40 | 6.500 [6.500, 6.500] | 264.203 [264.203, 264.203] | 274.938 [274.938, 274.938] |
| end-to-end / native / markdown | 40 | 28.500 [28.500, 28.500] | 232.047 [232.047, 232.047] | 236.266 [236.266, 236.266] |
| end-to-end / native / feed | 40 | 35.500 [35.500, 35.500] | 210.422 [210.422, 210.422] | 215.172 [215.172, 215.172] |
| end-to-end / native / hello | 40 | 0.750 [0.750, 0.750] | 137.750 [137.750, 137.750] | 137.750 [137.750, 137.750] |
| end-to-end / native / primes | 40 | 5.250 [5.250, 5.250] | 282.484 [282.484, 282.484] | 288.906 [288.906, 288.906] |

## Throughput / latency

| Scope / runtime / route / C | req/s median [min,max] | p50 ms median [min,max] | p99 ms median [min,max] | Peak total MiB | Measured sockets created / requests reused (each run) | Generator CPU cores / saturation suspected |
| --- | --- | --- | --- | --- | --- | --- |
| direct / node / login / 1 | 8.241 [8.241, 8.241] | 120.442 [120.442, 120.442] | 127.496 [127.496, 127.496] | 102.484 [102.484, 102.484] | 0 / 3 of 3 | 0.011 [0.011, 0.011] / no |
| direct / node / login-scrypt / 1 | 10.932 [10.932, 10.932] | 91.054 [91.054, 91.054] | 92.878 [92.878, 92.878] | 135.078 [135.078, 135.078] | 0 / 3 of 3 | 0.017 [0.017, 0.017] / no |
| direct / node / verify / 1 | 602.139 [602.139, 602.139] | 1.358 [1.358, 1.358] | 4.864 [4.864, 4.864] | 120.172 [120.172, 120.172] | 0 / 241 of 241 | 0.232 [0.232, 0.232] / no |
| direct / node / verify / 8 | 4590.935 [4590.935, 4590.935] | 1.526 [1.526, 1.526] | 5.413 [5.413, 5.413] | 121.344 [121.344, 121.344] | 0 / 1844 of 1844 | 0.577 [0.577, 0.577] / no |
| direct / node / verify / 64 | 8654.320 [8654.320, 8654.320] | 6.405 [6.405, 6.405] | 23.987 [23.987, 23.987] | 114.813 [114.813, 114.813] | 0 / 3472 of 3472 | 0.728 [0.728, 0.728] / no |
| direct / node / search / 1 | 358.465 [358.465, 358.465] | 2.379 [2.379, 2.379] | 7.074 [7.074, 7.074] | 120.891 [120.891, 120.891] | 0 / 144 of 144 | 0.199 [0.199, 0.199] / no |
| direct / node / search / 8 | 1121.722 [1121.722, 1121.722] | 5.981 [5.981, 5.981] | 16.980 [16.980, 16.980] | 121.516 [121.516, 121.516] | 0 / 456 of 456 | 0.435 [0.435, 0.435] / no |
| direct / node / search / 64 | 926.676 [926.676, 926.676] | 62.276 [62.276, 62.276] | 131.823 [131.823, 131.823] | 132.453 [132.453, 132.453] | 0 / 426 of 426 | 0.308 [0.308, 0.308] / no |
| direct / node / markdown / 1 | 279.394 [279.394, 279.394] | 2.444 [2.444, 2.444] | 9.788 [9.788, 9.788] | 94.359 [94.359, 94.359] | 0 / 112 of 112 | 0.157 [0.157, 0.157] / no |
| direct / node / markdown / 8 | 1058.023 [1058.023, 1058.023] | 4.387 [4.387, 4.387] | 85.322 [85.322, 85.322] | 101.797 [101.797, 101.797] | 0 / 428 of 428 | 0.368 [0.368, 0.368] / no |
| direct / node / markdown / 64 | 1310.941 [1310.941, 1310.941] | 35.566 [35.566, 35.566] | 141.424 [141.424, 141.424] | 92.734 [92.734, 92.734] | 0 / 571 of 571 | 0.368 [0.368, 0.368] / no |
| direct / node / feed / 1 | 381.252 [381.252, 381.252] | 2.099 [2.099, 2.099] | 8.277 [8.277, 8.277] | 89.656 [89.656, 89.656] | 0 / 153 of 153 | 0.198 [0.198, 0.198] / no |
| direct / node / feed / 8 | 1248.960 [1248.960, 1248.960] | 5.032 [5.032, 5.032] | 15.280 [15.280, 15.280] | 103.484 [103.484, 103.484] | 0 / 510 of 510 | 0.406 [0.406, 0.406] / no |
| direct / node / feed / 64 | 1348.697 [1348.697, 1348.697] | 43.749 [43.749, 43.749] | 87.767 [87.767, 87.767] | 111.984 [111.984, 111.984] | 0 / 603 of 603 | 0.414 [0.414, 0.414] / no |
| direct / node / hello / 1 | 1109.042 [1109.042, 1109.042] | 0.697 [0.697, 0.697] | 2.753 [2.753, 2.753] | 110.469 [110.469, 110.469] | 0 / 444 of 444 | 0.409 [0.409, 0.409] / no |
| direct / node / hello / 8 | 6880.240 [6880.240, 6880.240] | 0.818 [0.818, 0.818] | 6.849 [6.849, 6.849] | 87.516 [87.516, 87.516] | 0 / 2756 of 2756 | 0.646 [0.646, 0.646] / no |
| direct / node / hello / 64 | 11438.997 [11438.997, 11438.997] | 3.891 [3.891, 3.891] | 31.810 [31.810, 31.810] | 93.641 [93.641, 93.641] | 0 / 4590 of 4590 | 0.889 [0.889, 0.889] / YES |
| direct / node / primes / 1 | 151.847 [151.847, 151.847] | 6.144 [6.144, 6.144] | 13.299 [13.299, 13.299] | 124.266 [124.266, 124.266] | 0 / 61 of 61 | 0.102 [0.102, 0.102] / no |
| direct / node / primes / 8 | 214.417 [214.417, 214.417] | 31.356 [31.356, 31.356] | 77.896 [77.896, 77.896] | 179.047 [179.047, 179.047] | 0 / 93 of 93 | 0.129 [0.129, 0.129] / no |
| direct / node / primes / 64 | 214.937 [214.937, 214.937] | 281.055 [281.055, 281.055] | 581.023 [581.023, 581.023] | 183.281 [183.281, 183.281] | 0 / 144 of 144 | 0.115 [0.115, 0.115] / no |
| direct / native / login / 1 | 0.071 [0.071, 0.071] | 13726.338 [13726.338, 13726.338] | 16460.146 [16460.146, 16460.146] | 4.938 [4.938, 4.938] | 0 / 3 of 3 | 0.000 [0.000, 0.000] / no |
| direct / native / login-scrypt / 1 | 8.237 [8.237, 8.237] | 111.367 [111.367, 111.367] | 150.337 [150.337, 150.337] | 36.828 [36.828, 36.828] | 0 / 3 of 3 | 0.013 [0.013, 0.013] / no |
| direct / native / verify / 1 | 339.265 [339.265, 339.265] | 2.005 [2.005, 2.005] | 13.954 [13.954, 13.954] | 4.891 [4.891, 4.891] | 0 / 136 of 136 | 0.190 [0.190, 0.190] / no |
| direct / native / verify / 8 | 2545.622 [2545.622, 2545.622] | 2.599 [2.599, 2.599] | 9.808 [9.808, 9.808] | 5.594 [5.594, 5.594] | 0 / 1021 of 1021 | 0.425 [0.425, 0.425] / no |
| direct / native / verify / 64 | 2932.318 [2932.318, 2932.318] | 17.961 [17.961, 17.961] | 67.898 [67.898, 67.898] | 9.281 [9.281, 9.281] | 0 / 1201 of 1201 | 0.525 [0.525, 0.525] / no |
| direct / native / search / 1 | 135.241 [135.241, 135.241] | 6.038 [6.038, 6.038] | 15.241 [15.241, 15.241] | 27.266 [27.266, 27.266] | 0 / 55 of 55 | 0.106 [0.106, 0.106] / no |
| direct / native / search / 8 | 168.573 [168.573, 168.573] | 34.350 [34.350, 34.350] | 115.010 [115.010, 115.010] | 27.359 [27.359, 27.359] | 0 / 72 of 72 | 0.066 [0.066, 0.066] / no |
| direct / native / search / 64 | 147.154 [147.154, 147.154] | 430.587 [430.587, 430.587] | 431.185 [431.185, 431.185] | 25.250 [25.250, 25.250] | 0 / 64 of 64 | 0.040 [0.040, 0.040] / no |
| direct / native / markdown / 1 | 5.775 [5.775, 5.775] | 187.042 [187.042, 187.042] | 211.747 [211.747, 211.747] | 8.703 [8.703, 8.703] | 0 / 3 of 3 | 0.008 [0.008, 0.008] / no |
| direct / native / markdown / 8 | 22.885 [22.885, 22.885] | 319.640 [319.640, 319.640] | 379.110 [379.110, 379.110] | 9.125 [9.125, 9.125] | 0 / 16 of 16 | 0.013 [0.013, 0.013] / no |
| direct / native / markdown / 64 | 19.928 [19.928, 19.928] | 3181.060 [3181.060, 3181.060] | 3198.792 [3198.792, 3198.792] | 11.703 [11.703, 11.703] | 0 / 64 of 64 | 0.011 [0.011, 0.011] / no |
| direct / native / feed / 1 | 27.265 [27.265, 27.265] | 35.672 [35.672, 35.672] | 43.810 [43.810, 43.810] | 8.484 [8.484, 8.484] | 0 / 11 of 11 | 0.034 [0.034, 0.034] / no |
| direct / native / feed / 8 | 29.190 [29.190, 29.190] | 261.875 [261.875, 261.875] | 287.083 [287.083, 287.083] | 9.656 [9.656, 9.656] | 0 / 17 of 17 | 0.021 [0.021, 0.021] / no |
| direct / native / feed / 64 | 26.548 [26.548, 26.548] | 2411.976 [2411.976, 2411.976] | 2418.295 [2418.295, 2418.295] | 12.781 [12.781, 12.781] | 0 / 65 of 65 | 0.010 [0.010, 0.010] / no |
| direct / native / hello / 1 | 642.164 [642.164, 642.164] | 0.994 [0.994, 0.994] | 5.484 [5.484, 5.484] | 3.016 [3.016, 3.016] | 0 / 257 of 257 | 0.252 [0.252, 0.252] / no |
| direct / native / hello / 8 | 4825.490 [4825.490, 4825.490] | 0.800 [0.800, 0.800] | 14.421 [14.421, 14.421] | 3.094 [3.094, 3.094] | 0 / 1955 of 1955 | 0.456 [0.456, 0.456] / no |
| direct / native / hello / 64 | 13809.862 [13809.862, 13809.862] | 4.210 [4.210, 4.210] | 11.595 [11.595, 11.595] | 3.938 [3.938, 3.938] | 0 / 5549 of 5549 | 1.025 [1.025, 1.025] / YES |
| direct / native / primes / 1 | 182.670 [182.670, 182.670] | 5.288 [5.288, 5.288] | 7.222 [7.222, 7.222] | 6.500 [6.500, 6.500] | 0 / 74 of 74 | 0.113 [0.113, 0.113] / no |
| direct / native / primes / 8 | 173.708 [173.708, 173.708] | 47.630 [47.630, 47.630] | 62.316 [62.316, 62.316] | 6.563 [6.563, 6.563] | 0 / 74 of 74 | 0.080 [0.080, 0.080] / no |
| direct / native / primes / 64 | 197.057 [197.057, 197.057] | 315.096 [315.096, 315.096] | 342.762 [342.762, 342.762] | 7.375 [7.375, 7.375] | 0 / 139 of 139 | 0.051 [0.051, 0.051] / no |
| end-to-end / node / login / 1 | 7.429 [7.429, 7.429] | 134.053 [134.053, 134.053] | 135.151 [135.151, 135.151] | 119.078 [119.078, 119.078] | 0 / 3 of 3 | 0.012 [0.012, 0.012] / no |
| end-to-end / node / login-scrypt / 1 | 8.464 [8.464, 8.464] | 129.924 [129.924, 129.924] | 130.949 [130.949, 130.949] | 150.938 [150.938, 150.938] | 0 / 3 of 3 | 0.013 [0.013, 0.013] / no |
| end-to-end / node / verify / 1 | 294.032 [294.032, 294.032] | 2.512 [2.512, 2.512] | 13.623 [13.623, 13.623] | 166.281 [166.281, 166.281] | 0 / 118 of 118 | 0.182 [0.182, 0.182] / no |
| end-to-end / node / verify / 8 | 2270.126 [2270.126, 2270.126] | 2.627 [2.627, 2.627] | 10.245 [10.245, 10.245] | 296.891 [296.891, 296.891] | 0 / 918 of 918 | 0.495 [0.495, 0.495] / no |
| end-to-end / node / verify / 64 | 2059.023 [2059.023, 2059.023] | 29.011 [29.011, 29.011] | 56.672 [56.672, 56.672] | 357.406 [357.406, 357.406] | 0 / 886 of 886 | 0.301 [0.301, 0.301] / no |
| end-to-end / node / search / 1 | 496.602 [496.602, 496.602] | 1.759 [1.759, 1.759] | 4.229 [4.229, 4.229] | 316.266 [316.266, 316.266] | 0 / 199 of 199 | 0.202 [0.202, 0.202] / no |
| end-to-end / node / search / 8 | 1127.494 [1127.494, 1127.494] | 6.288 [6.288, 6.288] | 15.253 [15.253, 15.253] | 317.953 [317.953, 317.953] | 0 / 458 of 458 | 0.319 [0.319, 0.319] / no |
| end-to-end / node / search / 64 | 799.639 [799.639, 799.639] | 75.910 [75.910, 75.910] | 144.978 [144.978, 144.978] | 332.969 [332.969, 332.969] | 0 / 391 of 391 | 0.322 [0.322, 0.322] / no |
| end-to-end / node / markdown / 1 | 406.694 [406.694, 406.694] | 2.009 [2.009, 2.009] | 7.275 [7.275, 7.275] | 320.016 [320.016, 320.016] | 0 / 163 of 163 | 0.223 [0.223, 0.223] / no |
| end-to-end / node / markdown / 8 | 1098.773 [1098.773, 1098.773] | 6.124 [6.124, 6.124] | 18.399 [18.399, 18.399] | 336.469 [336.469, 336.469] | 0 / 445 of 445 | 0.413 [0.413, 0.413] / no |
| end-to-end / node / markdown / 64 | 851.301 [851.301, 851.301] | 71.236 [71.236, 71.236] | 135.426 [135.426, 135.426] | 330.266 [330.266, 330.266] | 0 / 420 of 420 | 0.350 [0.350, 0.350] / no |
| end-to-end / node / feed / 1 | 229.053 [229.053, 229.053] | 3.499 [3.499, 3.499] | 11.977 [11.977, 11.977] | 247.938 [247.938, 247.938] | 0 / 92 of 92 | 0.157 [0.157, 0.157] / no |
| end-to-end / node / feed / 8 | 821.179 [821.179, 821.179] | 8.364 [8.364, 8.364] | 23.387 [23.387, 23.387] | 347.578 [347.578, 347.578] | 0 / 335 of 335 | 0.356 [0.356, 0.356] / no |
| end-to-end / node / feed / 64 | 895.971 [895.971, 895.971] | 69.185 [69.185, 69.185] | 136.187 [136.187, 136.187] | 352.641 [352.641, 352.641] | 0 / 415 of 415 | 0.428 [0.428, 0.428] / no |
| end-to-end / node / hello / 1 | 771.197 [771.197, 771.197] | 0.824 [0.824, 0.824] | 7.931 [7.931, 7.931] | 348.094 [348.094, 348.094] | 0 / 310 of 310 | 0.274 [0.274, 0.274] / no |
| end-to-end / node / hello / 8 | 2783.353 [2783.353, 2783.353] | 2.113 [2.113, 2.113] | 10.205 [10.205, 10.205] | 356.328 [356.328, 356.328] | 0 / 1133 of 1133 | 0.503 [0.503, 0.503] / no |
| end-to-end / node / hello / 64 | 2337.411 [2337.411, 2337.411] | 25.432 [25.432, 25.432] | 51.604 [51.604, 51.604] | 353.000 [353.000, 353.000] | 0 / 976 of 976 | 0.465 [0.465, 0.465] / no |
| end-to-end / node / primes / 1 | 161.290 [161.290, 161.290] | 5.575 [5.575, 5.575] | 14.199 [14.199, 14.199] | 408.984 [408.984, 408.984] | 0 / 65 of 65 | 0.105 [0.105, 0.105] / no |
| end-to-end / node / primes / 8 | 179.365 [179.365, 179.365] | 40.345 [40.345, 40.345] | 99.845 [99.845, 99.845] | 391.453 [391.453, 391.453] | 0 / 81 of 81 | 0.115 [0.115, 0.115] / no |
| end-to-end / node / primes / 64 | 117.966 [117.966, 117.966] | 502.864 [502.864, 502.864] | 593.076 [593.076, 593.076] | 365.547 [365.547, 365.547] | 0 / 97 of 97 | 0.066 [0.066, 0.066] / no |
| end-to-end / native / login / 1 | 0.090 [0.090, 0.090] | 10805.138 [10805.138, 10805.138] | 11983.303 [11983.303, 11983.303] | 98.281 [98.281, 98.281] | 0 / 3 of 3 | 0.001 [0.001, 0.001] / no |
| end-to-end / native / login-scrypt / 1 | 9.411 [9.411, 9.411] | 104.601 [104.601, 104.601] | 110.345 [110.345, 110.345] | 135.016 [135.016, 135.016] | 0 / 3 of 3 | 0.016 [0.016, 0.016] / no |
| end-to-end / native / verify / 1 | 782.089 [782.089, 782.089] | 0.920 [0.920, 0.920] | 5.995 [5.995, 5.995] | 187.641 [187.641, 187.641] | 0 / 315 of 315 | 0.287 [0.287, 0.287] / no |
| end-to-end / native / verify / 8 | 3123.863 [3123.863, 3123.863] | 1.778 [1.778, 1.778] | 19.399 [19.399, 19.399] | 234.656 [234.656, 234.656] | 0 / 1263 of 1263 | 0.497 [0.497, 0.497] / no |
| end-to-end / native / verify / 64 | 4240.301 [4240.301, 4240.301] | 13.450 [13.450, 13.450] | 33.085 [33.085, 33.085] | 271.297 [271.297, 271.297] | 0 / 1745 of 1745 | 0.570 [0.570, 0.570] / no |
| end-to-end / native / search / 1 | 111.400 [111.400, 111.400] | 7.632 [7.632, 7.632] | 21.265 [21.265, 21.265] | 222.875 [222.875, 222.875] | 0 / 45 of 45 | 0.092 [0.092, 0.092] / no |
| end-to-end / native / search / 8 | 302.702 [302.702, 302.702] | 25.885 [25.885, 25.885] | 37.316 [37.316, 37.316] | 208.406 [208.406, 208.406] | 0 / 126 of 126 | 0.112 [0.112, 0.112] / no |
| end-to-end / native / search / 64 | 314.063 [314.063, 314.063] | 192.990 [192.990, 192.990] | 218.340 [218.340, 218.340] | 225.703 [225.703, 225.703] | 0 / 178 of 178 | 0.065 [0.065, 0.065] / no |
| end-to-end / native / markdown / 1 | 27.054 [27.054, 27.054] | 33.191 [33.191, 33.191] | 54.788 [54.788, 54.788] | 148.141 [148.141, 148.141] | 0 / 11 of 11 | 0.041 [0.041, 0.041] / no |
| end-to-end / native / markdown / 8 | 30.497 [30.497, 30.497] | 258.642 [258.642, 258.642] | 268.260 [268.260, 268.260] | 114.813 [114.813, 114.813] | 0 / 17 of 17 | 0.014 [0.014, 0.014] / no |
| end-to-end / native / markdown / 64 | 31.558 [31.558, 31.558] | 2043.293 [2043.293, 2043.293] | 2044.580 [2044.580, 2044.580] | 127.156 [127.156, 127.156] | 0 / 65 of 65 | 0.014 [0.014, 0.014] / no |
| end-to-end / native / feed / 1 | 21.489 [21.489, 21.489] | 43.601 [43.601, 43.601] | 57.563 [57.563, 57.563] | 202.594 [202.594, 202.594] | 0 / 9 of 9 | 0.038 [0.038, 0.038] / no |
| end-to-end / native / feed / 8 | 27.249 [27.249, 27.249] | 279.476 [279.476, 279.476] | 309.789 [309.789, 309.789] | 110.547 [110.547, 110.547] | 0 / 18 of 18 | 0.020 [0.020, 0.020] / no |
| end-to-end / native / feed / 64 | 28.375 [28.375, 28.375] | 2257.755 [2257.755, 2257.755] | 2264.271 [2264.271, 2264.271] | 125.219 [125.219, 125.219] | 0 / 65 of 65 | 0.011 [0.011, 0.011] / no |
| end-to-end / native / hello / 1 | 309.224 [309.224, 309.224] | 2.089 [2.089, 2.089] | 10.506 [10.506, 10.506] | 152.766 [152.766, 152.766] | 0 / 124 of 124 | 0.168 [0.168, 0.168] / no |
| end-to-end / native / hello / 8 | 1600.584 [1600.584, 1600.584] | 4.115 [4.115, 4.115] | 26.400 [26.400, 26.400] | 253.422 [253.422, 253.422] | 0 / 651 of 651 | 0.342 [0.342, 0.342] / no |
| end-to-end / native / hello / 64 | 3265.383 [3265.383, 3265.383] | 16.757 [16.757, 16.757] | 48.966 [48.966, 48.966] | 285.703 [285.703, 285.703] | 0 / 1448 of 1448 | 0.421 [0.421, 0.421] / no |
| end-to-end / native / primes / 1 | 169.589 [169.589, 169.589] | 5.521 [5.521, 5.521] | 14.975 [14.975, 14.975] | 286.984 [286.984, 286.984] | 0 / 68 of 68 | 0.101 [0.101, 0.101] / no |
| end-to-end / native / primes / 8 | 203.887 [203.887, 203.887] | 38.922 [38.922, 38.922] | 49.932 [49.932, 49.932] | 275.188 [275.188, 275.188] | 0 / 85 of 85 | 0.081 [0.081, 0.081] / no |
| end-to-end / native / primes / 64 | 222.507 [222.507, 222.507] | 287.896 [287.896, 287.896] | 297.625 [297.625, 297.625] | 267.406 [267.406, 267.406] | 0 / 133 of 133 | 0.060 [0.060, 0.060] / no |

## Observed native proxy/topology cost

| Route / C | Δ median p50 ms | Δ median p99 ms | end-to-end/direct req/s | Client saturation suspected |
| --- | --- | --- | --- | --- |
| login / 1 | -2921.200 | -4476.843 | 1.269 | no |
| login-scrypt / 1 | -6.766 | -39.992 | 1.143 | no |
| verify / 1 | -1.084 | -7.959 | 2.305 | no |
| verify / 8 | -0.821 | 9.591 | 1.227 | no |
| verify / 64 | -4.510 | -34.813 | 1.446 | no |
| search / 1 | 1.594 | 6.025 | 0.824 | no |
| search / 8 | -8.465 | -77.694 | 1.796 | no |
| search / 64 | -237.597 | -212.844 | 2.134 | no |
| markdown / 1 | -153.850 | -156.959 | 4.684 | no |
| markdown / 8 | -60.999 | -110.850 | 1.333 | no |
| markdown / 64 | -1137.767 | -1154.212 | 1.584 | no |
| feed / 1 | 7.929 | 13.753 | 0.788 | no |
| feed / 8 | 17.601 | 22.705 | 0.934 | no |
| feed / 64 | -154.221 | -154.024 | 1.069 | no |
| hello / 1 | 1.095 | 5.023 | 0.482 | no |
| hello / 8 | 3.314 | 11.980 | 0.332 | no |
| hello / 64 | 12.546 | 37.371 | 0.236 | YES |
| primes / 1 | 0.233 | 7.753 | 0.928 | no |
| primes / 8 | -8.708 | -12.385 | 1.174 | no |
| primes / 64 | -27.200 | -45.137 | 1.129 | no |

## Event-loop isolation (each repetition)

| Runtime / window / repeat | Probe | Requests | p50 ms | p99 ms | Heavy completed |
| --- | --- | --- | --- | --- | --- |
| node / login / isolation-idle / 0 | / | 35 | 1.726 | 14.723 | none |
| node / login / isolation-idle / 0 | /api/hello | 35 | 2.281 | 12.345 | none |
| node / login / isolation-loaded / 0 | / | 10 | 68.596 | 91.446 | 11 |
| node / login / isolation-loaded / 0 | /api/hello | 10 | 68.948 | 91.860 | 11 |
| node / login-scrypt / isolation-idle / 0 | / | 36 | 1.132 | 5.450 | none |
| node / login-scrypt / isolation-idle / 0 | /api/hello | 36 | 1.465 | 4.064 | none |
| node / login-scrypt / isolation-loaded / 0 | / | 36 | 1.531 | 3.202 | 12 |
| node / login-scrypt / isolation-loaded / 0 | /api/hello | 36 | 2.010 | 4.461 | 12 |
| node / primes / isolation-idle / 0 | / | 35 | 1.345 | 10.917 | none |
| node / primes / isolation-idle / 0 | /api/hello | 35 | 1.833 | 5.409 | none |
| node / primes / isolation-loaded / 0 | / | 11 | 62.626 | 126.770 | 20 |
| node / primes / isolation-loaded / 0 | /api/hello | 11 | 62.854 | 126.388 | 20 |
| native / login / isolation-idle / 0 | / | 35 | 1.593 | 11.938 | none |
| native / login / isolation-idle / 0 | /api/hello | 35 | 2.005 | 15.824 | none |
| native / login / isolation-loaded / 0 | / | 35 | 1.771 | 4.737 | 1 |
| native / login / isolation-loaded / 0 | /api/hello | 35 | 2.214 | 6.338 | 1 |
| native / login-scrypt / isolation-idle / 0 | / | 36 | 1.337 | 7.359 | none |
| native / login-scrypt / isolation-idle / 0 | /api/hello | 36 | 1.724 | 5.726 | none |
| native / login-scrypt / isolation-loaded / 0 | / | 36 | 1.286 | 2.187 | 14 |
| native / login-scrypt / isolation-loaded / 0 | /api/hello | 36 | 1.689 | 2.903 | 14 |
| native / primes / isolation-idle / 0 | / | 36 | 1.571 | 6.976 | none |
| native / primes / isolation-idle / 0 | /api/hello | 36 | 2.027 | 5.062 | none |
| native / primes / isolation-loaded / 0 | / | 33 | 1.795 | 63.160 | 20 |
| native / primes / isolation-loaded / 0 | /api/hello | 33 | 1.904 | 33.021 | 20 |

## Synthetic threads: sharing ergonomics and overhead

| Variant / workers | Internal ms median [min,max] | Warmed total RSS MiB median [min,max] |
| --- | --- | --- |
| node-objects-clone / 1 | 2437.286 [2437.286, 2437.286] | 465.156 [465.156, 465.156] |
| node-objects-clone / 2 | 1244.135 [1244.135, 1244.135] | 732.906 [732.906, 732.906] |
| node-objects-clone / 4 | 791.361 [791.361, 791.361] | 1039.734 [1039.734, 1039.734] |
| node-sab / 1 | 1687.472 [1687.472, 1687.472] | 84.469 [84.469, 84.469] |
| node-sab / 2 | 1334.494 [1334.494, 1334.494] | 76.906 [76.906, 76.906] |
| node-sab / 4 | 447.510 [447.510, 447.510] | 98.828 [98.828, 98.828] |
| native-published-objects / 1 | 1110.520 [1110.520, 1110.520] | 82.750 [82.750, 82.750] |
| native-published-objects / 2 | 553.832 [553.832, 553.832] | 83.156 [83.156, 83.156] |
| native-published-objects / 4 | 298.577 [298.577, 298.577] | 83.813 [83.813, 83.813] |

Same-process net RSS growth from 1 to 4 warmed workers; not allocation size. See the threads definition.

| Variant | 1-worker RSS MiB | 4-worker RSS MiB | Marginal warmed RSS / added worker MiB |
| --- | --- | --- | --- |
| node-objects-clone | 465.156 | 1039.734 | 191.526 |
| node-sab | 84.469 | 98.828 | 4.786 |
| native-published-objects | 82.750 | 83.813 | 0.354 |

## Precise metric definitions

- **cold-start:** Monotonic wall time immediately before spawn to the first HTTP response with expected status and fully drained body. Fresh process each sample; readiness retries every 2 ms. Direct uses the exact generated .next/scriptc/entry-N.ts under Node 24 type stripping versus its compiled binary; no Next. End-to-end includes next start (Node) or the recorded native production command and the first execution of the specified route. OS filesystem caches are not flushed; this is process-cold, not machine-cold. Median averages the middle two values for even N; p90 uses nearest rank.
- **memory-idle:** RSS after first successful readiness request and the configured quiet interval. Includes initialization by that route, not an untouched process. Direct: route process. End-to-end: entire owned process tree, including Next, adapter supervisor, all native binaries and descendants. Linux uses the kernel's approximate stat RSS counter; macOS uses ps RSS. Totals sum resident mappings and may double-count shared OS/library pages; not PSS or unique physical memory.
- **cpu-fixed-count:** After untimed warmup, user+system CPU delta of the stable owned process tree over exactly N successful sequential keep-alive requests, divided by N. Linux /proc/PID/stat excludes child CPU fields to avoid double counting; Node worker threads are already in process totals. macOS ps TIME is rounded to centiseconds. The generator warms its own process and keep-alive agent before an IPC barrier; CPU snapshots bracket release through generator shutdown, excluding spawn/warmup. Boundary sampling and idle runtime CPU remain; generator CPU is excluded and reported separately. Each row carries before/after per-process CPU and RSS. N is per repetition, after prior warmup; RSS after N is not a fresh-process measurement.
- **throughput-latency:** Separate-process HTTP/1.1 keep-alive closed-loop generator with C outstanding requests, no pipelining; dispatch until duration expires, then drain all in-flight requests. Throughput = completed responses / actual dispatch-to-final-drain seconds. Latency = dispatch to fully drained body; nearest-rank p50/p99 within a run. No coordinated-omission correction; this measures closed-loop capacity, not an external arrival-rate SLA. Each sample warms the same generator process and agent at its C before the IPC start barrier. Socket creations and reused requests are counted separately for warmup and measurement; repeats retained independently, with median and min/max across runs.
- **peak-rss:** Largest sampled simultaneous sum of process-tree RSS, sampled every 100 ms plus the before/after boundaries. Sampler reads only the previously discovered tree (targeted ps on macOS, /proc on Linux); full discovery at both boundaries checks stable process membership. Each peak snapshot contains every process. This is a lower bound on peak RSS, not a kernel high-water mark. On a loaded host ps/scheduling can lengthen the interval.
- **hop-cost:** Native end-to-end minus native direct median p50/p99 at identical concurrency, input and affinity. Also report end-to-end/direct throughput ratio. This is an observed topology difference including Next routing/proxy/serialization/scheduling, not a pure network-hop stopwatch. The samples are separate runs; percentile differences are not percentiles of paired hop times and may be negative under noise.
- **isolation:** First warm heavy and probe endpoints. Baseline and loaded windows each dispatch one sequential probe per path, in parallel, waiting 20 ms after completion. Loaded window additionally holds one heavy request outstanding, back to back. Record probe p50/p99 and sample counts alongside completed heavy requests; equal offered concurrency, not equal achieved heavy RPS. Heavy load starts 100 ms before probes; drain is included. A synchronous Node handler may delay even accepting probes. Requests cannot be preempted at the deadline.
- **threads:** One million orders, 8 regions, 12 scenarios, 60 months; exact integer-cent totals compared across all variants/counts. Fresh process per variant, growing its retained pool through 1/2/4 workers. One readiness computation at 1 worker, then two full warmups at each count before repeated internal dispatch+compute+reduction timings. Counts run ascending and share JIT/GC history. Dataset/pool setup and HTTP excluded. RSS includes the dataset and all worker threads. Marginal warmed RSS/added worker = (median post-job RSS at 4 workers - median post-job RSS at 1 worker) / 3 within that SAME process. The instantaneous dataset-construction RSS is no longer the baseline; this measures net resident growth including GC/JIT/allocator history, not exact clone allocations. Negative values, if any, remain visible as GC/noise and do not mean negative worker allocation. SAB uses four hand-filled Int32 SharedArrayBuffers; object variants share the original route and worker source. Node object workers clone workerData; native publishes ordinary object graphs. No forced GC.
