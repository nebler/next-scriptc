# Per-type promotion boundary encodings

2026-11-01. Phase 1 implementation on `t3/per-type-boundary-encodings`, after merging `t3/automatic-native-promotion` at `ccbe1d5`.

The prototype serialized every argument inside one JSON array. A JSON-text string therefore crossed as escaped JSON inside JSON. The replacement chooses each argument's encoding from metadata produced by `checkFunctionTypes`. Compilation remains the final candidate filter. No performance measurements were run for this change. Its performance gate waits for C1 and the calibrated stand-in.

## ABI findings

The read-only sources inspected were `/Users/noah/scriptc/docs/content/docs/wasm.mdx`, the library-mode section of `cli.mdx`, and `packages/compiler/src/library/library-profile.ts`. `library/prepare.ts` confirms that `bytes` requires a `u8` element type. The generated host LLVM confirms these native signatures:

- `f64` is `double`.
- `bool` is an eight-bit value. The C declarations use `uint8_t`, matching LLVM `i8`.
- Each `string` or `bytes` argument expands to `const uint8_t *, size_t`, in parameter order. Mixed parameters work in one export.
- A `string` or `bytes` result appends `const uint8_t **, size_t *` output slots and returns `void`.
- `null` has no profile class. A known-null parameter uses a false boolean slot and becomes the TypeScript constant `null`. A null result uses the same boolean ABI and becomes JS `null`.
- `bytes` accepts and returns `Uint8Array`. Other typed-array element kinds do not match. They remain ineligible, rather than being reinterpreted as bytes.
- Callback registration is `int32_t register(const char *name, void (*fn)(void), void *ctx)`. The stage callback is a synchronous `void (*)(void *, double)`.

The profile also supports integer classes and `cstring`. This implementation uses `f64` for TypeScript numbers and length-delimited strings for embedded NUL support. It does not use the integer proof requirements or NUL-terminated strings. Library mode remains synchronous and static-only. The existing permanent owner thread, panic poisoning, and result-arena ownership rules remain in effect.

## Encoding contract

| Checked TypeScript type | JS to addon | Library profile | Result to JS |
| --- | --- | --- | --- |
| `number` and numeric literals | Finite number | `f64` | Finite number |
| `boolean` and boolean literals | Boolean | `bool` | Boolean |
| `null` | Null, lowered to false | `bool` | Null |
| `string` and string literals | Raw string, copied to UTF-8 | `string` | Raw UTF-8 string |
| Top-level `Uint8Array` | Owned byte snapshot | `bytes` | Plain `Uint8Array` |
| Object, array, or mixed union | Strict JSON for that argument | `string` | Strict JSON for an object or array result |

A homogeneous union keeps its encoding. A mixed union such as `string | null` uses strict JSON. Nested byte arrays remain unsupported because their containing object still uses the JSON contract. Byte types are recognized from TypeScript's standard library declarations, not from an application-defined class with the same name. The shim currently limits each function to 64 parameters.

Strict JSON still rejects non-finite numbers, cycles, sparse arrays, accessors, symbol properties, non-data properties, and non-plain objects. Direct numbers normalize `-0` to `0`, as the previous JSON boundary did. Scalar native results undergo validation without constructing JSON text. A non-finite native result traps and demotes the instance through the existing panic path.

Raw UTF-8 cannot preserve lone UTF-16 surrogates. The raw-string encoder rejects them and the dispatcher answers in JS. Unicode scalar values, embedded NUL, empty strings, and large strings round-trip. A string inside JSON retains JSON's escaping behavior.

Byte inputs must be plain `Uint8Array` values without extra own properties. Buffer and other views are refused. Offset views are supported. The JS encoder snapshots bytes before deferred shadow execution; the addon then owns another copy for the worker. This avoids retaining V8 pointers across threads. Native parameters are copied again into scriptc's runtime, as required by the library ABI.

Shadow comparison still serializes both JSON-compatible results with the same strict serializer and compares the canonical text exactly, including object key order. Strings use the same canonical JSON bytes for verification even though their transport is raw. Byte results compare the strict JSON encoding of their byte sequence. Argument snapshots happen before the caller can mutate them. A mismatch logs a hash and demotes the bucket before native answers a caller.

## Stage instrumentation

`buildPromotion(modules, output, {target, timing: true})` creates an instrumented library and addon. Ordinary builds omit callback declarations, callback calls, native clock calls, and timing result objects. The JS native path reads no extra stage clock when timing is off. Existing dispatcher clocks for promotion decisions remain unchanged.

