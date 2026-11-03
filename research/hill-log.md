# Hill log

## 1. Calibrate the local stand-in (C1, 2026-11-01)

**Hypothesis.** A one-core Linux arm64 container and two separate compute and boundary factors can approximate A2's hosted revenue medians well enough to steer local experiments.

**Change.** Add `research/standin/run.sh`, stock 0.4.6 cross-builds, Node 24.22.2, one CPU pinned to VM core 0, 2 GiB, process and child CPU accounting, strict SHA checks, and same-result typed encoding no-ops. Six windows are retained. Final windows 5 and 6 supply n=120 per cell, plus 30 retained warmups; all 4,800 final workload and boundary calls match Node and A2. Early probes and their losses remain separate because the measurement method changed. The x64 emulation check passes 216 results, with no speed analysis.

**Result.** Local wall factors are compute **1.791** (conditional bootstrap 95% CI 1.782–1.800) and boundary **2.254** (2.225–2.280). Mean absolute cell error is **6.44%**, maximum **17.37%**, held-out-size mean **7.51%**. A third factor barely helps in sample and worsens validation. A2's earlier placement yields factors 1.576 and 1.823, showing uncertainty much wider than the sample bootstrap. All 47 existing tests pass.

**Verdict.** Keep the reusable stand-in and two-factor rule for coarse steering. Do not count small predicted improvements as wins. Boundary changes and architecture-specific changes need hosted confirmation. A2 records function wall time, so neither fit identifies Vercel Active CPU savings. Report raw local CPU plus a clearly labeled CPU-input hosted-wall proxy until a checkpoint measures hosted CPU. Recalibrate at every hosted checkpoint. The [calibration report](standin-calibration.md) contains every cell, methods, retained failures, and limits. No production code or compiler patch was made.

## 2026-11-01: Phase 1 boundary encodings

Hypothesis: per-type argument encodings remove the outer JSON escaping and parsing passes for JSON-text strings. Implemented checked signature metadata, mixed ABI shims, raw strings and Uint8Array transport, direct scalars, per-object strict JSON, optional stage instrumentation, and a shared Node runtime loader. Kept after correctness tests and host execution. Both Linux targets pass build and link checks. No performance measurement was run. The calibrated stand-in gate remains pending, and any boundary gain needs hosted confirmation. Details are in [boundary-encodings.md](boundary-encodings.md).

## 2. Measure the Phase 1 real-argument gate (M2, 2026-11-01)

**Hypothesis.** Raw UTF-8 string arguments remove P1's nested JSON boundary cost enough for native revenueCore to beat JS from 5k upward beyond calibration error, with auto matching the best fixed lane per bucket and beating both fixed modes on the 70/20/10 mix.

**Change.** Merge `t3/per-type-boundary-encodings` at 3d514ac, preserving its implementation log above. Add a real-argument workload to the stand-in and reconstruct the old all-JSON wire contract on the current owner-thread shim. Three retained windows provide n=180 per size and mode, separate n=180 seven-stage diagnostics, and three actual 600-call mixed streams per mode. Repeat after host-load spikes; discard no samples. Keep the missing-dependency build failure. All 14,040 returned results pass SHA-256 checks; 60 shadows pass exact canonical-byte comparison, with explicit SHA checks added for 40 shadows in windows 2 and 3. Existing tests pass (38 package tests and 24 demo tests).

**Result.** New native CPU-input hosted-wall proxy reductions against JS are about 15% at 5k, 46% at 15k, and 67% at 200k. The 5k reduction is inside the 17.37% maximum calibration error. 1k remains slower in native. Auto always keeps 1k in JS and promotes 200k at call 100, but 5k and 15k decisions vary across windows. Async shadows can reject the synchronous fixed winner. Auto's measured mixed CPU totals beat both fixed choices, but its additional gain over fixed new native is inside the calibration band. At 200k, about 59 ms disappears from argument escaping and outer-JSON decoding, while core compute stays near 26 ms.

**Verdict.** Keep the encoding implementation and measurement tools. Reject a Phase 1 performance pass: the 5k and per-bucket auto requirements fail. **Needs hosted confirmation.** C1 calibrates hosted wall, so CPU-input predictions remain proxies and establish no Vercel Active CPU savings. No dispatcher thresholds or compiler behavior changed. No hosted calls, push, issue, or PR. Full tables, tails, stage allocation limits, mixed totals, learning costs, failures, and raw evidence are in [phase1-standin-results.md](phase1-standin-results.md).

## 3. Stabilize dispatcher decisions after M2 (2026-11-01)

**Hypothesis.** Paired service timings, more verified samples, a robust confidence check, and periodic re-checks can correct M2's missed native wins without increasing shadow rate caps.

**Change.** Add asynchronous addon service timing that excludes libuv scheduling delay. Pair it with JS timing for the same arguments. Discard two cold pairs, require 19 of 24 pairs beyond a 10% promotion margin, and demote only with evidence of a 5% loss. Re-check settled buckets every 200 calls. Preserve mismatch demotion and the one-in-20 learning, 50-per-minute, and one-pending-shadow caps. Ordinary JS calls take no clock readings or sample-array updates.

**Simulated result.** In 1000 seeded empirical trials per size, old-policy misdecisions were 0%, 66.2%, 34.2%, and 1.4% at 1k, 5k, 15k, and 200k. New first-epoch rates were 0%, 6.1%, 0%, and 0%. After eight epochs, both empirical and added-stall simulations had no observed errors. These results use fixed native wall samples as a proxy for the new service clock and establish no measured performance gain. Root `pnpm test` passes 43 package tests and 24 demo tests.

**Verdict.** Keep for real measurement. JS latency overhead, total learning CPU, convergence under traffic, and hosted performance remain pending. The old 120-call training period is insufficient for the new policy. Diagnosis, parameters, limitations, and reproduction are in [dispatcher-stability.md](dispatcher-stability.md). No performance benchmarks, Docker operations, hosted calls, pushes, issues, or PRs ran.

## 4. Reduce native result validation refreshes (2026-11-01)

**Hypothesis.** M2's roughly 0.58 ms result boundary repeats native view materialization during strict validation; reducing reflection on the original value can help without weakening canonical-byte checks.

**Change.** Inspect symbol keys on the complete descriptor dictionary rather than refreshing the native source for a separate symbol query. Retain typed stringify and all strict checks. Add focused result-shape tests and a short cached-result host probe. Separately test a record-prototype cache in a new scriptc fork worktree; no compiler upgrade is wired into the adapter.

**Result.** Stock 0.4.6 host encode-stage median / p95: 1k 0.595 / 0.640 → 0.495 / 0.543 ms; 5k 0.596 / 0.631 → 0.503 / 0.541 ms. Validation dominates; typed stringify is about 0.010 ms, arena conversion around timer resolution, and copy-back about 0.003 ms. These are elapsed times on a loaded host, not CPU or calibrated stand-in results. The fork experiment's alternating windows show 0.718 → 0.710 ms, inconclusive. Failed fused encoding, per-property descriptor probes and compiler limitations are retained in [native-result-encoding.md](native-result-encoding.md).

**Verdict.** Keep the strict adapter change, preserve the fork experiment locally for review, and defer a performance verdict to the calibrated stand-in. Expect 1k still to lose and 5k to gain some margin. No threshold tuning or claim of a gate pass. **Needs hosted confirmation.** No full suite, Docker, Sandbox, hosted action or push.

## 5. W2: library loop limits and wasm vectorization (2026-11-01)

Hypothesis: S1's scalar reductions result from loop lowering, beyond the missing wasm SIMD target feature. Minimal length-bound imul and Int32 controls already vectorize. The reproducing difference is a module-global library limit: it bypasses counted-loop analysis and leaves double induction, conversions, and per-read bounds branches. Gate 1 passes.

Keep a local backend change admitting immutable numeric globals to counted-loop matching in arithmetic bodies that cannot invoke user code. Branch `next-scriptc/wasm-counted-globals`, commit `b46987ce9`, upstream base `a07d5a791`, with the existing int8 patch cherry-picked as `0cc542ceb`. No push. The full S1-shaped imul reduction now vectorizes for wasm SIMD, arm64, and AVX2; a same-version toggle restores scalar IR. Strict float wasm reduction remains blocked by ordered arithmetic semantics.

Focused validation passes: 26 backend tests, the new corpus in both differential harnesses release/dev and ASan/RC audit, typecheck, focused lint/format, TS7 baseline completeness, and 15 non-timed JS/Wasm SHA-256 comparisons. Full gate and measurements are pending; no improvement is counted or CPU claim made. The first warning-induced corpus failure and rejected reproduction attempts remain documented. Step 3 is only an untested CLI/target-feature sketch; no C++ helper rebuild. [Report, IR evidence, and pending command](wasm-vectorization.md).

## 6. Papermark local correctness gate (2026-11-01)

Hypothesis: the unchanged held-out `documentViewDistribution` can pass automatic discovery, library compilation, and real dispatcher shadow comparison without Papermark code changes.

Discovery and a full local Next slice build exposed three adapter defects: route rewrites dropped auto-promotion metadata, the purity screen rejected sorting fresh array chains, and Next cleanup deleted promotion artifacts after compilation. Keep fixes for metadata retention, conservative fresh-array recognition, and local cache-to-runtime artifact publication, with regression tests.

The pinned R1 playback module remains outside the repo at commit `ed19717ec02a1ac79aecf5569159aa9d2d869312`. Its only accepted dispatch boundary is `documentViewDistribution`; the report records every other export's first rejection. Stock scriptc 0.4.6 builds darwin arm64 and Linux arm64 addons. Both pass 12 real loader/dispatcher shadow cases, including 6k and 60k playback records, and intentional mismatch demotion with zero native answers. The installed Next slice builds, retains the addon, and serves 20 byte-identical HTTP smoke responses. All 48 package unit tests and 24 demo tests pass.

Keep the correctness result. No workload timing, CPU claim, policy tuning, compiler change, or new compiler limitation follows. A checker executable-permission setup failure is retained. Whole-app integration and performance remain unproven. The new `nsc-standin-papermark` container and generated dependencies and builds are removed. Free disk is 8.2 GiB before and 9.4 GiB after, with concurrent work affecting both readings. No Vercel or upstream action occurred. See [papermark-local-gate.md](papermark-local-gate.md).

## 7. Typed result validation (2026-11-01)

Hypothesis: generated typed visits can remove E1's expensive reflective result
validation while preserving the strict boundary contract.

Implemented bounded return-shape metadata from the application's TypeScript
checker and generated typed visits with complete container guards and generic
fallback for extras. The experimental build option is `specializeResults:true`;
production keeps strict validation. Added adversarial and native-path tests.
Fixed negative-zero loss in direct number transport; scalar shadow comparison
distinguishes its sign bit. A JSON-level -0 refusal was reverted in review: it
threw inside the native lane and poisoned the instance (all functions demoted).

Loaded-host alternating A/B, 120 measured rounds per size after 10 warmups,
measured strict/generated median (p95) elapsed ms: 1k 0.682 (1.098) / 0.652
(0.968); 5k 0.597 (0.888) / 0.574 (0.913). Typed encoding without validation is
0.012–0.013 ms. Paired median differences are -0.027 and -0.023 ms, with wide
spreads crossing zero. This does not meet the nearly-free goal or exceed C1's
17.37% error. No calibrated win is claimed.

Keep the experiment disabled by default. Returning UTF-8 bytes or projecting a
compact layout does not certify the source value; sampled shadows cannot prove
future results safe. Record a compiler closed-record certificate candidate and
minimal repro in the patch ledger. The existing boundary also has broader
observational-equivalence limits, documented in the report rather than hidden
by a performance claim. No scriptc change, Docker stand-in, Vercel call, or root
README edit. Node 24 passes 54 adapter, 2 shim, and 24 demo tests with at most two
test jobs. [Full report and raw A/B rows](native-result-validation.md).


## 8. Closed-record certificate hypothesis gate (2026-11-01)

Hypothesis: typed native layouts and existing dynamic metadata can certify exact JSON-safe result graphs without descriptor materialization.

Fetched upstream and created isolated scriptc branch `next-scriptc/closed-records` at `f606a3bd8`. Traced record layouts, source tables, checked views, capsule lifetime, dynamic mutation paths, live JSON encoding, and array density metadata. A retained diagnostic fixture compiles through worktree compiler source as both an executable and a static library. Its private ABI 48 pack rebuilds the relevant release and library JSON units, reusing other runtime and vendor artifacts.

Both native modes lose null-prototype state, hidden symbols on records and arrays, and accessor identity after accepted typed-to-erased mutations. Hidden string keys, extra enumerable fields, holes, and JSON negative zero match Node in this probe. JSON bytes alone conceal the reflection failures. The runner intentionally exits 1 for failed parity; these are known-gap fixtures outside automatic corpus discovery.

Stop at the requested hypothesis gate. Existing layout metadata cannot supply the proposed sound certificate across these crossings. A persistent native-identity mutation history or a construction proof needs further work. No encoder or adapter wiring was added, and no unsafe path was timed. There are no new A/B numbers or performance claims. Production remains strict, with the existing generated-visit experiment disabled by default. No container operation, Docker stand-in, Vercel call, full gate, push, or root README edit. [Mechanism, per-case evidence, and reproduction](closed-records.md).

## 9. Immutable construction proof (2026-11-01)

Hypothesis: an allowlist over the complete extracted helper closure can prove
closed JSON construction and remove reflective native result validation.

Keep an adapter-only screen for immutable literals, JSON inputs, allocating
map/filter operations, and an acyclic local helper graph. It checks extracted
source with a strict TypeScript program, excludes type escapes and every reference
mutation, and emits per-function verdicts in `construction-report.json`.
`constructionResults:true` enables typed JSON.stringify for passing JSON results.
The default remains strict. The graph argument establishes closure under JS
semantics, but does not prove compiler parity or bounded resource consumption.
There is no unconditional native no-panic theorem.

Pinned Papermark `documentViewDistribution`, demo `revenueCore`, and async
`revenue` all fail the screen and keep strict validation. No Papermark source or
extracted closure is committed. Arithmetic is excluded because finite inputs can
produce NaN or Infinity. A silent conversion to null would disagree with the JS
lane and its strict shadow canonicalization. Negative zero keeps existing JSON
canonicalization, without throwing inside native code.

