# scriptc patch ledger

Every change we make to scriptc is listed here. Each change lives on its own branch in the fork and is intended to become one upstream PR.

- Fork: https://github.com/nebler/scriptc (`origin`). Upstream: https://github.com/vercel-labs/scriptc (`upstream`).
- Local clone: `/Users/noah/code/scriptc-fork`.
- Update routine for each patch branch: `git fetch upstream main && git rebase upstream/main`, rerun the patch's focused tests, then update "Last rebased" below.
- Commit and PR prose follows scriptc's `technical-writer` skill (required by their CONTRIBUTING for AI-written text).
- Upstream filing happens only with the maintainer's (Noah's) explicit go.

| Patch | Branch | Status | Last rebased onto upstream | Last validated |
| --- | --- | --- | --- | --- |
| Closed-record certificate investigation | `next-scriptc/closed-records` | local diagnosis only; stopped on metadata loss, no facility or adapter change. Pushed to the fork 2026-11-02. | 2026-11-01, `f606a3bd8` | — |
| Cached record prototype reflection | `next-scriptc/result-reflection` | experimental, focused parity only. Pushed to the fork 2026-11-02. | 2026-11-01, `a07d5a791` | focused only |
| Immutable global limits in arithmetic loops | `next-scriptc/wasm-counted-globals` | focused checks pass, full gate pending; **stacked on the int8 branch**. Pushed to the fork 2026-11-02. | 2026-11-01, `a07d5a791` | focused only |
| Dense native object key arrays | `next-scriptc/object-key-array-construction` | Local commit `0f66b43c5`; not pushed; focused validation only | 2026-11-02, `38cc546e0` | ASan/UBSan runtime tests, release/dev corpus + sanitized RC audit, 3 affected cases, lint/format; full gate pending |
| Ordered JSON schema record decode | `next-scriptc/c2-json-decode` | Local commit `4bd7effcf`; not pushed; bounded typed-path improvement | 2026-11-03, `08c74e73a` | ASan/UBSan runtime + RC audit, 256 Node comparisons, 2 schema emission tests, lint/format, baseline completeness; full gate pending |
| Local leaf record scalar replacement (C1c) | `next-scriptc/record-scalar-replacement` | Local commit `5bdafe19e`; opt-in, not pushed; generic −57.0%, broader ownership work open | 2026-11-03, `301c28c9f` | 724 LLVM backend tests, 16 corpus programs through both harnesses, new + weak-key sanitized RC audit, lint/format/build/baseline completeness; full gate pending |
| int8 product ranges in wrapping sums | `next-scriptc/int8-range-analysis` | Pushed `d49007483`; local fix `2a3ce4ba6` (quadratic range walk) is unpushed. **PR on hold.** | 2026-11-01, `0a7dd5650` (clean) | 2026-11-01–02: `d49007483` plain failed, sanitized incomplete; fix has focused checks only ([report](int8-gate-2026-11-01.md)) |

## int8 product ranges in wrapping sums

