# C1b: expose leaf record teardown to LLVM

2026-11-03. This round implements the bounded fallback from C1b: make final-reference teardown eligible for inlining for nontraced record shapes containing only scalars and native strings. It does not implement general record escape analysis or scalar replacement. The patch preserves allocation, identity, every ownership operation, and disposal hooks. Full escape analysis remains open.

## Why this is the bounded change

C1 attributes 62.3% of samples in its generic fixture to generated record-release code. That profile identifies a place to investigate, not a removable fraction of total runtime. Fresh upstream `862a372300651dbfafe68e61aea9228f15a9f8e0` already has considerable related machinery: `call-lifetimes.ts` proves projection-only parameters and locals, `stack-objects.ts` emits frame storage and tracks owned fields, `record-results.ts` builds results in caller slots, and `frame-escapes.ts` groups aliases and solves parameter/capture facts. Frame-class eligibility uses the broader frame-escape proof; record eligibility mainly uses projection-only facts. A new independent escape pass would duplicate existing analysis without resolving ownership integration.

A specialized identity helper returns its argument. Inlining that helper later in LLVM does not retroactively change the compiler's earlier storage decision. C1's generic fixture still constructs heap records. Its leaf record release uses a tiny inline shared-reference check but places final-reference teardown behind `noinline`, even though its only owned field is a native string. This patch exposes that existing teardown body at the direct release symbol. LLVM decides whether to inline it. No `alwaysinline` attribute or assumption that the record is local is added.

## Implementation and ownership proof

`packages/compiler/src/backend/llvm/shapes.ts` adds an optional inline-teardown mode to `releaseBody`. Only record emission requests it, when no member needs bounded destruction, the shape is not traced, and it is neither freezable nor a record-view target. `needsBoundedRelease` already classifies every reference kind except native strings as requiring the runtime destruction budget. Overflow maps, child records, arrays, erased values, closures, and other owned references therefore retain the existing slow path. Classes are unchanged.

The inline body is the existing complete release body. It checks null and immortal headers, decrements once, releases fields only at zero, and runs the existing weak/source disposal and allocator free sequence. Native strings cannot invoke user code or recurse through arbitrary owned graphs. Nested records keep their budgeted teardown and release their leaf children normally. Checked typed-to-erased transitions, descriptor mutations, and weak collections keep their runtime machinery. This optimization applies to escaping leaf records too because it changes code placement rather than their lifetime or representation.

Shape-union dispatch calls an arm's `_slow` symbol directly. An initial version omitted that symbol and failed `4591-weak-keys-union-records.ts` with `SC3004`, `use of undefined value '@sc_rrelease_r29362d86b762_slow'`. The final implementation retains a `noinline` compatibility entry that calls the direct release body. Union dispatch has not decremented the final reference before this call, so there is still exactly one decrement. No caller-site ownership logic changes.

Exception paths, partially initialized records, field initialization order, and scope cleanup order are unchanged. There is no new stack lifetime, delayed field release, constructor deletion, retain/release cancellation, or movement across a throwing operation. The existing object audit notes remain in sanitized emission. Frozen headers and view marks keep their previous handling through the conservative exclusion.

## Measurement

Apple M4 Pro, macOS arm64, Node 26.12.0. The baseline and patch are built from the same fetched upstream revision with the same newly built seven-flavor Darwin runtime pack. Only compiler TypeScript emission changes. The existing LLVM 22.1.8 helper is copied read-only from the fork's built package; there is one native build tree. C1's earlier dense key-array patch is not cherry-picked.

The [runner](compiler-object-string/escape-measure.mjs) executes all six C1 suite workloads at 1k, 10k, and 50k, and CSV at 128 and 4,096 rows. Four process windows alternate baseline→patch and patch→baseline. Each cell runs Node first. Every process warms 50 calls and times 35 calls inside the computation, excluding startup and stdout. CSV uses json-2-csv 5.5.0 and esbuild 0.25.12, with the same C1 input/call shape. Full CSV strings and all suite checksums match Node in every sample. CSV input construction is outside its clock; suite construction is inside. [Raw samples](compiler-object-string/escape-results.json) retain 140 timings per lane and cell, plus CSV output byte counts and SHA-256.

Pooled medians in milliseconds, with positive changes meaning slower:

| Workload | Size | Node | Baseline | Patched | Change |
| --- | ---: | ---: | ---: | ---: | ---: |
| events | 50,000 | 3.5304 | 1.4820 | 1.4825 | +0.0% |
| strings | 50,000 | 2.6595 | 1.6760 | 1.6565 | -1.2% |
| maps | 50,000 | 4.3614 | 1.9490 | 1.9660 | +0.9% |
| copy | 50,000 | 0.8281 | 0.1705 | 0.1430 | -16.1% |
| generic | 50,000 | 0.0302 | 0.1190 | 0.1040 | -12.6% |
| json | 50,000 | 9.6740 | 11.1530 | 10.9585 | -1.7% |
| csv | 128 | 0.2417 | 1.2995 | 1.2825 | -1.3% |
| csv | 4,096 | 7.0197 | 41.4570 | 41.1485 | -0.7% |

