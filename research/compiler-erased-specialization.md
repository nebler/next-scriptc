# C1d: guarded string indices on the erased path

2026-11-03. This round adds a numeric-index fast path for primitive strings to the existing dynamic-tier property probe. It avoids formatting the index as a property key and repeating generic lookup for an immutable own character. General property caches and primitive arithmetic already exist in freshly fetched upstream `ee968de47`; this patch extends that machinery rather than adding another object model.

## Reduction and attribution

[erased-path.ts](compiler-object-string/erased-path.ts) is own code that reduces the escaped-dot scan and nested path walk identified in C1's CSV profile. It repeatedly evaluates `nested.note` over two JSON-decoded records. The path and record receivers stay erased. The final reduction also erases the loop variable, as the bundled JavaScript does. A retained typed-index control uses the same walk with a typed loop variable. It checks a dot and its preceding backslash, slices path segments, reads computed fields, and sums the final string lengths. It is a mechanism reproducer, not a replacement implementation of json-2-csv. It omits CSV quoting, header discovery, arrays, and configurable path rules. No dependency source is copied.

The baseline profile was collected before choosing the patch, using macOS `sample PID 3 -file FILE` while the reduction ran at 50k iterations. Its initial capture briefly overlaps compilation and includes process startup, so it establishes attribution rather than timing. Named exclusive top-of-stack rows include `sc_dyn_key_get` (317 samples), computed helper dispatch (117), `scr_f64_to_scrstr` (82), `scr_str_char_at` (68), and `scr_dyn_release` (104). The graph contains both a startup thread view and the later main queue view; summing inclusive subtrees would double-count costs. [Raw profile](compiler-object-string/erased-path-profile.txt.gz). These symbols motivate avoiding key formatting and generic dispatch. They do not predict the saving. A second baseline capture of the fully erased reduction runs after all builds and tests, before final timing. It again shows keyed lookup (279), key formatting (52), keyed probing (70), and ownership work. [Fully erased profile](compiler-object-string/erased-path-dynamic-profile.txt.gz).

The full CSV fixture still loads json-2-csv 5.5.0 and esbuild 0.25.12 from a private external install through the existing `csv-build.mjs`. The bundle, installed package sources, and native executables are disposable and absent from this commit. C1's original ~41 ms versus ~7 ms comparison uses older upstream; measurements below compare the current upstream base to this patch.

## Guard and ownership argument

`scr_js_keyed_probe` already dispatches primitive numeric keys through `scr_js_index_probe`. That probe now forwards primitive string receivers to `scr_dyn_index_get`. After its existing nonnegative, finite-range, exact-integer check, the latter checks the runtime string kind and UTF-16 length. An in-range read calls the existing `scr_str_char_at`, boxes its one-code-unit result, releases the temporary string owner, and returns an owned value. The caller retains its existing result cleanup. Returning a character after releasing the receiver is explicitly tested.

An integer `-0` names index zero. NaN, infinity, negative numbers, fractions, and numbers at or above 2^32−1 decline before the cast or read. A valid index outside the string declines, allowing the existing prototype lookup. The upper bound is conservative: larger valid string indices still use the generic path. Astral pairs produce individual surrogate code units, and lone surrogates retain the existing WTF-8 representation. No UTF-8 byte offset is substituted for a JavaScript index.

An in-range primitive string character is an immutable own data property. There is no cached descriptor, slot, receiver identity, or prototype assumption to invalidate. Numeric-string keys, `"-0"`, coercible objects, and symbols follow existing key handling. Object receivers, boxed wrappers, proxies, getters/setters, dictionaries, layout changes, deletes, and prototype mutations follow their existing paths. No new property cache is introduced. No ToPrimitive hook is skipped because the shortcut requires an already primitive numeric key and primitive string receiver. Evaluation order and single evaluation are unchanged in the compiler.

The initial LLVM investigation exposed an obsolete recognizer for a legacy helper shape, but current calls use the NaN-boxed tier and its earlier IC dispatch. Experimental recognizer edits were discarded. The committed LLVM test checks the active keyed probe and generic fallback. Existing upstream arithmetic fast paths remain unchanged. Repeated ownership elimination and broader descriptor-guarded caches remain separate work.

## Measurements

