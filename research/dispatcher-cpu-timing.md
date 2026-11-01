# Dispatcher CPU timing

2026-11-01. The contention hypothesis is supported, with one correction: M3 drains every shadow before the next workload call. Its repeated `setImmediate` drain keeps the main thread runnable while the owner thread executes. Concurrent workload JS is a separate production case, reproduced by the probe.

## Evidence before the fix

The original `m3-window2-phase1.json` records 15/24 strict and 14/24 construction promotion votes at 200k. Its decision JS/native medians are 102.905/85.242 ms and 105.163/76.422 ms. Fixed native CPU is about 30 ms. At 5k strict, only 11/24 pairs vote native, with decision medians 2.817/2.621 ms versus fixed JS/native CPU 2.141/1.401 ms. The raw artifact alone cannot assign elapsed time to contention; the following controlled probe changes only main-thread activity.

The probe rotates 20 retained samples per condition after three warmups at each size, using the strict addon on CPU 11 with `--cpus=1`. Timer draining sleeps 1 ms between checks; busy draining repeats `setImmediate`; the JS condition executes the same reference workload between checks. Every shadow result is byte checked. Native CPU includes owner execution, input conversion, worker handoff CPU, and result conversion.

| Events | Main-thread activity | Native CPU median | Native wall median | Concurrent JS CPU / wall per call |
| ---: | --- | ---: | ---: | ---: |
| 5000 | timer | 1.398 | 1.425 | n/a |
| 5000 | busy | 1.362 | 1.541 | n/a |
| 5000 | js | 1.371 | 1.478 | 2.403 / 2.442 |
| 200000 | timer | 29.799 | 30.505 | n/a |
| 200000 | busy | 29.902 | 59.310 | n/a |
| 200000 | js | 30.107 | 58.771 | 93.670 / 130.070 |

## Implementation

`runShadow` now returns `cpuMs` alongside `elapsedMs`. `CLOCK_THREAD_CPUTIME_ID` measures input conversion and result conversion on the caller, native execution on its permanent owner, and worker handoff CPU separately. Queue wait, preemption, and event-loop completion wait consume no measured service CPU. Ordinary synchronous and asynchronous addon return contracts are unchanged.

The addon exposes `threadCpuMs()` for the calling thread. The dispatcher uses it for JS reference execution and caller encoding and decoding, then adds the addon service CPU. CPU pairs require both clocks; invalid CPU durations are skipped rather than mixed with wall. Legacy addons and custom dispatchers without the CPU clock retain wall sampling. No shadow is launched from a JS sample taken while another shadow is pending. Wall pairs remain diagnostic and include caller encode/decode. Correctness checking and hashing stay outside the decision metric.

D1 retains 24 pairs, 19 required votes, a 0.90 promotion ratio, 1.05 demotion ratio, two cold exclusions, existing frequency limits, and one pending shadow. Thread CPU is a service-cost estimate, not a hosted billing measurement. It excludes V8 helper-thread CPU, scheduling bookkeeping outside these regions, and work attributable to later garbage collection. Mixed totals still use process CPU and include background drains.

## M3 rerun

The unchanged five-arm schedule uses 540 training calls per bucket and auto mode, 15 warmups and 60 retained calls per cell, then an actual 600-call 70/20/10 mix. The rolling 50/minute cap remains enabled. The busy drain is deliberately retained to reproduce M3 contention. Builds and tests finish before timing starts. The Linux arm64 Node 24 stand-in is pinned to CPU 11 with one CPU and 2 GiB memory. No existing container, scriptc source, Vercel deployment, root README, or Papermark measurement is changed.

All times below are milliseconds. Decision medians use the same upper median as dispatcher logging. Steady medians use M3 nearest-rank convention.

| Mode | Events | Chosen lane | Votes / 24 | Decision CPU JS / native | Steady CPU JS / native | Decision wall JS / native |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| new | 1000 | js-final | 0 | 0.577 / 1.028 | 0.475 / 0.838 | 0.585 / 1.181 |
| new | 5000 | native | 23 | 2.198 / 1.473 | 2.054 / 1.354 | 2.207 / 1.742 |
| new | 15000 | native | 24 | 6.349 / 2.990 | 6.462 / 2.955 | 6.354 / 5.719 |
| new | 200000 | native | 24 | 84.956 / 39.887 | 103.245 / 30.370 | 96.224 / 78.876 |
| construction | 1000 | native | 23 | 0.528 / 0.350 | 0.475 / 0.297 | 0.535 / 0.363 |
| construction | 5000 | native | 24 | 2.237 / 0.953 | 2.054 / 0.851 | 2.246 / 1.002 |
| construction | 15000 | native | 24 | 6.208 / 2.461 | 6.462 / 2.413 | 6.219 / 2.975 |
| construction | 200000 | native | 24 | 92.665 / 44.002 | 103.245 / 30.161 | 103.922 / 85.805 |

Each first decision occurs at call 520. Only partial later epochs are observed; this does not establish long-term stability. The native decision CPU/steady CPU ratios at 200k are new 1.31x, construction 1.46x. Compare the original wall ratios of approximately 2.87x strict and 2.53x construction. The remaining CPU gap is real measured service variation; removing contention does not make training and steady-state allocation or warmup costs identical.

