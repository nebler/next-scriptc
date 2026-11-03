# C1c: scalar replacement for closed local leaf records

2026-11-03. An opt-in compiler pass removes nonescaping leaf record literals and their local aliases before LLVM emission. The C1 generic fixture now loses its record constructor. This is the first scalar-replacement implementation in this series. General owned-graph escape analysis remains unfinished.

## Analysis and representation

The fork starts at freshly fetched upstream `301c28c9f912a9711498dce3a87776e1c69e2431`, without stacking C1b. Upstream already has frame storage, call lifetime facts, result-slot producers, and numeric result scalarization. `ir/local-records.ts` adds construction-site analysis for local literals instead of broadening the existing stack proof. It runs before the existing LLVM rewrite pipeline, so subsequent analyses see the new locals and cannot retain stale node facts.

Each synchronous function is analyzed independently. A candidate must have one declaration, an unboxed binding without temporal-dead-zone machinery, and a complete closed record shape containing only numbers, booleans, and native strings. Tuple, index-signature, null-prototype, overflow, and freezable shapes remain allocated. Initializers must have no counted temporary whose lifetime splitting would shorten. Literal strings, binding reads, and direct field reads are accepted. Computed string initializers remain allocated, although a string computed into a prior local can initialize a candidate.

The analysis grows an alias group to a fixed point through single-declaration local copies. It then checks every use in the whole function, including dormant branches and expression sequences. Only declared-field reads, field writes, and the proved alias declarations are accepted. Rebinding, returns, throws of the identity, heap/container stores, unknown calls, captures, erased transitions, identity comparisons, reflection, descriptor/prototype operations, and weak collections reject the entire group. A conditional escape on one path rejects all paths. Future unknown IR consumers reach the ordinary whole-value rejection.

A narrow helper summary recognizes a synchronous, capture-free function whose entire body returns its sole parameter and whose only local is that parameter. Such calls become their argument before group analysis. This handles the specialized identity helpers in C1. Arbitrary projection or mutation helpers, recursive summaries, and callback effects remain conservative. The pass does not infer safety from LLVM's later inlining.

The transform replaces each field with a mutable typed local and removes the record and alias declarations. Reads and writes through every alias address the same scalar local. LLVM promotes the ordinary local slots to SSA and constructs control-flow joins. Declarations stay in the original lexical statement list, including `seqExpr.stmts`. Rewriting repeats until no candidate remains, which exposes source records after spread-related field reads are simplified. Direct same-shape clones with stable local receivers snapshot fields before overrides. General spread lowering can retain a result allocation.

## Ownership and soundness boundaries

The proof has two parts: every use of the record identity is known, and every removed owner contains only fields whose destruction cannot invoke user code. Distinct identities cannot become observably equal because identity consumers reject the group. Alias mutation is shared, and no heap pointer or closure can outlive the removed representation.

Strings retain the existing local retain, replacement, and cleanup operations. Each field keeps an owner at its declaration scope. An initializer executes once in source order. A replacement evaluates its right-hand side before replacing the previous owner. An exception releases the initialized scalar locals on the existing cleanup path. String destruction cannot invoke user callbacks, so changing string owner grouping does not reorder user-visible finalizers. Arrays, child records, closures, erased fields, and all other owned references keep the original heap/frame behavior. RC audit covers those conservative paths as well as transformed string fields.

Loop-local declarations execute each iteration. Any loop-carried alias stored into another binding rejects the candidate. Async and generator functions remain unchanged. This round creates no new stack object, immortal header, or lifetime marker. It uses scalar locals directly. Broader stack fallback with precise lifetime markers and nested owned-field scalarization still needs the ownership integration described in [C1b](compiler-escape-analysis.md).

`SCRIPTC_SCALAR_RECORDS=1` enables the executable/textual LLVM path. Direct emitter users pass `{scalarRecords:true}`. The option remains off by default and debugger emission bypasses the pass. The executable cache key separates enabled builds. Library, worker, self-hosted native compiler, Linux, and wasm end-to-end support are not established.

## Measurement

