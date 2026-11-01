# Phase 1 gate M3

2026-11-01. Stand-in results on Linux arm64, Node 24.22.2, stock scriptc 0.4.6. Boundary-driven gains **need hosted confirmation**.

## Method

Five arms rotate within each iteration: JS, strict native, strict auto, construction native, and construction auto. Both native result modes use D1 and E1. Construction uses `constructionResults:true` and default `catchFallback:true`; the retained build report confirms revenueCore is eligible and enabled. Arguments contain real event JSON. Each auto arm receives 540 calls per size, with 26 verified shadows required for its first decision at call 520. The rolling 50/minute cap remains active; the harness waits for capacity rather than changing the policy. Training, including asynchronous shadows, hashing and event-loop drains, is separate from steady-state results.

Each cell has 15 warmups and 60 measured calls. The actual mixed stream has 600 calls per arm, exactly 420/120/60 at 1k/5k/200k. Calls and arm order are paired. Every returned result and every shadow is checked byte for byte against JS, with SHA-256 retained. No timed samples are filtered.

The container uses `--cpus=1 --cpuset-cpus=11 --memory=2g`. The unrelated int8 validation container on CPUs 0-5 and all pre-existing containers are untouched. Host load is logged every two seconds. Absolute timings carry extra uncertainty from host load. C1 used CPU 0 and final one-minute loads 2.62-3.64 and 3.04-3.51; VM logical CPU 11 is not a guaranteed physical performance core.

CPU timers use process.cpuUsage and include the native owner thread. Caller CPU excludes byte verification. Separate post-call drain CPU captures background shadow work; mixed inclusive CPU adds that cost, including drain bookkeeping. Wall tables show caller latency, with drain wall retained separately.

A first attempt was stopped during training after inspection found that mixed totals omitted background recheck CPU. Its partial raw artifact and log remain as a method pilot; it contributes no final samples.

## Per-bucket measurements

Milliseconds, nearest-rank median and p95. CPU is caller CPU; mixed totals below also include shadow-drain CPU.

| Events | Arm | CPU median / p95 | Wall median / p95 | Lane |
| ---: | --- | ---: | ---: | --- |
| 1000 | js | 0.483 / 0.681 | 0.481 / 0.678 | js |
| 1000 | native-new | 0.822 / 1.249 | 0.820 / 1.246 | new |
| 1000 | auto-new | 0.491 / 0.645 | 0.488 / 0.642 | js |
| 1000 | native-construction | 0.306 / 0.419 | 0.304 / 0.415 | construction |
| 1000 | auto-construction | 0.303 / 0.422 | 0.300 / 0.417 | construction |
| 5000 | js | 2.141 / 2.269 | 2.140 / 2.266 | js |
| 5000 | native-new | 1.401 / 1.561 | 1.400 / 1.582 | new |
| 5000 | auto-new | 2.149 / 2.301 | 2.143 / 2.297 | js |
| 5000 | native-construction | 0.873 / 0.970 | 0.872 / 0.969 | construction |
| 5000 | auto-construction | 0.854 / 0.928 | 0.852 / 0.927 | construction |
| 15000 | js | 6.590 / 8.117 | 6.584 / 8.112 | js |
| 15000 | native-new | 3.012 / 3.283 | 3.009 / 3.276 | new |
| 15000 | auto-new | 2.915 / 3.236 | 2.912 / 3.229 | new |
| 15000 | native-construction | 2.447 / 2.804 | 2.444 / 2.799 | construction |
| 15000 | auto-construction | 2.374 / 2.540 | 2.372 / 2.537 | construction |
| 200000 | js | 101.537 / 124.085 | 101.527 / 124.069 | js |
| 200000 | native-new | 29.693 / 49.568 | 29.683 / 49.557 | new |
| 200000 | auto-new | 104.173 / 128.551 | 104.156 / 128.578 | js |
| 200000 | native-construction | 30.159 / 47.178 | 30.151 / 47.165 | construction |
| 200000 | auto-construction | 98.534 / 134.281 | 98.491 / 134.552 | js |