Generic improves in all four windows: baseline→patch medians are 0.138→0.109, 0.116→0.112, 0.119→0.104, and 0.119→0.101 ms. Spread also improves in all four: 0.165→0.143, 0.170→0.141, 0.166→0.143, and 0.177→0.143 ms. Generic remains about 3.4× Node. These submillisecond clocks have microsecond granularity; four process windows are not independent production trials or confidence intervals.

Large CSV medians by window are 41.412→40.658, 41.665→41.944, 41.878→41.979, and 41.178→40.571 ms. The direction reverses, so there is no demonstrated CSV benefit. Its pooled patched time remains about 5.9× Node. JSON's small pooled movement also reverses in one window and is not established as a gain. Strings and Map changes are noise controls because those paths have no changed record teardown. Events are effectively unchanged.

The suite executable decreases from 414,032 to 413,888 bytes and CSV from 1,617,504 to 1,617,496 bytes. `llvm-nm` finds four record `_slow` symbols in the baseline suite and none in the patched suite after dead-code elimination. Emitted LLVM still contains record constructors and releases: this is a teardown-call improvement, not proven scalar replacement. No new profile attributes a precise share of the elapsed-time change. Final timing windows overlap no task builds/tests. An earlier incomplete timing launch was canceled with exit 130 because its start overlapped the tail of test collection; none of those samples enters the retained result.

## Validation and observed failures

Local fork branch `next-scriptc/record-release-fast-path`, commit `c37e2154abd3144f3115d5f778087fbb19d4c8d6`, worktree `/Users/noah/code/scriptc-wt/c1b-escape`. [Validation log tails](compiler-object-string/escape-validation.log) retain the final counts, compiler warnings, and setup history. All test commands use `SCRIPTC_TEST_WORKERS=2`. Final builds/tests/benchmarks use Node 26.12.0 and pnpm 10.27.0; the initial install/build used the pnpm launcher's Node 23.10.0, which emitted engine warnings. This differs from the repository's pinned Node 24.22.1 and is a validation limit. No dependency-file changes are committed.

The final LLVM backend run passes all 719 tests in 75 files. The final focused run passes 15 selected tests: three emitter assertions and six corpus programs through both differential harnesses. The LLVM corpus harness runs release and dev within each selected test. The six programs are `record-leaf-release.ts`, `4591-weak-keys-union-records.ts`, `5120-frame-records.ts`, `5124-frame-objects-control.ts`, `5960-frame-records-own-references.ts`, and `record-view-extras-release.ts`.

The final sanitized run passes four selected tests: the new fixture and the weak-key union fixture through both harnesses, including LLVM release/dev. `SCRIPTC_SAN=1` instruments emitted code and rebuilds runtime sources with AddressSanitizer and `SCR_RC_AUDIT`; this is native sanitizer execution, not a pure TypeScript unit run. No sanitizer or RC-audit failure appears. The new fixture's measured combined harness costs are recorded as 2,319 ms plain and 4,105 ms sanitized, on this host with warm caches and concurrent compilation. These are shard estimates, not portable performance claims.

`pnpm -r build`, `pnpm lint`, `pnpm format:check`, `pnpm test:ts7 --baselines-only`, and a direct single-fixture `checkPreflightTs7` comparison to its recorded module order and empty diagnostics pass. The baseline was generated and reviewed only for the new fixture. No existing frontend baseline is changed. A broad order-parity sweep and the full plain/sanitized repository gates are not run, following the requested focused-gate scope after the documented full-run OOM history. Linux, wasm, worker, and library end-to-end gates remain outstanding.

Exact final behavioral commands, run in the fork worktree with Node 26.12.0's `installation/bin` first on PATH:

```sh
SCRIPTC_TEST_WORKERS=2 pnpm test packages/compiler/src/backend/llvm
SCRIPTC_TEST_WORKERS=2 pnpm test packages/compiler/src/backend/llvm tests/harness/differential.test.ts tests/harness/llvm-differential.test.ts -t '(record-leaf-release|5120-frame-records|5960-frame-records-own-references|5124-frame-objects-control|4591-weak-keys-union-records|record-view-extras-release|scalar and string records|freezable records|leaf layouts)'
SCRIPTC_TEST_WORKERS=2 SCRIPTC_SAN=1 pnpm test tests/harness/differential.test.ts tests/harness/llvm-differential.test.ts -t '(record-leaf-release|4591-weak-keys-union-records)'
pnpm lint
pnpm format:check
pnpm test:ts7 --baselines-only
```

