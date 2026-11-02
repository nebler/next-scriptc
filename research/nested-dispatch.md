# Nested dispatch and fair shadow admission

D3, 2026-11-02. Internal calls between accepted candidates now use raw JavaScript companions. Entry calls from application code retain dispatch. The revenue stand-in passes the amended gate in strict and opt-in construction modes. Papermark remains held out. No Papermark code is executed or profiled for D3.

## Internal calls and settled JavaScript

The shared loader parses the original module once and rewrites references by lexical binding inside each candidate's raw body. Local candidates, referenced private candidates, callbacks, expression arrows, and named recursive function expressions use raw companions. Shadowed local names retain their original binding. A private companion stays private. Exported candidates retain their public wrapper and receive a generated companion export for linking.

Discovery records resolved import targets before native closure lowering. Linked calls use the accepted target's companion, including aliases through re-export modules. Canonical paths match candidates across filesystem symlinks. Vite passes the complete accepted module map to the shared loader; Next already does so. A rejected target keeps its ordinary JS binding. Raw JS keeps the original parameter patterns and defaults. Native closures and their boundary checks are unchanged.

The wrapper passes a stable raw function instead of allocating a fallback closure on every entry. In the dispatcher, `js-final` checks its bucket and recheck deadline before logging, clocks, encoding, native checks, or sampling. Bucket lookup still needs input size. A single scalar argument has constant bucket zero and avoids the size loop and logarithm. Call counts remain exact. Periodic rechecks can change the lane.

## Shadow policy

Each function-bucket has its own pending-shadow slot. CPU-clock addons can capture an outer JS reference while a different bucket has a pending native job. The calling thread's CPU clock excludes the other owner thread's CPU. Legacy wall-clock sampling retains D2's exclusion while any shadow is pending.

Admission uses one rolling 50-launch quota per dispatcher across all functions and buckets. Among active buckets, a requester can launch only when its service count is at the minimum. A new participant starts at the current minimum. A bucket retains its service count across dormant periods. Requesters dormant for 60 seconds leave the active set so unused allocations do not block work indefinitely. Admission is checked after the JS answer is computed and before encoding or enqueueing a shadow. Each bucket can enqueue at most one job. A late arrival can wait for previously spent rolling tokens to expire. This is admission fairness for repeatedly requested eligible buckets, not a latency guarantee for arbitrary arrivals.

Learning starts at `20 + hash(id, bucket) % 20` calls. Later learning gaps are 20 to 26 calls. Rechecks use 200 to 399 calls. Identity, bucket, and verification count determine the offsets. Denied attempts advance their deadline too, avoiding a clock and quota check on every subsequent settled-JS call. Overrides retain their minimum configured frequencies.

The decision rule is unchanged: two cold exclusions, 24 valid pairs per disjoint epoch, 19 votes, a 0.90 promotion ratio, and a 1.05 demotion ratio. CPU pairs still require valid caller and native CPU clocks. Mismatch, fallback-rate, panic, and boundary fallback rules remain in force.

There is no new tiny-function exclusion. A scalar-looking body can call expensive helpers or do expensive work for rare inputs. The existing work screen already rejects unforced functions without loops, recursion, callbacks, or JSON parsing. Adding a static cost threshold would need a cost model that this change does not establish. The development fixture deliberately forces its tiny scalar helper through that existing screen.

## Development fixture and measurement

[Fixture](../examples/demo/lib/nested-aggregation.ts) parses a JSON array and aggregates two scalar-helper calls per record. Both functions compile with stock scriptc 0.4.6. The before lane uses the committed loader and dispatcher from `79fce825ba186780ed3890809179672fa577aee4`. OFF runs the original source. After runs generated D3 wrappers. There are 700 training requests and 100 subsequent requests per lane at 600, 6,000, and 60,000 records. Each size gets fresh dispatchers. Arm order reverses each request. Every result matches OFF. Shadows drain with 1 ms timer sleeps.

