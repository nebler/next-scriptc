# Local Vercel stand-in calibration

2026-11-01. C1, branch `t3/standin-calibration`. The two-factor model is useful for coarse steering on this revenue workload. It is insufficient to accept small gains or predict Vercel Active CPU. The final fit has 6.44% mean absolute percentage error and 17.37% maximum cell error. Validation with each size held out has 7.51% mean absolute percentage error. Published performance claims still require hosted measurements.

## Method and environment

The harness creates only new `nsc-standin-*` containers and removes them on exit. Linux arm64 runs natively on this Apple M4 Pro host through Docker Desktop 4.39.0, Engine 28.0.1. All container tasks share `--cpus=1 --cpuset-cpus=0 --memory=2g --memory-swap=2g`. The cpuset pins a Linux VM logical CPU, not a known physical Apple performance core. Cgroup settings, kernel version, task affinity, and quota counters are retained with each window. There is no claim of an exclusive CPU.

Node is exactly 24.22.2, matching A2. The Debian bookworm slim image uses manifest digest `sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c`. Stock scriptc 0.4.6, stock runtime packs 0.4.6, ABI 47, Zig 0.16.0, and cached Node 24.22.1 C headers build both GNU targets with minimum glibc 2.34. Runtime glibc and OS differ from the hosted environment. [Artifacts](standin/raw/artifacts.json) and [runtime manifests](standin/raw/runtime-pack-arm64.json.gz) record hashes and versions. The serialized owner-thread shim is A1's unchanged C source. The addon is a rebuild from that recipe, not A2's identical binary bytes.

The Node baseline is the original async revenue function with types stripped at build time. Only the native library facade removes `async`. Arguments are `["2026-01-01","2026-01-31",size,false]`. Fixtures remain lazily cached. Each call parses events, filters dates, aggregates, sorts, and returns the complete result. The timed sidecar revenue dispatcher is A2's exact dispatcher, using the existing serveFunctions, createSidecar, callNative, and strict JSON code. Build flags are release, strip, and node-islands off. No application or compiler implementation changed.

Final windows **5 and 6** each retain 15 warmups and 60 measured calls per cell, with Node, sidecar, addon sync, and addon async rotated sequentially on every iteration. Sizes are 1k, 5k, 15k, and 200k. The same real sidecar and addon remain alive across sizes. After each bucket, a separate cached-result probe measures 15 warmups and 60 boundary calls per variant. The extra probe sidecar and addon are idle outside their turns and share the same quota. Final pooled n is **120 measured calls per cell**, plus 30 retained warmups, for both workload and boundary. No timed sample within these windows is filtered. There are 4,800 checked final calls including warmups and boundary probes.

Wall timers enclose the call, including await for async variants. `process.cpuUsage()` encloses the same operation and includes the native owner and libuv threads. Sidecar CPU adds nanoseconds of execution summed across `/proc/PID/task/TID/schedstat`. The before/after counter reads and SHA-256 hashing occur outside the wall timer. CPU snapshots add small measurement overhead, so CPU may slightly exceed wall time for tiny calls. Kernel task counters measure scheduled CPU, including system work charged to the task, not waiting time. The harness needs readable, active schedstat accounting. Cgroup throttling is retained, never removed from samples.

Every result is SHA-256 checked against the first Node warmup after timing. Analysis also asserts those hashes equal A2's recorded Node hashes. All 4,800 final results pass. The four complete-result hashes remain the ones listed in [A2](use-native-napi-vercel.md). Network access was limited to stock package and image downloads. No Vercel, Sandbox, push, or upstream operation was used.

## Compute and boundary estimates

The final native no-op parses the same four small arguments, looks up a cached **typed** result, runs the same strict validation and typed JSON encoding, and returns through A1's serialized shim. Sync and async probes include their usual copies and scheduling. The separate sidecar no-op parses the same request and returns a cached typed result through the full HTTP and strict encoding path. Each cache fills on its first warmup. Every response has the same bytes as the real workload.

Boundary is the median no-op time. Compute is median full time minus median boundary time, separately for CPU and wall. Node has no serialized interface, so its model boundary is zero. Its JSON.parse diagnostic remains in the raw boundary rows but is unused. This is an estimate, not an exact stage decomposition: cache lookup is extra boundary work, cache locality differs, and subtracting medians does not recover the distribution of paired compute times. Native argument parsing is classified as boundary here, while event JSON parsing is compute. Result encoding and strict validation are boundary. The result shape is nearly constant across event sizes, which is why the boundary medians change little.

The following table uses milliseconds and nearest-rank p50 and p95. Positive error means overprediction. Local medians pool both final windows. The hosted target is **nearest-rank p50 of the 60 measured rows per cell in `napi-vercel/raw/1-bench-SIZE.json`**, A2's final warm window. It excludes all i < 0 warmups and reproduces A2's published medians exactly. A2 measured **function wall time**, not CPU time. Its WAN request duration and batch Server-Timing are unused.

