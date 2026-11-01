# Construction results default readiness

2026-11-01. Adapter-only work on `t3/construction-proof-promotion-safety`, stock scriptc 0.4.6, Darwin arm64, Node 24.22.0. The default remains strict. No compiler, Docker, Vercel, held-out Papermark workload, or root README change is part of this work.

## Recommendation

Keep construction opt-in for now. These runs support the screened synchronous path and its per-call fallback, but cannot establish that every scriptc lowering is correct. This corpus is permanent and extensible. It does not enumerate every application candidate or every inline source fragment in the adapter tests. Existing adversarial and native ABI tests remain necessary.

The single switch is `constructionResultsDefault` in `packages/next-scriptc/src/functions/promotion-signature.mjs`. Both the builder and signature defaults use it. `constructionResults` and `catchFallback` remain explicit build options. The old `specializeResults` option and generated typed-validator runtime are removed. The historical benchmark retains its helper in `research/legacy-result-validator.mjs`; its report remains unchanged.

## Differential coverage

`test/promotion-fuzz.mjs` runs in the normal adapter suite and `test:unit`. `scripts/promotion-fuzz.mjs` runs the same implementation. `PROMOTION_FUZZ_LONG=1` selects 10,000 inputs per candidate. `PROMOTION_FUZZ_CASES` overrides that count, and `PROMOTION_FUZZ_SEED` selects the reproducible xorshift32 stream.

The corpus contains 12 candidates. It includes the extracted demo `revenueCore`, copies of the rows, parse, arithmetic, scalar, and sum test patterns, and synthetic immutable, string, bounded-depth, Map, Set, sort, loop, and nested-result functions. Every source must pass the construction proof and the application's boundary checker. The generator derives parameter shapes from that checker. Parsed string inputs use the construction proof's asserted schemas. Both strict and construction builds use the installed compiler, a real addon, and `loadPromotion` with forced native dispatch. No mocked native answers enter the differential run.

Arrays contain zero to five elements per level. Nested schema depth is bounded below 32. One fixture has eleven nested record fields, and parsed input extras include sixteen nested records. Numbers include signed zero, both signs of the largest and smallest finite doubles, large exponents, safe-integer limits, and random finite fractions. Strings include astral characters, combining characters, NUL, BMP characters above the surrogate range, reserved data keys, and lone surrogates. JSON string encoding escapes lone surrogates before the native parse. Selected parsed inputs contain duplicate `n` fields plus own `__proto__` and `constructor` data properties. These fields do not mutate prototypes.

Every fifth generated input replaces an argument with a potentially invalid boundary value. Every eleventh applicable input replaces parsed JSON with syntax errors, missing fields, nulls, wrong primitives, or arrays. Some replacements happen to be valid; the schedule is an invalid-input probe rate, not a claim that exactly 20% fail type checks. Arithmetic produces overflow, underflow, and NaN paths. Both the JS answer and the original JS exception type and message are checked.

Every input runs through both builds. After each comparison, a known-good call must increment the same dispatcher's native-success count. No bucket may be demoted. This detects poisoning that a JS-only recovery could hide. The test raises the fallback window above the run size so deliberate invalid inputs cannot trigger the separately tested fallback-rate policy. Existing addon tests exercise async calls, timing envelopes, and automatic shadow promotion; the fuzzer forces the native lane so successful shadows cannot hide incorrect native answers.

A failure reports its seed, candidate, input index, and a smaller reproducer. The bounded shrinker removes array elements, reduces numbers and strings, removes record fields, and reduces parsed JSON. Shrinking is greedy and capped at 30 accepted reductions; it does not promise a globally smallest input.

## Equality contract

The oracle calls JS with the original arguments. It does not round-trip the JS answer through JSON, which would conceal NaN, undefined, and Infinity on fallback paths. Successful values must match by deep structure and canonical bytes where canonical serialization is defined. Exception type and message must match. No numerical tolerance, key reorder, dropped field, string replacement, or replacement of non-finite numbers with null is accepted.

The one accepted value difference is negative zero inside the JSON result ABI. Deep comparison recursively maps only `-0` to `+0`, matching the documented `JSON.stringify` canonicalization. Direct f64 results retain their sign bit and use distinct canonical bytes for `-0`. JSON arguments also canonicalize signed zero before native entry. If that changes a later observable value beyond a JSON result's zero sign, the differential test fails. Fallback preserves the original JS result, including non-finite values. Reference identity and property descriptors are outside this JSON-data contract, as documented in the earlier construction reports.

Strict result validation can throw for non-finite results or checked parsed reads. The builder now gives proof-eligible JSON and numeric functions the same catch-and-fallback envelope in strict mode. The C wrapper recognizes that status in both modes. This prevents strict-mode invalid-input probes from poisoning the instance. Unscreened functions retain their existing strict behavior. No scriptc mismatch was found, so there is no new compiler patch-ledger entry.

## Crash guard and covered windows

