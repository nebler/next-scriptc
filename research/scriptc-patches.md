# scriptc patch ledger

Every change we make to scriptc is listed here. Each change lives on its own branch in the fork and is intended to become one upstream PR.

- Fork: https://github.com/nebler/scriptc (`origin`). Upstream: https://github.com/vercel-labs/scriptc (`upstream`).
- Local clone: `/Users/noah/code/scriptc-fork`.
- Update routine for each patch branch: `git fetch upstream main && git rebase upstream/main`, rerun the patch's focused tests, then update "Last rebased" below.
- Commit and PR prose follows scriptc's `technical-writer` skill (required by their CONTRIBUTING for AI-written text).
- Upstream filing happens only with the maintainer's (Noah's) explicit go.

| Patch | Branch | Status | Last rebased onto upstream |
| --- | --- | --- | --- |
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
| Loop shape that blocks vectorization in wasm32 | LLVM remarks: uncountable loops, unidentified induction variables, calls in loop ([wasm-simd-workerd.md](wasm-simd-workerd.md)) | Needs a minimal repro loop first |
| `Map`/`Set` allocation and record copying cost | R1's analysis of real app targets ([real-app-targets.md](real-app-targets.md)) | Prioritize if Hill 2 (Papermark) hits it |
| `JSON.stringify` on erased values | O1: 1.30 → 0.36 ms with a typed encoder ([function-level.md](function-level.md)) | Issue first |