Apple M4 Pro, macOS arm64, Node 26.13.0. Both lanes rebuild the two affected default runtime units with Homebrew LLVM 22.1.8 and identical flags. Four independent process windows alternate baseline and candidate order. Each process warms 50 calls and times 35 calls. Entries are the median of four window medians, in milliseconds. Startup and stdout are excluded. The suite includes fixture construction; CSV and path input construction are outside the clock. Every checksum and complete CSV string matches Node. These are descriptive local measurements, not confidence intervals or production savings.

| Workload | Size | Node ms | Baseline ms | Patched ms | Change |
| --- | ---: | ---: | ---: | ---: | ---: |
| erased-path | 50,000 | 3.7801 | 38.4090 | 31.4085 | -18.2% |
| typed-path | 50,000 | 3.7886 | 30.8925 | 30.7350 | -0.5% |
| events | 50,000 | 2.6234 | 1.5085 | 1.5185 | +0.7% |
| strings | 50,000 | 2.7687 | 1.6410 | 1.6370 | -0.2% |
| maps | 50,000 | 3.4948 | 1.9530 | 1.9525 | -0.0% |
| copy | 50,000 | 0.7391 | 0.1685 | 0.1770 | +5.0% |
| generic | 50,000 | 0.0375 | 0.1190 | 0.1285 | +8.0% |
| json | 50,000 | 9.5847 | 10.8770 | 10.8415 | -0.3% |
| csv | 128 | 0.2416 | 1.2760 | 1.2150 | -4.8% |
| csv | 4,096 | 7.0251 | 40.7580 | 38.5330 | -5.5% |

The fully erased reduction improves in all windows (16.5–18.5%). The typed-index control has mixed directions and establishes no gain. That control takes a typed helper path that formats the key before the active probe, exposing remaining compiler work. Full 4,096-row CSV improves in all windows (3.3–10.3%), with a 5.5% reduction in the summary. It still takes 5.49 times Node. This slice does not resolve the erased-path deficit.

Copy and generic controls regress by 5.0% and 8.0% in the summary. Copy is slower in three windows and tied in one; generic has mixed directions. Neither exercises the new character read. Code placement and desktop variation are possible explanations, not established causes. These regressions are retained and need follow-up before broader adoption. No suite-wide gain is claimed. Other controls move by less than 1% in the summary.

[Final raw suite/CSV samples](compiler-object-string/erased-results.json), [erased reduction](compiler-object-string/erased-path-results.json), [typed control](compiler-object-string/erased-path-typed-results.json), [summary and per-window changes](compiler-object-string/erased-summary.json), and [artifact hashes](compiler-object-string/erased-artifacts.json) retain the evidence. `node research/compiler-object-string/erased-summarize.mjs` regenerates the summary. Files ending in `-preliminary.json` are the excluded mixed-compiler experiment. The profile is attribution evidence and does not estimate the patch's CPU saving.

## Validation and observed failures

Commands run in `/Users/noah/code/scriptc-wt/c1d-erased`. Final behavioral commands use `SCRIPTC_TEST_WORKERS=2` and Node 26.13.0 on PATH. pnpm is 10.27.0. Initial install and builds invoked pnpm under Node 23.10.0 and emitted engine warnings. Final builds and tests use Node 26.13.0; this differs from the repository pin.

- `pnpm install --no-frozen-lockfile` and `pnpm -r build` pass. Install lockfile drift is reverted. Dependencies remain inside the worktree.
- `PATH=/opt/homebrew/opt/llvm@22/bin:$PATH CMAKE_BUILD_PARALLEL_LEVEL=2 pnpm --filter @scriptc/runtime-darwin-arm64 build:native` builds six runtime flavors and six vendor archives. The existing LLVM helper is copied read-only from the original fork. Only one native build tree exists for this task. The final paired unit rebuild explicitly uses Homebrew LLVM 22.1.8 for both baseline and candidate.
- Baseline and candidate binaries use that same pack. For candidate measurement, [erased-rebuild-runtime.mjs](compiler-object-string/erased-rebuild-runtime.mjs) rebuilds default release/dev `scr_json.c` and `scr_js_object.c`, updating manifest hashes and sizes. Other variants remain baseline. The two baseline units are rebuilt from the parent revision with the same command and compiler as the candidate. Sanitized tests compile runtime sources. A production build must rebuild all variants.
- `pnpm test packages/compiler/src/backend/llvm`: 719 tests pass in 76 files, including the new active-probe/fallback emission assertion.
- `pnpm test tests/harness/differential.test.ts tests/harness/llvm-differential.test.ts -t 'erased-string-index|1574-dyn-optional-method-number-keys|2678-large-string-sparse-index|2601-dyn-keyed-write-ops|3120-dynamic-property-descriptors|prototype-named-data-records'`: 12 tests pass. The LLVM harness covers release and dev. Filtered cases are not full-suite passes.
- `SCRIPTC_SAN=1 pnpm test tests/harness/differential.test.ts tests/harness/llvm-differential.test.ts -t erased-string-index`: two tests pass, including native ASan and RC audit, plus LLVM release/dev.
- `pnpm test packages/runtime/src/scr_js_object.test.ts`: two tests pass with ASan and UBSan. The isolated indices mode also runs with RC audit; old budget and absent-read modes retain ordinary sanitized coverage. `scr_context.c` is linked as required by the current runtime.
- `pnpm lint`, `pnpm format:check`, `pnpm test:ts7 --baselines-only`, and `git diff --check` pass. The new fixture's single-module preflight/order baseline has empty diagnostics and matches an independent frontend recheck. No broad order sweep runs.

