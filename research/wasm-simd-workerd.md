# WebAssembly SIMD in local workerd

2026-11-01. Local experiment on branch `t3/measure-wasm-simd-workerd`, based on `24195b48972bb091703b5b1e1295863ae5a69fa7`. No deployments, pushes, upstream issues, Docker changes, or edits to either scriptc checkout.

**NO-GO.** Enabling SIMD does not reach 2× lower CPU than JS at 20k int8 rows. The imul SIMD build uses 23.109 ms CPU per call versus 12.464 ms for JS, a JS/Wasm ratio of 0.539×. A fresh repeat gives 22.896 versus 10.956 ms, or 0.479×. Natural stock and patched forms also lose. Float32-input dot product is separately NO-GO at 26.171 versus 15.794 ms, or 0.603×. SIMD instructions appear in the linked modules, but the numeric reduction loops remain scalar.

## Question and build method

Does enabling WebAssembly SIMD give scriptc at least 2× lower CPU than plain JavaScript for resident int8 vector search at a Workers-feasible corpus size? Float32 dot products are a separate result. Revenue at 5k events is a control.

The IR route works without rebuilding the native LLVM helper. `--emit-ir` retains typed IR JSON, not textual LLVM IR. Library builds also leave `<entry>.lib.ll`, which Zig accepts directly. All external rebuilds consume that unmodified LLVM IR. The source factory in `/Users/noah/scriptc/native/llvm-codegen/src/target.cpp` passes `"generic", ""` to `createTargetMachine`. The source fragment and hash are retained in [provenance.json](wasm-simd-workerd/raw/provenance.json).

Four variants separate feature selection from optimization differences:

- `js`: the same TypeScript algorithm, bundled with esbuild for workerd, or executed through Node's TypeScript support.
- `stock`: scriptc 0.4.6 library reactor, the W1 build path with the default release profile.
- `scalar`: retained IR compiled with Zig `-O3 -mno-simd128`.
- `simd`: the identical IR compiled with Zig `-O3 -msimd128`.

Stock uses scriptc's helper and release optimization. External rebuilds use Zig's LLVM and O3. Therefore `simd` versus `scalar` isolates feature selection; `simd` versus `stock` also changes LLVM and optimization level. All variants link the exact stock `@scriptc/runtime-wasm32-wasi` 0.4.6 ABI-47 runtime objects selected by the compiler. A linker wrapper captures the stock recipe. The rebuild replaces only `program.o`, translates staged runtime paths back to the matching installed pack, and preserves the reactor model, exported ABI, system libraries, and stripping flag. No runtime object is rebuilt with SIMD.

The toolchain is Zig 0.16.0, scriptc 0.4.6, workerd 1.20261031.1, WABT 1.0.39, and esbuild 0.28.2. This run uses Node v26.13.0 and Zig Clang 21.1.0. Exact V8, hardware, OS, compiler, source, IR, runtime-manifest, and artifact identities are in the raw records. The host is an Apple M4 Pro with 24 GiB RAM and macOS 26.6.1.

## Kernels and correctness

Int8 uses W1's deterministic xorshift32 corpus, 768 dimensions, signed int8 values, wrapping int32 accumulation, and top-10 insertion. Both 20,000 and 100,000 rows are measured. Natural multiplication preserves W1's `(sum + corpus[base+j] * embedding[j]) | 0`. The imul version replaces only that product with `Math.imul(corpus[base+j], embedding[j])`. Corpus generation, query validation, insertion, and serialization remain the same. The query is the same fixed 768-element array as W1. Every request scans the full corpus; there is no result cache.

Float uses Float32Array corpus and query values scaled by 1/128, double-precision accumulation with ordinary JavaScript `+` and `*`, Float64Array top scores and IDs, and the same exhaustive top-10 search. These binary fractions give exact products and sums over the tested dimensions, so complete JSON can be checked byte for byte. This is a float32-input dot product, not a cosine kernel, normalized dataset, f32 accumulator, fast-math reduction, or SIMD intrinsic implementation. Strict floating addition order can itself prevent reduction vectorization. Float 100k is a diagnostic outside the hosted memory budget.

Revenue reuses the original fixture and algorithm, removes `async` in the staged copy for the synchronous library ABI, and returns all 248 daily rows with timings=null. Production application files are untouched.

