# C2: native boundary JSON decode

2026-11-03. This experiment isolates the runtime decoder used by generated promotion entries. It uses an own-code fixture and never executes Papermark. Results describe a local runtime microbenchmark, not a hosted application speedup.

## The boundary already uses direct typed decode

`packages/scriptc-promote/src/functions/promotion-build.mjs` writes the library entry from `promotion-signature.mjs`. JSON arguments become `JSON.parse(pN) as Parameters<typeof fN>[N]`. With the default catch fallback, this checked cast is the input guard. Some configurations without catch fallback also perform a dynamic guard parse. This distinction matters when attributing a decode stage.

Fresh upstream base `08c74e73a7869ab045f04c032bcc12be3a4901df` already emits `scr_json_parse_schema` for eligible record and array types. It writes directly into the compiler's layout and calls the checked dynamic parse/conversion only after a quiet decline. The schema-emission tests verify both calls. Unsupported types and erased targets use `scr_json_parse`. Typed decode is therefore an existing baseline feature, rather than a new C2 optimization.

Upstream also already has per-parse dynamic key-sequence transitions, shared key bytes, schema expected-key comparisons for names up to eight bytes, word scanning for unescaped strings, and a short decimal fast path with `strtod` fallback. Dynamic container regions already reduce some lifetime work. Reimplementing these mechanisms would not establish a new win. E1's projected input and E2's extra source fields remain separate costs. PM2's 26.964 ms decode and 36.318 ms compute, and E2's 23.013 versus 2.330 ms parse stages, are historical measurements from different fixtures and stock compiler versions. No number here is substituted into either application result.

## Benchmark and correctness method

[bench.c](native-json-decode/bench.c) links the runtime APIs directly. It reuses upstream's test schema declarations through an include, without copying upstream source into this repository. Its own record extends that layout with an optional numeric union. Each row has `sku`, `qty`, `ok`, `tags`, and an optional number present on alternating rows. The flat case has empty tag arrays. The nested case has three string tags per record. Sizes are 600, 6,000, and 60,000 records. JSON generation, file I/O, and creation of the input `ScrStr` occur outside clocks. Each process warms ten parses, then retains forty samples. Separate clocks cover decode, checksum traversal, and destruction. Every checksum is checked against Node's parse of the same text, including optional values.

The benchmark uses the same runtime entry points as the generated native library, but excludes addon input copies, encoding, output serialization, and the checked-dynamic conversion after a schema decline. The schema constructors reuse the C test fixture's `calloc`/`free`, rather than compiler-emitted record allocation. Their allocation share cannot be generalized to promoted application code. Timing the two paths is useful for attribution, but it does not prove an application promotion win.

Final comparisons use four process windows with baseline/patch order reversed in alternate windows. They use the same compiler flags, input, schema callbacks, and runtime sources except for the patch. No task builds or tests overlap those windows. Raw files retain all samples. Medians are descriptive single-host results without confidence intervals. Desktop processes remain active. Node is 26.13.0, differing from scriptc's pinned Node 24.22.1. The host is macOS arm64. The C compiler is Apple clang, using `-std=c11 -O3 -g`.

## Profile attribution

Four clean `sample <pid> 3 -file <path>` profiles cover 60k rows, typed and erased, flat and nested. Each has about 2,200 main-thread samples. Typed flat: schema parse is 72.9% inclusive; record parsing 66.9%; the fixture's record constructor 12.5%; numeric conversion 8.7%; string allocation/copy 2.6%; plain-string scanning 1.9%. Typed nested: schema parse 78.8%; record parsing 75.0%; constructor 7.1%; numeric conversion 4.3%; string allocation/copy 6.8%; plain-string scanning 5.5%. These are fractions of the complete decode/checksum/destruction loop, not fractions of decode alone.

The top-level typed destruction call accounts for 559/2,240 samples (25.0%) flat and 427/2,255 (18.9%) nested, including callback-driven record and array release. Erased parsing is 62.3% flat and 55.8% nested. Number conversion contributes 7.4% and 4.6%; plain-string scanning 1.8% and 3.6%; string allocation/copy 2.7% and 4.8%. `scr_dyn_alloc` alone appears in 2.2% and 1.0%, but inlined scalar/region allocation prevents treating that as all boxing cost. Key lookup is conspicuous in the checksum traversal (`scr_dyn_obj_get`: 13.5% flat, 21.7% nested); it must not be attributed to decode. Key transition checks and insertion inline into parser code, so no separate hash/interning percentage is claimed. [summary.json](native-json-decode/summary.json) and the four `final-baseline-*.txt` files retain attribution evidence.

