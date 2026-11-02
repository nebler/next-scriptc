# Whole-library native builds with stock scriptc (L1)

2026-11-02. Bundling works for **json-2-csv 5.5.0 and escape-html 1.0.3** with stock scriptc 0.4.6. Both pass 240 generated inputs through the production N-API addon and dispatcher. Neither wins local CPU measurements. Markdown-it 14.1.0 and Day.js 1.11.13 produce archives but fail at native initialization or execution. Compiler acceptance alone is insufficient.

This is a bounded entry-graph experiment. Esbuild resolves the dependencies of the selected entry, including their initialization, with ordinary tree shaking. It does not force unrelated package files, optional plugins, CLI programs, or exports into the native instance. CSV's CJS graph retains both converter directions. No package source, bundles, archives, or addons are committed. [JSON summary](whole-library-native/summary.json) links the detailed results through its filenames.

## Method and licenses

The host was an Apple M4 Pro, darwin-arm64, with Node 26.13.0. The compiler was a fresh registry install of `scriptc@0.4.6`, rather than the local fork. Its executable SHA-256 is `5cd0af91a2c127bd3dff1960f521b08dadedf1a516dcc948053ed76a37123fd1`. The npm integrity, exact dependency versions, file hashes, bundle hashes, compiler commands, and diagnostics are in [baseline results](whole-library-native/results.json), [tsconfig relaxation results](whole-library-native/relaxed-results.json), [interop results](whole-library-native/interop-results.json), and [require-entry results](whole-library-native/require-results.json). There were 34 initial library builds and one fresh-install reproduction build.

All four selected libraries declare MIT. The bundled dependency graphs contain MIT and BSD-2-Clause packages only. Installed manifests and LICENSE-file hashes were checked, including deeks 3.1.0 and doc-path 4.1.0 for CSV. Markdown-it installs argparse 2.0.1, licensed Python-2.0, for its CLI. That package is absent from every bundle input graph and never compiled. The toolchain is Apache-2.0, with the LLVM exception on LLVM. [Dependency lock](whole-library-native/deps-lock.json) retains registry integrity. This checks the distributed manifests and license files, without a legal interpretation of licensing terms.

The probe follows `promotion-build.mjs`: `build --lib --profile ... -o functions.lib.a`, the `rev_` ABI, localized runtime, one serialized runtime, and `SCRIPTC_CHECKER_SERVER=0`. A typed TS facade imports `bundle.js`. All profiles export one string-to-string function. CSV's facade parses the input into a typed array of rows containing a number, string, and nested note object. This is a JSON-boundary transport, not an admission through the existing construction proof. Other entries take strings directly.

Each baseline uses esbuild 0.25.12, ESM output, bundling, `mainFields: ['module','main']`, and `process.env.NODE_ENV="production"`. Six configurations vary neutral versus Node platform, ESNext versus ES2015/ES2022 target, minification, keepNames, object spread lowering, and arrow/template lowering. Neutral platform initially failed resolution because it ignores `main` by default. Explicit main fields fix that bundler failure. Externalizing a dependency would invalidate this experiment and was never used.

## Failures and fixes

| Library | Exact first failure and construct | Iteration and final outcome | Classification |
| --- | --- | --- | --- |
| json-2-csv 5.5.0 | SC0001, `Object.create ? ...` in TS-emitted `__createBinding` at bundle.js:217:66, reported as an always-true function condition | Lowering spread first reports SC0001 on helper `prop`, reused as string and symbol. `checkJs:false`, `skipLibCheck:true`, and `noCheck:true` do not suppress these. An esbuild `banner` containing `// @ts-nocheck` does. Both ESM-import and require-entry bundles then run correctly. | Typecheck/bundle artifact, fixable without a fork. No remaining compiler gap demonstrated for the tested entry/domain. |
| markdown-it 14.1.0 | Archive builds. Native `rev_init` fails with SC4013, `Uncaught TypeError: expected string at $, got undefined`. | Node, neutral, lowered, minified, keepNames, and no-arrow variants all build. Neutral, minified, and require-entry plus nocheck variants all fail at init. | Runtime/compiler gap in initialization of the bundled renderer graph. The diagnostic identifies the ABI init entry, not the offending JS expression. Root-cause localization remains open. |
| dayjs 1.11.13 | SC0001, unary `!` applied to void-returning UMD IIFE at bundle.js:30:6. Also SC0001 for browser fallback name `self`. | Minify syntax plus `define self=globalThis` produces an archive. A nocheck-only build instead fails at initialization with SC2001 on the void-valued UMD expression, wrapped in SC4013. The adjusted require-entry execution fails with SC1090 at require-entry bundle.js:35, `t2 instanceof _`, where `_` is Day.js's function constructor. The addon reports SC4013 enclosing that error in `rev_fn_0`. | Front-end failures are bundler-fixable. Function-constructor RHS of instanceof and void-valued UMD expression execution are scriptc runtime gaps. |
| escape-html 1.0.3 | Archive builds. Native `rev_init` fails with SC4013, `Object.getPrototypeOf on this value is not supported yet`. Esbuild `__toESM` calls it on the exported function. | A local wrapper using `require('escape-html')` before bundling avoids `__toESM`; no require is left unresolved. It passes parity. | Interop artifact fixable by the bundle entry. Underlying callable Object.getPrototypeOf support remains a compiler/runtime limitation. |