- **Branch:** [`next-scriptc/int8-range-analysis`](https://github.com/nebler/scriptc/tree/next-scriptc/int8-range-analysis), local head `2a3ce4ba6` (unpushed), following `d49007483`.
- **Change:** `wrappingRange` in `packages/compiler/src/backend/llvm/wrapping-sums.ts` derives integer ranges through nested exact `+`, `-` and `*`. A natural `(sum + a[i] * b[i]) | 0` over `Int8Array` therefore takes the same int32 path as the `Math.imul` form. The local follow-up also removes repeated recursive range walks.
- **Tests added:** `wrapping-sums.test.ts` (backend), corpus program `tests/corpus/signed-products-wrapping-sums.ts` with its order-parity baseline and corpus-cost entry.
- **Evidence:** Vercel vector route, server compute p50 409 → 10.0 ms ([vector-vercel.md](vector-vercel.md)). Linux causal measurement 403.7 → 23.4 ms ([scriptc-int8-range-analysis.md](scriptc-int8-range-analysis.md)). In WebAssembly, 113 → 28 ms in workerd at 20k rows ([wasm-simd-workerd.md](wasm-simd-workerd.md)).
- **Validation:**
  - Before the rebase: partial local validation, plain lane only ([scriptc-int8-range-analysis.md](scriptc-int8-range-analysis.md)).
  - Rebased `d49007483`: install/build/lint/format passed. Full plain: 17,309 passed, 254 failed, 415 skipped. Sanitized command failed with OOM-correlated IPC closure before completion; observed 8,713 passed, 74 failed, 127 skipped. See the [gate report](int8-gate-2026-11-01.md) for classifications, evidence loss, and remaining validation gaps.
  - Local fix `2a3ce4ba6` addresses a proven quadratic range-query regression. Pinned-Node host quality checks and all three backend unit tests pass with plain and sanitized environment settings; full/native validation on that head is outstanding.
  - The full gate is still outstanding. The `pnpm test:sandbox` budget is exhausted, so use the local fallback from CONTRIBUTING: `SCRIPTC_TEST_WORKERS=4 pnpm test`, then the same with `SCRIPTC_SAN=1`.

## Candidate patches (not started)

| Candidate | Evidence | Notes |
| --- | --- | --- |
| Enable `simd128` for wasm32 | `native/llvm-codegen/src/target.cpp` creates every target with CPU `generic` and no features ([wasm-simd-workerd.md](wasm-simd-workerd.md)) | Needs the native helper rebuilt; draft issue in [wasm-simd-upstream-draft.md](wasm-simd-upstream-draft.md) |
| Loop shape that blocks vectorization in wasm32 | Module-global library limits prevent integer induction ([wasm-vectorization.md](wasm-vectorization.md)) | Local patch recorded below; strict float reduction remains separate |
| `Map`/`Set` allocation and record copying cost | R1's analysis of real app targets ([real-app-targets.md](real-app-targets.md)) | Prioritize if Hill 2 (Papermark) hits it |
| `JSON.stringify` on erased values | O1: 1.30 → 0.36 ms with a typed encoder ([function-level.md](function-level.md)) | Issue first |

## Cached record prototype reflection

- **Branch:** `next-scriptc/result-reflection`, commit `505306dee94421c413b83f7658484b7004593e41`. Worktree `/Users/noah/code/scriptc-wt/result-reflection`; upstream base `a07d5a791`.
- **Status:** **local, not pushed**. Experimental; full and sanitized gates outstanding. Not used by the adapter, which stays on stock 0.4.6.
- **Change:** `scr_dyn_get_prototype` reuses a native record's existing checked view. Runtime field refreshes preserve that view's prototype, so another field snapshot is unnecessary for this read. Arrays and other capsule types retain their previous path.
- **Evidence:** M2's result cost is mostly strict reflective validation, not typed JSON encoding. Four short alternating fork windows measured strict serializer median 0.718 → 0.710 ms, an inconclusive gain on a loaded host. Separate windows reversed direction. See [native-result-encoding.md](native-result-encoding.md).
- **Tests:** new corpus `typed-reflection-prototype-cache.ts` plus its frontend order baseline; direct Node/native release stdout and exit parity for it, `3120-dynamic-property-descriptors.js`, and `prototype-named-data-records.ts`. Only the changed release runtime unit was rebuilt into a private ABI 48 pack. No full suite.
- **Remaining gaps:** separate typed-to-erased prototype mutation and hidden symbol attachment to a typed array exposed pre-existing parity failures. They are recorded with failed attempts in the report and are not fixed by this patch. Erased stringify remains a candidate for separate work; it is not on the production result-encoding path.

## Immutable global limits in arithmetic loops

- Branch `next-scriptc/wasm-counted-globals`, local commit `b46987ce934ae7cda1ae3aea1969491d1d14537d`, worktree `/Users/noah/code/scriptc-wt/wasm-counted-globals`. Status: **local, not pushed**. Fresh upstream base `a07d5a791`; dependency `0cc542ceb` cherry-picks the earlier int8 patch.
- `counted-global-limits.ts` and two matcher integrations in `emit-statements.ts` admit immutable numeric globals only for arithmetic bodies that cannot reenter user code. Preserve runtime loads, initialization checks, guarded bounds, and scalar fallback. No C++ change.
- S1-shaped imul reduction now has integer induction, vector loads/multiply/accumulate, and vector reduction: wasm width 4, arm64 width 16, AVX2 width 8. Disabling only this fix on the same source revision restores zero vector PHIs. Strict float wasm reduction remains scalar.
- Validation: 26 focused backend tests, new corpus in both differential harnesses release/dev and ASan/RC audit, single-fixture TS7 preflight/order plus completeness, compiler typecheck, focused lint/format, and 15 non-timed SHA-256 Wasm checks pass. Full suite and performance are pending. [Evidence and later measurement command](wasm-vectorization.md).
- Step 3 is an untested `--wasm-simd`/`+simd128` CLI/helper propagation sketch in [the upstream draft](wasm-simd-upstream-draft.md). The native helper was not rebuilt. Evaluation uses retained IR with Zig `-O3 -msimd128` and stock runtime objects.

## Candidate: checked closed records for result encoding

Investigated 2026-11-01 on local branch `next-scriptc/closed-records`, diagnostic commit `2ff495f8cc9fb79d37cd222e9a68ea7456916cd6`, worktree `/Users/noah/code/scriptc-wt/closed-records`, fetched upstream base `f606a3bd8`. **Stopped at the hypothesis gate.** Static library mode accepts typed-to-erased prototype, symbol, and descriptor mutations. The focused Node/executable/library probe loses a null prototype, hidden record and array symbols, and accessor identity on subsequent crossings. Native layouts and temporary checked views do not provide an authoritative persistent closure certificate. See [closed-records.md](closed-records.md) and [raw parity outputs](closed-records-parity.json). The fork branch retains a diagnostic fixture outside automatic corpus discovery because parity currently fails. No encoder, adapter flag, A/B measurement, full gate, or push. A native-identity mutation certificate remains a separate design task.

Not implemented. Adapter-only generated visits retain reflective container checks
because TypeScript signatures are structural. The loaded-host experiment in
[native-result-validation.md](native-result-validation.md) leaves about 0.6 ms
of validation versus 0.01 ms for typed JSON encoding.

A compiler facility could certify a closed record at construction and invalidate
that certificate on changes to keys, descriptors, symbols, prototype, or array
density. Checked dynamic crossings must verify the certificate or fall back.
A typed encoder could then check finite numbers and encode without materializing
a descriptor dictionary per object. This needs an explicit compiler/runtime
contract, not an adapter assertion that a return type is exact.

Minimal repro against a hypothetical unchecked `{n:number}` encoder:

```ts
function fake(): {n:number} {
    const value = {n:1};
    Object.defineProperty(value, 'hidden', {value:2});
    return value;
}
const value = fake();
console.log(Object.getOwnPropertyNames(value)); // ['n', 'hidden']
console.log(JSON.stringify(value));             // {"n":1}
```

Other required cases are `Object.setPrototypeOf(value,null)`, a hidden symbol,
`{n:-0}`, a getter replacing `n`, and `const a:number[]=[]; a.length=1`.
Neither the declared return type nor successful shadows prove their absence on
the next call. A certificate must preserve actual key order and handle extra
fields through a checked fallback. JSON negative zero stays canonicalized to zero. A certificate must not throw
inside the native lane to refuse it. A compact layout must define the same guarantees before the
adapter can safely decode it. The investigation adds only diagnostic fixtures in scriptc; compiler and runtime code are unchanged.

## Adapter construction proof follow-up

2026-11-01. The CR1 follow-up adds an adapter-only immutable construction screen.
No scriptc source or runtime patch was made. Closed literal and map/filter
closures can bypass reflective result validation under an explicit build option.
Revenue and Papermark remain strict because the screen excludes their construction
and mutation patterns. Compiler parity, resource limits, and broader construction
coverage remain unproven, so the option stays disabled by default. This does not
resolve the closed-record runtime certificate candidate or its lost-metadata
reproductions. See [construction-proof.md](construction-proof.md).

## Optional boundary follow-up (stock 0.4.6, adapter only)

2026-11-01. No compiler patch was made. Library mode accepts a checked parse
of `{v?: string | null}`. The real addon preserves `Object.keys({})` as `[]`,
`x.v === undefined` as true, and explicit null as null. See the permanent
`test/optional-discovery.mjs` fixture and the [report](optional-boundaries-and-discovery.md).

Undefined-bearing results remain rejected by the adapter. This minimal wrapper
produced SC1090 in stock library mode:

```ts
function f(x: number): null | undefined { return x ? undefined : null; }
export function run(x: number): string {
	const value = f(x);
	return JSON.stringify(value);
}
```

Diagnostic: `JSON.stringify of 'null | undefined' values ... are not supported yet`.
The promotion wrapper's typed encoder callback hits the same diagnostic even
inside a catch envelope. This is a compiler feature limit, not evidence that
undefined should become null. `JSON.stringify([undefined])` produces `[null]`;
`JSON.stringify({v:undefined})` produces `{}`; bare undefined produces no string.
Those transformations lose caller-visible distinctions. Inputs with explicit
undefined continue to fall back before native entry. Missing optional fields
can enter as ordinary JSON. Optional results, optional tuple elements and rest
parameters remain conservative rejections pending a separately proved encoding.

## Dependency closure follow-up, stock 0.4.6

K1 development, 2026-11-01. Candidates only; no compiler changes. Run each
reproduction in library mode with a profile exporting `run(string): string`.
[Probe and diagnostics](dependency-closures/results.json),
[design and limitations](dependency-closures.md).

SC1010, runtime JavaScript package resolution: install json-2-csv 5.5.0 from
K1's lockfile, then import its absolute `lib/converter.js` runtime path.

```ts
import { json2csv } from "/absolute/install/node_modules/json-2-csv/lib/converter.js";
export function run(x: string): string { return json2csv(JSON.parse(x)); }
```

Stock reports that the import resolves only to declarations. This blocks the
original package before deeper closure lowering. It is not evidence that all
of json-2-csv can compile once resolution is fixed.

SC0001, unbound CommonJS exports in a raw flattened TypeScript input:

```ts
function twice(n: number): number { return n * 2; }
exports.twice = twice;
export function run(x: string): string { return String(twice(Number(x))); }
```

This is a module-linking requirement, not a request to accept an unbound global.
A correct linker must preserve export-object mutation and initialization order.
Getter re-exports need descriptor semantics and an effect proof before promotion.

Isolated dynamic JSON property reads, module-level Set lookup, and callback
regex replacement compile. No SC failure is claimed for these constructs.

## Dense native object key arrays

- Branch `next-scriptc/object-key-array-construction`, commit `0f66b43c5ba7fc11e6d2d930c25566f03bca6527`, worktree `/Users/noah/code/scriptc-wt/c1-object-string`, freshly fetched upstream base `38cc546e0`. Local only, not pushed.
- `scr_dyn_own_key_strs` constructs fresh inline arrays and fills owned dense slots directly instead of general indexed pushes. Ordering, optional presence, enumerability, and observable snapshot ownership are preserved.
- Four alternating windows over 50k key snapshots improve 11–15%; pooled median 8.0265 → 6.9325 ms. Whole JSON walk improves only 10.364 → 10.186 ms in one final session. Large CSV does not improve (42.570 → 43.365 ms); no CSV benefit claimed.
- New C ownership assertions and corpus `object-keys-owned-dense-array.ts`; both C ASan/UBSan modes, corpus release/dev and sanitized RC audit, three affected descriptor/order programs, single-fixture preflight/order, baseline completeness, lint and format pass. Full gate and other runtime variants remain outstanding.
- [C1 report, raw measurements, profiles, design notes, and reproduction](compiler-object-string.md).


## Leaf record teardown visibility (C1b)

- Branch `next-scriptc/record-release-fast-path`, local commit `c37e2154abd3144f3115d5f778087fbb19d4c8d6`, worktree `/Users/noah/code/scriptc-wt/c1b-escape`, fetched upstream base `862a372300651dbfafe68e61aea9228f15a9f8e0`. Not pushed.
- Scalar/native-string record releases expose their existing final-reference teardown to LLVM. Frozen/view/traced/recursive shapes keep the old path. Shape-union `_slow` entry points remain available. Allocation, identity, RC operations, weak/source hooks, and cleanup ordering remain unchanged. General escape analysis and scalar replacement are not implemented.
- Four alternating windows, 50 warmups and 35 samples per process: at 50k, generic pooled median 0.119 → 0.104 ms (−12.6%); spread 0.1705 → 0.143 ms (−16.1%). Both improve in every window. Large CSV 41.457 → 41.1485 ms has mixed directions across windows, so no CSV gain is established. Every suite checksum and full CSV output matches Node.
- Final validation: 719 LLVM backend tests; six selected corpus programs through both harnesses, including release/dev; new fixture and weak-key union program under ASan/RC audit; build, lint, formatting, single-fixture preflight/order, and baseline completeness pass. Two implementation mistakes were found and fixed, including a missing shape-union slow entry. Full gates and other platforms remain outstanding. Node 26.12.0 differs from the repository pin.
- [Design, ownership proof, full results, failures, exact commands, and remaining work](compiler-escape-analysis.md), [raw measurements](compiler-object-string/escape-results.json).

## Ordered JSON schema record decode (C2)

- Local branch `next-scriptc/c2-json-decode`, commit `4bd7effcf29eb1b373b1235e0b2bf72b8d09ed29`, based on fresh upstream `08c74e73a7869ab045f04c032bcc12be3a4901df`. No push.
- The schema parser uses a compact declaration-order prefix and direct record dispatch for array elements. Existing field readers, source views, duplicate-key decline, checked fallback, number/string semantics, and depth handling remain. The runtime test source list also gains its required context implementation.
- Four alternating process windows at 60k rows: typed flat decode 4.804 → 4.414 ms (−8.1%); nested 8.872 → 8.539 ms (−3.8%). Host variability is substantial; erased decode has no consistent gain. This is a runtime API microbenchmark with test record allocators, not an application result.
- ASan/UBSan runtime tests pass with RC audit off/on, three cycle thresholds, and 128 Node differential inputs per mode. Two compiler schema-emission tests, lint, format, baseline completeness, and diff checks pass. Full builds/gates and other-platform execution remain outstanding.
- [Benchmark, attribution, ownership argument, exact validation, limits, and emitted-decoder design](native-json-decode.md).

## Local leaf record scalar replacement (C1c)

`SCRIPTC_SCALAR_RECORDS=1` removes complete local number/boolean/string records after alias-group use analysis. Field mutation and exact identity helpers are supported. Nested owned graphs, arbitrary helpers, erased and escaping identities retain allocation. Four alternating windows give generic 0.1350 → 0.0580 ms at 50k; spread and D1/E1 boundary probes show no established gain. CSV remains about six times Node. The default-on experiment matches opt-in generic/spread timings. [Analysis, ownership argument, exact validation, failures, and raw evidence](compiler-scalar-replacement.md).

## Guarded erased string indices (C1d)

- Local branch `next-scriptc/erased-specialization`, commit `1bba92c707186ea32b0cb40cf02d9b0fd2c75178`, from upstream `ee968de47ff4d4f0cb71186ede42f51cc72c79e5`. Not pushed.
- The existing numeric-key probe answers immutable in-range primitive string characters directly, with UTF-16 semantics and existing keyed fallback. No new object cache or compiler ownership transform.
- Four matched-LLVM alternating windows: erased reduction 38.4090 → 31.4085 ms (−18.2%); 4,096-row CSV 40.7580 → 38.5330 ms (−5.5%), still 5.49× Node. Typed control unchanged. Copy/generic summary regressions of 5.0%/8.0% remain visible and unexplained.
- 719 LLVM backend tests, six affected corpus programs through both harnesses, sanitized new corpus with RC audit, direct ASan/UBSan runtime checks with isolated RC audit, lint, formatting, preflight/order recheck, and baseline completeness pass. Full gates and other variants/platforms remain open.
- [Reproducer, profiles, soundness, excluded mixed-compiler experiment, exact commands, and results](compiler-erased-specialization.md).