The W1 bridge supplies the same compute-only WASI Preview 1 imports and owns the same allocation/copy/decode boundary. Wasm requests include strict host serialization, UTF-8 copying, facade JSON parsing, compute, result validation and serialization, decode and host JSON parsing. JS receives the same argument JSON and returns the same result JSON. CPU and external wall measurements include this boundary. Fixture generation is in discarded warmups. All measured and warmup results use SHA-256 over the complete result JSON. Node also checks against the workerd result hash. No timing or failed attempt is filtered.

## Measurement protocol

Each workerd case starts four fresh processes and separate isolates. The external Node client issues one request at a time. Thirty warmups per variant precede six batches of twenty requests per variant, giving 120 measured samples per variant and case. The first variant rotates every batch and every warmup pass. Four variants across six batches gives unequal first positions by at most one; all variants experience the same active machine window.

Wall time brackets external fetch through complete response drain, before hashing. CPU is the workerd process user+system delta from W1's macOS libproc sampler around each twenty-request batch, divided by twenty. CPU is process CPU, not Cloudflare billed CPU. Wall p50 and p95 are nearest-rank over all 120 requests. CPU means average the six batches. Batch CPU distributions, process memory observations, raw counter values, and load averages before and after each batch are retained.

Node uses the same warmup and sample counts, rotates twenty-call batches, and brackets JSON parsing through final encoding with `process.cpuUsage` and `performance.now`. Variants share a Node process, so GC and JIT attribution can cross variants. Node is a cross-check, not the source of the Workers decision.

Another agent may build on this machine. This experiment leaves unrelated processes running. Load averages are sampled in every workerd batch; elapsed times remain sensitive to scheduling, CPU placement, and DVFS. The initial read-only patched compiler attempt occurred during early warmup and failed on package resolution. Later compiler diagnostics run after the main measurement. The records preserve the observed environment rather than claiming an idle host.

## Workerd results

CPU is mean process milliseconds per call. Wall cells are p50 / p95 milliseconds. Smaller is better.

| Kernel | Rows | Variant | CPU ms/call | Wall p50 / p95 ms | Linear MiB |
| --- | ---: | --- | ---: | ---: | ---: |
| natural | 20,000 | js | 10.686 | 10.999 / 12.228 | 0.00 |
| natural | 20,000 | stock | 112.748 | 112.971 / 115.171 | 33.19 |
| natural | 20,000 | scalar | 112.700 | 113.154 / 115.387 | 33.19 |
| natural | 20,000 | simd | 113.114 | 113.764 / 115.880 | 33.19 |
| natural | 100,000 | js | 52.964 | 52.951 / 55.919 | 0.00 |
| natural | 100,000 | stock | 559.252 | 558.565 / 569.937 | 145.19 |
| natural | 100,000 | scalar | 558.367 | 557.979 / 567.345 | 145.19 |
| natural | 100,000 | simd | 560.332 | 560.120 / 571.929 | 145.19 |
| imul | 20,000 | js | 12.464 | 12.435 / 15.084 | 0.00 |
| imul | 20,000 | stock | 22.957 | 22.407 / 26.678 | 33.19 |
| imul | 20,000 | scalar | 23.249 | 22.578 / 28.033 | 33.19 |
| imul | 20,000 | simd | 23.109 | 22.468 / 26.311 | 33.19 |
| imul | 100,000 | js | 63.422 | 62.510 / 73.904 | 0.00 |
| imul | 100,000 | stock | 112.366 | 111.144 / 122.977 | 145.19 |
| imul | 100,000 | scalar | 112.152 | 109.451 / 127.968 | 145.19 |
| imul | 100,000 | simd | 112.385 | 109.616 / 127.515 | 145.19 |
| float | 20,000 | js | 15.794 | 16.138 / 16.877 | 0.00 |
| float | 20,000 | stock | 26.020 | 26.043 / 27.943 | 81.19 |
| float | 20,000 | scalar | 25.958 | 25.756 / 27.512 | 81.19 |
| float | 20,000 | simd | 26.171 | 26.306 / 27.962 | 81.19 |
| float | 100,000 | js | 78.576 | 77.977 / 80.192 | 0.00 |
| float | 100,000 | stock | 127.473 | 126.545 / 135.332 | 529.19 |
| float | 100,000 | scalar | 126.978 | 126.078 / 133.629 | 529.19 |
| float | 100,000 | simd | 127.367 | 125.665 / 136.918 | 529.19 |
| revenue | 5,000 | js | 1.551 | 1.749 / 2.296 | 0.00 |
| revenue | 5,000 | stock | 2.669 | 2.755 / 3.449 | 21.50 |
| revenue | 5,000 | scalar | 2.683 | 2.795 / 3.505 | 21.50 |
| revenue | 5,000 | simd | 2.686 | 2.801 / 3.517 | 21.50 |
| patched | 20,000 | js | 10.599 | 10.761 / 12.557 | 0.00 |
| patched | 20,000 | scalar | 27.718 | 27.714 / 29.236 | 33.19 |
| patched | 20,000 | simd | 27.707 | 27.606 / 29.525 | 33.19 |
| patched | 100,000 | js | 52.403 | 52.194 / 56.136 | 0.00 |
| patched | 100,000 | scalar | 135.220 | 135.060 / 139.554 | 145.19 |
| patched | 100,000 | simd | 135.512 | 135.365 / 140.154 | 145.19 |

