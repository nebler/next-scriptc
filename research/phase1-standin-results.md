# Phase 1 stand-in results (M2)

2026-11-01. Local measurements only. The compound Phase 1 gate fails. Raw UTF-8 improves this real-argument workload, but auto does not reliably choose the best fixed lane in every bucket. Boundary gains **need hosted confirmation**.

## Workload and method

The unchanged P1 `revenueCore(from,to,eventsJson)` receives generated event JSON as an actual string argument. Fixture generation and SHA-256 validation are outside timed calls. There is no A2 internal fixture cache. Input bytes are 1000: 73784, 5000: 368918, 15000: 1106753, 200000: 14756712.

Merge source is `t3/per-type-boundary-encodings` at 3d514ac, including the automatic-promotion prototype. The only merge conflict was the hill log; both histories were preserved. Stock scriptc and runtime 0.4.6, ABI 47, Zig 0.16.0, Linux arm64 GNU 2.34, Node 24.22.2, one CPU pinned to VM CPU 0, and 2 GiB match the calibrated stand-in. The pin does not guarantee a physical Apple performance core.

The old lane reconstructs P1's boundary: serialize `[from,to,eventsJson]` as one strict JSON string, copy it, parse the tuple in native code, call the unchanged core, strictly serialize its object result, copy back, and JSON.parse in JS. A one-tuple wrapper lets the current shim build that exact all-JSON wire contract. Thus this isolates encoding and uses the same current owner-thread shim on both lanes; it is not the historical P1 addon binary. The wrapper adds a trivial call. The new lane passes three raw UTF-8 strings and keeps JSON for the object result.

Each of three windows discards 15 warmups and measures 60 calls per size and mode with rotated order. Pooled n=180 per cell. A separate 600-call stream per mode per window uses exactly 420 at 1k, 120 at 5k, and 60 at 200k, interleaved in a repeated 70/20/10 sequence. Mixed totals are actual sums. They exclude learning and warmups. No samples are filtered.

Auto uses the prototype defaults. Each bucket receives 120 training calls, draining asynchronous shadows between calls. Five shadows at calls 20,40,60,80,100 decide its lane. All training rows and total CPU including shadows are retained. This is a sequential warm-instance experiment, not a concurrent production arrival-rate test.

CPU encloses each invocation with process.cpuUsage and includes the native owner thread and all Node threads. Wall encloses the same synchronous call. Seven-stage diagnostics use separate instrumented builds, 15 discarded warmups and 60 measured calls per cell per window. Instrumented totals never enter the primary tables. Stage clocks measure elapsed time, not CPU.

## Local CPU and wall

Cells are nearest-rank median / p95 milliseconds. All cells have n=180.

| Events | Mode | CPU median / p95 | Wall median / p95 |
| ---: | --- | ---: | ---: |
| 1000 | js | 0.452 / 0.503 | 0.451 / 0.502 |
| 1000 | old | 1.200 / 1.431 | 1.328 / 1.682 |
| 1000 | new | 0.922 / 1.143 | 1.049 / 1.299 |
| 1000 | auto | 0.512 / 0.634 | 0.636 / 0.819 |
| 5000 | js | 2.077 / 2.327 | 2.076 / 2.323 |
| 5000 | old | 2.991 / 3.266 | 3.119 / 3.420 |
| 5000 | new | 1.524 / 1.778 | 1.661 / 1.971 |
| 5000 | auto | 2.119 / 2.321 | 2.244 / 2.477 |
| 15000 | js | 6.087 / 7.198 | 6.084 / 7.195 |
| 15000 | old | 7.099 / 7.622 | 7.240 / 7.864 |
| 15000 | new | 2.995 / 3.426 | 3.123 / 3.632 |
| 15000 | auto | 3.019 / 6.324 | 3.159 / 6.519 |
| 200000 | js | 96.110 / 123.095 | 96.724 / 123.087 |
| 200000 | old | 89.159 / 96.092 | 89.581 / 96.280 |
| 200000 | new | 30.057 / 31.828 | 30.323 / 32.654 |
| 200000 | auto | 29.857 / 30.886 | 30.083 / 31.447 |

## Predicted hosted wall and CPU-input proxy

Apply compute × 1.79 + boundary × 2.25. The seven stages define compute as the original core, including event JSON.parse. All other stages and unassigned end-to-end overhead are boundary. For each cell, estimate the compute fraction as the median of instrumented compute / total wall; apply that fraction to the uninstrumented total. This proportional CPU allocation is an estimate because there are no per-stage CPU counters. Scheduling and throttling can distort it. JS has no boundary. Auto uses its actual lane in each window. Window predictions are averaged.