All timing uses a Linux arm64 Node 24 container named `nsc-standin-d3`, CPU 11, one CPU quota, 2 GiB memory, and no network. Only task-owned containers are created and removed. Builds, tests, and analysis do not overlap timing. Host process lists and load are captured before each workload window. Desktop background work remains possible. These are single-session measurements, without a confidence interval or a claim of a fully idle host.

The caller thread's D2 clock measures synchronous reference work. Process CPU includes native owner execution and complete shadow drains. Caller-thread reductions after native promotion therefore cannot establish total CPU savings. Training medians describe changing policies. The tables retain both metrics.

| Records | Phase | OFF thread CPU ms | Before AUTO ms (overhead) | After AUTO ms (overhead) |
| ---: | --- | ---: | ---: | ---: |
| 600 | training | 0.00692 | 0.09488 (+1271.8%) | 0.00758 (+9.6%) |
| 600 | steady | 0.00696 | 0.00858 (+23.4%) | 0.00729 (+4.8%) |
| 6000 | training | 0.06096 | 0.96837 (+1488.6%) | 0.06179 (+1.4%) |
| 6000 | steady | 0.06208 | 0.01121 (-81.9%) | 0.06283 (+1.2%) |
| 60000 | training | 0.69462 | 10.71058 (+1441.9%) | 0.69629 (+0.2%) |
| 60000 | steady | 0.68354 | 0.03963 (-94.2%) | 0.68683 (+0.5%) |

Thread CPU excludes native owner CPU; inclusive process totals below include drains. Training medians describe a changing dispatcher.

Settled JS microbenchmark before: direct 6.94 ns, dispatch 45.53 ns, difference 38.58 ns/call.
Settled JS microbenchmark after: direct 6.64 ns, dispatch 57.96 ns, difference 51.31 ns/call.

| Records | Version | Outer state | Verified | Decision call | Helper dispatches |
| ---: | --- | --- | ---: | ---: | ---: |
| 600 | before | native | 28 | 560 | 674400 |
| 600 | after | js-final | 26 | 600 | 0 |
| 6000 | before | native | 28 | 560 | 6744000 |
| 6000 | after | js-final | 26 | 611 | 0 |
| 60000 | before | native | 28 | 560 | 67440000 |
| 60000 | after | js-final | 26 | 610 | 0 |

600 records inclusive process CPU totals (training + steady): {'off': 8.066, 'before': 107.905, 'after': 18.04}.

6000 records inclusive process CPU totals (training + steady): {'off': 52.047, 'before': 637.253, 'after': 63.038000000000004}.

60000 records inclusive process CPU totals (training + steady): {'off': 565.022, 'before': 6395.333, 'after': 629.359}.

The after lane completes all 26 verification runs and settles on JS at every size. This fixture's unwrapped JS is cheaper than its native boundary. The before lane promotes against a JS reference inflated by helper dispatch. It does not reproduce PM1's persistent starvation at these exact call counts: after the helper spends its old per-function quota, the outer eventually samples. The separate nested-load regression checks that the outer receives a complete epoch and promotes when its native pairs win, under the new global quota. Actual revenue promotions are reported below.

| Records | Phase | Lane | Inclusive process CPU median / p95 ms |
| ---: | --- | --- | ---: |
| 600 | training | off | 0.00800 / 0.01600 |
| 600 | training | before | 0.09700 / 0.30300 |
| 600 | training | after | 0.00900 / 0.05800 |
| 600 | steady | off | 0.00800 / 0.01000 |
| 600 | steady | before | 0.02300 / 0.05100 |
| 600 | steady | after | 0.00900 / 0.01100 |
| 6000 | training | off | 0.06300 / 0.07400 |
| 6000 | training | before | 0.97800 / 1.26400 |
| 6000 | training | after | 0.06400 / 0.08600 |
| 6000 | steady | off | 0.06400 / 0.07300 |
| 6000 | steady | before | 0.07700 / 0.10000 |
| 6000 | steady | after | 0.06500 / 0.07400 |
| 60000 | training | off | 0.69600 / 0.76300 |
| 60000 | training | before | 10.79900 / 12.07800 |
| 60000 | training | after | 0.69900 / 0.82600 |
| 60000 | steady | off | 0.68600 / 0.72600 |
| 60000 | steady | before | 0.57800 / 0.61800 |
| 60000 | steady | after | 0.68900 / 0.73700 |

