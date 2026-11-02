# Evaluation protocol

This corpus is a targeted search, not a random sample of Node applications. Source discovery is distinct from compiler acceptance, successful shadow verification, and CPU savings. Null measurements mean unmeasured, never zero cost.

## Freeze and isolation

The manifest records immutable repository revisions and an app-level DEV or HELD_OUT assignment. A baseline intensity screen may precede this assignment. No adapter or compiler optimization is part of corpus construction. After freezing, change implementations or policy against DEV only. Run held-out cases only at named milestones with a recorded adapter SHA, compiler version, harness SHA, and identical input seeds. Papermark retains its prior held-out pin and protocol. Do not pool its historical results with these measurements.

Split whole repositories, including their internal helpers, together. Stratify by domain and observed server framework where possible. Singleton domains cannot support a balanced split. Excluded client code, non-Node servers, source-available products, and unproven server call paths remain labeled controls. They cannot increase the qualifying-app denominator. A library must have a pinned caller path inside an eligible app to count as coverage.

## Inputs and intensity

Use committed deterministic synthetic argument tuples matching source types. Record sizes, argument JSON UTF-8 bytes, JS elapsed ns per call, process CPU ns per call, and elapsed ns per byte. Generate arguments before timing. Typed-array cases reconstruct Float64Array values before timing and report JSON bytes of those actual values. These bytes are an intensity diagnostic, not the adapter's projected wire size. The baseline uses 30 warmups, a pilot to choose batch size, and 21 retained batches of approximately 2 ms or more. Raw batches remain in JSON. Consume results. Include no source compilation, input generation, or JSON serialization in JS compute timings.

Screen as compute-dense when median JS compute is at least 100 us per call AND at least 100 ns per input byte at a plausible size. This is a preregistered triage threshold, not a prediction of speedup. Large adversarial input alone does not qualify. Report all sizes and algorithm branch changes. Production size frequencies are unknown until measured at an actual endpoint. Synthetic controls cannot establish request frequency.

For accepted functions, build with unchanged stock scriptc through buildPromotion. Report build refusal verbatim. Measure input validation and encoding, native typed decode and compute, output decoding, and complete boundary-inclusive invocation. Compare identical results outside timed intervals; require exact JSON parity by default. For numerical algorithms use the application's existing tolerance only if recorded before executing native. No new relaxed tolerance may turn a failing case into a pass.

A function performance pass requires zero correctness failures and boundary-inclusive native process CPU / JS process CPU <=0.90 at the representative size, with the paired block-bootstrap 95% upper bound below 1.0. Use at least 60 alternating samples and 2,000 seeded block resamples. Pilot timings do not meet this gate. Cold compilation and first-call costs are recorded separately. No native result is inferred from intensity alone.

## Coverage and endpoint CPU

Per eligible app, report source files visited, discovery-accepted functions, compiler-accepted functions, qualifying dense request-path functions, and qualifying functions with a measured native win. Report both counts and app-level any-win coverage. The scanner's diagnostics are not a function denominator: async and nested functions may be silently excluded. Source-only scans with missing dependencies give provisional acceptance and blockers. Timeouts give unknown coverage, not zero.

Where a route can run in memory, call the pinned original handler with deterministic service fixtures. Do not start databases or app lifecycle scripts. Record mocked versus real costs and preserve output bytes. Compare OFF, forced JS, forced native, and AUTO under a documented request mix. Include training, shadows, drain work, GC, and caller plus native-owner CPU in total process CPU. Use >=200 requests per size and >=600 mixed requests with randomized balanced arm order and paired block intervals. Repeat across three sessions, with no concurrent task builds or scans.

An endpoint pass requires byte-identical responses, no mismatches or native fallbacks, and >=5% inclusive CPU saving with a 95% lower bound above zero in all three sessions. A synthetic microbench win alone never passes the install-and-go claim. Until route frequency and endpoint CPU are measured, report endpoint CPU delta as null. No endpoint harness was executed in this baseline.