The checked builds did not reproduce the survey's direct-CJS SC1010 failure. Esbuild's `__commonJS` closures remove the raw module-format barrier. They do not remove TypeScript diagnostics, reflective helper semantics, or runtime limitations.

The selected CSV and escape calls use no I/O, eval, randomness, or wall-clock reads. The Day.js entry always supplies a string and fixes the local harness timezone to UTC. Its public no-argument API uses the current time, so an adapter must exclude that call form. Locale/default timezone changes and plugins are further configuration effects. Markdown-it is instantiated with fixed options and no app plugins. This does not certify arbitrary calls to either library as pure. No observed first failure is classified as library-inherent I/O or eval.

## Real-addon parity and CPU

[check.mjs](whole-library-native/check.mjs) links each accepted archive using the unmodified production `promotion-addon.c` template and the string ABI table used by promotion signatures. It writes production `ids.json` and `encodings.json`, loads through `loadPromotion`, and exercises both forced native dispatch and automatic shadow verification. Discovery and construction proofs are deliberately bypassed to test the alternative compilation model. No production adapter code changed.

The JS reference uses the original installed package. CSV's reference parses the same input before calling json2csv. The harness also checks the bundled JS output against that reference. For both passing libraries, all 240 direct native outputs match the JS UTF-8 bytes. All 240 forced-dispatch calls return native output, with zero fallbacks. All 240 automatic shadow checks verify. Their policy keeps the buckets in shadow for the experiment, so this is correctness evidence, not a claim that the production speed policy promotes them.

The deterministic corpus includes empty strings, Unicode and emoji, embedded NUL, line breaks, quotes, apostrophes, ampersands and angle brackets. CSV varies 1–17 rows with nested note objects, quoting, and empty string fields. An additional empty CSV array matches `"\n"` in JS, native, and dispatcher. Markdown inputs include code fences, lists, links, and HTML. Blocked libraries stop at their first native failure and have **no 200-input native parity claim**. [CSV check](whole-library-native/check-json-2-csv-nocheck-banner.json) and [escape check](whole-library-native/check-escape-html-require-entry.json) retain corpus hashes, counters, and CPU pairs.

Local indicative, needs stand-in/hosted confirmation. Each size has five warm-up pairs and 35 measured pairs. JS includes the facade computation, including CSV JSON parsing. Native includes the addon's argument/result work and owner-thread execution, measured by its caller-plus-owner thread CPU accounting. Waiting time and unrelated host threads are excluded. JS uses the addon's caller-thread CPU clock. The native measurements use `runShadow`, so they include that sampling wrapper's overhead and are not end-to-end HTTP timings.

| Entry and UTF-8 input bytes | JS median ms | Native median ms | Native / JS |
| --- | ---: | ---: | ---: |
| CSV, 61 | 0.00833 | 0.04479 | 5.37 |
| CSV, 1,163 | 0.04900 | 0.24412 | 4.98 |
| CSV, 9,620 | 0.28529 | 1.53392 | 5.38 |
| escape-html, 169 | 0.00092 | 0.00904 | 9.86 |
| escape-html, 2,704 | 0.01150 | 0.04383 | 3.81 |
| escape-html, 21,632 | 0.07408 | 0.27246 | 3.68 |

These data support feasibility, with no demonstrated CPU saving. The require-entry CSV alternative also passes 240 inputs and is similarly slower. No request coverage was measured, and Dub's historical CSV inclusive CPU share is not a recovered share here.

## Adapter design

Detect resolved import or require bindings and their direct call sites. Support named imports, aliases, default callable exports, and fixed receiver methods only when the adapter can preserve receiver semantics. Specialize constant options into the facade. Reject dynamic package resolution, escaping callable aliases, arbitrary plugins, and configuration setters until their effects have a contract. Retain the app's original JS entry for replay. The compiler profile exports only the adapter entry, even when internal bundled exports remain reachable.

Initialize one native library instance on its permanent owner thread. The JS module cache and native state are separate. Separate dependency versions, initialization options, and plugin sets need separate identities. One instance per app process is a reasonable starting contract, but the current combined promotion archive does not itself provide arbitrary independently resettable package instances. Parallel owner instances need explicit state and thread ownership rules. Mutable caches are acceptable only if they do not change observable results, input objects, or replay behavior.

Divergence can arise from later locale/plugin/configuration changes, import-order effects, timezone/environment reads, external mutation of exports or prototypes, or calls that update internal state. Shadow verification can detect sampled divergence and demote a bucket. It does not detect every future divergent call before it returns: an already promoted bucket can return stale native results until a recheck. The current dispatcher demotes the affected size bucket on mismatch, not every entry sharing that library. A whole-dependency adapter needs library-wide invalidation, configuration versioning, or an explicit immutable-configuration contract. Unsafe stateful calls must stay in JS. A native panic poisons the instance; ordinary divergent output is different from an exception requiring replay.

