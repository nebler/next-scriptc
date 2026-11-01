# Dispatcher stability after M2

2026-11-01. Implementation and deterministic tests only. No performance benchmark ran. Real stand-in measurement and hosted confirmation remain pending.

## Why window 1 rejected 15k

The retained evidence is in `standin/raw/m2-window{1,2,3}-phase1.json`, under `decisions`, `transitions`, `training`, and `rows`. The dispatcher kept the last 60 JS durations but only five native durations. At call 100, it compared their medians and permanently stopped learning if native missed a 10% margin.

Window 1's bucket 20 native durations, in collection order, were 9.259291, 5.858333, 2.929042, 7.935125, and 3.049541 ms. The JS median was 6.362250 ms. Native's median was 5.858333 ms, above the promotion threshold of 5.726025 ms. The rejection was only 0.132308 ms beyond that threshold. Window 2's native decision median was 3.429 ms; window 3's was 5.054 ms. Both promoted.

This is broader than a first-run problem. Removing only the first native duration leaves an upper median of 5.858333 ms. Removing the first two still leaves a late 7.935125 ms duration. Two of the five original durations were close to the fixed native median of 3.123 ms wall, while three were substantially higher. Five samples let that tail control the decision.

The timing methods also differed. JS used two `performance.now()` readings around a synchronous function. The native timer began inside `setImmediate`, before `await nativeAsync`, and ended after result decoding. It included libuv queue delay, the owner-thread handoff, event-loop completion delay, promise continuation, encoding, and decoding. It excluded the initial `setImmediate` delay. Production native answers use the synchronous addon entry, without libuv queue and completion delays. The 200k native shadow median in window 1 was 59.726 ms, versus about 30 ms for fixed native. This bias was not confined to 15k.

M2 did not record per-shadow queue, compute, or CPU durations. Its separate seven-stage samples cannot assign the slow shadows to scheduling, allocation, throttling, or initialization. The host load spike is supporting context, not proof of a particular cause. More samples alone cannot remove a systematic timing bias.

The buckets were correct and distinct. The shallow string-size estimate put 1k, 5k, 15k, and 200k in buckets 16, 18, 20, and 23. There was no boundary collision. M2 drained each asynchronous shadow before the next call, so dispatcher backlog between training calls does not explain the result. The addon still used libuv and its dedicated owner thread.

## Policy and timing changes

Each candidate keeps independent evidence per bucket. The dispatcher measures JS only on a call eligible for a shadow and pairs that duration with the verified native result for the same arguments.

The default policy uses these parameters:

| Parameter | Value | Reason |
| --- | ---: | --- |
| Initial JS calls | 20 | Preserve the prototype's initial learning delay |
| Learning frequency | 1 in 20 calls | Preserve the shadow rate ceiling |
| Cold verified pairs discarded | 2 per bucket | Exclude initialization from statistics while still checking correctness |
| Pairs per decision epoch | 24 | Bound memory and require substantially more evidence than five samples |
| Required votes | 19 of 24 | One-sided paired sign test with tail probability 0.003305 under a 50% null |
| Promotion threshold | native < 0.90 × JS | Require at least a 10% median paired effect |
| Demotion threshold | native > 1.05 × JS | Keep a lane through small reversals and measurement noise |
| Settled re-check frequency | 1 in 200 calls | Correct early errors at one tenth of the learning sample rate |
| Shadow cap | 50 per rolling minute per function | Preserve the prototype's cap across all buckets |
| Shadows in flight | At most 1 globally | Preserve queue-pressure protection |

The decision uses the order of paired ratios, a robust statistic. A few large outliers cannot outweigh a majority. For promotion, 19 pairs must clear the promotion threshold; native demotion requires 19 pairs beyond the separate demotion threshold. Ties do not vote. There are no intermediate statistical looks within an epoch. Each epoch consumes fresh evidence and then clears its working arrays. `lastDecision` retains the preceding epoch's paired durations for diagnosis.

If the first epoch is inconclusive, the bucket settles on JS. The existing `js-final` state name now means settled JS with periodic re-checks. An inconclusive later epoch retains the current lane. Correctness mismatches and panics still cause permanent demotion. Cold samples also undergo exact canonical-byte verification before any evidence is accepted.

The sign-test probability assumes independent pairs with stable distributions. It is a per-epoch bound, not a lifetime guarantee. Repeated epochs, correlated host stalls, and changing input contents weaken that interpretation. Hysteresis limits switching around crossover, but indefinitely repeated tests can eventually make a false transition. Re-checks can correct those transitions too. No cost model predicts lanes for unseen buckets.

### The addon measures the synchronous service path