Sample stacks overlap: inclusive percentages must not be added. Token scanning, key comparison, scalar dispatch, and record bookkeeping can inline into their callers, so the sampler cannot assign each an independent precise share. Numeric conversion already avoids `strtod` for these small integers. Strings stay in WTF-8 with an ASCII flag; this fixture does not perform a whole-tree UTF-8 to UTF-16 conversion. Escaped strings use the existing decoder, and UTF-16 indexing is separate work. Dynamic scalar boxing, region bookkeeping, shared-key insertion, and RC remain present in the erased path. Schema decode avoids those boxes for scalar fields but still allocates native records, arrays, and strings. Teardown is measured separately and remains material.

## The landed slice shortens schema dispatch

The patch gives declaration-order fields a short prefix loop in `scr_jschema_record`. It performs the existing exact expected-key comparison and field reader, then advances `seen` and `guess`. On a key miss, it resumes the existing general loop at the same opening quote. That loop retains source order, extra properties, and index-signature behavior. A close brace uses the existing missing-field/optional-arm check. A repeated field reaches the existing duplicate check and declines for the generated caller to rerun the checked dynamic route. `__proto__` extras still enter the own-data source view.

Record elements in `scr_jschema_array` also call the record parser directly after the same whitespace, kind, and depth checks. This bypasses the generic schema switch on every record. Failure still releases the partial record and all staged array elements. No field reader, number conversion, string decoder, exception builder, schema ABI, or allocator changes. All schemas retain the existing 1,000-level cap and quiet-decline contract. This preserves the compiler's documented depth behavior; it does not claim V8 has the same depth limit.

A trial forcing string scanner inlining showed no consistent improvement and was discarded. Its exploratory raw results are not used in the final table. An initial build failed with undefined `scr_context_is_main`; an early attempted run therefore failed with `spawnSync ... ENOENT`. The benchmark provides the ordinary main-context answer, while the runtime test build now links the actual `scr_context.c`. The pre-existing C test source list omitted that newly required runtime dependency. An early test launch overlapped exploratory profiling and was stopped with exit 130; final profiles and measurements were collected again without that overlap.

## Before and after

All values are milliseconds: the median of four per-window medians. Change is decode time only; negative means faster. Destruction follows the checksum traversal and is excluded from decode.

| Rows | Shape | Target | Decode before | Decode after | Change | Destroy before | Destroy after |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 600 | flat | erased | 0.063 | 0.064 | +0.8% | 0.021 | 0.021 |
| 600 | flat | typed | 0.050 | 0.045 | -9.1% | 0.018 | 0.017 |
| 600 | nested | erased | 0.091 | 0.092 | +0.8% | 0.031 | 0.032 |
| 600 | nested | typed | 0.089 | 0.086 | -3.4% | 0.022 | 0.022 |
| 6,000 | flat | erased | 0.594 | 0.619 | +4.2% | 0.201 | 0.210 |
| 6,000 | flat | typed | 0.476 | 0.442 | -7.1% | 0.165 | 0.161 |
| 6,000 | nested | erased | 0.919 | 0.922 | +0.2% | 0.315 | 0.318 |
| 6,000 | nested | typed | 0.886 | 0.854 | -3.7% | 0.217 | 0.212 |
| 60,000 | flat | erased | 6.260 | 6.516 | +4.1% | 2.186 | 2.293 |
| 60,000 | flat | typed | 4.804 | 4.414 | -8.1% | 1.810 | 1.613 |
| 60,000 | nested | erased | 10.206 | 9.885 | -3.1% | 3.508 | 3.277 |
| 60,000 | nested | typed | 8.872 | 8.539 | -3.8% | 2.104 | 2.071 |

The 60k typed flat case improves by 8.1% in the summary; its per-window changes range from -6.7% to -24.8%. Typed nested improves by 3.8% in the summary, with per-window changes from -12.7% to +6.2%. The slower baseline fourth window and the nested patch third window show substantial host variation. The erased decoder has no source changes and no consistent measured gain: its 60k flat window changes range from -11.0% to +21.1%. These data support a bounded typed-path improvement, especially on flat records, rather than a broad decode-speed breakthrough. Destruction changes are not evidence of a teardown optimization; its code is unchanged. The remaining design is required for the larger C2 goal.