## C1 predictions

C1 does not identify hosted CPU. These are CPU-input hosted-wall proxies, not calibrated Active CPU or billing savings. Factors are 1.792 compute and 2.260 boundary for CPU input, and 1.791/2.254 for wall input. As in M2, the median instrumented compute/total-wall fraction allocates uninstrumented time proportionally. CPU stage allocation is an estimate. Auto uses the chosen lane. Bands are ±17.37%, the maximum C1 observed cell error, not confidence intervals. Extending the small-argument calibration to large event strings remains unvalidated.

| Events | Arm | CPU-input proxy [band] | Hosted wall prediction [band] |
| ---: | --- | ---: | ---: |
| 1000 | js | 0.866 [0.715, 1.016] | 0.861 [0.711, 1.010] |
| 1000 | native-new | 1.784 [1.474, 2.094] | 1.774 [1.466, 2.083] |
| 1000 | auto-new | 0.880 [0.727, 1.033] | 0.873 [0.721, 1.025] |
| 1000 | native-construction | 0.616 [0.509, 0.723] | 0.611 [0.505, 0.717] |
| 1000 | auto-construction | 0.610 [0.504, 0.716] | 0.603 [0.499, 0.708] |
| 5000 | js | 3.837 [3.170, 4.503] | 3.832 [3.166, 4.497] |
| 5000 | native-new | 2.845 [2.351, 3.340] | 2.838 [2.345, 3.331] |
| 5000 | auto-new | 3.851 [3.182, 4.520] | 3.839 [3.172, 4.505] |
| 5000 | native-construction | 1.658 [1.370, 1.946] | 1.654 [1.367, 1.942] |
| 5000 | auto-construction | 1.622 [1.340, 1.903] | 1.616 [1.335, 1.897] |
| 15000 | js | 11.809 [9.758, 13.861] | 11.792 [9.744, 13.840] |
| 15000 | native-new | 5.832 [4.819, 6.845] | 5.817 [4.807, 6.828] |
| 15000 | auto-new | 5.644 [4.664, 6.624] | 5.631 [4.653, 6.609] |
| 15000 | native-construction | 4.558 [3.766, 5.350] | 4.548 [3.758, 5.338] |
| 15000 | auto-construction | 4.422 [3.654, 5.190] | 4.414 [3.647, 5.181] |
| 200000 | js | 181.954 [150.349, 213.560] | 181.835 [150.250, 213.419] |
| 200000 | native-new | 55.088 [45.519, 64.657] | 55.019 [45.463, 64.576] |
| 200000 | auto-new | 186.678 [154.252, 219.104] | 186.543 [154.140, 218.945] |
| 200000 | native-construction | 55.701 [46.026, 65.376] | 55.638 [45.974, 65.302] |
| 200000 | auto-construction | 176.573 [145.902, 207.244] | 176.398 [145.757, 207.038] |

## Decisions and training

| Mode | Events | First lane | Call | Cumulative verified | Final lane | Flapped? |
| --- | ---: | --- | ---: | ---: | --- | --- |
| new | 1000 | js-final | 520 | 29 | js-final | no observed |
| new | 5000 | js-final | 520 | 27 | js-final | no observed |
| new | 15000 | native | 520 | 27 | native | no observed |
| new | 200000 | js-final | 520 | 27 | js-final | no observed |
| construction | 1000 | native | 520 | 29 | native | no observed |
| construction | 5000 | native | 520 | 27 | native | no observed |
| construction | 15000 | native | 520 | 27 | native | no observed |
| construction | 200000 | js-final | 520 | 27 | js-final | no observed |

| Events | Training CPU total | Training wall total |
| ---: | ---: | ---: |
| 1000 | 1054.501 | 1054.232 |
| 5000 | 3561.728 | 59202.178 |
| 15000 | 7648.941 | 7653.056 |
| 200000 | 131150.658 | 132144.260 |

