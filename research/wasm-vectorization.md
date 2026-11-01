# Counted loops in scriptc WebAssembly libraries

2026-11-01. Local research on `t3/research-wasm-vectorization`. No timing benchmarks, deployments, Docker operations, pushes, or upstream filings ran.

Gate 1 passes. S1 has a concrete TypeScript-backend barrier: a module-global loop limit does not enter counted-loop analysis in a library. A scoped fix now vectorizes the S1-shaped integer reduction on wasm SIMD, arm64, and AVX2. Strict floating-point reduction remains a separate legality limit. This is codegen and correctness evidence, with performance still pending.

## Repros distinguish three causes

[repro.ts](wasm-vectorization/repro.ts) contains the four requested forms. [analyze.py](wasm-vectorization/analyze.py) generates isolated versions with a scalar library facade, so optimizer remarks belong to one kernel. It allocates the arrays in the facade because the library bytes ABI does not accept arbitrary signed typed-array parameters. [isolated.json](wasm-vectorization/isolated.json) records compile status, exact remarks, and functions containing vector IR. The `offset` control adds `base+i` and a literal 768 bound. [nested.json](wasm-vectorization/nested.json) adds a row loop and a literal bound.

The stock compiler is the installed next-scriptc dependency, scriptc 0.4.6. The earlier int8 compiler is the existing, read-only fork CLI at `d4900748300e27fbdd3278ba8649230c03e1b95d`. Its WASI invocation retains fresh IR but fails runtime-pack resolution with SC3003, as in S1. Native library builds succeed. These patched wasm results are IR diagnostics, not successful patched-helper builds. Fresh `.lib.ll` files are required before optimization, so a failed compilation cannot silently reuse an earlier file.

The direct `i < a.length` controls give these results under O3:

| Kernel | wasm32, +simd128 | arm64, apple-m4 | x86-64 Linux IR, haswell |
| --- | --- | --- | --- |
| Stock int8 `Math.imul` | Fast loop vectorizes, width 4 | Width 16, interleave 4 | Width 8, interleave 4 |
| Stock natural int8 wrapping sum | No reduction recognized | Same | Same |
| Natural int8 with earlier range patch | Fast loop width 4 | Width 16, interleave 4 | Width 8, interleave 4 |
| Float32 inputs, double accumulator | Strict FP prevents fast-loop vectorization | Ordered reduction vectorizes, width 4 | Strict FP prevents fast-loop vectorization |
| Int32 wrapping sum | Width 4 | Width 4, interleave 4 | Width 8, interleave 4 |

A vectorized fast path does not imply every fallback vectorizes. Remaining remarks include cost-model rejection and `value that could not be identified as reduction is used outside the loop`. Bounds failures can reset a wrapping sum to zero, making that path a conditional recurrence rather than an ordinary modular reduction. The float out-of-bounds path returns NaN and also has reduction-recognition failures. Preserve those paths.

For stock natural multiplication, the compiler retains Number multiplication/addition and coercion control flow. The earlier wrapping-range patch exposes the modular `mul i32` and `add i32` path while preserving invalid-read behavior. That is an existing fix, not the new loop-limit change.

For float, LLVM reports `cannot prove it is safe to reorder floating-point operations`. Float32Array loads extend to double; the accumulator's `fadd double` has no reassociation permission. A wasm f64 lane reduction that changes addition order would change JavaScript semantics. The arm64 result shows that vector IR can still represent an ordered reduction; it does not justify fast-math on wasm or x86. This patch adds no fast-math flags and does not claim to solve the float reduction.

## The S1-specific barrier is a module-global limit

The literal-bound offset and nested controls already vectorize. Reintroducing S1's module-level `const dimensions = 768` reproduces the missing integer induction. [global-limit.ts](wasm-vectorization/global-limit.ts) is the small source form. The full diagnostic uses the original S1 vector source with its generator, validation, insertion, and serialization; only the product changes to `Math.imul` and a scalar facade supplies the input query.

`packages/compiler/src/ir/constant-globals.ts` explicitly skips `mod.lib`. Library globals remain runtime state rather than initializer literals. `emit-function.ts` builds `numericLocals` from the function's locals, while `stableLoopValue` in `ir/integer-loops.ts` requires the loop limit's binding in that map. The module global is absent, so counted-loop matching fails even for an immutable numeric limit. This affects native libraries too. Executable builds can fold module constants, explaining why the earlier native route differed from W1/S1 libraries.

The optimized stock S1-shaped inner loop contains:

```llvm
%sc_l_j_1.0180.i.i = phi double [ 0.000000e+00, %loop.b64.lr.ph.i.i ], [ %t226.i.i, %bytes.read.done72.i.i ]
%t172.i.i = fadd double %t161.i.i, %sc_l_j_1.0180.i.i
%t178.i.i = fptosi double %t172.i.i to i64
%t179.i.i = freeze i64 %t178.i.i
%t180.i.i = sitofp i64 %t179.i.i to double
%t181.i.i = fcmp oeq double %t172.i.i, %t180.i.i
```

The cursor updates with `fadd double ..., 1.0` and compares to a loaded global double. LLVM reports `integer loop induction variable could not be identified` and `Cannot vectorize uncountable loop`. Each typed-array access also has a validity/bounds branch and a zero-valued invalid arm. Data pointers load on the valid paths. There are no per-element refcount operations or runtime calls in this imul reduction: the source `Math.imul` becomes an integer multiply. Other full-program remarks about calls, early exits, and control flow come from additional loops, including validation and insertion, and must not all be attributed to this reduction.

Full [IR excerpts](wasm-vectorization/ir-excerpts.txt), [stock remarks](wasm-vectorization/full-remarks.log), and [tool/IR hashes](wasm-vectorization/provenance.json) are retained. Remarks have `<unknown>:0:0`; the release `.lib.ll` has no debug locations. Debug-mode lowering disables relevant loop optimizations, so enabling it would change the experiment. Isolated source functions and exact IR labels supply attribution without claiming source locations that LLVM did not emit.

The earlier Vercel result was actual SIMD. The retained [vector assembly audit](vector-vercel/vector-assembly.json) identifies YMM widening, signed pair multiplication, and accumulation in both dispatched v3 search copies. Baseline copies lack AVX. That supports actual vector code in that executable route, not a claim that every native library loop vectorizes.

## Gate 1: proceed with a scoped backend fix

The cause is fixable in `packages/compiler/src/backend/llvm/`, without rebuilding the helper or weakening JavaScript arithmetic. The new branch was created in `/Users/noah/code/scriptc-wt/wasm-counted-globals` after fetching upstream. Base: `a07d5a791`. The existing int8 patch was cherry-picked as dependency `0cc542ceb`. The new change is `b46987ce934ae7cda1ae3aea1969491d1d14537d` on `next-scriptc/wasm-counted-globals`. Both commits are local; nothing was pushed.

`counted-global-limits.ts` supplies immutable numeric globals to counted-loop matching only for a deliberately narrow arithmetic body. It accepts numeric operations, typed-array reads and length, and `math.imul`. It rejects bodies containing ordinary calls or other expressions that could invoke user code and reenter library initialization. Mutable globals, TDZ globals, and initialization-flag globals remain excluded. The existing matcher still rejects writes to the limit.

The global's current value remains a runtime load. Existing counted-loop guards and floor/ceiling endpoint rules preserve fractional, NaN, negative, and large bounds, including pre-initialization values. Bounds/version guards select a fast loop only when valid; scalar fallback and tails remain. This does not fold library globals to source literals or introduce unchecked reads.

The fixed S1-shaped wasm loop contains:

```llvm
%index = phi i64 [ %index.next, %vector.body ], [ 0, %loop.b99.lr.ph.i.i ]
%vec.phi = phi <4 x i32> [ %21, %vector.body ], [ zeroinitializer, %loop.b99.lr.ph.i.i ]
%wide.load = load <4 x i8>, ptr %16, align 1, !tbaa !14
%17 = sext <4 x i8> %wide.load to <4 x i32>
%wide.load48 = load <4 x i8>, ptr %18, align 1, !tbaa !14
%19 = sext <4 x i8> %wide.load48 to <4 x i32>
%20 = mul nsw <4 x i32> %19, %17
%21 = add <4 x i32> %20, %vec.phi
```

LLVM then emits `llvm.vector.reduce.add.v4i32`. Data pointer loads move before the fast loop. Zig 0.16.0 / Clang 21 reports width 4, interleave 1. Native host-layout IR optimized with LLVM 23.1.4 reports arm64 width 16 / interleave 4 and haswell width 8 / interleave 4. The Linux comparison consumes native LP64 IR; it does not retarget wasm32 object layouts to x86.

A same-version causal check temporarily disabled only the two new matcher integrations in this agent's worktree, emitted the same full source, and restored the file in `finally`. The upstream-plus-int8 control has zero vector PHIs; restoring the fix produces the vector reduction above. [Control remarks](wasm-vectorization/same-base-remarks.log) preserve the result. This separates the loop fix from unrelated differences between stock 0.4.6 and current upstream.

