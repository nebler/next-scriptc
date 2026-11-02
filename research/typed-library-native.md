# Typed library native builds (L2)

2026-11-02. Typed sources help compiler acceptance in one tested library, but do not establish a general CPU advantage. Stock scriptc 0.4.6 compiles unmodified TypeScript from fastest-levenshtein 1.0.16 and passes 240 inputs through the real addon and dispatcher. It loses to V8 at three smaller sizes. A 131 KB case narrowly favors native in two local sessions, by 4.3–6.2%. Typed json-2-csv 5.5.0 is blocked by unsupported source operations, including after an annotation-only attempt. There is no typed CSV CPU result.

These are local indicative measurements on an Apple M4 Pro, darwin-arm64, Node 26.13.0. They need stand-in confirmation. No timing job overlapped another job of this agent. Builds and measurements ran sequentially alongside the separately authorized Formbricks job. No stand-in measurement, deployment, hosting call, or publication occurred.

[Summary JSON](typed-library-native/summary.json), [comparison chart](typed-library-native/chart.html), and [build results](typed-library-native/final-build-results.json) retain the outcomes. Individual check JSON files retain all 35 CPU pairs at each size, parity counts, and dispatcher snapshots.

## Source provenance and compilation

The source checkouts were outside the repository. These refs match the installed package versions and registry `gitHead` values:

| Package | Ref | Commit | License |
| --- | --- | --- | --- |
| json-2-csv 5.5.0 | tag `5.5.0` | `e3ab1899e0256823d35d765b6c7242380b5360d5` | MIT |
| deeks 3.1.0 | tag `3.1.0` | `acc74f23e07e87f0b4c731ab6c82884e07807ec9` | MIT |
| doc-path 4.1.0 | tag `4.1.0` | `89b6556760f4938b851a4d2de72a6ad763a0e84c` | MIT |
| fastest-levenshtein 1.0.16 | registry gitHead | `03d621ba324d0f665b3b7f557429ca622560d9a3` | MIT |