`runShadow` adds an asynchronous addon entry that returns `{value, elapsedMs}`. Its timer sums input conversion and copy, execution including the same owner-thread handoff as `run`, and result conversion. It excludes libuv queue wait and event-loop completion wait. The dispatcher adds JS encoding and decoding durations. Canonical comparison and hashing remain outside the decision timer. Optional seven-stage output remains nested in `value` and continues to work.

Ordinary `run` and `runAsync` return values retain their contracts. Clock calls for this new timer occur only for `runShadow`. The C stub test compiles the actual shim with a trivial numeric entry and exercises all three entries with stage instrumentation both enabled and disabled. It does not compile or time scriptc workloads.

This is an approximation of synchronous caller service cost. Tiny addon validation and bookkeeping costs are omitted, and elapsed execution still includes host preemption and owner contention. It does not measure CPU billing or guarantee the same speed under concurrency. The runtime loader selects `runShadow` for new addons. Direct custom dispatchers can supply `nativeSample`; legacy `nativeAsync` remains a compatibility fallback whose timing still includes asynchronous scheduling.

## Deterministic simulation results

`node research/dispatcher-stability-sim.mjs` only resamples retained JSON numbers and calls the decision function. It never invokes a workload, addon, container, or benchmark. The seed is an LCG initialized to integers 1 through 1000 for each size; windows rotate evenly across seeds.

The old-policy simulation resamples five native shadow times and 60 retained JS times from the selected window's original decision. It applies the original 0.9 median rule. The new-policy simulation resamples the selected window's 60 fixed-JS and 60 fixed-native wall samples. These are proxies for matched service timings because M2 did not record the new clock. CPU samples are not substituted for wall samples. The target lane is the lower fixed wall median in that window.

A separate stress simulation adds independent 3× native service stalls to 10% of samples, on top of the empirical tails. Both new-policy simulations allow eight complete, disjoint epochs. The first-epoch column shows the initial learning cost separately.

| Events | Trials | Old wrong | New first epoch wrong | New after eight epochs wrong | Stress after eight epochs wrong |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1000 | 1000 | 0% | 0% | 0% | 0% |
| 5000 | 1000 | 66.2% | 6.1% | 0% | 0% |
| 15000 | 1000 | 34.2% | 0% | 0% | 0% |
| 200000 | 1000 | 1.4% | 0% | 0% | 0% |

The aggregate old error is 25.45%; the new first-epoch error is 1.525%. No final error was observed in 4000 trials. Zero observed errors is not zero population risk. These empirical simulations combine a timing-method change with a decision-policy change; they do not isolate each change's contribution. Resampling five original shadows also cannot recover tails M2 never observed.

The test with an injected clock adds 100 ms of asynchronous delay to a 1 ms native service sample. It verifies that this delay does not prevent promotion. It also verifies cold exclusion, native-to-JS correction, JS-to-native correction, and permanent mismatch demotion. Separate tests check incomplete epochs, insufficient confidence, the effect margin, and the hysteresis band.

The stronger confidence check deliberately delays a decision. With no skipped shadows, the first epoch completes at call 520, rather than call 100. Each later epoch requires 4800 calls in a settled bucket. Eight epochs require roughly 34,120 calls, with no rate-cap delays. Low traffic or the shared per-function cap makes convergence slower. The 5k first-epoch misses remain visible instead of being counted as successful early decisions.

## Overhead, CPU limits, and the next measurement

Ordinary JS calls do no clock reads, serialization, canonical comparison, or sample-array updates. They retain the existing shallow size estimate, map lookups, counters, and a sampling modulus. The deterministic overhead test checks zero clock reads for unsampled calls. It also verifies the rolling 50-shadow cap and resumption after the minute expires. The pending-work test verifies that only one background shadow can run at once.

No microbenchmark was run, so the ≤0.005 ms JS overhead budget remains unmeasured. Shadow-eligible caller work still includes argument capture and expected-result serialization. Rate and count limits are unchanged, but collecting more evidence increases total learning CPU. These are count-based CPU controls, not a bound in CPU milliseconds for arbitrarily expensive functions.

The Phase 1 harness now uses `runShadow` and preserves its separate SHA checks. Its historical 120-call training loop remains unchanged to avoid silently changing M2's experiment. That loop is insufficient for the new policy. The next measurement must extend learning to at least one completed epoch per bucket, respect the shared per-minute cap, retain all learning costs, and allow multiple re-check epochs when evaluating correction. It must separately measure settled JS overhead and total shadow CPU. The original 120-call stream can still measure cold-learning behavior, but cannot be labeled settled auto.

Root `pnpm test` passes 43 package tests and 24 demo tests, including the seeded simulations and compiled C stub. No compiler source checkout, Docker resource, hosted service, or upstream repository was changed. Temporary C outputs are removed by the test.