Apple M4 Pro, macOS arm64, Node 24.22.1 and pnpm 10.27.0. Both lanes use the same newly built seven-flavor Darwin runtime pack and existing LLVM 22 helper copied read-only from the original fork. No runtime source changes are made. Initial install/build used the host's Node 23.10.0 and emitted engine warnings. Final builds, tests, and timings use the repository's pinned Node 24.22.1. Earlier C1/C1b measurements used Node 26.12.0 and are not directly comparable.

The retained C1 `escape-measure.mjs` runner executes all six workloads at 1k, 10k, and 50k, and CSV at 128 and 4,096 rows. Four process windows alternate baseline and enabled order, with Node first in each cell. Every process warms 50 calls and times 35. Timing is inside computation, excluding process startup and stdout. Suite construction is inside the clock; CSV fixture construction is outside. Every numeric output and full CSV string matches Node in all windows. Timing windows follow completed builds and tests. These descriptive medians are not production savings or confidence intervals.

| Workload | Size | Node ms | Disabled ms | Enabled ms | Change |
| --- | ---: | ---: | ---: | ---: | ---: |
| events | 50,000 | 2.7589 | 1.5020 | 1.5185 | +1.1% |
| strings | 50,000 | 2.7443 | 1.6370 | 1.6750 | +2.3% |
| maps | 50,000 | 3.5828 | 1.9570 | 1.9690 | +0.6% |
| copy | 50,000 | 0.7338 | 0.1715 | 0.1745 | +1.7% |
| generic | 50,000 | 0.0408 | 0.1350 | 0.0580 | -57.0% |
| json | 50,000 | 9.8573 | 11.1905 | 10.7335 | -4.1% |
| csv | 128 | 0.2395 | 1.2950 | 1.2905 | -0.3% |
| csv | 4,096 | 7.1716 | 41.9505 | 41.2925 | -1.6% |

Generic improves in all four windows. The whole suite's preoptimization LLVM has six record-constructor calls disabled and five enabled. The removed call is on the generic path. Existing helper definitions and escaping event records remain. Spread retains allocation and has mixed window directions. JSON does not traverse the removed generic record site, so its movement cannot establish a JSON scalar-replacement benefit. CSV remains roughly six times Node. Its small movement is insufficient to claim that the broad dynamic ownership/boxing problem is solved.

[Raw C1/CSV samples](compiler-object-string/scalar-results.json), [IR counts](compiler-object-string/scalar-ir-summary.json), and [artifact hashes](compiler-object-string/scalar-artifacts.json) are retained. The suite executables are 414,024 bytes disabled and 413,928 bytes enabled. CSV is 1,617,416 bytes in both lanes.

The [boundary probe](compiler-object-string/scalar-boundary.ts) imports the actual D1 `forecast` and E1 `aggregate` functions. Each timed call parses typed JSON, calls the function, and stringifies its result. Input construction occurs outside clocks. This is a standalone boundary probe, not an addon or dispatcher measurement. D1's result escapes through JSON encoding. E1 retains its result and selected input row. Both therefore offer little local-record work for this pass.

Four alternating windows use the same 50 warmups and 35 samples, with full result-string parity. Pooled medians are D1 at 6,000 trials: Node 9.3913 ms, disabled 2.3850 ms, enabled 2.3845 ms. E1 at 6,000 rows: Node 2.0477 ms, disabled 0.8060 ms, enabled 0.8030 ms. E1 at 60,000 rows: Node 20.4677 ms, disabled 8.1115 ms, enabled 8.0710 ms. These subpercent movements establish no boundary improvement. [Raw boundary samples](compiler-object-string/scalar-boundary-results.json). Node prints a module-type detection warning before startup for the imported TypeScript probe. It is outside the clocks and does not affect result parity.

The temporary [default-on experiment](compiler-object-string/scalar-default-experiment.mjs) changes only generated compiler JavaScript to enable the pass when the environment variable is absent, compiles a third suite binary, then restores that JavaScript in `finally`. Four alternating opt-in/default-on windows at 50k match checksums. Generic medians are 0.0570 ms in both lanes, and spread is 0.1740 ms in both. [Raw samples](compiler-object-string/scalar-default-results.json). The committed source remains disabled by default.

## Validation and failures

All commands run in `/Users/noah/code/scriptc-wt/c1c-escape`. Final behavioral tests use `SCRIPTC_TEST_WORKERS=2` and pinned Node 24.22.1. The full sandbox/plain/sanitized repository gates are deliberately not run because of the documented OOM history and requested bounded gate.

