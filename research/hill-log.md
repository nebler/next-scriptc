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