| Events | Mode | Local wall median / p95 | Local CPU median / p95 | Boundary wall / CPU median | Hosted wall median | Predicted wall | Error |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1000 | node | 0.461 / 0.567 | 0.464 / 0.624 | 0.000 / 0.000 | 0.852 | 0.826 | -3.0% |
| 1000 | sidecar | 1.006 / 1.717 | 1.011 / 1.719 | 0.809 / 0.811 | 2.388 | 2.177 | -8.9% |
| 1000 | sync | 0.822 / 0.972 | 0.818 / 0.960 | 0.682 / 0.678 | 1.703 | 1.789 | +5.1% |
| 1000 | async | 0.864 / 1.249 | 0.862 / 1.247 | 0.722 / 0.719 | 1.724 | 1.882 | +9.2% |
| 5000 | node | 2.155 / 2.974 | 2.158 / 2.975 | 0.000 / 0.000 | 3.809 | 3.859 | +1.3% |
| 5000 | sidecar | 1.661 / 2.919 | 1.663 / 2.923 | 0.875 / 0.876 | 3.607 | 3.380 | -6.3% |
| 5000 | sync | 1.378 / 1.567 | 1.376 / 1.571 | 0.713 / 0.704 | 2.774 | 2.798 | +0.8% |
| 5000 | async | 1.412 / 1.839 | 1.409 / 1.736 | 0.742 / 0.737 | 2.759 | 2.872 | +4.1% |
| 15000 | node | 6.264 / 7.066 | 6.251 / 7.076 | 0.000 / 0.000 | 11.344 | 11.216 | -1.1% |
| 15000 | sidecar | 3.165 / 3.817 | 3.167 / 3.822 | 0.847 / 0.849 | 6.698 | 6.059 | -9.5% |
| 15000 | sync | 2.709 / 3.331 | 2.702 / 3.334 | 0.708 / 0.701 | 5.573 | 5.178 | -7.1% |
| 15000 | async | 2.739 / 3.215 | 2.741 / 3.220 | 0.738 / 0.736 | 5.482 | 5.246 | -4.3% |
| 200000 | node | 104.385 / 108.359 | 104.101 / 107.806 | 0.000 / 0.000 | 171.508 | 186.911 | +9.0% |
| 200000 | sidecar | 37.745 / 42.976 | 37.694 / 42.896 | 0.719 / 0.720 | 57.868 | 67.919 | +17.4% |
| 200000 | sync | 26.936 / 29.634 | 26.838 / 27.998 | 0.683 / 0.679 | 52.887 | 48.548 | -8.2% |
| 200000 | async | 26.949 / 38.045 | 26.898 / 38.012 | 0.708 / 0.707 | 52.671 | 48.583 | -7.8% |


Explicit compute estimates, in milliseconds, are:

| Events | Mode | Compute wall | Compute CPU |
| ---: | --- | ---: | ---: |
| 1000 | node | 0.461 | 0.464 |
| 1000 | sidecar | 0.197 | 0.199 |
| 1000 | sync | 0.140 | 0.140 |
| 1000 | async | 0.142 | 0.143 |
| 5000 | node | 2.155 | 2.158 |
| 5000 | sidecar | 0.786 | 0.787 |
| 5000 | sync | 0.665 | 0.672 |
| 5000 | async | 0.669 | 0.672 |
| 15000 | node | 6.264 | 6.251 |
| 15000 | sidecar | 2.317 | 2.318 |
| 15000 | sync | 2.000 | 2.001 |
| 15000 | async | 2.001 | 2.005 |
| 200000 | node | 104.385 | 104.101 |
| 200000 | sidecar | 37.026 | 36.973 |
| 200000 | sync | 26.252 | 26.159 |
| 200000 | async | 26.241 | 26.191 |

## Factors and fit quality

Fit `predicted hosted wall = compute × f_compute + boundary × f_boundary`, without an intercept. Ordinary least squares on rows divided by their hosted median minimizes squared **relative** error, giving small and large cells equal influence. All fitted coefficients are positive without constraints. These choices prevent 200k Node from dominating the fit.

| Input measurement | Compute factor, conditional 95% CI | Boundary factor, conditional 95% CI | Mean absolute error | Maximum error | Held-out-size mean absolute error |
| --- | --- | --- | ---: | ---: | ---: |
| Local wall → hosted wall | 1.791 [1.782–1.800] | 2.254 [2.225–2.280] | 6.44% | 17.37% | 7.51% |
| Local CPU → hosted wall proxy | 1.792 [1.784–1.802] | 2.260 [2.229–2.287] | 6.32% | 17.27% | 7.37% |

Uncertainty uses 2,000 independent sample bootstraps, seed 20261101, resampling all 120 local workload samples, 120 local boundary samples, and 60 hosted samples in each cell before recomputing medians and fitting. These are **conditional sample confidence intervals**, not deployment prediction intervals. They ignore serial correlation, common-mode placement, shared sync/async runtime effects, and uncertainty in the boundary definition. Only two final local windows and one primary hosted placement exist. The tight intervals do not justify equally precise future predictions.