Loaded-host alternating strict/screened-expression measurements use literal copies
of cached revenue outputs. There are 120 rounds per size after 10 warmups, with
byte comparison on every call. Compute median [p05, p95] elapsed milliseconds:
1k strict 0.331 [0.305, 0.404], screened 0.008 [0.007, 0.010]; 5k strict 0.324
[0.308, 0.358], screened 0.008 [0.007, 0.009]. Both arms include literal result
allocation. These numbers do not measure eligible revenue aggregation, CPU time,
or a calibrated workload improvement. Boundary gains need hosted confirmation.

The first full adapter run found a report callback ordering regression, fixed by
retaining verdicts in the JSON build report. Final verification passes 59 adapter tests, 2 shim tests, and 24 demo tests,
with at most two test jobs. Final review added definite-initialization checks for
callback captures, followed by a full adapter rerun. Tests cover every exclusion family, native sync and
async parity, real shadow comparison, shared aliases, large arrays, deep input
rejection, non-finite input rejection, Unicode, and JSON lone-surrogate strings.
No scriptc edit, Docker operation, Vercel call, PR, push, or root README edit.
[Proof, gaps, workload verdicts, and raw measurements](construction-proof.md).

## 10. CR3: local allocation proof and per-call fallback (2026-11-01)

Hypothesis: local allocation provenance plus a typed finite-value scan can cover
real aggregation functions without reflective result validation. Implemented an
addon fallback status, dispatcher sample skipping, a conservative allocation graph,
and dynamic preflight guards for asserted JSON.parse parameters. Default stays off.

`revenueCore` and pinned Papermark `documentViewDistribution` qualify. The async
`revenue` wrapper remains strict. Papermark passes all 12 screened byte-identical
shadows, including 6k and 60k events, without measuring held-out timings.

Loaded-host real revenueCore A/B, 120 interleaved rounds per size, matches JS bytes.
Median wall milliseconds: 1k strict 0.434, screened 0.341; 5k strict 0.776,
screened 1.540. Result encoding falls from about 0.32 to 0.01 ms, but parse
preflight makes 5k slower. Kept as an opt-in safety and coverage experiment.
This is not a hill performance win and has no hosted CPU claim. See
[the rule-by-rule argument and limits](construction-proof-v2.md) and
[raw measurements](construction-proof-v2-host.json).

Validation: 66 adapter tests and 2 shim tests pass on Node 24.22.0; the final
focused fallback suite passes all 7 tests. Real revenueCore dispatcher shadows
verify at 1k and 5k. Temporary dependency symlinks and generated native artifacts
were removed. No containers, scriptc source, Vercel, or root README were changed.

## 11. try/catch fallback instead of parse guards (2026-11-01)

- **Hypothesis:** CR3's 5k regression comes from its parse guards (a JS syntax preflight plus a second native dynamic parse). Native exceptions are catchable, and scriptc's typed `JSON.parse` already rejects shape mismatches, so a `try/catch` fallback can replace both.
- **Change:** `catchFallback` (default on, screened functions only) wraps the generated wrapper body in try/catch and returns the per-call fallback status. The guards are dropped.
- **Result, loaded host, real `revenueCore`, rotating arms:**

  | Events | Strict | CR3 guard | try/catch | JS (sequential) |
  | ---: | ---: | ---: | ---: | ---: |
  | 1k | 0.468 | 0.398 | **0.140** | 0.272 |
  | 5k | 0.897 | 1.860 | **0.541** | 1.187 |

  All values are median milliseconds. 66 adapter tests pass.
- **Kept.** Needs stand-in confirmation, because the gain comes from boundary costs. Follow-up: demote buckets with high fallback rates. See [construction-proof-v2.md](construction-proof-v2.md).


## 12. Bound repeated per-call fallback costs (2026-11-01)

Hypothesis: a screened bucket that repeatedly falls back should stop paying native
plus JS without disabling unrelated native work. Keep per-bucket disjoint windows
of 20 actual native attempts, counting synchronous answers and shadows. A fallback
rate strictly above 50% permanently demotes that bucket. Encoding failures and
queue skips do not count as native attempts. Occasional fallback retains the lane.
Counters and a transition reason remain visible in snapshots and logs.

Three added tests cover repeated sync fallback, shadow fallback, exact-threshold
behavior, window reset, and bucket/function isolation. All 69 adapter tests and
both shim tests pass on Node 24.22.0. The standard demo suite passes 24 tests.
An overly broad demo test invocation also selected separate integration scripts;
its setup failures under temporary dependency links are retained. No compiler
source change or hosted operation occurred.

## 13. Rerun the Phase 1 gate with D1, E1, and construction results (M3, 2026-11-01)

Hypothesis: stable paired decisions and cheaper screened result encoding let the
real-argument Phase 1 gate pass. Five paired rotating arms run in the C1 stand-in
on CPU 11, with 540 training calls per bucket and arm and unchanged shadow caps.
Construction revenueCore is confirmed screened with catchFallback enabled.

Construction fixed native clears disjoint calibration bands at 5k, 15k and 200k;
strict fixed native still fails 5k. Both auto arms retain JS at 200k because their
first epochs miss D1's 19/24 confidence requirement. No flaps are observed, but
no second decision epoch completes. Neither auto arm beats both fixed modes on
the actual 70/20/10 mix beyond calibration error. The compound M2 gate FAILS.
Ordinary JS dispatcher overhead is 0.000038 ms/call, passing the 0.005 ms budget.
All 9,420 returned byte checks and 220 shadow byte checks pass.

Keep the implementation and evidence, without claiming a performance gate pass.
Boundary gains **need hosted confirmation**. C1 predicts hosted wall from CPU,
not hosted Active CPU. Host load 7.10-8.07 exceeds C1's final 2.62-3.64 and
3.04-3.51 ranges, so absolute values carry extra uncertainty. An initial training
pilot was stopped to add background recheck CPU to mixed totals; no pilot samples
enter final tables. [Report](phase1-gate-m3.md) and its raw links retain both runs.
No Vercel, Papermark timing, or unrelated container operation occurred.

## 14. Time W2 in workerd after M3 (2026-11-01)

Hypothesis: the counted-globals fix plus SIMD makes integer wasm reductions
competitive with V8 in workerd. Preparation uses the requested fork worktree at
b46987ce9 and stock ABI-47 WASI runtime objects; no compiler source is edited.
The original pending artifacts are preserved through a separate W2_OUTPUT.

All 15 verification cases and 3,000 measured/warmup response hashes pass. Fixed
SIMD median wall speedups over V8 are 2.23x imul, 2.24x natural int8, 2.81x sum,
and 2.90x search. Process CPU speedups are 2.33x, 2.29x, 2.92x, and 3.13x.
Strict float remains slightly slower, 0.97x by both metrics. Keep the timing
result as local evidence. Architecture-specific gains **need hosted confirmation**.
No app-level or hosted CPU improvement follows from synthetic kernels.

The macOS harness has no affinity option. It runs sequential requests with four
persistent workerd workers, 30 warmups and 120 measured calls per variant/kernel.
CPU tails describe six batch averages, while wall tails describe requests. M3
and W2 timings do not overlap. [Timing report](wasm-vectorization-timing.md)
links raw samples, CPU counters, build outcomes, hashes and logs. Task-created
builds and dependency links are removed after recording disk use. No Vercel,
Papermark timing, fork source edit, or unrelated-container change occurred.

Cleanup: disk free approximately 18 GiB before work, 20.62 GiB after. All task-created build trees and temporary dependency links are removed. Other host activity affects the disk readings.

Setup caveat: the initial Phase1 build overlapped the two-worker adapter suite,
so the requested two-build ceiling was not guaranteed during that interval.
Subsequent preparation was sequential. No build or test overlapped either final
timing run.

## 15. Pair dispatcher decisions on thread CPU (2026-11-01)

Hypothesis: owner-thread contention inflates native shadow wall time and can
make D1 reject the CPU winner. M3 actually drains shadows before subsequent
workload calls; its busy `setImmediate` drain itself contends with the owner.
A targeted CPU-11 probe confirms 200k native CPU near 30 ms with either drain,
but wall rises from 30.5 ms with timer draining to 59.3 ms with busy draining.
Concurrent JS also inflates wall time. The 5k effect is smaller in this probe.

Keep addon thread CPU measurements for owner execution and boundary work,
calling-thread CPU for JS and caller encode/decode, and diagnostic wall pairs.
Skip JS sampling while shadows are pending. D1 votes, margins, hysteresis,
cold exclusion, frequency and quota remain unchanged. Fake-clock tests show
wall contention rejects the faster native lane while CPU pairs promote it.

The same M3 five-arm run selects the best fixed lane in all four buckets for
both auto arms. Strict uses JS/native/native/native with votes 0/23/24/24;
construction uses native throughout with votes 23/24/24/24. At 200k native
decision/steady CPU ratios narrow to 1.31x strict and 1.46x construction,
compared with original wall ratios 2.87x and 2.53x. Training costs still vary.
Mixed inclusive CPU totals are JS 6016.333 ms, strict native 2444.495 ms,
strict auto 2913.559 ms, construction native 2118.950 ms, construction auto
2043.525 ms. Post-call drain CPU includes all background work and bookkeeping.

The exact M2 gate still FAILS. Strict 5k misses the calibration-band test;
both auto modes miss the mixed win beyond error. Keep the measurement fix,
without claiming a performance gate pass. Boundary gains need hosted
confirmation. Host one-minute load spans 6.14–9.68. All 72 full adapter tests,
both Node 24 shim tests, and 24 demo tests pass; builds and tests do not overlap
timing runs, and builds run sequentially. No scriptc edit, Vercel run,
Papermark timing, or existing-container operation occurs. The report and raw
artifacts are in [dispatcher-cpu-timing.md](dispatcher-cpu-timing.md).

Cleanup removes task build trees and all three dependency symlinks. Available
disk increases from 18.49 GiB immediately before cleanup to 19.28 GiB after.
The final full adapter rerun also passes all 72 tests on Node 24.

## 16. Phase 1 gate under the amended criterion (2026-11-01)

The gate was amended in [hill-plan.md](hill-plan.md) and approved after D2. Applied to D2's stand-in rerun ([dispatcher-cpu-timing.md](dispatcher-cpu-timing.md)), with no new measurement:

- **Construction path: PASS.**
  - The per-bucket bands pass from 5k up.
  - Auto picks native in every bucket and is within noise of always-native: mixed caller CPU 2,020 vs 2,118 ms.
  - On the mix it beats JS beyond the error margin: predicted 3,810 [3,148, 4,472] vs 10,782 [8,909, 12,654].
- **Strict path: FAIL** (the 5k band overlaps). It is being replaced by the construction path.
- **Needs hosted confirmation** (boundary-driven). `constructionResults` stays opt-in until the fuzzer and crash safety exist.


## 17. Gate construction defaults with differential tests and crash leases (2026-11-01)

Hypothesis: the construction proof plus catch fallback can survive bounded random
boundary data without changing caller answers or poisoning the native instance.
A permanent 12-candidate fuzzer compiles strict and construction builds and uses
the real addon dispatcher. Two seeds each run 240,000 inputs. All 960,000 total
differential comparisons and 960,000 follow-up native usability checks pass.
There are 278,064 fallbacks across both runs. No compiler mismatch was found.
The final CI-sized fuzzer takes 21.10 seconds, below its 60-second budget.

Keep catch fallback for proof-eligible strict JSON and numeric wrappers as well,
so invalid input and non-finite result probes cannot poison the strict control.
Remove the specializeResults build experiment and retain its historical benchmark
helper under research. A single constructionResultsDefault constant remains false.
The builder tries the combined archive first and retains incremental refusal
filtering if that attempt fails.

Replace the path-only marker with build-content-keyed process leases before addon
loading. A child-process SIGSEGV test confirms that the next process stays on JS,
explicit reset retries native, and a changed build retries independently. Live
leases coexist, and process birth identity detects PID reuse. The lease covers
all native jobs until normal exit, with conservative false positives for other
fatal process failures. Cached dispatch does no guard filesystem work per call.
JS-path overhead is 0.00002334 ms per call against the 0.005 ms budget. No other
performance claim is made on this loaded host.

All 73 adapter tests and both shim tests pass on Node 24.22.0. Keep construction
opt-in. This corpus supports the screened synchronous subset but does not certify
every compiler lowering or enumerate all application candidates. The restart
guard cannot isolate the first native crash or preserve temp files across host
replacement. [Readiness report](default-on-readiness.md) records the equality
contract, seeds, counts, covered crash windows, reset, limits, and reproduction.
No scriptc source, Vercel deployment, Docker container, Papermark workload, or root
README was changed. Dependency symlinks and task-created build output are removed.

## 18. Real-app request CPU coverage baseline (2026-11-01)

Hypothesis: existing sync JSON candidates cover enough real request CPU to justify
further adapter work, and source candidate counts alone mis-rank the next gaps.
Measured Papermark plus Dub and Umami with original server code, synthetic
fixtures, mocked services, and V8 CPU profiles. No adapter/compiler change,
native speed experiment, app install, Docker operation, or deployment.

Papermark's existing distribution candidate covers 44.4% of the mocked 6k-event
request and 60.9% at 60k. Optional watch-time/length boundaries hide another
12.9% and 7.7%. Papermark remains held out: only coverage and correctness were
measured, with no timing-based tuning. An instrumentation naming failure was
corrected before retaining final coverage profiles.

Dub's unchanged foreground links export spends 58.9–61.4% in CSV conversion
and 30.1–31.5% in formatting. Current opaque-import and boundary checks leave
all of that in JS. Umami's actual tsconfig disables auto discovery through
strictNullChecks=false. Its isolated persistence path has 70.8–72.0% blocked
shaping work, with about 23% already-native UUID work. It excludes the full
HTTP ingestion handler, so it is not an ingest-request CPU result.

Actual adapter discovery scans 1,757 server-directory files: Papermark 5,
Dub 9, Umami 0 boundary-accepted candidates. A strict-null counterfactual gives
Umami 3. Only Papermark distribution passes construction proof; failure of that
proof is metadata for strict result handling, not rejection from discovery.
No new native compilation was attempted, and no compiler errors were inferred.

Keep the baseline and reproduction scripts. Recommend a Dub development
project for dependency closure proof plus safe object/JSON specialization,
and a smaller optional/undefined transport project on independent fixtures.
At hypothetical boundary-inclusive 2x speed, their measured-region scenarios
are 29–31% of mocked Dub export CPU and an additional 4–6% of mocked Papermark
request CPU. These are conditional ceilings, not measured savings or a
whole-app Vercel X. Production traffic weights and omitted service CPU remain
unknown. Full report: [coverage-baseline.md](coverage-baseline.md).

