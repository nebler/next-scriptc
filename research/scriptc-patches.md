# scriptc patch ledger

Every change we make to scriptc is listed here. Each change lives on its own branch in the fork and is intended to become one upstream PR.

- Fork: https://github.com/nebler/scriptc (`origin`). Upstream: https://github.com/vercel-labs/scriptc (`upstream`).
- Local clone: `/Users/noah/code/scriptc-fork`.
- Update routine for each patch branch: `git fetch upstream main && git rebase upstream/main`, rerun the patch's focused tests, then update "Last rebased" below.
- Commit and PR prose follows scriptc's `technical-writer` skill (required by their CONTRIBUTING for AI-written text).
- Upstream filing happens only with the maintainer's (Noah's) explicit go.

| Patch | Branch | Status | Last rebased onto upstream |
| --- | --- | --- | --- |
| Closed-record certificate investigation | `next-scriptc/closed-records` | local diagnosis only; stopped on metadata loss, no facility or adapter change | 2026-11-01, `f606a3bd8` |
| Cached record prototype reflection | `next-scriptc/result-reflection` | **local, not pushed**; experimental, focused parity only | 2026-11-01, `a07d5a791` |
| Immutable global limits in arithmetic loops | `next-scriptc/wasm-counted-globals` | local, not pushed; focused checks pass, full gate pending; **stacked on the int8 branch** (upstream it needs the int8 PR first or a rebase onto plain upstream) | 2026-11-01, `a07d5a791` |
| int8 product ranges in wrapping sums | `next-scriptc/int8-range-analysis` | Committed and pushed to the fork. **PR on hold.** | 2026-11-01, `0a7dd5650` (clean) |

## int8 product ranges in wrapping sums

- **Branch:** [`next-scriptc/int8-range-analysis`](https://github.com/nebler/scriptc/tree/next-scriptc/int8-range-analysis), commit `d49007483`.
- **Change:** `wrappingRange` in `packages/compiler/src/backend/llvm/wrapping-sums.ts` derives integer ranges through nested exact `+`, `-` and `*`. A natural `(sum + a[i] * b[i]) | 0` over `Int8Array` therefore takes the same int32 path as the `Math.imul` form. Production change: +25 / −2 lines.
- **Tests added:** `wrapping-sums.test.ts` (backend), corpus program `tests/corpus/signed-products-wrapping-sums.ts` with its order-parity baseline and corpus-cost entry.
- **Evidence:** Vercel vector route, server compute p50 409 → 10.0 ms ([vector-vercel.md](vector-vercel.md)). Linux causal measurement 403.7 → 23.4 ms ([scriptc-int8-range-analysis.md](scriptc-int8-range-analysis.md)). In WebAssembly, 113 → 28 ms in workerd at 20k rows ([wasm-simd-workerd.md](wasm-simd-workerd.md)).
- **Validation:**
  - Before the rebase: partial local validation, plain lane only ([scriptc-int8-range-analysis.md](scriptc-int8-range-analysis.md)).
  - Not yet re-run after the 2026-11-01 rebase.
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