The initial frozen install failed with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`. Installation with `--no-frozen-lockfile` succeeded; its lockfile rewrite was restored before commit. A premature baseline compile failed with `SC3003: could not read @scriptc/runtime-darwin-arm64/runtime-pack.json` while that pack was building. The subsequent baseline compile succeeds. The first broad backend run had 718 passes and one assertion expecting the old leaf `_slow` body; that assertion now checks the direct body. The affected corpus then caught the actual missing union entry described above. Both failures were fixed and the final selected and backend runs pass. An intermediate assertion-only retry also failed before its template-string expectation was corrected. No failing run is counted as a pass.

## Full record escape analysis still needs an ownership integration

The next implementation should extend the existing analyses and storage emitter rather than add a source-pattern shortcut. Represent a construction site and its local aliases as one identity group. Compute a fixed point across specialized direct callees. Summaries must distinguish projection, mutation of the argument, return of an alias, retention in memory, capture, possible callback invocation, and throwing behavior. A returned alias is not an escape if the caller consumes it locally and the analysis substitutes that identity group. Merely knowing that a helper is specialized or later inlined is insufficient.

Initially accept complete, closed, acyclic record literals in synchronous functions. Reject return or throw of the identity group, stores into escaping objects/arrays/maps/globals, escaping captures, dynamic or foreign calls, unresolved callees, and all conversions to erased representations. Reject descriptor/prototype operations, reflection, weak collections, and observable identity operations until a separate representation proof covers them. Preserve distinct identities and alias writes. A field assignment that introduces an ownership edge must participate in the acyclicity proof. Reject unknown edges rather than infer acyclicity from the declared TypeScript type.

Use existing frame storage first. Integrate broader record eligibility with `findStackObjects`, field owners, and alias-aware writes. Do not give an unproven heap record an immortal stack header. Each owned field needs one live owner at every control-flow join, including partial initialization and exception edges. For `a.child = makeChild()`, evaluate the right-hand side once, preserve the old child if evaluation throws, and retain/store/release in the existing semantic order. Cleanup must read the current field, including changes through aliases. A stack record holding a heap child does not eliminate that child's RC. Calls that can observe or destroy owned children remain ordering barriers.

For loops, distinguish a record created each iteration from a loop-carried alias. Reuse storage only after every previous identity and owned field is dead. Put `llvm.lifetime.start/end` at actual dynamic lifetime boundaries, including exceptional exits, rather than assuming entry-block allocation defines a JavaScript lifetime. Keep async/generator frames outside the first implementation. Reject captures initially even where the current frame analysis proves a local closure stays in the frame.

After that storage proof passes differential and RC-audit tests, scalar replacement can replace field slots with SSA values and PHIs. Promote primitive fields first. Owned fields require a separate destruction-order proof; the absence of a record escape does not prove that destroying a child cannot run user code. Keep typed-to-erased crossings on heap storage until a materialization operation can preserve identity, every alias, descriptors, and ownership atomically on success and failure. Do not use LLVM's later inlining as evidence for an earlier escape decision.

Required future tests include helper-returned aliases, multiple mutations through aliases, stores of a local into escaping memory, local versus escaping closures, exceptions in each initializer and assignment, branch joins with partially initialized owned fields, loop-carried aliases, distinct-identity comparisons, reflection/prototype/accessor changes, weak collections, and typed-to-erased round trips. Existing frame-object tests are a starting point, not evidence that these extensions work. No speedup for this unimplemented design is estimated here.

## Reproduction and artifact ownership

Research lives on `t3/c1b-escape` in `/Users/noah/.t3/worktrees/next-scriptc/c1b-escape`, created from next-scriptc `main` at `1ac8284`. No root README change is included. Dependencies were installed only in the compiler worktree and its `.c1b/deps` directory. Neither original compiler checkout was modified. There is no Docker, push, issue, PR, deployment, or public post.

To reproduce, create a fresh compiler worktree at the upstream base above, install/build its workspace, provide the matching LLVM helper, and build `@scriptc/runtime-darwin-arm64` with `build:native`. The actual native build command used `PATH=/Users/noah/.local/share/vite-plus/bin:/opt/homebrew/opt/llvm@22/bin:$PATH CMAKE_BUILD_PARALLEL_LEVEL=2 pnpm --filter @scriptc/runtime-darwin-arm64 build:native`. It produced seven flavors and six vendor archives. Compile C1 `workloads.ts` and the CSV bundle before and after applying the fork commit, retaining the two executable pairs outside the source tree. Both lanes must use the same runtime pack and toolchain. The recorded run used the following shape, with absolute paths in the actual invocation:

```sh
node research/compiler-object-string/escape-measure.mjs BASELINE_SUITE PATCHED_SUITE CSV_ENTRY BASELINE_CSV PATCHED_CSV research/compiler-object-string/escape-results.json
```

Each uppercase argument denotes a locally built file. Build CSV with the retained `csv-build.mjs` and a private install of json-2-csv 5.5.0 and esbuild 0.25.12. No bundled dependency source is retained. The raw measurement file is under 256 KB. All task-owned executables, runtime packs, compiler dist files, copied native helper, install directories, and test caches are removed after evidence is retained. The branches and source worktrees remain for review. Native helper/runtime artifacts must be supplied again before rerunning tests. Cleanup leaves 39.88 GiB free, compared with about 40 GiB at setup. [Artifact hashes](compiler-object-string/escape-artifacts.json) identify the removed executable pairs, helper, manifest, and emitted LLVM.
