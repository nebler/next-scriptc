# Coverage report design

The report answers which functions discovery accepts and what boundary-inclusive
native execution costs for supplied inputs. Static acceptance alone cannot predict
savings. E1 reduced encoding cost substantially while its cheap aggregation still
lost to JavaScript. Compute intensity, measured here as JS ns per input JSON byte,
makes that constraint visible without inventing a new static eligibility heuristic.

## Static evidence

`scriptc-promote report [dir]` uses `discoverPromotions`, including the existing
extractor, dependency closure, purity screen, specialization, and boundary checker.
Optional observer callbacks attach source and function names to existing diagnostic
strings. These observers do not change acceptance or dispatch policy. The report
also retains the original extracted closure before opaque lowering for a raw JS
measurement reference. Application imports are not executed during static analysis.

A separate TypeScript inventory counts top-level functions, callable variable
bindings, and default callback exports. Wrapped callbacks count as one binding.
The inventory includes JavaScript even if the app disables `allowJs`. Considered,
diagnosed, accepted, and silent exclusion counts have different meanings. Diagnostics
stop at the first failure, so a nearest miss means one emitted diagnostic, not proof
that only one change will make the function eligible.

Framework detection reads package dependencies and config filenames. Route entries
cover Next app and pages conventions, SvelteKit server modules, Nitro server API and
routes, Astro endpoint modules, React Router loader/action exports, and TanStack
`createServerFn` bindings. Entries identify source files and symbols, not a fully
resolved deployment URL. A symbol-reference graph follows local functions and
TypeScript-resolved imports. It conservatively includes references that may not be
called and misses dynamic dispatch, framework injection, namespace calls, and
unresolved dependencies. It is not request profiling.

## Measurement evidence

`--measure` creates temporary builds through `buildPromotion` with stock scriptc.
A subprocess contains native crashes and has a three-minute timeout. Temporary
artifacts are removed on completion. Compiler refusals are distinct from static
rejections. User tuples come from `--inputs`; missing entries use bounded TypeScript
synthesis and carry an explicit synthetic label. Unsupported synthesis produces an
unmeasured row rather than guessed inputs. Each tuple is reported independently.

The reference executes the extracted original closure, including raw internal
helper calls. Twenty warm calls precede two discarded pairs and 24 retained pairs.
Arm order alternates. Each native result is compared with the JS canonical result
outside the timing interval. Native fallback or mismatch invalidates measurement.
The metric is thread CPU when both addon clocks are available, otherwise wall time.
Native samples include checked JS argument encoding, worker native CPU, and checked
JS result decoding. No instrumented stage clock enters the decision samples.

The prediction invokes the dispatcher's unchanged `decideLane` with its defaults.
Nineteen of 24 pairs below a 0.90 native/JS ratio predict native. Nineteen pairs with
native at least as expensive as JS predict JS; the remaining cases are unclear.
This is an offline prediction of one epoch, not actual dispatcher training. The
report does not include shadow quotas, request frequency, host load correction,
periodic rechecks, wrapper overhead, deployment transport, or billing estimates.

A second addon with boundary timing estimates wall boundary share as one minus
median native compute wall time divided by median total wall time, bounded to
[0, 1]. It uses ten calls and includes encoding, decoding, copies, and invocation
overhead in the remainder. Stage instrumentation affects this probe. The figure is
a diagnostic, not a CPU decomposition or a speedup attribution.

JSON contains sample count, minimum, p10, median, p90, and maximum for both lanes.
It also includes input UTF-8 JSON bytes, native and JS ns per byte, the policy,
input provenance, and limitations. Compute intensity is the same JS ns per byte
quantity, explicitly named so a large boundary with cheap work is easy to spot.
It is a workload-dependent ratio, not a portable break-even threshold.

## Reproduce the output

From the repository root with worktree-local dependencies installed:

```sh
node packages/scriptc-promote/src/cli.mjs report examples --json /tmp/examples-coverage.json
node packages/scriptc-promote/src/cli.mjs report packages/scriptc-promote/test/support/fixtures/report/next
pnpm --filter scriptc-promote test
pnpm --filter next-scriptc test
```

`examples` is a collection of apps, so its root detects as `generic` and uses one
root type configuration. Report an individual example directory for framework and
app-specific type resolution. No deployment or framework build is required.

## Runtime observations

`createDispatcher().snapshot()` exposes per-function calls, native calls, fallbacks,
and bucket state with verified sample counts and last decisions. State belongs to
the running process. The CLI does not contact an app or read unrelated logs.
A future explicit snapshot import can attach these observations without claiming
that offline predictions are observed promotions.

Observed static output in this worktree:

```text
scriptc-promote coverage — generic
279 files; 473 top-level callable bindings (189 exported)
234 considered; 218 diagnosed; 16 accepted; 239 silently excluded
Diagnostics are not a complete denominator; acceptance is not a speedup.
```

Next fixture output, shortened:

```text
scriptc-promote coverage — next
2 files; 5 top-level callable bindings (5 exported)
3 considered; 2 diagnosed; 1 accepted; 2 silently excluded
Diagnostics are not a complete denominator; acceptance is not a speedup.
excluded             app/api/compute/route.ts#GET
accepted             app/compute.ts#sum
rejected             app/compute.ts#tiny — [next-scriptc] not a candidate tiny: work: no loop, recursion, array callback or JSON parse
rejected             app/compute.ts#noisy — [next-scriptc] not a candidate noisy: purity: time, randomness or I/O
```

Forced native annotations retain discovery's existing fail-fast errors. Missing or
invalid app type configuration can change strict-closure diagnostics. The extracted
JS reference excludes unrelated module initialization and cannot reproduce effects
that other application code applies to global prototypes. Runtime shadows remain
necessary to validate the actual application.

A separate synthetic measurement of `examples/astro-demo` used the default scalar
input 32. Its 24 thread-CPU pairs measured JS median 292 ns/call and native median
7,793 ns/call including the boundary, predicting JS. Native p10/p90 were
6,583/10,581 ns; JS p10/p90 were 208/459 ns. Input JSON was four UTF-8 bytes, so
compute intensity was 73 JS ns per byte. This illustrates boundary cost for a tiny
synthetic workload, not production traffic or application savings. Regenerate with
`node packages/scriptc-promote/src/cli.mjs report examples/astro-demo --measure`.
