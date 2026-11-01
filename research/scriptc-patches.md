# scriptc patch ledger

Every change we make to scriptc is listed here. Each change lives on its own branch in the fork and is intended to become one upstream PR.

- Fork: https://github.com/nebler/scriptc (`origin`). Upstream: https://github.com/vercel-labs/scriptc (`upstream`).
- Local clone: `/Users/noah/code/scriptc-fork`.
- Update routine for each patch branch: `git fetch upstream main && git rebase upstream/main`, rerun the patch's focused tests, then update "Last rebased" below.
- Commit and PR prose follows scriptc's `technical-writer` skill (required by their CONTRIBUTING for AI-written text).
- Upstream filing happens only with the maintainer's (Noah's) explicit go.

| Patch | Branch | Status | Last rebased onto upstream |
| --- | --- | --- | --- |
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