The corpus covers ASCII, non-ASCII, astral text, lone surrogates, empty strings, index bounds, NaN, infinity, negative zero, numeric strings, object conversion hooks, symbol keys, objects whose properties become getters and then disappear, prototype replacement, proxies, and side effects in receiver/index expressions. `String.prototype` is not a first-class value in this compiler: an attempted prototype-getter fixture fails with SC2020 and is removed. No execution coverage of mutated built-in String prototypes is claimed. The fast-path proof relies only on immutable in-range own characters; misses preserve generic lookup.

An early baseline compile fails with SC3003 because the runtime pack manifest is not yet built. It passes after build completion. Early LLVM assertions expected the legacy index helper and fail; inspection identifies the active NaN-boxed probe, and the final assertion tests that path. Direct runtime ASan/UBSan passes initially, but enabling RC audit for the old shape-budget tests reports one live dyn value from their intentionally immortal object. The new string checks are moved to an isolated `indices` mode for audit, while the old budget tests keep their ordinary sanitized run. The first performance round also mixed Homebrew LLVM 22 baseline objects with Apple clang candidate objects. Those samples are retained as `*-preliminary.json` and excluded from final claims. Both lanes are rebuilt with LLVM 22 before final measurement. No failing run counts as a pass.

Full sandbox, full plain/sanitized suites, other platforms, worker/library execution, and addon integration do not run. The requested bounded gate follows the documented OOM history. This is local evidence, not release readiness.

## Reproduce and remaining work

Create the fork worktree from the recorded upstream base, install there, build the compiler and native pack, and compile `erased-path.ts`, `workloads.ts`, and the external CSV bundle before applying the patch. Keep the baseline binaries, apply the patch, rebuild both runtime units with `PATH=/opt/homebrew/opt/llvm@22/bin:$PATH node research/compiler-object-string/erased-rebuild-runtime.mjs`, and compile candidate binaries. The rebuild script rejects a clang identity that differs from the pack manifest. Run `erased-path-measure.mjs BASELINE PATCHED OUTPUT` and the existing `escape-measure.mjs BASELINE_SUITE PATCHED_SUITE CSV_ENTRY BASELINE_CSV PATCHED_CSV OUTPUT`. Both runners warm 50 calls and retain 35 samples per process in four alternating baseline/candidate windows, with Node as reference. No builds or tests overlap final timing.

The next work should profile the current full CSV graph after this slice, quantify dynamic closure and ownership costs, and investigate additional guarded operations only where the profile supports them. Current upstream already has shape caches and NaN-boxed arithmetic, so C1's earlier design must be evaluated against those implementations. General block-local ownership elimination needs effect and lifetime proofs. Built-in prototype coverage and all runtime variants need broader validation.

Local fork branch `next-scriptc/erased-specialization`, commit `1bba92c707186ea32b0cb40cf02d9b0fd2c75178`, based on upstream `ee968de47`. Research branch `t3/c1d-erased` starts at main `ee5a61f`. Both remain local. Original checkouts and root README are untouched. No Papermark, Docker, pushes, PRs, issues, public posts, deployment, or secrets are involved.

[Validation tails and observed failures](compiler-object-string/erased-validation.log). Task-owned dependencies, helper, runtime pack, caches, and binaries are removed after evidence collection.