Bands are ±17.37%, the calibration maximum observed cell error; mean absolute fit error was 6.44%. These are sensitivity bands, not confidence or prediction intervals. The calibration came from A2 with tiny arguments and hosted wall observations. Extending it to large real arguments is unvalidated. The CPU-input column predicts hosted wall from local CPU; it does not identify hosted Active CPU or billing savings.

| Events | Mode | CPU-input hosted-wall proxy [band], ms | Predicted hosted wall [band], ms |
| ---: | --- | ---: | ---: |
| 1000 | js | 0.811 [0.670, 0.952] | 0.810 [0.669, 0.951] |
| 1000 | old | 2.651 [2.190, 3.111] | 2.931 [2.422, 3.441] |
| 1000 | new | 2.022 [1.671, 2.374] | 2.299 [1.899, 2.698] |
| 1000 | auto | 0.919 [0.759, 1.078] | 1.140 [0.942, 1.338] |
| 5000 | js | 3.714 [3.069, 4.359] | 3.713 [3.068, 4.357] |
| 5000 | old | 6.361 [5.256, 7.466] | 6.639 [5.486, 7.793] |
| 5000 | new | 3.155 [2.607, 3.703] | 3.436 [2.839, 4.033] |
| 5000 | auto | 3.608 [2.981, 4.234] | 3.843 [3.175, 4.510] |
| 15000 | js | 10.896 [9.004, 12.789] | 10.893 [9.001, 12.786] |
| 15000 | old | 15.059 [12.443, 17.675] | 15.356 [12.688, 18.023] |
| 15000 | new | 5.873 [4.853, 6.893] | 6.128 [5.063, 7.192] |
| 15000 | auto | 7.521 [6.215, 8.828] | 7.778 [6.427, 9.129] |
| 200000 | js | 169.033 [139.672, 198.394] | 171.348 [141.585, 201.111] |
| 200000 | old | 188.173 [155.487, 220.858] | 189.134 [156.281, 221.987] |
| 200000 | new | 55.655 [45.988, 65.323] | 56.107 [46.361, 65.853] |
| 200000 | auto | 55.193 [45.606, 64.780] | 55.647 [45.981, 65.313] |

## Seven elapsed stages

Medians in ms, n=180 per cell. Residual is the median per-call end-to-end time minus the sum of its seven stages; sums of medians need not equal the median total.

| Events | Lane | JS encode | Input copy | Native decode | Compute | Native encode | Copy back | JS decode | Residual | Instrumented total |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1000 | old | 0.153 | 0.012 | 0.124 | 0.142 | 0.583 | 0.003 | 0.065 | 0.211 | 1.298 |
| 1000 | new | 0.001 | 0.011 | 0.004 | 0.143 | 0.584 | 0.004 | 0.065 | 0.213 | 1.029 |
| 5000 | old | 0.795 | 0.062 | 0.619 | 0.636 | 0.579 | 0.003 | 0.066 | 0.223 | 2.986 |
| 5000 | new | 0.001 | 0.053 | 0.016 | 0.651 | 0.578 | 0.004 | 0.067 | 0.219 | 1.600 |
| 15000 | old | 2.307 | 0.187 | 1.853 | 1.890 | 0.606 | 0.004 | 0.071 | 0.279 | 7.209 |
| 15000 | new | 0.002 | 0.160 | 0.047 | 1.894 | 0.590 | 0.005 | 0.068 | 0.231 | 3.015 |
| 200000 | old | 31.448 | 2.556 | 28.671 | 25.757 | 0.672 | 0.008 | 0.089 | 0.499 | 89.508 |
| 200000 | new | 0.004 | 2.177 | 0.640 | 25.672 | 0.639 | 0.008 | 0.081 | 0.365 | 29.600 |

## Mixed totals

Each row is an observed 600-call stream, not a weighted sum of medians. Each predicted total receives the same ±17.37% sensitivity band.