## Gate 2: focused validation passes; full gate remains pending

- Four focused backend files pass, 26 tests: the new global-limit tests, counted limits, byte-loop versions, and wrapping sums. [Log](wasm-vectorization/focused-final.log).
- The new corpus passes both differential harnesses, release and dev. It also passes both with ASan and RC audit. Tests compare Node/native stdout, stderr, and exit status. Fractional, negative, NaN bounds, short arrays, and signed-byte products are included. [Final case records](wasm-vectorization/corpus-final.json).
- The single new TS7 preflight/order baseline was generated through `checkPreflightTs7`, with no diagnostics and one source module. Baseline completeness passes. The full TS7 sweep was not run.
- Compiler `tsc --noEmit --incremental false` passes. Focused oxlint and oxfmt checks pass for all three owned backend files.
- The prepared measurement matrix passes 15 non-timed Wasm checks against JavaScript, with complete-result SHA-256 verification. These cover five kernels across three wasm variants. Search uses 20 rows for this correctness check; the 20k timing case remains pending. [Checks](wasm-vectorization/pending/raw/correctness.json), [artifact hashes](wasm-vectorization/pending/raw/artifacts.json).

The first corpus attempt failed because Node's experimental TypeScript warning differed on stderr. The retry uses `NODE_NO_WARNINGS=1` and LLVM on PATH. The original failure is retained in [corpus.log.gz](wasm-vectorization/corpus.log.gz). An initial empty-body unit fixture was rejected by the matcher's profitability check; the corrected test contains a counter-using imul. Early profile attempts omitted `abi`, used the unsupported `number` ABI spelling, and lacked the WASI pack. A bytes-parameter isolation attempt failed type checking; exploratory results that reused stale IR were discarded, and the final runner deletes old IR before compilation. An initial cross-layout retarget was also discarded. None of those attempts supplies a result in the table.

No full suites ran. The full scriptc gate belongs to the other agent and remains a prerequisite for shipping. This local commit is a focused-test candidate, not an upstream-ready patch. Strict float wasm reduction remains scalar. No CPU improvement is claimed.

## Step 3: target feature draft only

[The upstream draft](wasm-simd-upstream-draft.md) now includes the CLI/helper propagation sketch. An opt-in `--wasm-simd` would carry a boolean into target construction and select `+simd128` for wasm32, including optimization and code generation and all cache identities. This work did not modify or rebuild C++. All wasm SIMD evaluation consumed retained IR through Zig with `-msimd128 -O3` and the unchanged stock ABI-47 runtime objects.

## Pending measurement

[measurement.mjs](wasm-vectorization/measurement.mjs) prepares and verifies the matrix and reuses S1's workerd measurement engine, WASI bridge, CPU sampler, rotating batches, 30 warmups, and 120 measured requests per variant. It runs imul, natural int8, Float32-input dot, Int32 sum, and S1 imul search at 20k rows. Variants are JS, stock scalar wasm, fixed-loop scalar wasm, and fixed-loop SIMD wasm. Repro kernels repeat a 768-element reduction 20k times per request. Search scans the original 20k-by-768 corpus. Every response is hashed; errors remain failures.

`prepare` and `verify` ran successfully without timing. The final generated engine's syntax was checked. The later command, intentionally not executed as a timing round, is:

```sh
node research/wasm-vectorization/measurement.mjs prepare && node research/wasm-vectorization/measurement.mjs verify && node research/wasm-vectorization/measurement.mjs measure
```

Run from this next-scriptc worktree with Node 26, Zig 0.16.0, npm, and the retained fork worktree and its dependency links. `SCRIPTC` overrides the stock executable; `SCRIPTC_FIXED_SOURCE` overrides the fixed source checkout. Preparation downloads the pinned stock WASI pack, workerd, esbuild, and WABT into an isolated scratch directory. It checks the 6 GiB disk floor before work and after installation. Results go to `research/wasm-vectorization/pending/`. Archive that directory before a later round if preserving today's non-timed provenance.

Stock-versus-fixed performance also includes compiler-version and int8-patch differences. Fixed scalar versus fixed SIMD isolates target feature selection. The same-version IR toggle above establishes the loop-shape cause; the four-variant timing matrix alone cannot isolate its CPU contribution from every other compiler change. No hosted claim follows from local workerd timings.

Generated IR, wasm, native libraries, task-local caches, and downloaded dependencies from this next-scriptc task were removed after recording small excerpts and hashes. The fork source worktree and local commits remain. Free space stayed above 6 GiB; observations ranged from about 12 to 15 GiB during the work. No other agent's files or running services were changed.