All six response/row checks, profile-accounting assertions, census assertions,
and added-script syntax checks pass. Task-created dependencies and links are
removed; pinned source checkouts remain outside the repo and are clean.
Disk began at roughly 18 GiB free and ended at roughly 19 GiB, with unrelated
host activity affecting the difference. No third-party source is added.

## 19. Optional inputs and cheap discovery widening (2026-11-01)

Hypothesis: strict JSON-safe subsets of optional input types and cheap syntax
lowering recover K1 candidates without changing observable undefined semantics.
Kept: optional input admission with per-call fallback for explicit undefined;
JSON destructuring and literal defaults; expression arrows; referenced private
sync bindings; route helpers with HTTP bindings excluded. Undefined-bearing
results, optional tuples and rest remain rejected. Stock 0.4.6 emits SC1090 for
the bare undefined result wrapper; the patch ledger records the reproduction.

Actual census acceptances rise from 5 to 23 for held-out Papermark and 9 to 32
for Dub. Umami stays at zero under its original config (strict counterfactual:
3 to 15). Papermark's new watch-time and length kernels compile and pass native
and shadow byte parity at 6k and 60k events. K1 category a shares are 59.5% and
60.9% in the rerun; Dub and Umami measured paths remain at zero. These are loaded
host coverage shares, not CPU savings. The full adapter suite, shim parity and
280,000-input seeded fuzzer pass. No native timing, Vercel, Docker or compiler
change. Details: [optional-boundaries-and-discovery.md](optional-boundaries-and-discovery.md).

## 20. Runtime dependency closures and the CSV blocker (2026-11-01)

Hypothesis: a closed runtime import graph and a transitive effect proof can
recover Dub's dominant CSV conversion region without app changes. Kept the
conservative ESM linker, runtime-file resolution using TS paths and package
exports/main, scalar constant inlining, dependency content and manifest hashes,
and build invalidation. Imported closures must pass the construction effect
proof even when construction result optimization is off. Initialization is
audited before unused code is removed.

The Dub hypothesis remains unproven. CommonJS module objects, getter re-exports,
mutable exported defaults, and the formula-prefix Set fail the adapter proof.
Stock 0.4.6 refuses the actual runtime package import with SC1010. A minimal
raw CommonJS export input yields SC0001. Dynamic JSON key reads, Set lookup,
and callback regex replacement compile in isolation. The ledger records this
observed blocker set without inventing errors for deeper lowering.

No broad object boundary, CSV native parity claim, CSV A/B, or performance gain
is claimed. The report describes the schema guard and remaining equality proof
needed before such a boundary can be enabled. Synthetic app closures compile
and match forced-native bytes. The permanent fuzzer gains a helper closure and
CSV-sensitive strings; seed 20935 passes 300,000 inputs and 600,000 comparisons.

The final census remains Dub 32 and held-out Papermark 23. Dub accepted CSV
coverage stays zero; its CSV category is 61.1% at 100 rows and 62.0% at 1,000.
Papermark is used only for the final census and JS coverage recount, with no
native timing or tuning. These are loaded-host sampled shares, not CPU savings.
The full adapter suite passes 84 tests; both Node 24 shim tests pass.
Temporary installs and symlinks are removed. No compiler, Docker, Vercel,
third-party source, or root README change.
[Design, evidence, and validation](dependency-closures.md).

## 21. Construction results on by default (2026-11-01)

- **Decision (Noah, after R2):** functions that pass the construction proof skip the reflective result check by default.
- **Why:** R2's recommendation to keep it opt-in rested on scriptc lowering correctness. That risk is the same for the strict path. The construction path only removes result inspection, which the proof, the adversarial tests and 960k+ fuzzer comparisons cover. Shadow verification still guards native output in both modes. D2's stand-in run passes the amended gate only on this path.
- **Opt-out:** `NEXT_SCRIPTC_STRICT_RESULTS=1` builds with strict validation. The switch is `constructionResultsDefault` in `promotion-signature.mjs`.
- **Needs hosted confirmation** at the next Vercel checkpoint.

## 22. Packed installation and local hosted artifact retention (2026-11-01)

A fresh npm tarball install exposed a config-loading failure hidden by workspace
symlinks. Node cannot strip `json.ts` inside `node_modules`. Node clients now
use a generated JavaScript copy, with a synchronization test. Construction and
dependency checks no longer fall back to `examples/demo`, and the builder keeps
the proof produced with the app's checker. The source resolution audit found no
other repository-relative optional or peer dependency fallback.

The hosted branch also bypassed the cache publication fix. Both paths now build
promotion under Next's preserved cache and publish before the output adapter.
A local fixture exercises the real Next cleanup and adapter hooks without the
Vercel CLI, credentials, linking, deployment, or API calls. Zig emits a GNU Linux
x64 ELF addon; all runtime files survive into the traced Node function and the
simulated final `.vercel/output`. Plain Node and Edge fixtures exclude them.

The packed app uses Next 16.4.3 and its own TypeScript 5.9.3. A JSON loop, ESM
helper closure, optional-field input, and destructured parameter all compile.
Each completes three verified native shadows. All 280 HTTP bodies match the
JS-only build, with no native fallback, demotion, unavailable-addon message,
or missing crash guard. This is a correctness and packaging result, with no
performance or hosted execution claim. All 86 adapter tests and both Node 24
shim tests pass. The external
app and its dependencies and builds are removed automatically. No scriptc,
Docker container, or root README change.
[Findings, retained results, and commands](install-and-vercel-build-checks.md).

## 23. Strict closures in non-strict apps and dependency format survey (2026-11-01)

2026-11-01, `t3/strict-closure-promotion`. Hypothesis: an independent strict
closure check plus guarded runtime inputs can replace Umami's application-wide
strict-null veto. Kept. Reused the construction proof's strict program and
checked the entire extracted closure before deriving boundary types. Generated
builds now have their own strict tsconfig. Direct scalar guards reject null,
undefined, and wrong types before C. JSON inputs additionally require a
construction proof and a result ABI with per-call catch fallback. Unsupported
JSON result ABIs remain rejected. Optional TypeScript lookup starts from the
application/source or cwd, with no example-directory fallback.

Final census: Umami 4, Dub 32, held-out Papermark 23. Umami's four scalar-input
candidates are outside K1's persistence path. Its accepted profiled CPU remains
zero; there is no newly accepted profiled function requiring compilation/parity.
Only Umami was profiled anew; Papermark and Dub received census only. No native
performance or whole-app saving is claimed.

The published-package survey recommends richer ESM initialization proofs first.
Most surveyed ESM entry graphs still fail scalar/function-only initialization;
CJS support alone cannot recover Dub CSV or make effectful service SDKs pure.
Immediate demonstrated coverage gain from that future project is zero. The
report separates measured CSV CPU from unmeasured import frequency.

The full adapter suite passes 85 tests; eight final focused checks pass.
Fuzzer seed 20935 passes 320,000 inputs and 640,000 comparisons across 16
candidates, including nested null/undefined injection and direct scalar cases.
[Implementation, soundness argument, package evidence, and reproduction](nonstrict-apps-and-module-survey.md).
The optional local shim IPC and HTTP parity checks also pass. HTTP parity needed
one retry for the existing owner/child stdout-order race, without a code change.
Temporary packages, generated native outputs, and dependency symlinks were
removed. No scriptc, Vercel service, Docker, third-party source, or root README
change.

## 24. Private call-site specialization (2026-11-02)

Hypothesis: concrete call sites can recover generic, object and any boundaries
without treating structural types as proof of JSON origins. Kept a conservative
path for module-private bindings whose references are direct calls with fresh
JSON literals and one agreeing concrete type vector. Exports, aliases, shorthand
escapes, dynamic evaluation, unknown origins, non-JSON construction and
disagreement reject. Specialized native copies pass strict checking, the existing
construction proof and a per-call fallback ABI gate. All purity, closure,
dependency and module-init gates remain intact.

Demo generic, object[], any-array and scalar fixtures compile. Shape mismatches
return empty output or NaN and rerun JS; follow-up native calls remain usable.
Missing/undefined fidelity, prototype/getter rejection and signed-zero transport
policy are unchanged. Strict and construction-result paths receive fuzz coverage.

Honest negative: Umami stays at 4, Dub at 32 and held-out Papermark at 23, with
identical accepted identities and zero newly specialized real-app functions.
Dub CSV still fails module initialization and retains its separate CommonJS
blocker. Umami flatten/store still fail dependency NewExpression. Papermark's
expected generic functions reject exports with unseen callers. Papermark received
one final census only. No newly accepted function is on a profiled path, so no
K1 coverage rerun was required. No native benchmark, coverage gain or speedup.

All 89 adapter tests pass. Seed 20935 passes 85,000 inputs and 170,000 differential
comparisons across 17 candidates, with explicit shape-mismatch fallback and
native-usability checks. The initial suite exposed a fixture-only TypeScript
path and overly narrow primitive specialization; both were fixed before the
final full-suite pass. Temporary dependencies and outputs were removed. At most
two jobs ran together. No Docker, Vercel, network posting, third-party source,
root README change, merge or push.
[Design, limits, census and reproduction](call-site-specialization.md).

**Review follow-up (2026-11-02).**
- Relaxed K4 to rely on the runtime guards. Exported functions and non-literal callers can now specialize; unseen callers fall back.
- Fixed missed imported call sites (alias symbols).
- 91/91 tests pass; fuzz passes.
- The census is still unchanged. Disagreements are almost all concrete test-fixture types vs `any` in production callers. Static call-site types don't carry real data shapes, so the next lever here is profile-guided specialization from observed shapes (deferred).

## 25. Cloudflare provider feasibility, stock wasm (2026-11-02)

CF1 establishes a local OpenNext integration, with no stock wasm promotion win.
`withScriptc` gains an explicit opt-in Cloudflare branch that preserves JS routes,
skips Node sidecars and addons, emits a stock 0.4.6 WASI library reactor before
Next builds, and generates a Worker wrapper with a static wasm import. The app
resolves its optional runtime pack. OpenNext 1.20.15 builds the complete demo;
Wrangler 4.156.0 serves the synchronous demo revenueCore facade through that
OpenNext Worker. This prototype has one explicit facade, not automatic discovery.

Three initial byte-identical shadows per input-byte bucket and periodic rechecks
gate the static wasm lane. Mismatch or trap disables it for the isolate. JS is
the default. Local workerd timers advance during synchronous compute, unlike
Cloudflare's documented deployed restriction, so they cannot validate Node's
CPU-timed promotion on Workers. Recommend content-keyed static calibration plus
shadow correctness gating; these measurements choose JS in every bucket.

All 960 final warmed/measured responses match byte for byte. At 5k and 15k events,
stock wasm consumes 7.811 and 14.993 ms total workerd CPU/request against JS
7.355 and 13.528 ms: 6.2% and 10.8% worse. Application-process CPU and external
HTTP wall time also lose. The empty control loses too. The retained libproc batch
run samples both Wrangler workerd processes; an initial front-process-only window
was discarded. No build/test work overlaps timing. Existing shared-host work
continues, and all numbers **need hosted confirmation**. No fork/SIMD gain is
claimed. Final linear memory is 33.31 MiB, without hosted memory certification.

The full adapter suite and both shim checks pass. Task-created installations,
builds and local Wrangler state are removed after validation. No deploy, login,
Vercel call, Docker change, Papermark use, compiler source modification or root
README edit. [Report, prototype limits and reproduction](cloudflare-provider.md)
include current official docs, raw counters, hashes and retained validation logs.

## 26. Shared promotion core and Vite Node SSR integration (2026-11-02)

Hypothesis: the existing promotion proofs and dispatcher can serve a Vite Node
SSR build without framework-specific changes to their semantics. Kept for the
validated Node SSR path. Moved the machinery and fuzz support into
`scriptc-promote`, with compatibility exports at Next's old paths. Replaced
Next's compiled Babel dependency with declared Babel packages. Next retains its
host hooks, publication, and explicit native route/sidecar integration.

The Vite plugin skips dev, client builds and webworker targets. It groups module
rewrites, builds the library addon, and emits the three runtime artifacts.
Vite's suppressed SSR assets and adapter-node's second bundling step each exposed
packaging failures during validation. Enabled SSR asset emission and added an
adapter-node wrapper that copies artifacts after adaptation. Runtime resolution
survives output relocation and adapter chunk layout changes.

RealWorld is pinned to `df796708040f5200ec572b28ab7f88ecee5794dd`, with source
outside the repo. Its upstream census scans 16 JS/TS files and accepts zero
functions. A labeled local checksum probe adds one eligible, compiled function.
Production `node build` servers return identical bodies with promotion enabled
and disabled across 120 requests. The enabled dispatcher reaches shadow with
six verified samples and zero fallbacks. It serves no native foreground calls
in this run. This proves integration with an added workload, not coverage of an
existing upstream compute path. No speed or timing claim.

All 91 existing Next tests and three plugin tests pass. Actual Vite versions are
6.4.5 and 7.3.7. Fuzzer seed 20935 passes 85,000 inputs and 170,000 comparisons
across 17 candidates. The small SvelteKit example completes a production build.
Both workspace packages pack successfully; the full packed-install check was
not rerun. Dev, Nitro handler graphs, component-inline discovery, non-Node
adapters and new multi-environment builders have explicit gaps in the report.

Validation ran serially. No Docker/container changes, compiler/fork changes,
Papermark work, Vercel or Cloudflare calls, third-party source commits, root
README edits, merge or push. Temporary dependency installations were removed.
[Design, evidence and reproduction](vite-plugin.md).

## 27. Astro and React Router Node framework integration (2026-11-02)

Hypothesis: Astro 5's server build hook and React Router v7's classic framework
Vite build can reuse promotion without changing the proof or dispatcher core.
Kept framework-specific entrypoints. Astro installs a fresh plugin only for its
Node server build and uses the resolved source directory. React Router defaults
to `app`. Both frameworks preserve all three runtime artifacts in their final
server output, so neither needs an extra artifact copy step.