| Events | Arm | CPU median / p95 | Wall median / p95 |
| ---: | --- | ---: | ---: |
| 1000 | js | 0.475 / 0.681 | 0.472 / 0.679 |
| 1000 | native-new | 0.838 / 1.255 | 0.836 / 1.253 |
| 1000 | auto-new | 0.465 / 0.731 | 0.463 / 0.727 |
| 1000 | native-construction | 0.297 / 0.433 | 0.295 / 0.429 |
| 1000 | auto-construction | 0.290 / 0.413 | 0.289 / 0.404 |
| 5000 | js | 2.054 / 2.324 | 2.052 / 2.318 |
| 5000 | native-new | 1.354 / 1.711 | 1.362 / 1.708 |
| 5000 | auto-new | 1.341 / 1.786 | 1.340 / 1.774 |
| 5000 | native-construction | 0.851 / 1.023 | 0.849 / 1.018 |
| 5000 | auto-construction | 0.848 / 1.035 | 0.851 / 1.088 |
| 15000 | js | 6.462 / 12.175 | 6.459 / 12.168 |
| 15000 | native-new | 2.955 / 3.567 | 2.952 / 3.562 |
| 15000 | auto-new | 2.898 / 4.304 | 2.895 / 4.299 |
| 15000 | native-construction | 2.413 / 2.852 | 2.410 / 2.848 |
| 15000 | auto-construction | 2.383 / 2.987 | 2.379 / 2.980 |
| 200000 | js | 103.245 / 127.218 | 103.233 / 127.811 |
| 200000 | native-new | 30.370 / 34.842 | 30.369 / 34.818 |
| 200000 | auto-new | 30.740 / 33.436 | 30.744 / 33.425 |
| 200000 | native-construction | 30.161 / 36.575 | 30.154 / 36.227 |
| 200000 | auto-construction | 30.133 / 33.632 | 30.221 / 33.623 |

| Arm | Caller CPU total | CPU including drains | Caller wall total | C1 inclusive CPU proxy [band] |
| --- | ---: | ---: | ---: | ---: |
| js | 6015.490 | 6016.333 | 6015.322 | 10781.663 [8908.888, 12654.438] |
| native-new | 2443.706 | 2444.495 | 2445.146 | 4705.064 [3887.794, 5522.334] |
| auto-new | 2236.121 | 2913.559 | 2236.448 | 5691.736 [4703.082, 6680.391] |
| native-construction | 2118.184 | 2118.950 | 2118.768 | 3943.145 [3258.220, 4628.069] |
| auto-construction | 2019.610 | 2043.525 | 2018.138 | 3810.196 [3148.365, 4472.027] |

Drain CPU includes all process CPU during post-call event-loop draining, including drains with no pending shadow. Strict auto records 677.438 ms of mixed drain CPU versus 23.915 ms for construction auto. The retained fields cannot attribute this difference to shadows, garbage collection, or drain bookkeeping; none is subtracted or filtered. This reproduces M3 accounting and is deliberately conservative.

## Exact M2 gate

Native upper bands must fall below JS lower bands from 5k up. Auto must choose the best fixed lane in every bucket and beat both fixed lanes on the actual mix beyond calibration error. C1 factors remain 1.792 compute and 2.260 boundary, with ±17.37% bands. Compute fractions come from the median instrumented compute/wall ratio, as in M3. Drain CPU receives the boundary factor. These are CPU-input hosted-wall proxies, not calibrated Active CPU savings or confidence intervals. Boundary gains need hosted confirmation.

| Mode | 5k | 15k | 200k | Best lane every bucket | Mix beats both beyond error |
| --- | --- | --- | --- | --- | --- |
| new | FAIL | PASS | PASS | PASS | FAIL |
| construction | PASS | PASS | PASS | PASS | FAIL |

Compound gate FAIL. Auto cannot demonstrate a mixed win beyond error merely by matching the best fixed lane. Construction remains opt-in. No policy thresholds were tuned.

Host one-minute load spans 6.14–9.68; this adds uncertainty to absolute timings. Dispatcher overhead is 0.000036 ms/call against the 0.005 ms budget. Returned byte checks: 9420; shadow byte checks: 220. Raw cgroup throttling counters are retained.

## Validation

All 72 full adapter tests pass with one test worker, including the actual compiled addon ABI test and fake CPU/wall contention tests. Both shim tests pass on Node 24, and all 24 standard demo tests pass. The first shim attempt used host Node 26 and stopped at its explicit Node 24 guard; its log is retained. Builds and tests did not overlap timing runs. No build commands ran concurrently.

## Reproduction and artifacts

Use the installed stock scriptc 0.4.6 compiler with `SCRIPTC_COMPILER=... M3_ARTIFACTS=research/phase1/raw/cpu-timing/artifacts.json node research/phase1/build-m3.mjs`. Builds run sequentially. Run `STANDIN_CPU=11 PHASE1_MEASURE=research/phase1/probe-cpu-timing.mjs research/standin/run.sh phase1 cpu-contention-probe`, finish the tests, then run `STANDIN_CPU=11 PHASE1_MEASURE=research/phase1/measure-m3.mjs research/standin/run.sh phase1 m3-cpu-timing`. Regenerate this report with `python3 research/phase1/analyze-cpu-timing.py`.

Raw artifacts: [probe](standin/raw/cpu-contention-probe-phase1.json), [M3 rerun](standin/raw/m3-cpu-timing-phase1.json), [host load](standin/raw/m3-cpu-timing-host-load.log), [container settings](standin/raw/m3-cpu-timing-container.json), and [build and test records](phase1/raw/cpu-timing/). The historical M3 artifact and report remain unchanged.

Disk free before work was about 19 GiB; before cleanup 18.49 GiB and after cleanup 19.28 GiB. Task build output and all three dependency symlinks were removed. Other host work can affect free space.
