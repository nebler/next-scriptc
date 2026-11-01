# Native result encoding

2026-11-01. Local macOS arm64 only, loaded Apple M4 Pro, Node 24.22.0, stock scriptc 0.4.6 / ABI 47 for adapter measurements. No calibrated stand-in evaluation was run. No Docker, Sandbox, hosted calls, pushes, issues, or PRs.

## Where M2's 0.58 ms goes

The generated promotion wrapper already calls `serialize(value,true,()=>JSON.stringify(value))`. Its callback retains the concrete result type; O1's typed encoder is already present. It does not use erased stringify for production JSON results. The strict validator erases the value, obtains symbols, prototypes and descriptors, recursively visits descriptor values, and then invokes the typed encoder. Reflection over native typed references materializes checked dynamic views. Repeated reflection refreshes those views and allocates descriptors. This validation walk dominates; the typed JSON encoder and arena are small.

A separate executable probe, 10 discarded warmups and 40 samples per variant on the cached typed 1k result, measured strict validation at 0.625 ms median, validation plus typed encoding at 0.624 ms, and typed encoding alone at 0.010 ms. These are separate windows; do not subtract their medians as if they were paired sub-stage samples. Earlier windows measured validation around 0.55 ms and the complete serializer around 0.57–0.59 ms, reproducing M2's scale. Erased serialization measured 1.042 ms. The retained [probe rows](native-result-encoding-probe.jsonl) include failed alternatives.

The static result type does not prove strict JSON safety. Structural types permit extra properties, assertions and JSON.parse can fabricate values, and arrays can be sparse or cyclic. Runtime finite-number, descriptor, density, prototype, symbol and cycle checks remain necessary. Removing them based only on a checker signature would change the contract. A fused encoder is not justified by these measurements.

## Adapter change and focused host measurement

`json.ts` now checks symbols on the descriptor dictionary returned by `Object.getOwnPropertyDescriptors`, which includes non-enumerable symbol keys. This avoids one reflection operation on each original native container. It preserves strict rejection before the typed encoder runs. Key order, escaping, negative-zero normalization, finite-number checks, cycle handling and canonical-byte shadow comparison are unchanged. No transport or ownership change was made.

[The reusable host probe](native-result-encoding-bench.mjs) computes 1k and 5k revenue fixtures before compiling. The native function encodes those cached typed results only; it does not parse events or aggregate. This deliberately assigns validation/stringify to the `compute` stage, leaving the ordinary `nativeEncode` stage to measure the scalar string check and ABI result-arena conversion. Their per-call sum reconstructs the encoding stage. The 21,182-byte and 21,679-byte results match JS byte-for-byte on every invocation. Ten warmups and 40 measured calls per cell, interleaved baseline/current/typed-only order. [Raw rows and environment](native-result-encoding-host.json) retain every sample. These clocks measure elapsed milliseconds, not local CPU.

| Cached result | Before median / p95 ms | After median / p95 ms | Change in median |
| --- | ---: | ---: | ---: |
| 1k events | 0.595 / 0.640 | 0.495 / 0.543 | −0.100 ms (17%) |
| 5k events | 0.596 / 0.631 | 0.503 / 0.541 | −0.093 ms (16%) |

Typed JSON encoding alone is about 0.010 ms. Result-arena conversion plus the scalar string check is at the roughly 0.001 ms timer resolution (many samples round to zero). Host copying and N-API string construction together are about 0.003 ms median. The shim must copy the runtime-owned result before collection and then construct a V8 string; these are ownership copies, not the source of the 0.58 ms. The existing stage hook combines those two copies, so this experiment does not claim separate measurements for them. No copy was removed.

Reproduce with Node 24 and `SCRIPTC_COMPILER` pointing to stock 0.4.6: `node research/native-result-encoding-bench.mjs`. The baseline source is pinned to `4c7eeee09c8a9c933f58891046ebce242749adc8`. The harness removes its generated library and addon.

The observed saving is roughly 0.1 ms per result at both sizes because both have 248 rows. Applying that delta to M2 mechanically would move new native CPU from 0.922 toward 0.82 ms at 1k and from 1.524 toward 1.43 ms at 5k, versus JS 0.452 and 2.077 ms. This is directional arithmetic, **not a CPU measurement or prediction**: the host probe measures elapsed time on a loaded host. 1k should still lose; 5k may gain margin. The 16–17% encode-only improvement cannot be called a calibrated win against C1's 17.37% maximum error. Auto decisions and the mixed workload remain unmeasured. The real verdict waits for `research/standin/`; boundary gains need hosted confirmation.