Both CSV dependencies are TypeScript. The typed CSV attempt uses their TS sources, with no dist dependency fallback. Fastest-levenshtein has no runtime dependencies. Its synchronous string edit distance is relevant to server search, fuzzy matching, and deduplication. The [pinned implementation](https://github.com/ka-weihe/fastest-levenshtein/blob/03d621ba324d0f665b3b7f557429ca622560d9a3/mod.ts) uses typed string parameters and numeric bit operations. CSV's [tagged sources](https://github.com/mrodrig/json-2-csv/tree/5.5.0/src) retain their generic object and options types.

Source file hashes, manifests, npm integrity, compiler hash, and complete diagnostics are in the build JSON and [dependency lock](typed-library-native/deps-lock.json). The compiler executable hash matches L1. The installed CSV, deeks, and doc-path packages do not contain their `src` trees. Fastest-levenshtein's tarball contains `test.ts`, but no implementation `mod.ts`. A `.d.ts` file is a declaration surface, not the typed implementation.

[build.mjs](typed-library-native/build.mjs) preserves TypeScript by compiling a module graph directly. Esbuild is used only for the untyped dist variants and the V8 parity reference. Bundling TS with ordinary esbuild would erase the variable types before scriptc saw them. Project-local copies of the source preserve expressions and types. Bare dependency imports become relative imports to the pinned source copies. This is a module-resolution adjustment, separate from the annotation patch. Generated package manifests are metadata, not upstream source edits.

The CSV facade contains `convert(rows: Row[]): string`, where `Row` is L1's `{id:number;text:string;meta:{note:string}}`. The ABI entry remains `run(input:string):string`, and parses JSON before calling `convert`. The distance facade parses `{a:string;b:string}` and returns the decimal distance as a string. Thus both use L1's JSON-string transport. A typed facade does not specialize the library's generic `object[]`, `unknown`, unions, or option-dependent branches into a schema-specific implementation.

The build uses L1's profile, localized runtime, `rev_` ABI, serialized owner thread, `SCRIPTC_CHECKER_SERVER=0`, and production addon. [probe.mjs](whole-library-native/probe.mjs) was run unchanged for the CSV nocheck baseline. [Audit JSON](typed-library-native/audit.json) verifies that L2's untyped CSV bundle is byte-identical to that fresh L1 bundle, and its 240-input corpus hash matches L1. The additional identity, parse-only, and sink exports do not alter the library's source. Build attempts have 120-second timeouts. Runtime children have 300-second timeouts and retain exit status and stderr.

## Compiler outcomes and every diagnostic

Initial package-shaped TS copies, with `main` and `types` pointing at TS implementation files, fail SC4020. Scriptc requires a package's own `.d.ts` surface for that package route. It reports this on the facade import of json-2-csv and fastest-levenshtein. After moving sources into project modules, a remaining bare doc-path import in CSV `utils.ts:3` also reports SC4020. These are resolution attempts, not library-semantic failures. [Initial resolution results](typed-library-native/package-resolution-results.json) and [follow-up](typed-library-native/resolution-followup-results.json) preserve their full diagnostics.

With all dependencies resolved as project TS modules, typed CSV reports five SC1090 diagnostics:

| Source and line | Diagnostic |
| --- | --- |
| deeks/src/deeks.ts:57 | `'number[]' values where 'string[]' is expected is not supported yet`, at `utils.flatten(keys)` |
| deeks/src/utils.ts:8 | Spread arguments to concat are unsupported, at `[].concat(...array as ConcatArray<never>[])` |
| json-2-csv/src/json2csv.ts:365 | Method calls like `fieldValue.toLocaleString` are unsupported |
| json-2-csv/src/utils.ts:198 | Array methods as values are unsupported, at `if (array.flat)`, while instantiating `flatten<string>` |
| json-2-csv/src/utils.ts:206 | Spread arguments to concat are unsupported, while instantiating `flatten<string>` |

These are compiler support errors, not evidence that upstream TS is ill-typed. The source graph includes fixed-option branches that are not exercised by the facade, including locale formatting. Compiling source does not automatically eliminate these branches before support checks.

The [annotation-only patch](typed-library-native/annotations.patch) adds a return annotation to deeks' flatten helper and `as any` assertions at the unsupported receiver operations. Type erasure with TypeScript 5.9.3 produces identical JavaScript before and after every edit, verified by `audit.mjs`. This attempt removes the number-array diagnostic but leaves four SC1090 errors:

- deeks/src/utils.ts:8: method calls like `([] as any).concat` are unsupported.
- json-2-csv/src/json2csv.ts:365: method calls like `(fieldValue as any).toLocaleString` are unsupported.
- json-2-csv/src/utils.ts:198: reading `flat` from `any` is unsupported, in `flatten<string>`.
- json-2-csv/src/utils.ts:206: method calls like `(safeArray as any).concat` are unsupported, in `flatten<string>`.

[Annotation build results](typed-library-native/build-results.json) contain the complete diagnostics. This is a failed repair attempt, not a patch claimed to make CSV compile. No successful annotation-only patch was found. The compiler's suggested concat rewrite changes expressions and falls outside this experiment's source-preserving constraint. No logic rewrite, nocheck directive on TS sources, or compiler-fork change was used.

Fastest-levenshtein's unmodified TS compiles without diagnostics. Its untyped dist bundle also builds, but fails on corpus input 1 at `bundle.js:14`, indexing `peq[a.charCodeAt(i)]`. Native reports SC1090, `indexing with non-number keys are not supported yet`, wrapped in SC4013 in `rev_fn_0`. Only the first case passes. This variant has no CPU result. [Failure JSON](typed-library-native/check-fastest-levenshtein-untyped.json) retains the full error. Compiler acceptance alone again does not establish runtime support.

## Parity and CPU

CSV's untyped variant passes L1's exact 240 inputs, all 240 forced native dispatches with zero fallbacks, and all 240 automatic shadow verifications. Its empty array result also matches. Typed distance passes 240 inputs, 240 forced native dispatches with zero fallbacks, and 240 shadow verifications in both sessions. Its corpus derives pairs from L1's text set and includes empty strings, NUL, Unicode, emoji, punctuation, line breaks, repeated strings, and lengths across the 32-character algorithm switch. Parity compares UTF-8 bytes against the original installed npm package and separately checks the source-built V8 reference.

No native parity is claimed for blocked typed CSV. Distance's corpus contains the L1 text cases, but necessarily uses pairs rather than CSV's row payloads. Every measured input is also checked against JS before recording a sample.

Timing follows L1: five warm-up pairs, 35 measured pairs, the addon's caller-thread CPU clock for V8, and `runShadow` caller/service-plus-owner thread CPU for native. It excludes waiting and unrelated host threads. Native CPU includes the sampling wrapper. The pair order is JS, library native, sink, echo, parse-only. It is fixed, not randomized. JSON parsing is included in both implementations. Cold initialization is outside measured samples.

| Library and variant | Input bytes | V8 median ms | Native median ms | Native / V8 |
| --- | ---: | ---: | ---: | ---: |
| CSV untyped | 61 | 0.007667 | 0.040249 | 5.25 |
| CSV untyped | 1,163 | 0.042292 | 0.220833 | 5.22 |
| CSV untyped | 9,620 | 0.295458 | 1.553625 | 5.26 |
| CSV untyped | 315,275 | 8.886958 | 51.611250 | 5.81 |
| Distance typed, repeat session | 47 | 0.002792 | 0.005917 | 2.12 |
| Distance typed, repeat session | 527 | 0.011375 | 0.019959 | 1.75 |
| Distance typed, repeat session | 4,111 | 0.609334 | 0.687458 | 1.13 |
| Distance typed, repeat session | 131,119 | 0.962958 | 0.921541 | 0.96 |

CSV uses L1's 1, 16, and 128 rows, plus 4,096 rows. Distance uses pairs of 15, 240, and 1,920 UTF-16 code units. The large distance case uses 30 versus 122,880 code units, exercising the short-pattern algorithm with a large document. It is not a balanced 64 KB versus 64 KB edit-distance benchmark. Size and algorithm shape both matter, so these observations do not locate a universal crossover size.

The first Node 26.13.0 distance session measures native/V8 ratios of 2.08, 1.73, 1.12, and 0.94. The repeat was justified by the narrow large-case lead and keeps the same harness and payloads. [First session](typed-library-native/check-fastest-levenshtein-typed-session1.json) and [repeat](typed-library-native/check-fastest-levenshtein-typed.json) retain both outcomes. The repeat's 4.3% saving and first session's 6.2% saving are local observations, not a production promotion recommendation. A preliminary Node 24.22.0 check informed setup; all reported CPU pairs use Node 26.13.0.

## Boundary share

The production addon's boundary-stage hook requires compiler callback instrumentation to separate decode, compute, and encode. Instead, each accepted archive exports three source-level controls through the same string ABI and addon. `sink` accepts the same payload and returns `"0"`. `echo` returns the entire payload. `parseOnly` parses JSON and returns the payload. All controls use the same owner-thread handoff and `runShadow` accounting. Echo and parse-only results are checked against the input.

These are transport proxies, not an exact decomposition or mathematical bounds. Sink can avoid work for an unused input. Echo forces a result larger than the distance output and larger than CSV output. Neither matches the library's allocation and garbage-collection behavior. The controls do not separately measure caller-side `JSON.stringify`: the payload already exists, as in L1. JSON parsing inside the facade is computation, beyond ABI string transport.

| Entry, input bytes | Sink ms (% native) | Echo ms (% native) | Parse + echo ms (% native) |
| --- | ---: | ---: | ---: |
| CSV, 61 | 0.005708 (14.2%) | 0.005665 (14.1%) | 0.006458 (16.0%) |
| CSV, 1,163 | 0.007835 (3.5%) | 0.009500 (4.3%) | 0.015290 (6.9%) |
| CSV, 9,620 | 0.022250 (1.4%) | 0.036583 (2.4%) | 0.072791 (4.7%) |
| CSV, 315,275 | 0.494958 (1.0%) | 0.895042 (1.7%) | 3.017124 (5.8%) |
| Distance, 47 | 0.005375 (90.8%) | 0.005500 (93.0%) | 0.005916 (100.0%) |
| Distance, 527 | 0.005790 (29.0%) | 0.005625 (28.2%) | 0.006083 (30.5%) |
| Distance, 4,111 | 0.008123 (1.2%) | 0.008501 (1.2%) | 0.009917 (1.4%) |
| Distance, 131,119 | 0.019125 (2.1%) | 0.036959 (4.0%) | 0.052709 (5.7%) |

Percentages are ratios of medians. Small control differences reflect measurement variation. Transport dominates the smallest distance case, and contributes little at larger compute-heavy sizes. Even the parse-plus-echo proxy consumes only about 6% of large CSV native CPU. Removing JSON transport cannot explain or recover its roughly 5.8× deficit. These controls support that conclusion without claiming a precise compute/transport split.

## Implications for the adapter

Typed sources are worth testing per entry. This experiment shows a successful typed implementation and a narrow V8 win in one large, unequal-length case. It does not prove that L1's nocheck directive caused its slowdown. The directive suppresses checking; the input's missing types and emitted helper shapes are separate issues. Here typed CSV fails support checks, and untyped distance fails execution, so neither library supplies a complete successful typed-versus-untyped CPU comparison.

Prefer a verified implementation `src` in a package tarball when available, because it shares npm's integrity and version identity. Declarations alone cannot restore local annotations. Source maps may contain `sourcesContent`, but can contain only JS, omit sources, or refer to a different build. Validate that recovered TS corresponds to the installed dist graph. A git fallback needs a pinned tag and commit matched to package metadata, licenses, dependency versions, and a dist-versus-source parity check. Do not infer a source version from a mutable branch or a package homepage.

A source adapter must retain types through graph assembly, resolve TS dependencies consistently, and avoid silently turning source into an untyped esbuild bundle. Cache keys need source hashes, graph resolution, compiler/bundler versions, facade/schema, options, and every annotation patch. Support failures remain cached failures, with a JS fallback. Keep library-wide state, initialization effects, replay safety, and purity obligations from L1. Distance's module-global scratch array is restored after normal calls, but interruption/error recovery still needs an explicit contract. These corpus checks do not prove all future inputs or concurrent-instance behavior.

Gate on end-to-end CPU for the real call shape. Source availability does not imply eligibility or speed. The largest distance result warrants stand-in confirmation and a broader shape sweep; CSV needs upstream support work before its typed-source performance hypothesis can be tested under the annotation-only rule.

## Reproduction and cleanup

Use Node 26.13.0 with its cached Node headers and clang on macOS. Run L1's installer to create an external `<TEMP>`, then install `fastest-levenshtein@1.0.16` and `typescript@5.9.3` there with scripts disabled. The retained lock records the exact install used, including the experiment's separate Node runtime package. That runtime package is tooling and is absent from every compiled library graph. For an unchanged L1 probe, keep runtime tooling in a separate directory: its license inventory intentionally rejects the runtime installer's ISC package.

Run these commands sequentially from the repo, with the selected Node executable on PATH:

```sh
LIBRARIES=json-2-csv VARIANTS=nocheck-banner RESULTS_FILE=../typed-library-native/l1-probe-results.json node research/whole-library-native/probe.mjs <TEMP>
RESULTS_FILE=./final-build-results.json node research/typed-library-native/build.mjs <TEMP>
LIBRARIES=json-2-csv VARIANTS=annotated node research/typed-library-native/build.mjs <TEMP>
node research/typed-library-native/measure.mjs <TEMP>
cp research/typed-library-native/check-fastest-levenshtein-typed.json research/typed-library-native/check-fastest-levenshtein-typed-session1.json
node research/typed-library-native/check.mjs <TEMP> fastest-levenshtein typed
node research/typed-library-native/audit.mjs <TEMP>
node research/typed-library-native/summarize.mjs
```

`build.mjs` fetches missing source repositories and checks out the pinned refs. The annotation build intentionally fails and records diagnostics. The untyped distance runtime check also intentionally records failure. Historical package-resolution attempts are retained as diagnostics rather than required reproduction steps. `audit.mjs` checks annotation erasure, L1 bundle identity, and corpus identity. The harness is adapted from L1's `check.mjs` and uses the unchanged production addon template and `loadPromotion` dispatcher.

All task-owned temporary installs, source checkouts, bundles, archives, addons, and marker directories were removed after verification. No third-party implementation source is committed, apart from the expressly requested short patch and diagnostic excerpts. No Docker, compiler-fork edits, `/Users/noah/scriptc` changes, held-out Papermark work, root README edits, merge, or push. Every JSON artifact is below 256 KB; the repository compression check passes.