Training totals include both auto arms. This short run observes the first decision and partial recheck epochs, not long-term stability.

## Mixed workload totals

| Arm | Caller CPU sum | Inclusive CPU sum | Caller wall sum | Inclusive CPU proxy [band] |
| --- | ---: | ---: | ---: | ---: |
| js | 6719.515 | 6720.348 | 6720.222 | 12043.253 [9951.340, 14135.167] |
| native-new | 2643.652 | 2644.624 | 2646.847 | 5078.454 [4196.327, 5960.581] |
| auto-new | 8291.104 | 8494.972 | 8296.096 | 15318.400 [12657.594, 17979.206] |
| native-construction | 2288.206 | 2289.074 | 2287.686 | 4258.968 [3519.185, 4998.751] |
| auto-construction | 6524.249 | 6829.542 | 6526.270 | 12426.191 [10267.762, 14584.621] |

Drain CPU is conservatively assigned the boundary factor because no CPU stage split exists for rechecks. Raw rows preserve it separately.

## Dispatcher overhead

A rotating constant-function probe uses 100 measured batches of 10,000 calls after 10 warmup batches. Direct median 0.000007 ms/call; dispatcher median 0.000045; difference 0.000038. The ≤0.005 ms budget passes. This measures ordinary JS routing; shadow work is separate.

## Exact M2 gate

A performance improvement must have native upper band below JS lower band. Auto must select the best fixed lane in every bucket and beat both fixed lanes on the actual mix beyond calibration error.

| Mode | 5k | 15k | 200k | Best fixed lane in every bucket | Mixed beats both fixed lanes beyond error |
| --- | --- | --- | --- | --- | --- |
| new | FAIL | PASS | PASS | FAIL | FAIL |
| construction | PASS | PASS | PASS | FAIL | FAIL |

The compound M2 gate FAILS. A hosted CPU gate remains unidentifiable. Construction remains opt-in. No thresholds were tuned from these measurements. At 200k, strict has 15/24 and construction 14/24 promotion votes, below the D1 19-vote requirement. Decision medians are JS/native 102.905/85.242 ms strict and 105.163/76.422 ms construction. These loaded-host service pairs fail confidence despite a lower native median. Only partial recheck epochs follow, so recovery is not demonstrated.

## Evidence and reproduction

`SCRIPTC_COMPILER=/absolute/stock/scriptc node research/phase1/build-m3.mjs`, then `STANDIN_CPU=11 PHASE1_MEASURE=research/phase1/measure-m3.mjs research/standin/run.sh phase1 m3-window2`. Generate this report with `python3 research/phase1/analyze-m3.py`. The historical M2 harness is unchanged.

Raw final rows, decisions, stages, shadows, quotas and throttling are in [m3-window2-phase1.json](standin/raw/m3-window2-phase1.json). [Host load](standin/raw/m3-window2-host-load.log), [container settings](standin/raw/m3-window2-container.json), and [build/test records](phase1/raw/m3/) are retained. All 69 full adapter tests, both shim tests, and the standard 24 demo tests pass. An initial overly broad demo command included separate integration scripts and failed during setup under dependency symlinks; its log is retained, followed by the passing package-script file set. No Vercel, scriptc source edit, or Papermark timing occurred. Setup caveat: the initial Phase1 build overlapped the two-worker adapter suite, so the two-build ceiling was not guaranteed during that interval. All measurements started after builds and tests finished.

Observed host one-minute load spans 7.10-8.07. Returned byte checks: 9420; shadow byte checks: 220.

Disk free was approximately 18 GiB before work and 20.62 GiB after cleanup. The pre-cleanup reading was 19.55 GiB. Other host work also changes available space. Task-created build trees, caches, demo build output, and all three dependency symlinks were removed. See [cleanup record](phase1/raw/m3/disk-cleanup.json).