JS linear MiB=0 means no Wasm memory; it is not a JS heap measurement. Wasm memory is post-run capacity, not total isolate peak. All int8 20k variants use 33.19 MiB, and float 20k uses 81.19 MiB. Both leave room for host allocations under 128 MB, but local success does not certify a hosted memory quota. Int8 100k uses 145.19 MiB; float 100k uses 529.19 MiB. Both exceed that budget in linear memory alone. Revenue uses 21.50 MiB. Initial memory is 266 pages, 16.625 MiB.

## SIMD instruction and size audit

| Module | Raw bytes | Gzip bytes | SIMD instructions |
| --- | ---: | ---: | ---: |
| natural-stock | 494,397 | 178,345 | 0 |
| natural-scalar | 492,935 | 177,951 | 0 |
| natural-simd | 494,193 | 178,409 | 110 |
| imul-stock | 494,280 | 178,254 | 0 |
| imul-scalar | 492,818 | 177,868 | 0 |
| imul-simd | 494,076 | 178,338 | 110 |
| float-stock | 494,028 | 178,102 | 0 |
| float-scalar | 492,568 | 177,724 | 0 |
| float-simd | 493,826 | 178,188 | 110 |
| revenue-stock | 564,549 | 200,052 | 0 |
| revenue-scalar | 562,184 | 199,546 | 0 |
| revenue-simd | 563,415 | 200,032 | 122 |
| patched-scalar | 492,831 | 177,906 | 0 |
| patched-simd | 494,089 | 178,363 | 110 |

Counts include all `v128` and lane-vector instructions, not just opcodes spelled `v128.*`. WABT disassembles every artifact. Gzip uses Node zlib defaults. All measured scalar and stock artifacts contain zero. The SIMD numeric modules contain 110, but **all 110 are in Zig/WASI libc functions**, including `mem.findScalarPos`, `vfprintf`, `printf_core`, `pop_arg`, `__floatscan`, `scalbnl`, and `compiler_rt.fmod.fmodl`. Linking with SIMD selects SIMD-capable Zig library code even though the scriptc runtime object files remain unchanged.

The compiler-generated numeric IR has **zero vector-typed functions** after O3 optimization with SIMD enabled. Thus this experiment enables SIMD successfully but does not vectorize the dot-product loops. Revenue adds twelve SIMD instructions in generated functions, chiefly vector stores. Named function counts and LLVM vectorization remarks are in [diagnostics.json](wasm-simd-workerd/raw/diagnostics.json). Remarks mention uncountable loops, unidentified induction variables, control flow, and calls. They lack source locations, so they do not identify one unique cause in the reduction. Do not attribute the remaining loss to one barrier without a smaller compiler regression test.

The patched CLI emits IR but fails its normal runtime-pack resolution, including after a worktree-local CommonJS resolver attempt. Its retained IR compiles and links against the stock natural-build recipe. These `patched-scalar` and `patched-simd` variants use the same stock runtime and have no patched-helper baseline. They are an optional cross-version diagnostic, not a patch-only causal comparison. They preserve full-result parity. The shared fork and its native helper are never changed or rebuilt.

## Repeat and contention

The main plus patched windows span one-minute load averages 3.76–6.07. The fresh imul window spans 5.94–6.84. No main batch showed a sudden load rise outside that observed range. The additional window repeats both corpus sizes in fresh processes anyway. All original and repeat samples are retained.

