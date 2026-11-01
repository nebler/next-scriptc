# W2 workerd timing after M3

2026-11-01. Architecture-specific results **need hosted confirmation**. Fixed-loop SIMD wasm beats V8 on the integer kernels in this local run. The strict floating-point kernel remains slower.

## Method

The recorded prepare → verify → measure sequence ran after M3 completed. Stock is scriptc 0.4.6. Fixed source is the requested `/Users/noah/code/scriptc-wt/wasm-counted-globals` worktree, branch `next-scriptc/wasm-counted-globals`, commit `b46987ce934ae7cda1ae3aea1969491d1d14537d`. No fork source or main checkout was changed. Zig 0.16.0 relinks retained IR with SIMD disabled or enabled, using stock ABI-47 WASI objects.

Variants are JS in workerd V8, stock scalar wasm, fixed-loop scalar wasm, and fixed-loop SIMD wasm. All use workerd 1.20261031.1 on the Apple M4 Pro arm64 host. This macOS harness has no affinity control, so the workerd processes are not pinned to a core or quota-limited. Four workers remain alive but requests run sequentially. Rotation uses 30 warmup requests per variant, followed by six rotating batches of 20 measured requests, n=120 per variant and kernel. No build or repository tests overlap the timing run. Other host work, including the existing validation container, continues untouched.

Reduction kernels repeat 768 elements 20,000 times; search scans the original 20,000×768 corpus. The 15 non-timed verification cases pass. All 3,000 timed and warmup response hashes agree within each kernel, including search at the full 20k size. There are no failed cases or filtered samples.

Wall is end-to-end local HTTP request latency, including the WASI bridge and serialization for wasm. CPU is cumulative workerd-process user+system CPU measured with macOS libproc over each 20-request batch. Its median and p95 describe six batch averages, not per-request CPU tails. Client fetch CPU is excluded. All units below are milliseconds per request.

## Measurements

| Kernel | Variant | Wall median | Wall p95 | CPU batch-average median | CPU batch-average p95 |
| --- | --- | ---: | ---: | ---: | ---: |
| imul | js | 10.142 | 11.941 | 9.537 | 10.606 |
| imul | scalar | 17.171 | 17.567 | 16.559 | 16.631 |
| imul | fixed | 8.150 | 8.871 | 7.604 | 7.799 |
| imul | simd | 4.545 | 4.970 | 4.096 | 4.133 |
| natural | js | 10.922 | 16.902 | 9.869 | 13.792 |
| natural | scalar | 114.597 | 147.727 | 111.443 | 127.549 |
| natural | fixed | 8.730 | 13.856 | 7.864 | 11.233 |
| natural | simd | 4.887 | 7.123 | 4.301 | 5.723 |
| float | js | 16.187 | 24.846 | 15.515 | 21.700 |
| float | scalar | 18.593 | 30.090 | 17.765 | 25.640 |
| float | fixed | 16.785 | 24.258 | 15.984 | 21.354 |
| float | simd | 16.747 | 22.802 | 15.943 | 20.810 |
| sum | js | 8.099 | 8.790 | 7.588 | 7.688 |
| sum | scalar | 17.927 | 27.381 | 17.290 | 18.056 |
| sum | fixed | 6.699 | 7.379 | 6.219 | 6.272 |
| sum | simd | 2.883 | 4.061 | 2.597 | 2.841 |
| search | js | 13.401 | 15.346 | 13.114 | 13.210 |
| search | scalar | 23.406 | 24.973 | 22.926 | 23.295 |
| search | fixed | 8.303 | 9.153 | 7.894 | 7.972 |
| search | simd | 4.616 | 5.139 | 4.192 | 4.443 |

## Does wasm beat V8?

| Kernel | Best wasm variant | Wall speedup vs JS | CPU speedup vs JS | Fixed SIMD beats V8 on both? |
| --- | --- | ---: | ---: | --- |
| imul | simd | 2.23× | 2.33× | yes |
| natural | simd | 2.24× | 2.29× | yes |
| float | simd | 0.97× | 0.97× | no |
| sum | simd | 2.81× | 2.92× | yes |
| search | simd | 2.90× | 3.13× | yes |

Stock versus fixed timings also include compiler-version and int8-patch differences. Fixed scalar versus fixed SIMD isolates target-feature selection. W2's same-version IR toggle remains the evidence for the loop-shape cause. Floating-point reduction still preserves ordered arithmetic, so enabling SIMD does not establish vectorized floating-point reduction. These local synthetic kernels do not establish app-level, x86-64, or Vercel CPU savings.

Host load averages at timing start: [7.63818359375, 7.41357421875, 7.56640625]; end: [8.97021484375, 7.810546875, 7.69921875]. These are host-wide observations, not isolation guarantees.

## Reproduction and artifacts

Set `W2_OUTPUT="$PWD/research/wasm-vectorization/timing-m3"` for each invocation of `node research/wasm-vectorization/measurement.mjs prepare`, then `verify`, then `measure`. The optional output directory keeps the original pending artifacts intact. Generate this report with `python3 research/wasm-vectorization/analyze-timing.py`.

[Raw timings and process CPU counters](wasm-vectorization/timing-m3/raw/workerd.json), [build records](wasm-vectorization/timing-m3/raw/builds.json), [artifact hashes](wasm-vectorization/timing-m3/raw/artifacts.json), [verification hashes](wasm-vectorization/timing-m3/raw/correctness.json), and [logs](wasm-vectorization/timing-m3/logs/) are retained. The existing source-CLI runtime-pack-resolution SC3003 outcomes remain in build records; fresh fixed IR is required and successfully relinked. No scriptc source changes, Vercel calls, or Papermark measurements occurred.

Disk free was approximately 18 GiB before work and 20.62 GiB after cleanup. The pre-cleanup reading was 19.55 GiB. Other host work also changes available space. Task-created build trees, caches, demo build output, and all three dependency symlinks were removed. See [cleanup record](phase1/raw/m3/disk-cleanup.json).