## Separate scriptc experiment

Fetched upstream main and created only `/Users/noah/code/scriptc-wt/result-reflection`, branch `next-scriptc/result-reflection`, based on `a07d5a791`. The patch makes `scr_dyn_get_prototype` reuse an existing native record's checked view for prototype lookup. `scr_dyn_typed_ref_materialize` already preserves that view's prototype when refreshing native fields; prototype lookup therefore need not refresh those fields again. Arrays and class/other capsules retain their existing path. The new corpus fixture tests repeated reflection, native field updates, array growth, and prototype changes on an erased record reference. Its frontend order baseline is recorded.

Only the release `scr_json.c` runtime unit was rebuilt with clang in a private copy of the existing ABI 48 runtime pack, updating that unit's manifest hash. The existing fork's built 0.4.7 compiler was read, not rebuilt or changed. This is distinct from the stock 0.4.6 adapter measurement. New corpus plus `3120-dynamic-property-descriptors.js` and `prototype-named-data-records.ts` pass explicit Node/native stdout and successful-exit parity. No full gate or sanitized lane was run; another agent owns the full gate.

The first separate before/after window measured 0.739 → 0.661 ms. A second measured 0.553 → 0.703 ms. Four retained windows alternating binary launch order give 160 samples per variant: complete strict serializer median / p95 0.718 / 0.858 → 0.710 / 0.762 ms, with typed-only control 0.011 ms median on both. The effect is **inconclusive**, not an established optimization. [First retained final-build window](native-result-encoding-fork-base.jsonl), [patched window](native-result-encoding-fork-patched.jsonl), and [alternating repeats](native-result-encoding-fork-repeat.json) remain. This patch is local, not pushed, experimental, and not used by next-scriptc. Most reflective validation cost remains.

## Correctness and failed attempts

- Focused adapter tests: 18 passed across `result-encoding.mjs`, `functions.mjs`, and `boundary-encodings.mjs`. Coverage includes demo echo/revenue/revenueCore results, empty results, nullable and populated timings, shared references, ordered integer keys, Unicode and lone-surrogate JSON, finite extremes and negative zero, hidden symbols on objects/arrays, accessors/toJSON, cycles, sparse arrays, hidden properties and non-plain prototypes.
- Native integration: `boundary-native.mjs` and `function-native.mjs` passed with stock 0.4.6, including ordinary/instrumented sync/async addons and strict result/typed encoder parity. An extra hidden nested array-symbol test exposed a pre-existing stock compiler gap (below); it is not asserted as supported native behavior.
- Fused descriptor validation/token encoding took 3.26–6.74 ms, versus about 0.6 ms; discarded. Per-property descriptor queries took about 2.42 ms; discarded. No unsafe static-type shortcut was retained.
- The first fork corpus mutated prototypes through separate typed-to-erased crossings. Both unpatched upstream and patched binaries disagreed with Node. The same-capsule record mutation passes. Restoring Object.prototype through the generic helper hit scriptc's explicit unsupported-reflection error; array null-prototype mutation also disagreed with Node on unpatched upstream. The retained fixture covers supported record mutation; these pre-existing gaps are not fixed here. The cache patch was narrowed to records.
- An added native case `const a=[1]; hideSymbol(a); return {rows:a}` with `hideSymbol(v:unknown) { Object.defineProperty(v,Symbol("hidden"),{value:1}); }` failed rejection on both the original serializer and the changed serializer under stock 0.4.6. Native conversion loses this symbol before validation; Node rejects it. The exploratory native case was removed, while the corresponding JS strict-validation case remains. This pre-existing compiler limitation is unresolved.
- An added native test initially called Object.defineProperty on a typed array directly and failed SC2020 (unsupported lowering). Calling through the existing erased-value helper pattern builds; this setup failure was not treated as a timing sample.

The adapter change is kept. The fork experiment stays on its local branch for review and further measurement. Generated probe binaries, runtime copies and test outputs are removed; source, raw measurements, patch and corpus remain valuable.