The two small examples build production output and start local Node servers
after output relocation. Each returns 120 byte-identical compute responses with
promotion enabled versus disabled. React Router exercises GET loaders and POST
actions. Astro page imports and shared browser imports, plus React Router page
loaders and components, exercise server/client graph isolation. Each dispatcher
reaches shadow with six verified samples and zero fallbacks. No native foreground
serving or timing gain is claimed. Inline Astro frontmatter remains unsupported;
Astro 6+, experimental environment builds, non-Node adapters, and server bundle
splitting remain unvalidated.

Pinned external MIT apps stay outside the repository. AstroPaper v5.5.1 at
25d25437cf85b5df77c26b094ccc7035c6adddad accepts zero functions in 19 source
files. It is a static blog, so this is discovery evidence only. React Router
RealWorld at 59cf71947386f4ffac13f95b5f0ef47237e36c4a accepts zero in 52 files.
No external probe or third-party source is committed. Temporary installs run
serially and are removed. Disk exhaustion interrupted an initial AstroPaper
install; the retained census uses the Astro 5 tag after space was reclaimed.
No compiler source, Docker container, hosting provider, Papermark, or root README
was touched. [Report, evidence, limits, and reproduction](framework-integrations-astro-react-router.md).

Final package validation passes 95 Next tests and five promotion tests, with no
skips. The latter include both framework production checks and existing Vite
6.4.5/7.3.7 checks. The temporary dependency symlink and framework fixture installs
are removed before commit. Shared Vite implementation remains unchanged.

## 28. Nitro and TanStack Start production Node integration (2026-11-02)

Hypothesis: the existing promotion core can serve Nuxt's separate Nitro handler
build and TanStack Start's Vite environment builder without changing its proofs
or dispatch policy. Kept for the validated Node paths. Added a Nitro 2 module,
per-environment Vite compilation state, and a TanStack wrapper that publishes
SSR artifacts after Nitro 3's final bundle. Runtime resolution now requires the
addon and both manifests together, because Nitro can copy a hashed addon without
its metadata.

Nuxt 4.6.3 and TanStack React Start 1.169.4 each complete a production build.
The latter uses Nitro 3.0.261029-rc and Vite 8.3.5. Its endpoint calls a
`createServerFn` handler and a pure helper. After relocating the server output,
150 HTTP responses per framework match `SCRIPTC_PROMOTE=0` byte for byte across
six inputs. Both dispatchers reach shadow with seven verified samples and zero
fallbacks. Client bundles contain no promotion machinery. No native foreground
calls or timing benefit is claimed.

External shallow checkouts stay outside the repository. Nuxt RealWorld at
`88148ef6339be2ee7b396176a4f2eb50047cd563` accepts zero functions across 11 JS/TS
files. The LiveStore TanStack auth app at
`b2629833e4f2d5aa0beb204886052d02fff6a48a` accepts zero across 21 source files.
These are conservative source censuses with framework aliases disabled for
imported closures and application-local TypeScript only. No probe or native
coverage claim is attached to either upstream app. Component-inline functions
and separate RSC provider environments remain gaps.

All 95 Next tests pass. The promotion suite passes five tests, with two opt-in
production cases skipped by default and passed separately through serial
framework runners. A real Vite builder test checks two server environments
without `build.ssr`, with a client build between them. Classic Vite 6 and 7 tests
also pass. Temporary framework dependencies and output are removed after checks.
No Docker/container changes, compiler/fork changes, Papermark work, root README
edit, deployment, hosting call, merge, or push.
[Integration, limits, census, retained counters, and reproduction](framework-integrations-nitro-tanstack.md).

## 29. A0 async region outlining census (2026-11-02)

Research only. No transform was built. The finder scans all async functions in
K1's Umami and Dub server directories, plus a sparse pinned Formbricks response
and summary analysis scope. It records suspension-free statement runs, live
inputs and outputs with application checker types, return and jump exclusions,
throws, and this/arguments use. Hypothetical sync functions exist only in memory.
The real work, extraction, dependency, initialization, purity, boundary, strict
closure, and construction checks determine acceptance. Independent boundary
probes expose later data blockers. No native code was compiled or timed.

Umami: 598 async functions, 1,283 regions, zero accepted. Dub: 607 async
functions, 1,534 regions, zero accepted. Formbricks at
`76b05fb98dd870000d820ad8a27527e483dcfbb0`: 28 async functions, 83 regions,
one accepted. Its concrete Prisma row-to-deletion-ID map passes construction
proof. It is outside summary aggregation and has no CPU attribution. Generating
Formbricks' real Prisma client and JSON types changed this result from zero to
one, demonstrating why missing generated types cannot be treated as real any.
The summary mapper instead fails an independent boundary probe on nested Dates;
module initialization is still its first rejection.

Concrete input witnesses recover two Umami team-ID maps and one Dub tag map.
The optimistic additional bounds are 9 and 30 respectively, with remaining
construction and typing failures unproved. No witness is on a K1-profiled path.
New accepted coverage on those measured fixtures is zero. Historical Umami map
CPU of 9.8–11.1% remains a multi-gate ceiling, not an async-only coverage estimate.
Recommend observed-shape collection research before a production async outliner.
Confidence is moderate in that ordering and low for whole-app extrapolation.

The census has 2,900 regions in total. Later lexical references conservatively
approximate liveness; early-return protocols and loops containing awaits remain
excluded. Umami and Dub retain minimal dependency types, with unresolved types
reported separately. Formbricks uses its pinned Zod, Prisma, JSON generator, and
actual workspace source paths. Liveness fixtures and syntax checks pass. A fresh
dependency setup and both Prisma generators were checked independently.

Temporary dependencies and generated Prisma files were removed. Source checkouts
stay outside the repo; no AGPL source is committed. No Docker/container action,
Papermark use, hosting call, compiler/fork modification, root README edit, merge,
or push. [Report, full JSON census, counterfactual bounds, and reproduction](async-region-census.md).

**Review note (2026-11-02).** The census data points somewhere other than its recommendation. `any`/unknown is a small *first* rejection (9 / 27 / 0). The largest first rejection is closure/module-init (309 Umami, 424 Dub, 62 Formbricks of 83), followed by closure/import. The largest real compute region found, Formbricks `getElementSummary` (lines 329–1021, a synchronous aggregation loop), is rejected because of `export const getSurveySummary = reactCache(...)` at line 1024. That declaration is not in the region's dependency closure. `dependency-closure.mjs` checks the initialization of *every* top-level statement in each visited module, and its effect scan (Date, `new`, `this`, etc.) also covers the whole file. Next step: restrict those checks to the bindings reachable from the candidate (M1). Observed shapes are deferred.

## 30. M1 reachable module initialization (2026-11-02)

Implemented binding reachability for automatic native dependency closures. Source
candidates seed local bindings; imported references request only their specific
exports. A per-file union accumulates all requests before emission, including
requests through diamonds and export aliases. Unused declarations and sibling
variable declarators disappear. Reachable initializers and effects retain their
existing restrictions. Reachable module cycles still reject. Bare top-level
statements and side-effect-only imports reject across visited files.

Unreachable call initializers are accepted under the existing pure-closure and
unmodified-builtins assumptions. The original JS module still initializes.
Excluded initialization can nevertheless mutate prototypes, globals, or function
objects observed by the closure. Shadow comparison catches sampled divergence;
it is not a universal proof against later shared-state mutation. The report states
this boundary and the conservative rules that remain.

Pinned before/after K1/K4 censuses accept Umami 4 and Dub 32 sync functions in both
runs. A0 accepts 0 / 0 / 1 regions in Umami / Dub / Formbricks in both runs. No new
function or region lies on K1 paths, so no coverage-share rerun is required and
additional accepted measured coverage is zero. Module-init first rejections fall
309 to 94 in Umami and 424 to 271 in Dub; later closure checks absorb the difference.
Formbricks remains at 62. Its `getElementSummary` region now first rejects the
explicit `import "server-only"`, rather than the unrelated reactCache initializer.
The single final held-out Papermark census accepts 23, with no execution or timing.

All 95 Next tests pass. The promotion suite passes 15 tests with two opt-in skips,
including eight new reachability regressions. Real-addon differential fuzz passes
680 inputs and 1,360 comparisons across 17 candidates at seed 20935. A0 liveness
fixtures pass. M1 additionally admits the React Router demo's page loader beside
JSX; the HTTP fixture now exercises its shadow verification as well as checksum.
Astro and React Router each pass 241 requests per mode with zero fallbacks.

Task-created dependencies, workspace links, and generated Prisma output are
removed. App sources remain outside the repo. No native timing, Docker/container
operation, hosting call, compiler/fork edit, root README change, publication,
merge, or push. At most two jobs ran together. [Design, soundness boundary,
histograms, snapshots, and reproduction](reachable-module-init.md).

**Review follow-up (2026-11-02): `server-only` marker.** Every side-effect import that blocked a region after M1 was `import "server-only"`: 174 Dub regions (`lib/api/errors.ts`, `assert-role-plan.ts`) and about 60 Formbricks regions, including `getElementSummary`. Next resolves that package to an empty module on the server, and it throws in client bundles. A running server has therefore executed it as a no-op, and the native copy does not need it. The closure check now admits exactly that specifier. `client-only`, polyfills and lookalike names still reject; a test covers them.