Key the per-version build cache by the full resolved dependency graph and source hashes, package export conditions, compiler and runtime versions, target ABI, esbuild version/options, facade and boundary schema, initialization configuration, adapter version, and any supported environment assumptions. A package name/version alone misses transitive dependencies and patched installs. Keep artifacts separate from writable runtime instances. Cache compilation failures too, with diagnostic codes, but invalidate them when compiler/bundler inputs change.

Whole-graph initialization replaces the present scalar-only module-init proof with an initialization contract. It does not remove the need for boundary types and serialization guards, entry-call purity and determinism, no mutation of caller inputs, exception/replay safety, result validation, and supported compiler semantics. A call can be pure while its module performs I/O at import; executing that I/O twice remains unsafe. Initialization therefore still needs an effect allowlist or proof, even if native code can execute it. JS typecheck suppression helps compilation but supplies no purity or boundary proof. Current construction proofs cannot certify these general library bodies. A new adapter policy must supply the missing proof rather than silently marking them eligible. Shadow checks remain empirical safeguards, not universal proofs of purity or future state parity.

Risks include duplicated memory and caches, expensive initialization, library-specific native panics, compiler semantic divergence on untested inputs, unbounded allocation or regex work, input-dependent exceptions, prototype assumptions, and serialization overhead. These corpus results do not certify all CSV options or pathological inputs. Pinning an old package for this experiment is not a deployment recommendation.

## Upstream asks and verdict

Bundling is feasible today for the tested CSV and HTML-escape entry graphs. It avoids a required scriptc CJS implementation for these cases, but requires explicit bundler/typecheck policy and new adapter proofs. Performance gating should keep these measured sizes in JS.

Precise upstream follow-ups are function-constructor `instanceof` support with the Day.js SC1090 reproducer; callable `Object.getPrototypeOf` support for esbuild's interop helper; and the Markdown-it SC4013 initialization failure. For Markdown-it, first improve location reporting or reduce the pinned bundle to identify the responsible expression. Do not label its failure a known getter/prototype bug without that reduction. The nocheck-only Day.js path additionally exposes SC2001 on a void-valued UMD expression. Also request a documented user-JS typecheck-relaxation switch: tsconfig noCheck did not work here, while a source nocheck directive did. All four asks are reproducible from the pinned scripts and graph hashes without a compiler fork.

```json
{"stockScriptc":"0.4.6","buildAttempts":35,"nativeParity":{"json-2-csv@5.5.0":240,"escape-html@1.0.3":240},"blocked":{"markdown-it@14.1.0":"SC4013 in rev_init","dayjs@1.11.13":"SC1090 function-constructor instanceof, wrapped SC4013"},"demonstratedCpuSaving":false}
```

## Reproduction and cleanup

From the repo, run `node research/whole-library-native/install.mjs` and use the external directory it prints as `<TEMP>`. Then run these sequentially:

```sh
node research/whole-library-native/probe.mjs <TEMP>
LIBRARIES=json-2-csv,dayjs VARIANTS=no-check RESULTS_FILE=./relaxed-results.json node research/whole-library-native/probe.mjs <TEMP>
LIBRARIES=escape-html,dayjs,json-2-csv VARIANTS=require-entry,nocheck-banner RESULTS_FILE=./interop-results.json node research/whole-library-native/probe.mjs <TEMP>
LIBRARIES=markdown-it,json-2-csv VARIANTS=require-nocheck RESULTS_FILE=./require-results.json node research/whole-library-native/probe.mjs <TEMP>
node research/whole-library-native/check.mjs <TEMP> json-2-csv nocheck-banner
node research/whole-library-native/check.mjs <TEMP> json-2-csv require-nocheck
node research/whole-library-native/check.mjs <TEMP> escape-html require-entry
node research/whole-library-native/check.mjs <TEMP> markdown-it neutral
node research/whole-library-native/check.mjs <TEMP> markdown-it minified
node research/whole-library-native/check.mjs <TEMP> markdown-it require-nocheck
node research/whole-library-native/check.mjs <TEMP> dayjs require-entry
node research/whole-library-native/check.mjs <TEMP> dayjs nocheck-banner
node research/whole-library-native/summarize.mjs
```

The native linker helper currently targets macOS and requires matching cached Node headers and clang. Build probes use the installed stock host runtime. Compiler builds have a 120-second timeout. Runtime checks run in a child with a 120-second timeout, so a panic or crash cannot silently become passing parity. Bundle hashes include esbuild's run-specific source path labels, so a different temporary directory can change bundle hashes while source hashes remain stable. The synthetic entry is retained in the probe script; it has no installed source-file hash.

Remove only the printed task-owned temporary directories after inspecting outputs. A fresh lockfile install and escape-html require-entry rebuild also passed. The installer explicitly initializes the two toolchain packages after npm ci with scripts disabled. The experiment used no containers, hosting calls, fork changes, application checkouts, or publication. All temporary installs and compiled outputs were removed after validation. Work stayed sequential alongside the other research job.