## Remaining external-entry overhead

The first dispatcher-only probe showed 38.58 ns overhead before and 51.31 ns after. That result led to the single-scalar size shortcut. It remains in the raw nested artifact. The final probe includes generated wrappers and alternates direct, dispatcher, and wrapper batches. Each route has 20 discarded warmup batches and 100 retained batches of 100,000 calls. The addon's thread CPU clock brackets each batch. No sample is removed.

| Version | Direct ns | Dispatcher ns | Full wrapper ns | Dispatcher overhead ns | Wrapper overhead ns |
| --- | ---: | ---: | ---: | ---: | ---: |
| before | 4.61 | 41.67 | 45.33 | 37.05 | 40.72 |
| after | 2.48 | 34.43 | 62.07 | 31.94 | 59.58 |

The final full wrapper costs about 60 ns above direct JS. It is slower than the baseline wrapper in this probe, despite lower dispatcher-only cost. The remaining cost includes runtime entry, bucket lookup, argument handling, and indirect JS invocation. This is a measured small absolute overhead, not zero overhead or a wrapper speedup. Internal candidate calls avoid it entirely. The full nested and M3 runs precede the final scalar shortcut; their non-scalar outer arguments use the same size path in both revisions. Focused policy tests run again after that shortcut.

## Revenue and mixed stream

D2/M3 uses the unchanged five-arm workload, 15 warmups and 60 retained calls per steady cell, followed by the actual 600-call 70/20/10 stream. Training is extended to 700 calls per bucket to cover staggered schedules, with 63-second pauses between buckets to respect the stricter global quota. Busy shadow drains remain in M3. Strict and construction dispatchers each have their own 50/minute cap, as independent experimental arms.

The amended gate requires the best fixed lane in every bucket within measurement noise, and a mixed AUTO win over JS beyond C1 calibration error. Strict AUTO selects JS at 1k and native above it. Construction selects native throughout. The largest AUTO median excess over the best fixed lane is 1.5% strict and 0.4% construction. These small observed differences do not establish a statistical equivalence interval. Conservative calibration-band overlap is the automated noise check in `analyze.py`.

C1 uses compute CPU times 1.792 plus boundary CPU times 2.260, with the native compute fraction from instrumented stages. Drain CPU gets the boundary factor. AUTO's upper proxy band must be below JS's lower band using the unchanged ±17.37% error bound. The result is a hosted-wall proxy, not calibrated Active CPU or billing savings. The old requirement to beat both fixed lanes is not the amended gate.


new revenue:

| Events | JS CPU median / p95 | Fixed native CPU median / p95 | AUTO CPU median / p95 | Lane | AUTO / best |
| ---: | ---: | ---: | ---: | --- | ---: |
| 1000 | 0.463 / 0.524 | 0.746 / 0.849 | 0.439 / 0.479 | js-final | 0.948 |
| 5000 | 2.130 / 2.174 | 1.309 / 1.434 | 1.293 / 1.515 | native | 0.988 |
| 15000 | 6.283 / 6.443 | 2.788 / 2.971 | 2.735 / 2.984 | native | 0.981 |
| 200000 | 95.683 / 103.423 | 29.489 / 30.045 | 29.923 / 36.550 | native | 1.015 |

Mixed inclusive process CPU totals: {'js': 5732.199, 'native-new': 2423.088, 'auto-new': 2867.187}.
C1 proxy totals: {'js': 10272.430548, 'native-new': 4660.55722244748, 'auto-new': 5575.756493118992}.
Amended gate: within calibration noise per bucket True; mixed AUTO upper band < JS lower band True.

construction revenue:

| Events | JS CPU median / p95 | Fixed native CPU median / p95 | AUTO CPU median / p95 | Lane | AUTO / best |
| ---: | ---: | ---: | ---: | --- | ---: |
| 1000 | 0.463 / 0.524 | 0.266 / 0.312 | 0.266 / 0.347 | native | 1.000 |
| 5000 | 2.130 / 2.174 | 0.826 / 0.916 | 0.822 / 0.915 | native | 0.995 |
| 15000 | 6.283 / 6.443 | 2.269 / 2.496 | 2.272 / 2.494 | native | 1.001 |
| 200000 | 95.683 / 103.423 | 29.023 / 32.784 | 29.151 / 32.052 | native | 1.004 |

Mixed inclusive process CPU totals: {'js': 5732.199, 'native-construction': 1997.339, 'auto-construction': 2137.496}.
C1 proxy totals: {'js': 10272.430548, 'native-construction': 3704.8258151766813, 'auto-construction': 3997.9394377077274}.
Amended gate: within calibration noise per bucket True; mixed AUTO upper band < JS lower band True.

The original demo revenue benchmark also runs separately, with its existing 15 warmups and 60 retained samples per lane and size. All 1,200 returned values match, including warmups. Sidecar CPU includes child task CPU from schedstat. Boundary probes remain in the raw artifact.

| Events | Node CPU median / p95 ms | Sidecar | Sync addon | Async addon |
| ---: | ---: | ---: | ---: | ---: |
| 1000 | 0.454 / 0.554 | 0.842 / 1.288 | 0.716 / 0.751 | 0.756 / 0.982 |
| 5000 | 2.108 / 3.728 | 1.314 / 3.713 | 1.225 / 1.396 | 1.256 / 1.591 |
| 15000 | 6.132 / 6.258 | 2.586 / 2.930 | 2.454 / 2.593 | 2.506 / 2.774 |
| 200000 | 103.123 / 107.135 | 37.396 / 45.241 | 26.631 / 27.307 | 26.488 / 38.020 |

## Validation and reproduction

Next passes 98 tests, including the baseline 95 and three new D3 tests. Promotion passes 26 tests with its two existing skips. The standard demo suite passes 24 tests. The seeded real-addon differential fuzzer passes 680 inputs and 1,360 comparisons across 17 candidates. The final focused policy suite passes 24 tests after the scalar shortcut and the expanded private, recursive, and shadowed-binding assertions.

An initial full Next run found the linked-path defect and is retained. The final full suite passes after its fix. A broad demo-test glob accidentally started an additional local build; that command was stopped outside timing windows, then the intended package test list passed. No extra process remained when timing resumed. The first original-revenue build failed because its staging directory lacked `serve.ts`. Copying the existing adapter source into that generated directory fixes setup without changing the benchmark source. Both build logs are retained.

The build script recreates the baseline from its pinned Git commit. With installed dependencies, stock scriptc 0.4.6, Zig, Node headers, and the cached `nsc-standin:node24` image:

```sh
SCRIPTC_COMPILER=/path/to/stock/scriptc node research/nested-dispatch/build.mjs
M3_ARTIFACTS=research/nested-dispatch/m3-build.json SCRIPTC_COMPILER=/path/to/stock/scriptc node research/phase1/build-m3.mjs
bash research/nested-dispatch/run.sh
```

For the original revenue run, prepare the runtime packs under `.checks/standin` as in `research/standin/run.sh`. Copy `packages/next-scriptc/src/functions/serve.ts` into `.checks/standin/stage/serve.ts` after creating the stage directory, then run `node research/standin/build.mjs`. Save its artifact manifest under the D3 directory and restore the historical manifest. Finish tests before `bash research/nested-dispatch/run-revenue.sh`. Run `python3 research/nested-dispatch/analyze.py` after all timing finishes. Analysis accepts compressed raw JSON too.

[Raw nested measurements](nested-dispatch/nested.json.gz), [mixed measurements](nested-dispatch/m3.json.gz), [final microbenchmark](nested-dispatch/micro.json), [original revenue measurements](nested-dispatch/revenue.json.gz), [gate summary](nested-dispatch/summary.json), and the adjacent build, test, host, and container logs retain the evidence. Artifacts above 256 KiB are gzip-compressed. Task build outputs and temporary dependency links are removed. The root README, scriptc fork, and `/Users/noah/scriptc` are untouched. There are no hosting calls, publications, merges, or pushes.