A0 rerun on Dub and Formbricks with the change (artifact not replaced):
- **Regions accepted:** still 0 and 1.
- **Dub:**
  - closure/module-init falls from 271 to 252;
  - the next blockers are `errors.ts` `ClassDeclaration` (158; regions that throw the app's error classes reach them), unresolved `@prisma/client`/`@dub/utils` in the minimal type setup (119), and namespace imports (21).
- **Formbricks:**
  - closure/module-init falls from 62 to 28;
  - `getElementSummary` now stops at `unresolved export TSurveyElementTypeEnum`, an enum value imported from `@formbricks/types`.

The remaining blockers are now specific constructs: app error classes on throw paths, imported enums and constant objects, and type-only imports that need type linking. Each is a bounded adapter feature.


## 31. M2 bounded dependency closure features (2026-11-02)

Implemented transitive imported interface and alias linking with collision-safe
renaming, app-local TypeScript resolution, declaration-file support for types,
and strict standalone closure checking. Named source re-exports now link. Literal
string and numeric enums, including const enums and numeric auto-increment, lower
to literal reads and literal-union annotations. Computed members and unsafe uses
reject. Formbricks' TSurveyElementTypeEnum is a genuine TS string enum in
surveys/constants.ts, re-exported by elements.ts, rather than a Zod initializer.

Private as-const object and array graphs admit literal-key scalar reads after an
all-reference mutation and escape audit. Exported objects remain rejected because
as const is erased and another importer can mutate the object. Whole-application
reference analysis or an explicit runtime immutability contract is needed for
that extension. Zod and all call initializers remain excluded.

Reachable classes used solely as direct throw-new constructors become a native
fallback throw. Retained try statements and other class uses reject. Construction
proofs establish replay purity; the builder forces catchFallback for a supported
result ABI even when disabled by its caller. A real addon verifies enum and table
reads, then replays JS exactly once per throw and preserves the actual source
module's error constructor identity, name, and message. The report gives the
soundness argument and retains M1's module and builtin assumptions.

Pinned K1/K4 sync acceptance remains Umami 4 and Dub 32. A0 acceptance remains
0 / 0 / 1 for Umami / Dub / Formbricks. No newly accepted functions or regions
reach K1 paths, so additional accepted measured coverage is zero and coverage
shares need no rerun. A0 module-init first rejections move 94 to 85, 252 to 91,
and 28 to 21. Later gates absorb the difference. getElementSummary, lines 329–1021,
now first rejects the Date in local TSurveySummaryResponse.updatedAt, before its
enum read. The single final held-out Papermark census accepts 23. No app execution
or timing was performed for Papermark.

All 95 Next tests pass. Promotion passes 21 tests, adding five to the prior 16,
with two existing opt-in skips. Stock-addon differential fuzz passes 680 inputs
and 1,360 comparisons across 17 candidates at seed 20935. A0 liveness fixtures
pass. Setup cleanup modes remove owned dependencies and generated Prisma output;
temporary workspace links are removed after final validation. At most two jobs
run together. No native timing, Docker/container work, hosting call, fork edit,
root README change, publication, merge, or push. AGPL sources stay outside the
repo. [Design, exclusions, full histograms, validation and reproduction](closure-features.md).

## 32. L1 whole-library native builds through esbuild (2026-11-02)

Research probe, stock registry scriptc 0.4.6, esbuild 0.25.12. Bundling the
selected entry's complete dependency graph, including initialization, works for
json-2-csv 5.5.0 and escape-html 1.0.3. Both pass 240 generated inputs byte for
byte against JS through the production addon, 240 forced native dispatches with
zero fallbacks, and 240 automatic shadow verifications. Empty CSV arrays also
match. This bypasses discovery and construction proofs to test compiler/runtime
feasibility; it is not a production adapter eligibility change.

CSV's initial SC0001 diagnostics on TS-emitted feature checks disappear with a
bundle `// @ts-nocheck` banner. tsconfig noCheck did not suppress them. Escape-html
needs a bundled require entry to avoid esbuild __toESM calling Object.getPrototypeOf
on a function, which panics with SC4013. Markdown-it 14.1.0 builds but fails in
rev_init with SC4013, expected string at $ but got undefined, across three runtime
variants. Its responsible expression is not localized. Day.js 1.11.13 builds
after syntax/UMD adjustments but hits SC1090 on function-constructor instanceof,
wrapped in SC4013. A nocheck-only alternative instead hits SC2001 on a void value
in the UMD initializer. These are upstream compiler/runtime asks, with pinned
reproduction and hashes. Bundling removes the raw CJS barrier, not all JS gaps.

Thread-CPU measurements at three sizes show both passing libraries slower than
JS. Results are local indicative, needs stand-in/hosted confirmation. No hosted
work, request coverage, or CPU saving is claimed. The design note retains boundary,
purity, replay, and initialization-effect obligations. Separate JS/native state
requires an immutable-configuration contract or library-wide invalidation;
sampled shadow checks cannot prevent every stale promoted response.

All selected libraries are MIT; the compiled dependency graphs use MIT/BSD only.
Markdown-it's Python-licensed argparse CLI dependency is installed but excluded
from every graph. Installs, bundles and native outputs remain external and are
removed after checks. No containers, fork edits, held-out app work, root README
edit, hosting calls, publication, merge or push. Builds run sequentially beside
the other research job. [Report, JSON, scripts, hashes, and reproduction](whole-library-native.md).

**Review note on L1 (2026-11-02).** The 4–10× native slowdown is most likely structural, not overhead:
- The bundles compile only with `// @ts-nocheck`, so scriptc sees untyped JS. Every value goes through its dynamic representation, which V8's JIT handles better.
- scriptc's advantage comes from static types, and shipped `dist/*.js` has discarded them.
- **Next probe (L2):** compile libraries written in TypeScript (json-2-csv is one) from their TS sources, with types intact, and compare against the untyped bundle. If typed sources win, the whole-library path should compile from source where a package publishes it, and not from dist JS.

## 34. F1 summary boundary counterexample (2026-11-02)

F1 remains blocked before adapter implementation. At the pinned Formbricks
revision, `getElementSummary` observes `response.updatedAt` and returns the Date
in its samples. Its OpenText result also retains the original element, contact,
and contactAttributes references. The region has six timestamp read sites and
16 sites that store the whole element in a summary. Those input sub-objects
escape, violating the requested projection condition.

An executable counterexample reads the pinned source outside the repository,
checks it against the pinned Git blob, and runs its unchanged statement prefix
through the element loop. Dropping createdAt preserves bytes, but dropping
updatedAt changes bytes. Dropping an extra element field also changes bytes,
although the loop never reads that field explicitly. The production argument
encoder and result canonicalizer reject the retained Date. Converting the Date
to a string preserves JSON bytes for this fixture but changes its JavaScript
value and reference identity. A malformed response preserves the loop's TypeError.
The existing closure checker still rejects the actual local response interface
on `Identifier Date`.

This is evidence against the specified whole-region JSON projection, not a
scriptc compiler failure. No adapter gates were weakened, and no projection,
Zod emitter, async outliner, native summary, verified summary shadows, or CPU
comparison is claimed. A smaller count-only region with JS result assembly, or
a new reference-preserving transport contract, needs a separate design. The
fork stays on hold.

The reproduction is a scoped source-prefix check, not a complete application
module import or the requested end-to-end harness. AGPL source and transpiled
code are never saved in the repository. There is no summary timing to overlap
the other library probe. No container, hosting, held-out app, fork, or root README
operation is performed. [Evidence, limitations, validation, and reproduction](formbricks-summary.md).

All 95 Next tests and 21 promotion tests pass, with two existing promotion skips.
The real-addon differential fuzzer passes seed 20935 across 17 candidates,
680 inputs, and 1,360 comparisons. These validate the existing adapter corpus,
not a promoted summary. Temporary task-owned links are removed after validation.
No setup installation was created or removed. The artifact compression check
passes. The change is committed locally without a merge or push.

**Review note on F1 (2026-11-02): opaque handles.** Field projection is the wrong tool for this region. The aggregation *passes through* input objects (elements, contacts, `updatedAt` Dates) into its result without computing on them. A transport that keeps identity would cover that pattern:
- Values the closure only moves are sent to native code as opaque handles: indices into the call's argument graph.
- Native returns those handles in its result, and JS rebuilds the result with the original references.
- Only fields the closure actually reads (compares, does arithmetic on, or uses as keys) must be JSON-typed.

The analysis it needs: classify each input path as read versus passthrough-only; reject any identity comparison or mutation of a handle. Then Dates, class instances and original object identity survive exactly, because they never cross the boundary. This is the proposed next adapter feature (H1), with `getElementSummary` as its acceptance target.

## 33. L2 typed-source whole-library builds (2026-11-02)

Research probe using stock scriptc 0.4.6 and the L1 addon/dispatcher. Fetched
json-2-csv 5.5.0, deeks 3.1.0, and doc-path 4.1.0 at their matching tags, plus
fastest-levenshtein 1.0.16 at its registry gitHead. All four are MIT and written
in TypeScript. Source stayed in an external temp directory. Compiled project TS
modules directly, preserving types rather than stripping them with esbuild.
Only package-import resolution changed in the unmodified TS variant.

Typed CSV fails five SC1090 support checks: inferred number[] versus string[],
concat spreads at two sites, toLocaleString, and reading array.flat as a value.
An annotation-only patch, verified to erase to identical JS, removes the array
inference error but leaves four unsupported operations. No successful typed CSV
archive or CPU result is claimed. Initial package-shaped source attempts also
report SC4020; complete diagnostics and the failed annotation patch are retained.
The untyped CSV bundle is byte-identical to a fresh unchanged L1 probe build,
passes L1's exact 240-input corpus, forced dispatch and automatic shadow checks,
and remains 5.22–5.81× slower than V8 through a new 315 KB payload.

Typed fastest-levenshtein compiles unchanged and passes 240 paired-string inputs,
240 forced native dispatches without fallback, and 240 shadow verifications.
Its untyped dist bundle builds but fails native input 1 with SC1090 non-number
indexing, wrapped SC4013. It supplies no successful untyped CPU comparison.
Typed native/V8 ratios are 2.12, 1.75, 1.13, and 0.96 for 47, 527, 4,111, and
131,119-byte payloads in the repeat session. The first session's large-case
ratio is 0.94. The large case compares 30 versus 122,880 code units, so the
4.3–6.2% local saving does not identify a general size crossover.

Same-payload sink, echo, and JSON-parse-plus-echo controls use the same archive,
ABI, owner handoff, and thread-CPU sampling. These are transport proxies, not an
exact decomposition. Echo consumes about 1.7% of large CSV native CPU and 4.0%
of large typed-distance CPU. Parse-plus-echo consumes about 6% for both. Transport
dominates the smallest distance case, but cannot explain large CSV's deficit.
Types help acceptance here and permit one narrow V8 win; they do not establish
that nocheck caused L1's slowdown or that typed-source adapters generally win.

Local indicative on Apple M4 Pro, Node 26.13.0; needs stand-in confirmation.
Five warm-up and 35 measured pairs per size, sequential timing with no overlapping
work from this agent. No hosting calls, Docker, publication, fork edits, held-out
Papermark work, root README edits, merge, or push. Temp sources and native outputs
were removed. All artifacts are below 256 KB. Adapter guidance requires verified
source provenance and type-preserving graph assembly, with per-entry correctness
and CPU gates. [Report, JSON, patch, chart, and scripts](typed-library-native.md).

**Review note on L1/L2 together (2026-11-02).** Transport is not the bottleneck:
- The parse-plus-echo proxy is about 6% of native CPU at large CSV sizes.
- The generic object/string-heavy library code itself runs about 5× slower natively in stock scriptc 0.4.6.
- Native wins only on tight, typed loops: Papermark's numeric distribution (3–4×) and Levenshtein at 131 KB (marginally).

This bounds every coverage feature. Unlocking more functions helps CPU only where scriptc's code generation beats V8, and for typical library code it currently does not. The dispatcher keeps such code in JS, so there is no harm but also no gain. Broad "X% less CPU" claims therefore depend on scriptc code-generation work for objects, strings and generics (fork/upstream), not only on adapter coverage.

## 35. H1 opaque passthrough handles (2026-11-02)

Automatic promotion now lowers proven borrowed input paths to nominal numeric
handles. Argument encoding retains a per-call table; result decoding restores
original references. Date values, class instances, and arbitrary unknown borrowed
fields survive without JSON conversion. A second typed audit catches inspection
through local containers, and every handle-bearing build requires construction
proof and per-call fallback. Existing JSON bytes still compare canonically;
borrowed leaves compare by original-value identity after decoding.

The real addon exercises automatic discovery with imported boundary types,
100 seeded differential calls, exact Date and arbitrary-value identity, decoded
shadow verification, and intentional mismatch demotion. The bounded classifier
supports property paths, constant aliases, for-of and map bindings, and local
array pushes. Unknown helper uses remain reads. Generic functions, explicit
result annotations, optional structures, and unsupported shapes retain their
previous checks. This is conservative H1 coverage, not whole-program inference.

The pinned Formbricks body rejects `opaque handle is also read: 1.[]` for
`elements[]`: it reads each element's fields and returns that same element.
The requested read-and-pass exclusion prevents whole-summary acceptance.
A separate closure using the original response interface passes the former Date
gate and next rejects Zod's `TResponseData` type query in responses.ts. No scriptc
blocker is established. No Zod emitter, production outliner, native summary,
100/1k/10k parity run, or timing is claimed. The fork remains untouched.

Next passes 95 tests. Promotion passes 24 tests, including three new H1 tests,
with the two existing opt-in skips. The baseline fuzzer passes 680 inputs and
1,360 comparisons across 17 candidates. Setup briefly overlapped a suite and may
have exceeded the two-job budget if the other probe was active; subsequent jobs
ran serially. No timing ran. AGPL source stays outside the repo. Setup output
and temporary links are cleaned, artifacts are checked for compression, and the
change is committed locally without merge or push. No containers, hosting,
Papermark, compiler-fork, or root README work. [Design, limits, evidence, and
reproduction](opaque-handles.md).

## 36. H2 read-and-pass handles and Zod type queries (2026-11-02)

Read-and-pass plain objects now carry selected typed fields and a generated
original-value handle at the same input position. Passthrough expressions copy
that field; decoding restores the original reference. Own data descriptors
validate reads without evaluating getters. Input immutability and synchronous
execution make the projection agree with the returned original, including
aliases between read containers and passed values. Whole-object inspection,
mutation, unproved helpers, and descendant object identity comparisons still
reject. Construction proof and the second typed handle audit remain required.

The application checker resolves type-query aliases, including real Zod infer,
to structural declarations without copying or executing schemas. Unsupported
nested types remain unknown until specialization, which must remove them or
make them handles. Function, symbol, brand, and recursive read shapes reject.
Checker-read dependencies join hash verification. The actual Formbricks response
interface now passes the former TResponseData query gate.

The full typed summary closure next hits the adapter's computed-member gate in
checkForI18n at surveySummary.ts line 255. That helper also uses `in` on an input
element at line 252, explicitly outside H2's contract. A pure-reader designation
alone cannot admit it. No scriptc blocker is established, and the fork remains
on hold. The full region has not cleared; no production async outliner, native
summary, 100/1k/10k parity run, summary shadow, or CPU measurement is claimed.

Next passes 95 tests; promotion passes 26 with two existing skips. The real addon
checks 100 seeded read-and-pass calls, original row and Date identity, decoded
shadows, and mismatch demotion. The baseline fuzzer passes 680 inputs and 1,360
comparisons across 17 candidates. An early short probe briefly overlapped both
suites and exceeded the two-job limit; later validation uses at most two heavy
jobs. No timing ran. AGPL source stays outside the repository. Setup output and
temporary links are cleaned, artifacts are checked for compression, and the
change is committed locally without merge or push. No container, hosting,
Papermark, fork, or root README work. [Design, next blockers, evidence, and
reproduction](read-and-pass-handles.md).

## 37. PM1 held-out Papermark request CPU milestone (2026-11-02)

PM1 does not meet the end goal. The unchanged pinned video-analytics request,
with K1's service mocks and fresh JSON-decoded events, uses 15.63% more inclusive
process CPU in AUTO on the 600-request 70/20/10 mix. The paired block 95% CI is
10.23% to 21.52% more CPU. OFF totals 14,971.168 ms and AUTO 17,311.622 ms.
All 5,640 timed responses are byte-identical. There are zero mismatch demotions.
No post-promotion steady-state result exists.

Current default discovery compiles five playback exports, compared with one in
the earlier local gate. Nested playbackSeconds wrappers execute twice per event.
Earlier helper shadows occupy the dispatcher's pending slot before the target
can sample. documentViewDistribution ends in shadow at all three sizes, with
3/0/0 verified shadows after 1,160/860/800 requests. Its inability to promote in
this observation is recorded without changing policy, candidate selection,
construction defaults, adapter, or compiler. This is a milestone failure, not
a tuning step.

The calibrated Linux arm64 stand-in runs one Node 24 session on CPU 11, capped
at one CPU and 2 GiB, with networking disabled. Process CPU includes background
shadow drains. Per-request thread CPU, p95, bootstrap CIs, full response hashes,
transitions, and native stage diagnostics are retained. C1's exact 1.792/2.260
factors predict a 16.43% proxy increase. Its conservative ±17.37% error comparison
spans -65.37% to +18.03% saving. This is a CPU-input hosted-wall proxy, not a
calibrated Vercel Active CPU result. The omitted real auth, Prisma, and Tinybird
client CPU would make a positive saving an optimistic endpoint upper bound.

Host ps and load are captured immediately before every timing window. No other
agent, compiler, or test job from this task overlaps timing, but desktop and
macOS background CPU remain visible. The fully quiet host condition is not
established. Mixed large pairs are always AUTO-first under the fixed five-call
rotation, another limitation. No rows are filtered or rerun to improve the result.

The dedicated nsc-standin-pm1 container is removed. Papermark source and all native
outputs remain outside the repository, and temporary outputs and dependency links
are removed after validation. No existing container, root README, scriptc fork,
hosting, publication, merge, or push operation occurs. Validation and reproduction
are recorded in the [PM1 report](papermark-milestone.md). The work is committed
locally on its branch.

**Review note on PM1 (2026-11-02): an integration defect, not a scriptc result.** AUTO cost 15.6% more mixed CPU, and the target never promoted. The cause is in the adapter:
1. **Tiny helper wrapped in a hot loop.** `playbackSeconds` is called twice per event *from inside JS* (107.7M dispatches in PM1). Each call goes through the dispatcher wrapper, even after its bucket chose `js-final`.
2. **Shadow starvation.** Nested helpers occupy the single shared pending-shadow slot and the same 20/200-call schedules. `documentViewDistribution` therefore collects 0–3 verified shadows instead of the 24 it needs, and never decides.

**Planned fixes (D3), validated only on development workloads:**
- calls between candidates inside JS bodies go to the original function, with no wrapper;
- a near-zero-cost fast path once a function or bucket is `js-final`;
- a per-function shadow slot and fair sampling, so nested candidates cannot starve outer ones;
- optionally, never wrap candidates whose work screen shows trivially small per-call cost.

Papermark stays held out: it is not used to tune D3, and is remeasured only as the next milestone (PM2).

## 38. D3 internal JS calls and fair shadow admission (2026-11-02)

Candidate JS bodies call raw companions for accepted local and linked candidates.
Application entries keep wrappers, including exported helpers. The shared loader
preserves lexical bindings, private helpers, arrows, parameter patterns, and
recursive function expressions. Dependency resolution records linked targets;
canonical paths handle symlinks. Native closures are unchanged.

Settled JS checks its bucket and recheck deadline before sampling, logging, or
encoding. Single-scalar size lookup avoids the loop and logarithm. The final
thread-CPU microbenchmark measures about 32 ns of dispatcher overhead and 60 ns
of full-wrapper overhead. The wrapper is slower than the baseline in this probe;
internal calls bypass it entirely. The first, slower dispatcher probe is retained.

Shadow slots are per bucket. A dispatcher-wide rolling 50/minute cap admits
least-served active buckets and expires dormant participation after a minute.
Learning and recheck deadlines are staggered without increasing their frequency.
D1's 24 pairs, 19 votes, two cold exclusions, and 0.90/1.05 ratios remain unchanged.
D2 CPU pairs still require both CPU clocks. Legacy wall pairs retain the global
pending exclusion. There is no new static tiny-function cost heuristic.

The development nested aggregation compiles both its scalar helper and outer
function. At 600/6,000/60,000 records, D3 verifies 26 shadows and settles on JS.
The old wrapper-inflated JS reference instead promotes. This fixture does not
reproduce PM1's persistent starvation at its exact call counts. A separate
nested-load regression proves that the outer can collect 24 winning pairs and
promote under the global quota. No held-out Papermark execution or tuning occurs.

The Linux arm64 stand-in uses only nsc-standin-d3, CPU 11, one CPU, 2 GiB,
and no network. Before/after thread CPU and inclusive process CPU are retained.
The D2/M3 rerun passes the amended gate in strict and opt-in construction modes:
AUTO selects the best fixed lane in every bucket, stays within 1.5% of its median,
and beats JS on the mixed total beyond C1's calibration band. Strict mixed
inclusive CPU is 2,867 ms AUTO versus 5,732 ms JS; construction AUTO is 2,137 ms.
C1 remains a hosted-wall proxy, not calibrated Active CPU. The original revenue
benchmark also passes parity at all four sizes. No task build or test overlaps
timing. Host background load remains a limitation.

Next passes 98 tests, promotion passes 26 with two existing skips, and the demo
passes 24. Differential fuzz passes 680 inputs and 1,360 comparisons across 17
candidates. Final focused checks cover the scalar shortcut and expanded raw-call
cases. Initial linked-path and revenue-stage setup failures are retained. An
accidental broad demo test glob is stopped outside timing windows before the
intended suite passes. Task containers, build outputs, and dependency links are
removed. Artifacts above 256 KiB are compressed. The root README and compiler
fork are untouched. Nothing is hosted, published, merged, or pushed. The change
is committed locally. [Policy, measurements, limits, and reproduction](nested-dispatch.md).

## 39. PM2 held-out Papermark milestone with D3 (2026-11-02)

Hypothesis: D3 removes PM1's internal helper dispatch overhead and allows the
held-out target to collect shadows under the same request schedule. The adapter
is unchanged at 7a19a40. PM2 copies PM1's exact harness, Papermark pin, K1 mocks,
fixtures, counts, arm rotation, quota pauses, inclusive drain accounting, and
Linux arm64 Node 24 configuration. Only dedicated container and output paths
change. No held-out tuning occurs.

Mixed inclusive process CPU is 14,787.509 ms OFF and 14,865.309 ms AUTO, a 0.53%
increase, versus PM1's 15.63% increase. The paired-block 95% saving CI is -6.37%
to +4.34%. All 5,640 timed responses are byte-identical, their hashes match PM1,
and there are zero mismatch demotions or native fallbacks. No candidate promotes,
so no post-promotion steady state exists. The end goal remains unmet.

playbackSeconds dispatcher calls fall from 107,712,000 to zero. The handler's
external resolveVideoLength and watchTimeSeconds entries remain at 2,820 each,
as expected. documentViewDistribution collects 26/25/26 verified shadows at
600/6,000/60,000 events, compared with PM1's 3/0/0. The small and large buckets
complete epochs and choose JS at calls 1,160 and 799. The middle bucket ends one
valid pair short. Every collected target pair loses the promotion threshold.
Native boundary-inclusive median CPU is about 3.5/3.2/1.7 times its paired JS
reference. The separate stage probe identifies full-event JS encoding as its
largest stage. Fair admission restores service, but the unchanged schedule does
not complete all epochs under D3's shared quota. These are diagnoses only.

C1's exact 1.792 compute and 2.260 boundary factors predict 1.18% more mixed CPU
proxy cost. Opposing ±17.37% bands span -43.71% to +28.77% saving. This remains a
CPU-input hosted-wall proxy, not calibrated Vercel Active CPU. Mocked services
make any positive saving an optimistic endpoint upper bound. No hosting calls
or published performance claims occur.

All ten windows retain pre-window ps and load snapshots. This is the only agent
running the task, and no build, test, or analysis overlaps timing. Background
services and unrelated containers remain active; host load spans 3.37–7.63.
The fully idle host condition is not established. PM1's mixed large-pair order
bias remains. No measured rows are filtered or rerun.

Next passes 98 tests, including 680 seeded real-addon inputs and 1,360 comparisons
across 17 candidates. Promotion passes 26 with two existing skips. Setup failures
before timing and a later missing-Zod-link test failure are retained; only
task-owned dependency links resolve them. The dedicated nsc-standin-pm2 container,
external build tree, restored sparse-checkout handler, test outputs, and temporary
links are removed. Main's recorded dependency links remain unchanged. Artifacts
over 256 KiB are compressed. The root README, main checkout, scriptc fork, and
/Users/noah/scriptc are untouched. No existing container is altered. PM2 is kept
as measurement evidence and committed locally without merge or push.
[Report, comparisons, diagnostics, and reproduction](papermark-milestone-2.md).

**Review note on PM2 (2026-11-02): the input encoder is the bottleneck.** D3 removed the overhead: the mixed result is −0.53% (CI −6.4% to +4.3%), against PM1's −15.6%. The target now collects its shadows, and JS still correctly wins every pair. PM2's stage probe at 60k events: native compute is 36 ms against 111 ms for JS (3× faster), but **JS-side argument encoding takes 126 ms on its own**, and native JSON decode another 27 ms.

The encoder (`walkOpaque` in promotion-encodings.mjs) walks every field generically, with `getOwnPropertyDescriptor`, prototype checks and `Array.from` closures. That is a general adapter cost for every object-array input, not something specific to Papermark. Next is E1: schema-specialized generated encoders (and decoders), with the same checks (plain prototypes, own data properties, dense arrays, reserved keys), measured on development workloads only. The read-field projection the encoder already does also shrinks the payload. Papermark is remeasured only at the next milestone (PM3).

## 40. E1 generated projected argument encoders (2026-11-02)

Bounded projected input schemas now generate direct JSON writers once per loaded
schema. Writers retain per-value descriptor checks, exact array prototypes and
density checks, typed scalars, reserved-key rejection, JSON negative-zero
canonicalization, string escaping, and H1/H2 call handle identity. Getter checks
cannot safely be cached by prototype or key list. A no-eval CSP and unsupported
schemas retain the checked walker. Unshaped JSON boundaries retain strict generic
serialization because a type alone cannot authorize dropping extra fields.

The development fixture has eight scalar fields per record, reads three, takes a
scalar argument, and returns aggregates plus one original record. Papermark is
held out. At 600/6,000/60,000 records, the generated encoder is faster than the old
walker in local and Linux stand-in measurements. At 60k, local encoding falls
from 89.19 to 31.40 ms and stand-in encoding from 120.66 to 57.77 ms. Inclusive
native process CPU falls from 103.91 to 52.39 ms locally and 125.63 to 63.09 ms in
the stand-in. JS needs only about 0.2 ms on this cheap aggregation. All three
buckets correctly choose JS after 26 verified shadows. E1 does not establish an
application CPU saving or successful promotion on this fixture.

The validated-projection plus JSON.stringify control also removes much of the
old cost. The generated writer has lower central times in the final cells, but
no confidence interval establishes a universal winner. Initial rope-writer
samples remain alongside the final array-join samples. Sessions are not paired,
and background load and GC limit conclusions about the join change.

Column JSON reduces the 60k native decode stage from about 4.0 to 1.35 ms in the
stand-in. Its payload is prebuilt and omits returned identity. This is a decode
lower bound, not an end-to-end production wire-format win. The byte-compatible
record ABI stays in production. JS result decode and canonicalization cost about
0.031 and 0.022 ms and remain unchanged.

The unchanged amended revenue gate passes in strict and construction modes.
Mixed inclusive CPU is 5,829.921 ms JS, 2,695.269 ms strict AUTO, and 1,957.860 ms
construction AUTO. Lane choices match D3. C1 remains a hosted-wall proxy rather
than calibrated Active CPU. No hosting calls occur.

Validation includes 2,000 randomized old/new byte comparisons, rejection cases,
integer-key handle order, present undefined, H1/H2, and no-eval fallback. Next
passes 98 tests including the 680-input, 1,360-comparison real-addon fuzzer across
17 candidates. Promotion passes 29 tests with two existing skips, and the demo
passes 24 tests. Final package logs use workspace links pointing into this
worktree. Harness setup failures and both measured writer variants are retained.

Only task-owned nsc-standin-e1 containers are created and removed, with one CPU,
CPU 11, 2 GiB, and no network. No task build, test, or analysis overlaps timing.
No other agent runs. Temporary dependencies and native outputs are removed.
Artifacts over 256 KiB are compressed. The root README, main checkout, scriptc
fork, and /Users/noah/scriptc are untouched. The work is committed locally with
no merge or push. [Report, limits, tables, and reproduction](boundary-encoders.md).

**Review note on E1 (2026-11-02): what it means for Papermark.** E1's development fixture does almost no compute (0.17 ms of JS at 60k records), so "selects JS" says nothing about compute-heavy targets.
- **What E1 does show:** encoding fell about 2× (stand-in, 60k records: 120.7 → 57.8 ms).
- **Projection onto PM2's stage profile:** about 58 ms encode + 27 ms native decode + 36 ms compute + about 4 ms other ≈ 125 ms, against 111 ms for JS. Still a small loss. This is an estimate, not a measurement.

**The general constraint is compute intensity.** Papermark's distribution costs about 1.9 µs of JS per event, and the JSON round trip costs about 1.5 µs per event even after E1. Native wins only when compute per input byte clearly exceeds boundary cost per byte.

**Remaining levers:**
1. Native typed-JSON decode speed (27 ms; compiler side).
2. The descriptor check per read field. There is no sound hidden-class shortcut in standard JS.
3. Avoiding re-serialization entirely when the input was just parsed from JSON text: source-text passthrough.

PM3 is deferred until one of these moves the estimate clearly below JS.

## 41. Container route candidates and local binding proxy (2026-11-02)

Shallow source census covers 12 Workers-targeting projects: 11 with OSS license
declarations and one source-available search system excluded from that denominator.
Five are strong source-level offload candidates, four OG workloads remain conditional,
and two OSS projects fail the numeric CPU screen. None has request CPU measured here.
The positives are image codecs and Argon2, predominantly Rust/Wasm already. One
image app already forwards Worker requests to a native Rust Cloudflare Container.
This supports explicit route offload, but does not establish an automatic scriptc
market. Source discovery on three clones accepts four small helpers and no
identified heavy JS compute core. App dependencies were not installed, so unresolved
imports are qualified rather than presented as definitive compiler failures.

A separate Node process calls a Miniflare Worker owning ephemeral local KV through
an authenticated HTTP shim. Final 300-sample sequential medians are 0.438 ms for
no-op, 0.570 ms for 64-byte get, and 0.949 ms for 64-byte put. At 64 KiB, get is
0.815 ms and put is 1.315 ms. These are complete loopback elapsed round trips,
including serialization and local storage, not hosted latency or isolated transport
surcharges. Three retained runs include raw samples; auth, scope, value limit,
missing-key, Unicode and readback assertions pass.

Current Cloudflare documentation already offers Container outbound handlers with
Worker bindings through virtual hostnames. Use that supported channel for a future
hosted version. Text KV shims are practical; R2 streams and metadata, D1 batches
and sessions, DO stub ordering, replay and cancellation need explicit contracts.
A general transparent env clone is not justified. Fetch at the Worker edge, run
compute in the container, and return once wherever possible.

No deploy, login, account API, Docker, push, or public write occurred. Miniflare's
default startup fetched public Request.cf metadata in preliminary runs; final code
sets cf:false and does not recreate its removed cache. All binding traffic stays
local. All task-owned clones, dependencies and symlinks are removed. No third-party
source, root README, main checkout or scriptc fork is changed. Details and limits:
[Candidate census](container-offload-candidates.md) and
[binding proxy](binding-proxy.md). Continue a small application-level offload proof,
then gate broader work on a measured heavy promotable JS route.

## 42. CO1 Nitro route offload to Containers feasibility (2026-11-02)

A small Nitro app builds the same numeric, trivial and KV-dependent routes for
Workers and Node, with `scriptc-promote/nitro` on Node. A route allowlist and GET-only
forwarder preserve Worker fallback on unavailability, timeout or upstream 5xx.
The Container class/DO entry bundles; its cold-state branch warms in the background
and serves the cold request locally. The supplied Linux amd64 Dockerfile is unbuilt.

Docker Desktop's daemon socket is missing in both local contexts. Wrangler
Containers fails before building an image. Plain Docker is blocked too. No task
container or image is created, and no existing Docker resource is touched.
Container cold start and all actual container performance remain unavailable.
The measured third alternative is Wrangler to host macOS Node over localhost HTTP.

At n=100k/300k, N=60 per cell, median wall milliseconds are Worker JS 73.85/213.71,
Worker wasm 44.35/129.74, host Node JS 62.67/187.31, promoted Node 16.03/47.17,
and forwarded promoted Node 18.09/49.79. Byte parity holds. AUTO promotes after
26 verified shadows at call 609 and retains zero native fallbacks. The typed loop
has a scalar boundary and benefits from wasm locally, unlike CF1's revenue case.

The approximate HTTP hop is 1.44 ms on the trivial control and 2.06–2.62 ms on
numeric requests. An equal-framework warm compute model gives about 2–4 ms
break-even, with no positive crossover observed in the actual local route paths.
This excludes DO hops, placement, CPU quotas and container startup. Production
break-even is unknown. Worker and Container CPU overage rates are equal per CPU
second. A 4x native acceleration cuts compute cost by 75%; an illustrative fully utilized standard-2
instance saves about one-third overall before forwarding CPU. Provisioned memory,
disk, DO usage and idle tails can erase that saving. Sparse traffic loses badly.

Current Cloudflare docs support virtual-host outbound HTTP handlers that call
Worker bindings. Containers do not inherit live binding objects. Direct Node KV
returns 503; the forwarder serves the local Worker KV result instead. A narrow
binding protocol, replay rules, lifecycle policy and bounded instance pool would
be needed for an opt-in adapter. No package API is added.

Two focused forwarding tests, final Worker/wasm/fallback smoke checks and the
Container entry bundling pass. Raw wall samples, process CPU batch counters,
spread, errors, version pins and limitations are retained. Task servers,
dependencies and generated artifacts are removed. The root README, main checkout
and compiler fork are untouched. No deployment, login, account call, push or PR
occurs. [Report and reproduction](container-offload.md).

## 43. Review note on CO1 and CO2 (2026-11-02)

CO1 measured the forwarding premise but not Containers. The Docker daemon was down, so
the "container" lane is host macOS Node behind a local Wrangler Worker. Cold start,
DO RPC, placement and VM CPU remain unmeasured. The useful numbers: on a scalar-boundary
typed-array loop, Worker → Node native beats Worker JS about 4.3× at n=300k (49.8 vs
213.7 ms) with a ~1.4–2.6 ms local hop, giving a warm break-even near 2–4 Worker CPU
ms. Real hops will be larger. The `C > H / (1 - 1/S)` formula is the planning tool.

A side result matters independently: on this compute-dense, scalar-boundary workload,
the in-Worker wasm reactor is 1.66× **faster** than Worker JS. CF1's 6–11% loss was a
JSON-heavy revenue workload. So the Cloudflare wasm path is not dead; it follows the
same compute-intensity constraint as native (entry 40), only with a lower ceiling.

CO2 is the demand side. The heavy, binding-separable Workers routes it found are image
codecs and Argon2, already compiled Rust/Wasm. Source discovery found no heavy
promotable JS core. One app already forwards to a Rust Container. Cloudflare's
outbound handlers make binding access a supported channel, so a general binding proxy
is unnecessary.

Conclusion: route offload is a viable opt-in escape hatch, but scriptc adds value
only where a route has a compute-dense JS core, and none has been found in real
Workers apps. Next gates, in order: (1) build and run the CO1 Dockerfile locally to
measure container cold start and Linux native speed; (2) find one real compute-dense
JS route. Until (2), do not build a package adapter.


## 44. App coverage report and opt-in measurement (2026-11-02)

`scriptc-promote report [dir]` now reports per-file discovery acceptance, exact
blockers, one-diagnostic nearest misses, and conservative route reachability.
`next-scriptc report` delegates to the same implementation. Framework detection
reads dependencies and config filenames; overrides and source scope are explicit.
Terminal output, JSON, and Markdown share one report model.

The inventory counts JavaScript independently of app allowJs and includes async
handlers and other silent exclusions. The examples collection has 473 top-level
callable bindings, 234 considered functions, 218 diagnosed functions, and 16
accepted functions. The collection root detects as generic. Individual app roots
provide framework attribution. Discovery diagnostics remain an incomplete
denominator, and one diagnostic does not prove there is only one blocker.

Opt-in measurement uses stock buildPromotion, existing boundary encoders, and
raw original extracted JS closures. Separate tuples retain their own size buckets.
Twenty warm calls precede two discarded pairs and 24 retained pairs. Decisions
reuse the dispatcher's 19-vote, 0.90 promotion threshold. A separate instrumented
build estimates wall boundary share. Reports retain spread, N, raw pairs, JSON
bytes, JS ns per byte as compute intensity, and synthetic input provenance.
Native fallback, mismatch, unavailable tooling, and compiler refusal remain visible.
Offline predictions claim neither observed promotion nor application savings.
Dispatcher behavior and thresholds are unchanged.

Own-code Next, Nitro, and SvelteKit fixtures cover route attribution, accepted
functions, blockers, and nearest misses. The measurement regression predicts
native for the typed-array numeric fixture and JS for cheap object aggregation;
a third function checks bounded TypeScript input synthesis. A simple sqrt loop
lost during development and was not presented as evidence of a native win.
The full Next suite passes 98 tests. The full core suite passes 34 tests with two
existing environment-gated skips. Worktree-local scriptc helper execute permissions
required repair after installation; initial prerequisite failures were rerun.

Runtime observations remain a follow-up: snapshot() exposes state only inside the
app process. Route graphs omit dynamic and framework-injected paths. Synthetic
inputs are illustrative, and extracted references cannot reproduce unrelated
module effects. See [design, output, reproduction, and limits](coverage-report.md).
No root README, main checkout, compiler fork, hosting service, Docker, push, or
public write is involved. Dependencies and native builds stay in the worktree or
in task-owned temporary directories. The change is committed locally.

## 45. Real-app evaluation corpus baseline (2026-11-02)

The corpus attempts 34 repositories and inspects source in 33. An interrupted
PostHog checkout is explicitly excluded from the inspected count. Breadth includes
analytics, finance, scheduling, spreadsheets, games, geometry, image, search and
text applications, plus unsupported-stack and source-available controls. Pins,
license evidence, framework hypotheses, scope failures and function links are in
[the manifest](eval-corpus/manifest.json). This is targeted source triage, not a
representative sample or a complete dependency-installed evaluation.

The generalized census uses the shared discoverPromotions API on arbitrary source
scopes. Fourteen primary scans complete, eleven have scope errors, and nine fail
or time out, including the incomplete checkout. Retained scans report thirty
accepted helpers, not thirty server promotions. Missing app dependencies partly
explain unresolved imports. Unsupported references/types, runtime imports and
the work screen dominate retained messages. Async exclusions are often silent;
diagnostic counts cannot supply a function denominator.

Sixteen function targets in four repositories have 48 final JS measurement cells,
with three realistic synthetic sizes each. Five pass the baseline's 100 us and
100 ns/input-byte screen, but none establishes a dense, discovery-accepted server
function. Four are overlapping Rybbit beta/projection targets with browser callers
only observed. GrowthBook's exact category split is dense near its real fifteen-
category cap, but discovery rejects the mutation proof and the observed server
caller is enterprise-licensed. Actual's pure forecast is cheap and its HTTP path
is unproven. These targets are not sixteen independent workloads.

Three accepted Umami prefix/hash/color controls compile with stock scriptc 0.4.6.
Nine native size cells verify exact parity across sixty retained calls each. Every
boundary-inclusive elapsed ratio loses to JS. Coarse stage clocks and quantized
CPU samples limit these tiny controls. No native timing is inferred for rejected
functions. No endpoint CPU delta or successful install-and-go CPU saving is
measured. Full results, limitations and reproduction are in
[the report](eval-corpus.md).

Commit e002d480caee9f8b2474fb0db273c877c3195e70 freezes seventeen DEV and seventeen
HELD_OUT repositories before any optimization. Papermark remains additionally
held out at its existing pin and is not executed. A final named baseline milestone
runs the unchanged bodies and inputs from /tmp after that freeze; there is no
intervening adapter, compiler or policy change. Earlier VM and worktree probes
remain labeled separately. The protocol fixes coverage reporting, correctness,
boundary-inclusive CPU gates and endpoint CPU gates for future milestones.

JSON and artifact-size checks pass. Syntax checks pass for census, benchmark and
native-build harnesses. The final external benchmark has no failed cells. No
third-party source is committed. Task clones, installs, dependency links and
native artifacts are removed. The root README, main checkout and compiler fork
are untouched. No application lifecycle script, database, Docker resource,
deployment, login, push, PR, issue or public post is used.

## 46. Review note on EV1 and EV2 (2026-11-02)

EV2 gives every app a per-route coverage report and an opt-in measured prediction
using the dispatcher's unchanged decision rule. Our own demo shows the familiar
shape: 334 top-level callables, 11 accepted.

EV1 is the first broad real-app eval: 34 repos, 33 inspected, 16 functions
measured, split 17 DEV / 17 HELD_OUT (plus Papermark) frozen in commit e002d48
before any optimization. Result: compute-dense JS exists (Rybbit beta statistics up
to ~10 µs per input byte; GrowthBook exhaustive split search 226 µs at 15
categories), but none of it is simultaneously (a) on a demonstrated server request
path, (b) OSS-licensed on that path, and (c) accepted by discovery. The only
accepted functions are tiny helpers that lose after the boundary.

The census is incomplete: 8 scans failed and 11 were partial (timeouts, parse
errors, no installed deps), so 4,269 "unsupported reference/type" and 1,586
"runtime import" diagnostics partly reflect missing dependencies. The 0% figure is
a lower bound, not a publishable claim.

Two DEV candidates are concrete: GrowthBook split search (blocked by a
conservative transitive argument-mutation proof and a mutable quadrature cache) and
Actual's forecast solver (pure numeric but cheap and HTTP use unproven). Next work:
complete dependency-installed censuses on DEV so the blocker histogram is real, then
attack the top real blockers using DEV only, then measure HELD_OUT once.


## 47. C1 compiler object/string attribution and dense key snapshots (2026-11-02)

Own-code development benchmarks cover typed record aggregation, strings, Map/Set, spread, generics, erased JSON, and pinned json-2-csv 5.5.0. All final numeric outputs and CSV bytes match Node. CSV reproduces the deficit: 4,096 rows take 7.171 ms in Node, 42.438 ms with stock 0.4.6, and 42.570 ms with fetched upstream. Typed aggregation and strings beat Node in these fixtures, so a general 5× object/string penalty is unsupported.

Sample profiles rank erased ownership/boxing, dynamic property/layout probes and dispatch, then string/path work. Named exclusive stock CSV shares are at least 17.8% ownership, 7.8% allocation/boxing, 14.4% lookup, and 5.9% dynamic calls; inlining and unclassified generated code prevent a full partition. Generic identity helpers inline but retain record allocation/release, with 62.3% sampled in record-release code. JSON parsing and key enumeration matter in the erased tree fixture; neither explains the full CSV loss.

One sound local fix fills fresh native key arrays directly in inline dense storage. Four alternating windows improve 11–15%, pooled median 8.0265 → 6.9325 ms. Full JSON walk improves only 1.7% in the final session; large CSV regresses 1.9%, so no CSV acceleration is claimed. Escape analysis and guarded erased primitive/shape specialization remain precise designs, not implemented gains.

Fork branch `next-scriptc/object-key-array-construction` is committed at `0f66b43c5ba7fc11e6d2d930c25566f03bca6527` from upstream `38cc546e0`. Two ASan/UBSan runtime tests, new release/dev corpus and sanitized RC audit, three affected descriptor/key-order cases, single-fixture preflight/order, completeness, lint and format pass. Full gate remains outstanding; a broad order-canary command was terminated without a verdict. All final timings run after builds/tests. No held-out app, root README, original checkout, Docker, push, PR, issue, or public write is involved. [Report and retained evidence](compiler-object-string.md).

## 48. E2 checked source-text provenance experiment (2026-11-03)

Opt-in build rewriting captures unshadowed, single-argument JSON.parse calls in
promotion-bearing modules. A WeakMap retains the text and a complete descriptor,
identity, prototype, and extensibility snapshot. Every native call checks that
snapshot, including unread fields. Mutations invalidate provenance; unchanged
aliases and repeated calls remain valid. No application object is frozen, no
global parser is patched, and JS receives its parsed object. Dispatcher policy,
shadow verification, and fallback behavior are unchanged.

Only a conservative native-compatible lexical subset qualifies. Duplicate keys,
reserved or numeric object keys, escapes, Unicode, fractional or large numbers,
negative zero, excessive nesting, and actual opaque handle values retain the
encoder path. Response.json and callers outside transformed modules are not
captured. The existing checked native parser skips full-text extra fields, with
native differential coverage. There is no compiler change.

This version loses on the handle-free integer variant of E1's own-code DEV
fixture. At 600/6,000/60,000 rows, encoder total wall medians are
0.182/1.696/22.513 ms; text totals are 0.667/6.468/74.886 ms. At 60k, the
39.302 ms mutation check replaces 19.485 ms encoding. Full-text native parse/skip
costs 23.013 ms versus 2.330 ms for projected input. Source size rises from
2.47 MB to 8.03 MB. Native process CPU is 78.815 ms text versus 32.514 ms encoder,
while JS wall is about 0.118 ms. Capture takes 190.696 ms versus 16.713 ms plain
parsing, outside the per-call intervals. Every path and size selects js-final
after 26 verified shadows, with no mismatches or native fallbacks.

Sixty retained paired-order samples follow ten warmups per path and size on
macOS arm64, Node 26.13.0, stock scriptc 0.4.6. No Docker or stand-in is used.
Final timings overlap no task builds or tests. Initial values-only snapshots and
final descriptor-aware snapshots remain separate raw sessions. Background load,
GC, and a single host limit inference. This is not a successful application
promotion. The ideal 67 ms PM2 text-path arithmetic excludes provenance,
acquisition, and extra-field skip costs. These results do not justify projecting
a held-out native win. No Papermark or HELD_OUT repository is inspected or run.

Next passes 98 tests. Core passes 38 with two existing skips, including with
capture enabled. Focused tests cover mutation through aliases, descriptors,
prototype and extensibility, reassignment, revivers, try blocks, multiple calls,
parser receiver and evaluation order, semantic fallback, native skip, and shadow
isolation. Build capture stays behind SCRIPTC_SOURCE_TEXT=1. Static provenance
for immediate parse arguments is the next way to remove the runtime check;
handle-token overlays and broader JSON semantics remain unimplemented.

The worktree owns all dependencies and build artifacts. Root README, main
checkout, compiler fork, and /Users/noah/scriptc are untouched. No Docker,
hosting, deploy, push, PR, issue, or public write occurs. Details, raw samples,
reproduction, and limits are in [the E2 report](source-text-passthrough.md).

## 49. Review note on E2 (2026-11-03)

E2 is a clean negative, and the reason is structural. Without static proof, showing
that a value still equals `JSON.parse(text)` means walking the whole tree, which is
the same O(n) JS work as encoding, only more of it (39 vs 19 ms at 60k). Capturing
snapshots at parse time adds ~10× to `JSON.parse` itself. Separately, sending the
full text makes native parse every field: 23 ms vs 2.3 ms for the projected encoder
input. Projection is worth more than skipping serialization.

Decision: the research is merged; the implementation stays on branch
`t3/source-text-passthrough` (b2ab416) and is not merged, because it is opt-in,
always slower, and adds a lookup to the `encodeArguments` hot path. The measure
scripts here need that branch to run.

What remains of this lever is static provenance only (an immediate `JSON.parse`
argument, or a binding proven unmutated and unescaped), with a native-side
projected skip-parser. That is a narrower, compiler-assisted design; deprioritized
below C1b and E3. PM3 stays deferred.


## 50. C1b leaf record teardown and remaining escape analysis (2026-11-03)

This round lands C1b's bounded fallback. Direct releases of nontraced scalar/native-string records expose their existing final-reference body to LLVM. Frozen records, checked views, and recursive owned graphs keep the old path. Shape-union dispatch retains its slow entry. No identity, allocation, RC operation, observer hook, or exception cleanup order changes. General record escape analysis and scalar replacement remain open; fresh upstream already provides projection-based frame records, owned-field cleanup, and helper lifetime summaries that the next implementation should extend.

Four alternating baseline/patch windows run C1's complete six-workload suite and CSV with Node reference, 50 warmups and 35 timed calls per process. Every checksum and CSV byte matches. At 50k, generic pooled median falls 0.119 → 0.104 ms (12.6%) and spread 0.1705 → 0.143 ms (16.1%), with improvements in every window. Generic remains about 3.4× Node. Large CSV moves 41.457 → 41.1485 ms, but its direction reverses across windows. No CSV acceleration is established; native remains about 5.9× Node. Small JSON/string movements are not established gains.

Fork branch `next-scriptc/record-release-fast-path`, commit `c37e2154abd3144f3115d5f778087fbb19d4c8d6`, starts at fetched upstream `862a37230`. All 719 LLVM backend tests pass. Six affected corpus programs pass both differential harnesses; the LLVM harness covers release/dev. The new fixture and weak-key union program also pass native ASan/RC audit in both harnesses. Build, lint, formatting, fixture preflight/order, and baseline completeness pass. The tests caught an omitted shape-union `_slow` entry, which is fixed. Full gates and non-Darwin end-to-end validation remain open. Final Node 26.12.0 differs from the repository pin.

Both worktrees retain local commits only. Native outputs and dependencies are cleaned after evidence collection. The original checkouts and root README are untouched. No Docker, push, issue, PR, or public post occurs. [Design, exact measurements, failures, validation, and next implementation](compiler-escape-analysis.md).

## 51. P1 new-user friction audit and small fixes (2026-11-03)

Five isolated consumer scenarios cover ordinary Next scoring, explicit native and six language probes, Nitro, missing native tools, and Next development. Initial attempts follow package READMEs and their linked installation notes. Nitro setup and post-failure Next diagnosis required source reads, recorded explicitly. The ordinary Next build never considers automatic candidates without an undocumented option, despite static report acceptance. That default-policy change remains open. Report also excludes the explicitly native async function. No observed automatic promotion win is claimed.

Fixed a default Turbopack build failure by making function loader metadata survive an exact JSON round trip; optional undefined fields violated Next's loader contract. The existing loader configuration test now checks both server/client loader records. A repacked external consumer builds, starts a native sidecar, and returns the expected scores. Added Nitro installation/configuration and toolchain repair instructions, the current Next automatic opt-in, and native local-testing/report limits. Discovery acceptance and dispatcher/promotion policy are unchanged.

With ar removed from PATH, Nitro reports SC3004 spawnSync ar ENOENT, builds with zero compiled candidates, and serves the expected result in JS. Permission errors on independent scriptc installs require the documented pnpm rebuild repair. Map, Date, in, and optional-helper probes compile in the explicit async path; a parameter-property class fails with an unlocated unsupported-reference message. Indexed-read errors identify generated files. Dev runs JS and updates after an edit. One production build/rebuild pair takes 8.90s/4.41s on this shared machine; these are observations, not a performance benchmark.

Required Node 24 package suites pass: next-scriptc 98/98; scriptc-promote 34 passed and two existing skips. An initial run under an unintended Node 23 executable failed a React Router dependency preparation; the Node 24 rerun passes without a product change. Temporary consumers and task-owned processes are cleaned. Root README, main checkout, compiler source, and compiler fork are untouched. No Docker, deploy, push, PR, issue, or public post. Full fixtures, verbatim output, limitations, and ten prioritized follow-ups are in [the friction log](friction-log.md).

## 52. Dependency-installed DEV blocker census (2026-11-03)

All seventeen frozen DEV entries are accounted for: fifteen JavaScript/TypeScript
server repositories install dependencies with lifecycle scripts disabled, and
Fider/Maybe remain unexecuted non-Node controls. PostHog's pinned clone retry
succeeds. No HELD_OUT repository or Papermark is cloned, inspected, scanned, or
measured. The main checkout, its node_modules, compiler fork, and root README
remain untouched. No push, PR, public write, database, Docker, deployment, or
hosting-account call occurs.

Completed server scopes visit 10,376 files and consider 15,638 unique functions:
15,197 are diagnosed and 441 are discovery-accepted. Per-function first refusals
classify as 8,002 real and 7,195 environment-affected under the documented static
resolution checks. The leading real categories are the work screen (2,404),
module initialization/effect proof (2,023), unsupported references/types (1,095),
package-export/resolver policy (423), and declaration/type-only graph handling
(387). These counts are not a complete function denominator or a causal measure
of dependency installation: 1,957 parser-failed files remain outside considered
functions, classes/async exclusions remain silent, and 32 GrowthBook validator
files still exhaust the analyzer heap after scoped 6/12 GiB retries. No zero
coverage is inferred for those files.

N8n core/workflow require the app's compatible root TypeScript 6 Node API;
Unleash requires the protocol TypeScript 5.9.3 host instead of its TypeScript 7
package. These harness-only overrides and canonical failures are retained.
Offline Prisma attempts deny network access and leave missing engines/generated
types explicit. Static import contamination is conservative and can attribute
unrelated missing imports to a function. Declaration handling is separated from
executable initialization, and filenames cannot masquerade as mutation blockers.

A small parser-isolation fix retains healthy files, preserves forced-native
fail-fast behavior, records exact source errors, and warns that skipped coverage
is unknown. Dependency parse errors retain filenames. No eligibility, compiler,
shadow, or profitability policy is changed. Nineteen targeted regression checks
pass; 143 completed EV1/EV2 scope pairs agree on acceptance. Pins, unique IDs,
diagnostic partitions, artifact sizes, deterministic gzip headers, and secret
patterns are checked. Earlier lost EV1 fatal stderr is labeled; output retention
is fixed rather than reconstructing errors.

GrowthBook split search remains blocked by mutation/closure proofs, including the
previous quadrature-cache issue; its observed server caller is enterprise-licensed.
BIC and context helpers are discovery-accepted, with no native measurements.
Actual's forecast remains cheap, with strict indexed-access refusals and unproven
HTTP use. PostHog HogVM is an unmeasured server-import lead with unresolved imports
and state/callable-boundary questions. No native build, CPU win, or endpoint saving
is inferred. Resolve the validator resource gap before claiming complete coverage,
and profile request compute before prioritizing compiler support by these counts.

Task-owned clones, temporary installs, and dependency links are removed. Location
rule exceptions are documented: the initial tool install used its configured npm
cache, initial Yarn created a home cache later moved/removed, and initial tests
used and removed default macOS temporary fixtures. Existing user npm caches are
not erased. [Methods, per-repo results, examples, and limits](eval-dev-census.md)
and [audited artifact index](eval-corpus/dev-census/index.json).

## 53. Review note on EV3 (2026-11-03)

With dependencies installed and scans scoped to server code, the DEV census is
15,638 considered, 15,197 diagnosed, 441 accepted. 8,002 refusals are real gaps
and 7,195 still reflect the environment (unresolved imports, generated types).
The work screen (2,404) is an intentional economics gate. The real, fixable
blockers are mostly about how discovery reads the dependency graph, not compiler
features: module-initialization proofs (2,023), package export conditions (423),
and declaration/type-only graph handling (387). Parser syntax (decorators)
blocks whole files in AFFiNE, n8n, NocoDB and PostHog. These define B1.

Accepted functions are not yet measured, and EV1 suggests most are small helpers.
M1 (`report --measure` over DEV accepted functions) is the decisive next eval step.
The parser-isolation fix also matters for users: one unparseable file no longer
aborts discovery for the whole app.

## 54. P1b automatic default and actionable diagnostics (2026-11-03)

Next Node production builds now default to automatic promotion. Explicit auto/off
choices are preserved, Cloudflare retains static dispatch, and the other adapters
already had automatic discovery enabled. No dispatcher threshold, discovery
acceptance rule, or shadow policy changes. Extracted source offsets, flattened
helper locations, and opaque type-edit offsets translate compiler diagnostics to
original files. Stable NSC refusal codes and repair hints retain existing reason
substrings. Infrastructure failures name the unavailable tool and preserve JS.

Explicit native report rows include async functions, extraction status, and Next
async artifact status checked against build ID and source hash in default .next
output. Artifact presence does not establish runtime execution. Build summaries
count functions/modules separately from routes/processes. Dev prints a one-time
production-testing notice. Both package READMEs document the behavior.

A fresh Next 16.4.3 consumer installs both worktree tarballs in /tmp/nsc-p1b.
Default build compiles one scoring function in one module and zero native routes.
A broken explicit indexed read fails at original rank.ts:5:10 with a guard/tuple
hint. A nonexistent compiler build succeeds, announces JS fallback, and its
production POST returns [545,0]. Initial scriptc helper permissions required the
existing pnpm rebuild repair. The first automatic native build also exposed a
packed absolute runtime import; a relative import fixes Turbopack resolution.
No native runtime convergence or application speedup is claimed.

Node 24 suites pass: Next 101/101; core 41 passed and two existing skips. Tests
cover missing compiler/ar, helper permissions, original source positions,
explicit report status/freshness, defaults, dev notice, and separate counts.
F4 runtime visibility, F9 upstream helper packaging, other adapter setup recipes,
and custom-directory artifact reporting remain open. Temporary consumers and
servers are cleaned. Root README, main checkout, protected compiler sources,
and external services are untouched. No Docker, deploy, push, PR, issue, public
post, or secret. [Verbatim evidence and limits](friction-fixes.md).

## 55. T1 build-time differential fuzzing and edge semantics (2026-11-03)

Synchronous promotions now have a seeded, bounded differential fuzzer and an
opt-in shared Node build gate. EV2 and fuzzing share TypeScript input synthesis.
The CLI builds automatic and explicit candidates; next-scriptc delegates fuzz.
The dispatcher encoder/decoder/canonical comparison supplies the oracle.
Each function runs in a subprocess with a watchdog; JS calls have VM timeouts.
Bounded shrinking reports source location, input, and JS/native output.
Automatic failures demote and rebuild the addon index; explicit failures abort
and remove deployable addon metadata. Inconclusive checks cannot pass the gate.

Default build fuzzing stays off. Across 16 root-example candidates the additional
fuzz phase took 7.254 s; compilation took 1.324 s, discovery 33.885 s. The configured
execution allowance was 100 ms/function; startup/type analysis dominate it.
Astro's single-function fuzz phase took 0.845 s. These are local single runs,
with concurrent tests, not deployment or performance claims.

All 16 root-example candidates, 17 per-app candidates, and 14 permanent differential fixtures checked
without a native/JS mismatch. One immutable-array fixture is refused by discovery
(TS2339 on __scriptcOriginal); its source is documented for B1, whose files are
untouched. Specialized-signature generation and valid JSON-text coverage gaps
found during implementation are fixed. An injected native n+1 / JS n fixture
shrinks to [0], outputs 1/0, and exercises both demotion and forced failure.

Nine numeric/ordering probes agree across JS, stock 0.4.6 native, and a local
wasm32-wasi reactor through the Cloudflare bridge: signed zero, nonfinite JSON
canonicalization, wrapping/rounding, float formatting, UTF-16 comparison, stable
sort, Map/Set insertion order, and JSON key order. No compiler divergence or
Candidate patch is claimed. Runtime shadows remain enabled.

Node 24 suites pass: Next 101/101; core 53 passed, two existing skips.
Tests include seeded generation, optional fields, edges, shrinking, fake and
compiled divergent lanes, rebuild-ID consistency, explicit artifact cleanup,
CLI delegation, and native/wasm semantic probes. No compiler-source edits,
main-checkout edits, root README edits, deploys, Docker, account calls, pushes,
PRs, issues, public posts, secrets, Papermark, or HELD_OUT work.
[Design, limits, reproducers, overhead, and machine-readable findings](build-time-fuzzing.md).

## 56. P2 runtime visibility and CI reports (2026-11-03)

The shared Node dispatcher now exposes detached aggregate snapshots through a
supported API, with opt-in periodic JSON capture and a normal-exit flush. Next and
Vite adapters share registration. Snapshot files contain counters, timing pairs,
bucket lanes, vote explanations, thresholds, verification and fallback reasons.
They exclude input values, outputs, input hashes and errors. No HTTP endpoint or
dispatch policy change is introduced. Dev paths without wrappers have no runtime
observations; explicit async sidecars remain outside the dispatcher snapshot.

`report --runtime` merges observations into function and route rows. Route context
is static reachability, not request attribution. `report --ci` writes JSON and
Markdown, compares accepted/explicit/blocked rows to a baseline, accepts build and
fuzz evidence, and can exit 2 on regressions. Build output caps compiled names at
20 with source file and line. READMEs document capture and an Actions snippet;
no workflow is added.

A local stock-native fixture built one function and checked 1,200 HTTP responses.
599 calls ran native, 49.9%, with zero fallbacks. Its dispatcher estimated
479.998 ms CPU saved, excluding shadow cost and billing implications. Off-option
microbench medians were 55.53 vs 57.45 ns/call on Node 26 and 44.81 vs 41.67 on
Node 24. These noisy single-machine measurements show no consistent slowdown.
There are no extra clocks or file work on off-option call paths.

Node 24 validation: Next 102 passed; core 59 passed and two existing skips.
Six visibility tests cover privacy, detached state, capture, runtime merge,
baseline differences, compile/fuzz evidence, removed functions, and CLI exit codes.
Existing framework tests check native SSR and byte parity. Root README, discovery,
main checkout, compiler sources and external services are untouched. No deploy,
Docker, push, PR, issue, public post or secret.
[Design, overhead method, sample outputs and limits](runtime-visibility.md).