| Window | Mode | Local CPU total, ms | Local wall total, ms | CPU-input proxy [band], ms | Predicted wall [band], ms |
| ---: | --- | ---: | ---: | ---: | ---: |
| 1 | js | 6372.759 | 6383.348 | 11407.239 [9425.801, 13388.676] | 11426.193 [9441.463, 13410.923] |
| 1 | old | 6266.452 | 6352.366 | 13328.878 [11013.652, 15644.104] | 13516.094 [11168.348, 15863.839] |
| 1 | new | 2405.181 | 2496.297 | 4625.963 [3822.433, 5429.493] | 4817.806 [3980.953, 5654.659] |
| 1 | auto | 2203.082 | 2282.561 | 4103.348 [3390.597, 4816.100] | 4250.434 [3512.134, 4988.734] |
| 2 | js | 6313.446 | 6337.769 | 11301.068 [9338.073, 13264.064] | 11344.606 [9374.048, 13315.164] |
| 2 | old | 6408.921 | 6516.126 | 13630.479 [11262.865, 15998.093] | 13862.913 [11454.925, 16270.901] |
| 2 | new | 2404.086 | 2510.113 | 4625.843 [3822.334, 5429.352] | 4846.700 [4004.828, 5688.571] |
| 2 | auto | 2274.303 | 2363.104 | 4180.595 [3454.425, 4906.764] | 4340.516 [3586.568, 5094.464] |
| 3 | js | 6397.405 | 6415.741 | 11451.355 [9462.255, 13440.455] | 11484.176 [9489.375, 13478.978] |
| 3 | old | 6370.206 | 6467.716 | 13548.086 [11194.784, 15901.389] | 13760.137 [11370.001, 16150.273] |
| 3 | new | 2394.468 | 2493.998 | 4608.442 [3807.956, 5408.928] | 4817.207 [3980.459, 5653.956] |
| 3 | auto | 2284.527 | 2380.073 | 4198.971 [3469.609, 4928.332] | 4371.072 [3611.817, 5130.328] |

## Dispatcher decisions

| Window | Bucket | State | Decision call | Verified shadows | JS decision median, ms | Async native decision median, ms |
| ---: | ---: | --- | ---: | ---: | ---: | ---: |
| 1 | 16 | js-final | 100 | 5 | 0.467 | 3.493 |
| 1 | 18 | native | 100 | 5 | 2.152 | 1.769 |
| 1 | 20 | js-final | 100 | 5 | 6.362 | 5.858 |
| 1 | 23 | native | 100 | 5 | 94.157 | 59.726 |
| 2 | 16 | js-final | 100 | 5 | 0.465 | 3.367 |
| 2 | 18 | js-final | 100 | 5 | 2.118 | 1.959 |
| 2 | 20 | native | 100 | 5 | 6.259 | 3.429 |
| 2 | 23 | native | 100 | 5 | 95.375 | 60.703 |
| 3 | 16 | js-final | 100 | 5 | 0.463 | 4.011 |
| 3 | 18 | js-final | 100 | 5 | 2.133 | 2.356 |
| 3 | 20 | native | 100 | 5 | 6.194 | 5.054 |
| 3 | 23 | native | 100 | 5 | 96.851 | 57.704 |

No policy thresholds were tuned. Buckets are 16,18,20,23 for 1k,5k,15k,200k. Training CPU includes SHA validation and event-loop drains, so it is an inclusive learning cost, not isolated shadow CPU.

| Window | Size | Inclusive 120-call training CPU, ms | Inclusive training wall, ms |
| ---: | ---: | ---: | ---: |
| 1 | 1000 | 112.718 | 129.212 |
| 1 | 5000 | 281.998 | 297.435 |
| 1 | 15000 | 827.330 | 846.124 |
| 1 | 200000 | 11118.586 | 11150.954 |
| 2 | 1000 | 111.317 | 125.604 |
| 2 | 5000 | 297.151 | 313.162 |
| 2 | 15000 | 736.559 | 753.120 |
| 2 | 200000 | 11583.912 | 11628.562 |
| 3 | 1000 | 118.737 | 135.128 |
| 3 | 5000 | 306.472 | 324.484 |
| 3 | 15000 | 748.118 | 770.717 |
| 3 | 200000 | 11696.310 | 11760.887 |

## Gate and interpretation

Use disjoint worst-fit bands as the conservative criterion: new upper bound must be below JS lower bound. This is stricter than merely exceeding a 17.37% central reduction.

| Events | New CPU-proxy central reduction vs JS | Disjoint bands? |
| ---: | ---: | --- |
| 1000 | -149.4% | no |
| 5000 | 15.1% | no |
| 15000 | 46.1% | yes |
| 200000 | 67.1% | yes |

The full gate requires all sizes from 5k upward to beat JS beyond calibration error, auto to match the best fixed choice in every bucket, and auto to beat both fixed choices on the mix. Passing one condition does not establish the others. A hosted CPU gate remains unidentifiable with the current calibration.