- `pnpm -r build` passes after the cache-key correction.
- `pnpm test packages/compiler/src/backend/llvm` passes 724 tests in 76 files on the final implementation.
- Enabled focused differential run passes 18 selected tests: six new emitter assertions and six corpus programs in both harnesses. The LLVM harness executes release and dev. Corpus selection is `local-record-scalar-replacement`, `5120-frame-records`, `5124-frame-objects-control`, `5960-frame-records-own-references`, `4591-weak-keys-union-records`, and `record-view-extras-release`.
- Enabled broader differential run passes 20 tests across both harnesses. Selection is `2300-dyn-record-spread`, `2792-record-optional-spread`, `2969-scalar-record-results`, `3103-scalar-record-nested`, `5585-record-results-inlined`, `5997-frame-records-in-record`, `6474-index-record-spread`, `6590-function-value-promise-record`, `6916-index-record-spread`, and `record-union-spreads`.
- `SCRIPTC_SAN=1 SCRIPTC_SCALAR_RECORDS=1 pnpm test tests/harness/differential.test.ts tests/harness/llvm-differential.test.ts -t '(local-record-scalar-replacement|4591-weak-keys-union-records)'` passes four tests, including LLVM release/dev, native ASan, and RC audit.
- `pnpm lint`, `pnpm format:check`, `pnpm test:ts7 --baselines-only`, and `git diff --check` pass. A direct `checkPreflightTs7` call records and checks only the new fixture's single-module order and empty diagnostics. No broad order-parity sweep runs.

[Validation log tails and initial errors](compiler-object-string/scalar-validation.log) retain the actual commands and final counts.

The new corpus program covers nonescaping and escaping aliases, mutation through aliases, iteration-local records, nested strings/arrays on the conservative path, exceptions after field mutation, closures, generic identity calls, typed-to-erased transitions, and conditional escape. Costs are recorded as 1,830 ms plain and 2,931 ms sanitized for the combined two harness cases on this host. These are shard estimates.

Two implementation failures were fixed. The initial cache-key edit added a property outside `EarlyExecutableCacheOptions` and failed TypeScript with TS2353. The option now participates in the existing target fingerprint. The first enabled C1 compile failed with `InternalCompilerError: llvm emitter bug: unknown binding a.0`. An alias declaration in `seqExpr.stmts` survived while its local metadata was removed. The correction rewrites those statement lists, and the spread regression checks both IR validity and LLVM emission. The complete final backend and differential runs follow that correction. No failing run is counted as a pass.

## Reproduction and remaining work

Build the fork at the local commit recorded below, install dependencies in that worktree, supply the LLVM helper, and build `@scriptc/runtime-darwin-arm64` with `build:native`. Compile the same C1 source once without the flag and once with `SCRIPTC_SCALAR_RECORDS=1`. Build CSV with the retained `csv-build.mjs` and a worktree-private install of json-2-csv 5.5.0 and esbuild 0.25.12. Run `escape-measure.mjs` with the two suite binaries, CSV JavaScript entry, two CSV binaries, and an output path. Run `scalar-boundary-measure.mjs` with the two boundary binaries and an output path. The retained runners contain the exact windows, sizes, and parity checks.

The next compiler round needs summaries for projection/mutation helpers and returned aliases beyond the exact identity case, owned nested-field destruction proofs, general spread/result materialization, and exception initializer fuzzing. A full gate, broader cross-platform corpus, compile-time scaling measurement, and library/worker plumbing remain required before enabling this option by default.

Local fork branch `next-scriptc/record-scalar-replacement`, commit `5bdafe19eb5b21c2b1a34a9dea9c99075d6074e8` in `/Users/noah/code/scriptc-wt/c1c-escape`. Not pushed.

Research branch `t3/c1c-escape` starts at next-scriptc main `6d5db2f83f560f186e9dd907374b4f32172a19d7` in `/Users/noah/.t3/worktrees/next-scriptc/c1c-escape`. No root README, original compiler working tree, Papermark, Docker, secret, upstream issue, PR, push, deployment, or public post is involved. Dependencies and build outputs are confined to the compiler worktree and cleaned after evidence collection.