| Imul rows | JS CPU | Stock CPU | Scalar CPU | SIMD CPU |
| --- | ---: | ---: | ---: | ---: |
| 20000 | 10.956 | 23.113 | 22.813 | 22.896 |
| 100000 | 61.676 | 111.382 | 113.182 | 112.744 |

These values are milliseconds per call. The repeat confirms the loss and the absence of a material SIMD benefit. JS varies more between windows than the scalar/SIMD difference. There is no basis here for a claim of N× less Workers CPU. A wasm target-feature flag would expose useful capability, but numeric gains need further work on codegen, bounds/control flow, and reduction legality. This result does not measure handwritten Wasm intrinsics or a rewritten unchecked kernel.

## Node cross-check

Node v26.13.0, V8 14.6.202.34-node.40. CPU is process milliseconds per call; wall is p50 / p95 milliseconds.

| Kernel | Rows | Variant | CPU ms/call | Wall p50 / p95 ms |
| --- | ---: | --- | ---: | ---: |
| natural | 20,000 | js | 9.827 | 9.583 / 11.029 |
| natural | 20,000 | stock | 111.660 | 111.690 / 116.227 |
| natural | 20,000 | scalar | 111.653 | 111.437 / 112.898 |
| natural | 20,000 | simd | 111.616 | 111.526 / 113.015 |
| natural | 100,000 | js | 50.222 | 48.769 / 62.240 |
| natural | 100,000 | stock | 556.567 | 557.086 / 568.532 |
| natural | 100,000 | scalar | 556.792 | 558.257 / 571.970 |
| natural | 100,000 | simd | 557.200 | 558.043 / 579.914 |
| imul | 20,000 | js | 9.767 | 9.617 / 10.865 |
| imul | 20,000 | stock | 16.515 | 16.287 / 16.741 |
| imul | 20,000 | scalar | 16.464 | 16.223 / 16.660 |
| imul | 20,000 | simd | 16.477 | 16.169 / 16.771 |
| imul | 100,000 | js | 49.411 | 49.089 / 54.038 |
| imul | 100,000 | stock | 80.467 | 80.594 / 83.197 |
| imul | 100,000 | scalar | 80.201 | 80.141 / 82.007 |
| imul | 100,000 | simd | 80.200 | 80.043 / 82.003 |
| float | 20,000 | js | 15.809 | 15.771 / 16.197 |
| float | 20,000 | stock | 21.199 | 20.849 / 21.442 |
| float | 20,000 | scalar | 21.225 | 20.907 / 21.651 |
| float | 20,000 | simd | 21.146 | 20.936 / 21.401 |
| float | 100,000 | js | 79.227 | 78.354 / 80.570 |
| float | 100,000 | stock | 103.762 | 102.889 / 105.388 |
| float | 100,000 | scalar | 103.700 | 102.855 / 104.575 |
| float | 100,000 | simd | 103.806 | 102.969 / 106.587 |
| revenue | 5,000 | js | 1.600 | 1.482 / 1.724 |
| revenue | 5,000 | stock | 2.227 | 2.073 / 2.281 |
| revenue | 5,000 | scalar | 2.189 | 2.074 / 2.257 |
| revenue | 5,000 | simd | 2.173 | 2.054 / 2.271 |

Node confirms the absence of a SIMD CPU benefit in these numeric loops. Absolute JS/Wasm ratios differ from workerd. These process-wide Node counters are a cross-check, not a substitute for the separate workerd process measurements.

The patched IR cross-check uses the same three variants as its workerd run.

| Rows | Variant | CPU ms/call | Wall p50 / p95 ms |
| ---: | --- | ---: | ---: |
| 20,000 | js | 9.997 | 9.888 / 10.883 |
| 20,000 | scalar | 21.488 | 21.333 / 21.658 |
| 20,000 | simd | 21.339 | 21.195 / 21.689 |
| 100,000 | js | 49.328 | 48.145 / 54.717 |
| 100,000 | scalar | 103.962 | 103.696 / 106.634 |
| 100,000 | simd | 104.181 | 104.139 / 107.081 |

All **11,400** responses across **20 case windows** pass SHA-256 verification, including warmups. There are no failed application responses, filtered samples, or retries. The compiler resolution failures, initial float generation failure, and incorrect-query assertion are retained separately. The W1 result is byte-identical at int8 100k after removing the result-file newline.