## A larger slice needs emitted decoders

The next design is a per-schema emitted decoder, selected only at the same proved typed-cast sites as today's schema parser. It should use the existing lexer and slot readers, but emit constant field offsets, kind-specific calls, and a straight sequence of expected-key checks. This removes interpreted schema kind switches and pointer loads. Start with array-of-record roots and number/string/boolean fields plus optional scalar unions; retain generic schemas for recursive and discriminated unions, dictionaries, and unsupported layouts.

A miss must resume a shared record slow path with a precise cursor, seen-field mask, initialized slots, and last declaration index. Alternatively, release the partial typed result and rerun the current checked dynamic route from byte zero. The latter is the first sound implementation because parse has no callbacks. Duplicate keys, escaped field names, source-order changes, unknown keys, wrong types, and malformed syntax must use that route until equivalent specialized behavior is proved. Duplicate values must remain last-wins, including wrong-typed earlier values. Unknown fields cannot be dropped merely because a TypeScript annotation omits them: source views and returned records can expose them. A specialized decoder must retain source metadata or decline.

Generated decoders must preserve lone-surrogate WTF-8 strings, signed zero, correctly rounded doubles above 2^53, exponent overflow/underflow, own-data `__proto__`, and existing depth/error handling. They must use the compiler's allocation and release callbacks, clear initialization state only on successful ownership transfer, and release every initialized field on decline. No per-call global mutable schema cache is needed. Measure code size, instruction-cache effects, malformed-input retries, unknown-field workloads, and RC behavior before broadening eligibility. Eliminating erased preflight parses also needs a separate proof that the typed input guard and fallback preserve that configuration's construction checks.

## Validation and reproduction

The local fork branch is `next-scriptc/c2-json-decode`, commit `4bd7effcf29eb1b373b1235e0b2bf72b8d09ed29`, based on fresh upstream `08c74e73a7869ab045f04c032bcc12be3a4901df`. The following commands passed in its worktree, using Node 26.13.0 and pnpm 10.27.0:

- `SCRIPTC_TEST_WORKERS=2 pnpm test packages/runtime/src/scr_json.test.ts`: two tests pass in 82.59 seconds. Both compile with ASan+UBSan, then run RC audit off/on with cycle thresholds 1, 7, and 256. The new prefix checks, existing strings/number/optional/depth/ownership checks, and 128 generated Node differential inputs per audit mode pass. The C differential driver compares every accepted typed field and tag to the erased parse and compares the complete serialized tree to Node, including duplicates, own-data `__proto__`, negative zero, >2^53, exponents, subnormals, Unicode, escapes, and lone surrogates. Leak detection is disabled by the existing harness; RC counters and explicit ownership checks remain active. This is an API-level differential corpus embedded in the runtime test, rather than a new compiler corpus fixture.
- `SCRIPTC_TEST_WORKERS=2 pnpm test packages/compiler/test/json-schema-parse-emission.test.ts`: two tests pass, including native and wasm schema emission and fallback structure. These are emission tests, not native/wasm execution gates.
- `pnpm lint`, `pnpm format:check`, `pnpm test:ts7 --baselines-only`, and `git diff --check` pass. No new TypeScript fixture baseline is required.

The full workspace build, full plain/sanitized gate, sandbox gate, zero-cost gate, addon end-to-end execution, Linux, and wasm execution were not run. Focused runtime compilation provides the native build for this C-only change. Full-gate OOM history and the requested bounded validation scope remain release limitations. Dependencies are installed only in the compiler worktree. Initial non-frozen install lockfile drift was reverted. No dependencies are linked into main. No push, PR, issue, public post, Docker resource, secret, root README edit, or held-out execution occurs.

[run.mjs](native-json-decode/run.mjs) accepts the compiler worktree, output filename, and optional `build` or `profile` mode. Run it from this next-scriptc worktree. Build compiles C objects in the compiler worktree's `.c2` directory, then links one benchmark. It does not build a runtime pack or install dependencies in main. Delete `.c2` before rebuilding after header/include or compiler flag changes; its incremental check tracks direct source mtimes. `C2_BIN` selects a retained baseline or candidate executable for measurements. The generated JSON payloads, objects, dependencies, and binaries are disposable and are not committed. All retained harness files are own code, and every retained file is under 256 KiB.