## Evidence, failures, and cleanup

The initial build failed because dependencies were absent. `pnpm install --offline --frozen-lockfile` restored dependencies; the retry built all four addons. The failed build log is retained. An initial report-generator syntax check caught invalid quoting; it was corrected before analysis. Automatic approval review rejected the initial rm-style cleanup command. A replacement enumerated only generated files inside this worktree, checked path containment, and removed those files individually. No compiler source checkout was modified. Window 1 checks every returned answer by SHA-256; its 20 shadows use the dispatcher's exact canonical-byte comparison. Windows 2 and 3 additionally hash all 40 shadow results outside the shadow decision timer. The current harness uses the same dispatcher and addon wiring as loadPromotion. This verification-only change is recorded; no timing sample is dropped.

Raw training, warmups, measured rows, stages, decisions, hashes, CPU quotas, throttle counters, and artifact hashes are retained in [phase1/raw](phase1/raw) and [standin/raw](standin/raw). Reproduce builds with `SCRIPTC_COMPILER=/absolute/stock/scriptc node research/phase1/build.mjs`, then run `research/standin/run.sh phase1 fresh-window`. Regenerate tables with `python3 research/phase1/analyze.py`. The analysis explicitly selects windows 1, 2, and 3.

No Vercel, Sandbox, push, issue, or PR operation was used. Only newly created nsc-standin containers were removed. Generated artifacts are removed after validation.

Root `pnpm test` passes all 38 package tests and 24 demo tests. Shell and JavaScript syntax checks pass. This task changes research tools only; no compiler implementation changed.

## Window stability and validation

| Window | Host one-minute load min / max | Returned SHA checks | Shadow SHA checks |
| ---: | ---: | ---: | ---: |
| 1 | 2.92 / 8.81 | 4680 | 0 |
| 2 | 3.82 / 5.49 | 4680 | 20 |
| 3 | 4.19 / 4.83 | 4680 | 20 |

Window 1 load spiked from about 3 to 8.81. Window 2 repeated the experiment as load declined, then rose near its end. Window 3 is another repeat. Every window and every loss remains in the pooled results. No process or unrelated container was stopped. There is no claim of an idle host.

| Window | Events | JS CPU median | Old CPU median | New CPU median | Auto CPU median |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1000 | 0.451 | 1.222 | 0.935 | 0.518 |
| 1 | 5000 | 2.074 | 3.067 | 1.521 | 1.516 |
| 1 | 15000 | 6.046 | 7.149 | 2.999 | 6.117 |
| 1 | 200000 | 92.405 | 87.811 | 30.109 | 29.762 |
| 2 | 1000 | 0.449 | 1.197 | 0.919 | 0.505 |
| 2 | 5000 | 2.063 | 2.911 | 1.524 | 2.126 |
| 2 | 15000 | 6.071 | 7.121 | 2.991 | 2.959 |
| 2 | 200000 | 96.638 | 89.531 | 30.107 | 29.920 |
| 3 | 1000 | 0.459 | 1.196 | 0.922 | 0.517 |
| 3 | 5000 | 2.088 | 2.889 | 1.543 | 2.173 |
| 3 | 15000 | 6.145 | 6.947 | 2.995 | 2.964 |
| 3 | 200000 | 94.253 | 89.237 | 29.994 | 29.779 |

The input escaping and native outer-JSON decode explain almost all of the old-to-new savings. At 200k, these two stages shrink by about 59 ms while core compute stays near 26 ms. At 1k, roughly 0.58 ms of native result validation and encoding remains, exceeding the JS core alone. At 5k, removing argument escaping helps locally but leaves too little predicted gain to clear the calibration error.

Auto makes zero native answers at 1k in every window. Its settled caller overhead is visible in the main table and is not erased. At 5k or 15k, five async samples can reject a lane that wins with synchronous native calls. The decision timer includes libuv and event-loop scheduling; this mechanism can explain the conservative decisions, but the experiment does not isolate a single cause.

Auto mixed CPU totals beat fixed JS and fixed native in the retained windows. The extra win over fixed new native is small relative to the calibration bands, so it does not count as an established improvement under hill-plan.md. The per-bucket requirement also fails. Keep the encoding implementation and measurement tools, but reject a Phase 1 performance pass.

Instrumented and uninstrumented medians differ due to instrumentation, run order, and allocation state. Diagnostics do not identify a causal instrumentation penalty; they provide a stage allocation estimate. No negative overhead is subtracted. The calibration band does not account for this additional model uncertainty.