The scripts and all raw data are in [wasm-simd-workerd](wasm-simd-workerd/). The [upstream issue draft](wasm-simd-upstream-draft.md) is not filed.

## Reproduce locally

Use the W1 dependency lock, Zig on PATH, a stock scriptc 0.4.6 executable, and Python 3 on macOS. The scripts expect the repository root as the working directory. `SCRIPTC` can override the stock compiler path in `build.mjs`.

```sh
mkdir -p .checks/wasm-workerd
cp research/wasm-workerd/scratch-package.json .checks/wasm-workerd/package.json
cp research/wasm-workerd/scratch-package-lock.json .checks/wasm-workerd/package-lock.json
npm ci --prefix .checks/wasm-workerd --no-audit --no-fund
node research/wasm-simd-workerd/setup.mjs
node research/wasm-simd-workerd/build.mjs
node research/wasm-simd-workerd/prepare.mjs
node research/wasm-simd-workerd/audit.mjs
node research/wasm-simd-workerd/provenance.mjs
node research/wasm-simd-workerd/measure.mjs
MODE=node node research/wasm-simd-workerd/measure.mjs
node research/wasm-simd-workerd/summarize.mjs
node research/wasm-simd-workerd/verify.mjs
```

Run measurement commands sequentially. They bind only 127.0.0.1 on ports 19020–19023 and terminate their own workerd children. `KIND` restricts cases. `SUFFIX` preserves an additional raw window. Main raw filenames are overwritten on deliberate reproduction, so preserve the committed run first. The scripts hardcode 30 warmups and 120 measured calls per variant.

The core external compile command is:

```sh
zig cc --target=wasm32-wasi -O3 -msimd128 -c \
  .checks/wasm-workerd/imul-entry.lib.ll -o .checks/wasm-workerd/imul.o
```

The following link uses `zig cc -msimd128 -target wasm32-wasi -mexec-model=reactor -Wl,--strip-debug`, exports `bench_init`, `scriptc_alloc`, `scriptc_free`, `bench_collect`, and `bench_run`, the compiled object, the runtime objects, and `-lwasi-emulated-signal -lwasi-emulated-process-clocks`. Every exact argv and exit status is retained in [logs](wasm-simd-workerd/logs/). The build script is the portable recipe for runtime path translation.

A verification assertion initially used the production Vercel query hash rather than W1's query hash. The assertion was corrected to W1's complete-result hash, `d380a052417aab5481ca6934dc66beeb1bcdfa6603497c48a080834ded1babbe`, which all 100k int8 variants match. The diagnostic is retained. No measurement changed.

The first float build failed a generated TypeScript type check because only one Int32Array spelling had been replaced. The corrected generator replaces all those spellings. Its original diagnostic is retained. The first patched compiler attempt failed to resolve the WASI pack. Neither failure is a timing sample. Generated Wasm, IR, downloaded dependencies, and private caches are excluded from git and removed from this worktree after verification. No files outside this worktree are deleted.

The optional patched experiment uses the already-built CLI read-only. Its normal library link fails, so the build script uses the retained IR with the stock natural reactor's runtime recipe:

```sh
KINDS=patched SCRIPTC="$PWD/research/wasm-simd-workerd/patched-cli.sh" \
  node research/wasm-simd-workerd/build.mjs
KINDS=patched VARIANTS=js,scalar,simd SUFFIX=-patched \
  node research/wasm-simd-workerd/prepare.mjs
KINDS=patched SUFFIX=-patched node research/wasm-simd-workerd/diagnose.mjs
KINDS=patched VARIANTS=js,scalar,simd SUFFIX=-patched \
  node research/wasm-simd-workerd/measure.mjs
MODE=node KINDS=patched VARIANTS=js,scalar,simd SUFFIX=-patched \
  REFERENCE=workerd-patched.json node research/wasm-simd-workerd/measure.mjs
KIND=imul SUFFIX=-repeat node research/wasm-simd-workerd/measure.mjs
```

Run `diagnose.mjs` after timing or before starting timing, never during a measurement. It relinks an unstripped diagnostic copy to recover function names and compiles optimized IR with vectorization remarks. Diagnostic copies are not timed artifacts. Run `summarize.mjs` and `verify.mjs` after all main, repeat, and patched measurements.