Instrumented addon calls return `{value, timings}`. `loadPromotion(file, {onTiming})` unwraps the result and reports one sample per native invocation, including shadows. Samples use milliseconds and contain these fields:

| Field | Included work |
| --- | --- |
| `jsEncode` | Per-type validation, JSON serialization where needed, and byte snapshots |
| `nativeInputCopy` | N-API input conversion and allocation of owned job inputs |
| `nativeDecode` | Library parameter copying and decoding, including per-object JSON parsing |
| `compute` | The original function call |
| `nativeEncode` | Result validation, JSON encoding where needed, and buffered result-arena conversion |
| `copyBack` | Copy into host memory and construction of the N-API result |
| `jsDecode` | Result decoding and validation |

Owner-thread startup, queue wait, libuv scheduling, initialization, and timing-report construction are outside those seven fields. End-to-end time therefore exceeds their sum. These are elapsed-time stages, not per-stage CPU counters. The later measurement task must measure total CPU separately. Instrumentation adds overhead and must be accounted for during calibration.

The Next client forwards timing samples to `globalThis[Symbol.for('next-scriptc.promotion.timing')]` when a hook is installed. A self-hosted consumer can import `loadPromotion` from `next-scriptc/promotion` and pass `onTiming` directly.

## Core and host packaging

`promotion-discovery.mjs` and `types.mjs` discover candidates and prove boundary types. `promotion-signature.mjs` lowers those types into TypeScript exports, profiles, and C signatures. `promotion-build.mjs` builds one archive and addon for the selected target. The target option supports the local host, `linux-arm64-gnu`, and `linux-x64-gnu`; Linux uses GNU 2.34 triples. Runtime packs are reused from the output cache or an explicit `runtime` option.

`promotion-encodings.mjs`, `promotion.mjs`, and `promotion-runtime.mjs` contain the shared encoders, dispatcher, artifact loader, and artifact list. They have no Vercel dependency. Discovery still uses the existing Next-bundled parser and extractor; this change does not replace the parser dependency.

`promotion-client.mjs` retains Next's path fallback and process marker policy. `vercel.mjs` retains Function tracing and copies the three shared artifacts: `promotion.node`, `ids.json`, and `encodings.json`. A self-hosted Node consumer copies those files together and loads the addon by absolute path. Full Next standalone packaging remains unsupported, as in the prototype. No Vercel service was contacted.

## Correctness and build results

- Root `pnpm test`: 38 package tests and 24 demo tests pass, with no failures or skips.
- `pnpm --filter next-scriptc test:boundary-native`: the host integration test passes with ordinary and instrumented addons. It checks synchronous and asynchronous calls, mixed parameters, scalar and object results, raw bytes, Unicode, NUL, empty strings, multi-megabyte strings, canonical result parity, and invalid addon inputs.
- Unit coverage checks NaN and infinities, negative zero, finite-number extremes, strict container rejection, inferred types, unions, byte snapshots, shadow demotion, timing hooks, and the absence of additional stage clocks on the uninstrumented native path.
- macOS arm64: library and addon build and execute successfully.
- Linux arm64 GNU and Linux x64 GNU: libraries and addons build and link. ELF machine values are 183 and 62. Both dynamic-symbol audits find zero unresolved `scr_*` or `rev_*` symbols. N-API imports remain unresolved for Node, as expected. Linux binaries were not executed.

The build fixture is `research/boundary-build.mjs`. For example, `node research/boundary-build.mjs linux-arm64-gnu` builds the arm64 artifact. Adding `--timing` enables instrumentation. `python3 research/boundary-audit.py` audits both Linux artifacts after they exist. Generated archives, runtime packs, and addons were removed from this worktree after validation.

## Failed attempts and corrections

The first host build used the offline-installed local compiler and failed with SC3004, `TypeScript server startup: Permission denied`. The cached checker executable lacked execute permission. Builds then used the already installed stock 0.4.6 compiler through `SCRIPTC_COMPILER=/Users/noah/code/next-scriptc/packages/next-scriptc/node_modules/scriptc/bin/scriptc.exe`. Neither scriptc checkout was modified.

An initial edit command used unavailable `python`; the edit was retried with `python3`. During implementation, the callback registration declaration was corrected to the documented name-based registration ABI before instrumented execution. Boolean declarations were corrected from C `_Bool` to `uint8_t` after inspecting generated LLVM `i8` signatures. Zig 0.16's `objdump` rejected `-T`; the committed ELF reader performs the symbol audit instead.

No benchmarks, Docker operations, Vercel deployments, pushes, issues, or PRs were performed. Correctness tests invoke instrumented exports to verify the fields but do not collect performance distributions or make speed claims.