`promotion-crash-guard.mjs` replaces the path-only marker in `promotion-client.mjs`. The guard hashes the addon and both encoding manifests. Its directory is under `os.tmpdir()/next-scriptc-crashes`, or `NEXT_SCRIPTC_CRASH_DIR`. Each loaded instance creates an exclusive process lease before addon loading. A lease records the PID's birth time. On the next load, a dead PID or mismatched birth time disables promotion for that build and logs the reason. Other live processes with the same build remain valid. Birth-time lookup uses `ps` on supported Unix hosts; an unavailable identity or unwritable marker location fails closed to JS.

A normal process exit removes that process's leases. A segfault cannot execute the exit handler. Its lease remains until the build changes or `NEXT_SCRIPTC_RESET_CRASH=1` explicitly removes stale leases at startup. Reset leaves valid live leases alone. Reset is an operator action and should be removed from the environment after recovery. A changed build gets a different directory; stale old-build evidence remains available without blocking it.

The lease covers addon initialization, synchronous native entry, asynchronous owner-thread jobs, and native collection until process exit. A crash before lease creation cannot involve an addon loaded through this entry point. A crash after lease creation but before native entry conservatively disables promotion. A forced process termination or an unrelated JS failure that bypasses exit cleanup has the same conservative effect. The lease does not attribute crashes to a particular call. A process already running when another process crashes is not stopped; the next process load observes the stale lease.

The exit handler retains the lease while native jobs are pending. A later exit handler that reenters native code rearms the lease. A child-process regression covers that shutdown path. The guard cannot survive removal of its temp directory or guarantee evidence after replacement of an ephemeral host. It does not cover callers that load the `.node` file directly. It does not prevent the first segfault, resource exhaustion, or incorrect compiler output. Birth times have the precision supplied by the host's `ps`. This is a conservative restart guard, not isolation of native code.

The child-process regression compiles a deliberate N-API `SIGSEGV` addon. It verifies a fatal native call, a JS-only next process, explicit reset, and a changed-build retry. A separate test verifies concurrent live leases and a mismatched process birth time.

## Hot-path overhead

After initialization, ordinary native calls check and update an in-memory lease count. They perform no guard filesystem operation. The client now consults its cached instance before checking the addon path, removing the previous `existsSync` syscall from ordinary calls. Hashing, lease scans, PID checks, process identity lookup, and the lease write happen at instance load.

`scripts/promotion-js-overhead.mjs` measures the cached `promote` wrapper plus the real JS-only dispatcher against direct JS. It uses four warmup batches, nine alternating-order retained batches, and 500,000 calls per arm per retained batch. Median added cost is 0.00002334 ms per call, below the 0.005 ms budget. The cached dispatcher is installed directly for this narrow check, so startup cost is excluded. Raw deltas are in `default-on-readiness/js-overhead.json`. The host is loaded. This establishes no native speed, hosted CPU, or application performance claim.

## Correctness budgets and validation

The default CI run uses 40 inputs per candidate. In the final full suite it completed in 21.10 seconds, below the 60-second budget, including native compilation. The builder first tries the complete candidate set in one archive; if that fails, it retains the original incremental compiler-refusal filter. This avoids quadratic successful builds in the permanent fuzzer.

Seed 20935 ran 20,000 inputs per candidate: 240,000 inputs, 480,000 differential checks, and 480,000 follow-up native-success checks. Combined dispatcher counters recorded 821,168 native successes and 138,832 fallbacks. All comparisons passed. The count artifact is `default-on-readiness/fuzz-20935.json`.

Seed 3735928559 ran another 240,000 inputs, 480,000 differential checks, and 480,000 follow-up native-success checks. It recorded 820,768 native successes and 139,232 fallbacks, with no mismatch or poisoning. The correctness run took 43.78 seconds including setup and builds. Both seeds total 480,000 inputs, 960,000 differential checks, and 960,000 native usability checks. The second run also asserts JS exception messages. Its artifact is `default-on-readiness/fuzz-3735928559.json`.

The final adapter suite passes all 73 tests with one test worker. Both Node 24 shim tests also pass, including 113 HTTP parity requests. This includes the permanent fuzzer, the segfault regression, live-lease checks, existing automatic promotion and fallback-rate tests, and compiled native ABI tests. At most two independent jobs ran together. Native builds ran sequentially inside each job. The overhead check ran after those jobs finished.

Reproduction from a dependency-equipped checkout:

```sh
node --test --test-concurrency=1 packages/next-scriptc/test/*.mjs
PROMOTION_FUZZ_LONG=1 PROMOTION_FUZZ_CASES=20000 PROMOTION_FUZZ_SEED=20935 node scripts/promotion-fuzz.mjs
PROMOTION_FUZZ_LONG=1 PROMOTION_FUZZ_CASES=20000 PROMOTION_FUZZ_SEED=3735928559 node scripts/promotion-fuzz.mjs
node scripts/promotion-js-overhead.mjs
```

Use Node 24.22.0 to reproduce the recorded runs. The temporary dependency symlinks point into `/Users/noah/code/next-scriptc` and are removed after validation. All fuzzer and crash-test builds use task-created temp directories and remove them in `finally` blocks.