Separate local windows give factor pairs [1.7939766212195771, 2.2371367490508867] and [1.7780425035491811, 2.2642541771328104]. Using A2's earlier retained warm window instead gives [1.5763569381074256, 1.8229200289121117], substantially outside the conditional CIs. That placement sensitivity is more useful than the bootstrap for anticipating future error. Unweighted absolute least squares gives [1.6555243335845622, 3.6217239160202555]; the boundary estimate is sensitive to loss weighting.

A three-factor alternative gives separate Node and native compute factors plus a shared boundary factor. Its wall factors are 1.760, 1.824, 2.234. In-sample mean absolute error is 6.21%, maximum error 19.46%, and held-out-size mean absolute error 7.63%. Its extra coefficient gives little improvement and slightly worse held-out validation. The two-factor model is the simpler steering rule, but residuals at 200k sidecar and mid-size addons show it is not a uniform scaling law. There is too little independent hosted evidence to select a more elaborate model reliably. [Analysis JSON](standin/raw/analysis.json) retains every cell error for both alternatives and both input metrics.

## CPU metric and prediction limits

For the prescribed 70% 1k, 20% 5k, 10% 200k mix, the weighted sum of bucket medians is:

| Mode | Local CPU ms | Local wall ms | CPU-input hosted-wall proxy ms | Observed A2 wall ms |
| --- | ---: | ---: | ---: | ---: |
| node | 11.166 | 11.192 | 20.005 | 18.509 |
| sidecar | 4.810 | 4.811 | 8.998 | 8.180 |
| sync | 3.532 | 3.545 | 6.647 | 7.035 |
| async | 3.575 | 3.582 | 6.742 | 7.025 |

These are weighted medians, not a measured median of a mixed request stream. The CPU-input model predicts hosted **wall** from local CPU. A2 contains no hosted CPU observations, so C1 cannot identify Vercel Active CPU factors or verify the plan's primary predicted-CPU metric. Treat the CPU-input output as a labeled proxy until a hosted checkpoint records process CPU and child CPU. Never describe it as calibrated billing savings.

For future tasks, report raw CPU and wall median and p95 per bucket, then this proxy separately. A predicted gain below roughly 20% is within the observed worst cell error and placement variation. Even a larger gain requires consistent raw CPU reductions, identical hashes, and relevant tests before it is useful steering evidence. Boundary changes and architecture-specific changes always need hosted confirmation. Predictions apply to this cached-fixture revenue workload, not arbitrary real-data argument sizes, cold start, concurrency, throughput, fleet tails, or held-out Papermark. Recalibrate at the start of every hosted checkpoint.

## Retained attempts, host load, and correctness

Windows 1 and 2 used a combined echo/revenue sidecar with an `any`-typed cached value. That could change result encoding, so these are retained as methodologically unsuitable pilots, not pooled with the final experiment. Their raw samples, original build/artifact records, and pilot tables preserve the losses. Windows 3 and 4 restored A2's dispatcher but used the original byte echo, which omitted native validation and result encoding, and restarted the real sidecar between buckets. They remain intermediate probe evidence. Windows 5 and 6 use the full typed encoding no-op and persistent runtimes. The method changed for correctness of measurement, never because a timing sample was slow. No individual outlier was removed.

A local attempt to import NumPy failed because it was not installed. Analysis uses Python's standard library instead. The initial image and runtime-pack downloads succeeded. Builds, downloads, and repository tests did not overlap timed windows. The workstation was busy with existing UI, browser, audio, and VM processes and another agent's light work. No existing process or container was changed. Host uptime/load and the highest-CPU process names are retained every two seconds for every window. The one-minute host load range was 4.60–4.71 in window 1 and 4.50–4.70 in window 2; subsequent repeats preserve the measurements rather than excluding them. Final windows 5 and 6 ranged 2.62–3.64 and 3.04–3.51 respectively. No abrupt load spike appeared in either final window. Short transient contention between snapshots remains possible. All timing tails and cgroup throttle deltas are retained.

The amd64 container loaded the rebuilt linux-x64 GNU addon under emulation on Node 24.22.2. Node, sync, and async each passed 15 warmups plus 3 calls at all four sizes, **216 identical results**. The x64 artifact hash is unchanged across later probe-only build changes. The correctness record contains hashes only; emulated timings are never analyzed. This verifies loading and deterministic output, not x64 speed or Vercel compatibility in every environment.

`pnpm test` passed all 47 tests (23 adapter unit tests and 24 demo tests). Shell and JavaScript syntax checks pass. These changes add research tools only. No scriptc compiler change requires a native compiler gate.

The harness command and prerequisites are in [standin/README.md](standin/README.md). Generated build outputs and downloaded pack copies are removed from this worktree after calibration; npm's existing cache can supply the next build. All new containers are removed. The retained `nsc-standin:node24` image is about 81 MB by Docker's size field, under 1.5 GB. Existing Docker containers and images are untouched. Disk free after cleanup is recorded in `standin/raw/cleanup.log`.
