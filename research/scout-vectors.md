# Vector-search scouting: exact int8 dot products are the strongest candidate

2026-10-31; scriptc **0.4.6**; no compiler patches, deployments, push or merge.

**Recommendation:** pick dense, symmetric int8 embedding retrieval for compiler
hill-climbing. The shared TypeScript expression
`sum = (sum + Math.imul(data[base + j], query[j])) | 0` already beats both Node
and idiomatic plain-loop Go on the M4 Pro and in a Linux Sandbox. At 100k×768,
release takes **2.041 ms on Mac** and **23.879 ms on Linux**. Linux's same-VM
Node and Go medians are **132.500 / 61.400 ms**: **5.55× / 2.57×** speedups.
LLVM auto-vectorizes the integer reduction; Go's ordinary compiler keeps this
plain loop scalar. No assembly, SIMD package, FFI, native-only kernel or
semantics-changing arithmetic is used.

There is also an unusually concrete upstream opportunity: replacing `Math.imul`
with ordinary `*` in that same `|0` reduction makes scriptc about **200× slower
on Mac**. Its emitted code retains floating arithmetic and full ToInt32
coercion. The `Math.imul` control demonstrates what existing LLVM optimization
can achieve once the frontend preserves the integer reduction. The compiler
source suggests a signed-zero range-analysis gap; no patched-compiler proof
was attempted in this scout.

Float search wins on Mac but only ties Go on Linux. Binary search loses to
Go's popcount intrinsic. Those are useful controls, not the recommended winner.

## Workload and equivalence

- Row-major, resident corpus; one dense query; exhaustive dot product against
  every row; exact top-10 insertion selection, descending score with smaller
  IDs winning ties. No ANN pruning or sort of all N scores.
- Cases: **20,000×384** and **100,000×768**. The large corpus occupies 307.2 MB
  as float32, 76.8 MB as int8, or 9.6 MB as packed signs (decimal MB).
- `float`: Float32Array loads, JS Number/float64 products and accumulation.
  This is dot-product retrieval, not a cosine normalization benchmark. Embedding
  normalization, generation, corpus load and quantization are outside timing.
- `int8`: signed int8 inputs, `sum += a*b`; `int8-i32`: `(sum+a*b)|0`;
  `int8-imul`: `(sum+Math.imul(a,b))|0`. All three return **exactly the same
  scores and IDs**. Go uses the same int32 plain-loop implementation for all
  three labels. Even the full int8 bound is only
  `768 * 128 * 128 = 12,582,912`, so no accumulator overflows and Number sums
  remain exact. Under the proven in-bounds inputs, `Math.imul` changes no
  observable result: `|0` already discards a product's possible negative zero.
- `binary`: pack each dimension's positive sign into Uint32Array; XOR plus
  SWAR popcount; score is negative Hamming distance. Go reports both the same
  SWAR arithmetic and the idiomatic `math/bits.OnesCount32` intrinsic.
- Xorshift32 seed `0x12345678`; samples are `(uint32 % 255)-127`. Float values
  are those samples divided by 127 and rounded into float32; int8 uses the
  samples directly, binary uses their signs. This exercises mixed signs,
  zeroes and high uint32 bits. It is synthetic dense data, not a recall study
  or a real trained model's embedding distribution.
- Every runtime processes identical data for each representation. Every
  timed result is checked against that process's full top-10 output. The
  controller compares IDs **and all scores exactly** across runtimes; the
  summary also checks ordering, uniqueness and agreement of all int8 forms.
  **210 cross-runtime ID/score comparisons passed.** Float and int8 top IDs
  also happen to agree for these fixtures. Binary top IDs differ from float,
  as an approximate encoding should; there is no claim that quantization
  preserves arbitrary float rankings.

The formats are real retrieval techniques: Qdrant documents int8 scalar
quantization and binary Hamming search; Hugging Face's embedding-quantization
example uses USearch for int8 and Faiss for binary. These harnesses measure the
scoring primitive, not those libraries or their ANN indexes.
[Qdrant documentation](https://qdrant.tech/documentation/manage-data/quantization/),
[Hugging Face example](https://huggingface.co/blog/embedding-quantization).

## Measurement method

Mac: Apple M4 Pro, macOS arm64; Node **24.22.0** at the requested fnm path;
Go **1.27.3** at `/opt/homebrew/bin/go`; installed scriptc **0.4.6**.
`pnpm install --frozen-lockfile`, checker disabled, release and speed built
sequentially. The installed checker executables needed `chmod +x` after pnpm
installation. No compiler source was changed.

Two fresh processes per runtime/case, **15 warmups + 30 timed searches each**.
The two orders are Node/release/speed/Go and Go/speed/release/Node; Go SWAR
binary is additionally run once per round. The final sweep ran after code
inspection/builds, with no competing local benchmark processes. This shared
Mac has no CPU affinity or isolation; load averages were 6.16/5.83/5.46 before
and 5.11/5.41/5.33 after. Treat small differences as indicative.

Timing includes result-buffer reset, all N dot products and top-k selection;
it excludes initialization, quantization, serialization and validation. The
same typed TS file runs unchanged under Node's type stripping and scriptc.
Go uses row slices, range loops and int32 accumulation, with no SIMD package.
All implementations are synchronous so the async-frame ownership issue in the
histogram repro is not introduced into this compute-only scout.

Tables recompute conventional medians from **all 60 raw Mac samples**, with
p95 at nearest rank `ceil(.95*n)`. The small programs' `medianMs` fields use
the upper middle element; `summarize.mjs` uses the average of the two middle
samples. RSS is the maximum process high-water mark across both runs, measured
by `/usr/bin/time -l`, including corpus initialization, runtime and JIT memory.
All raw samples and per-process results are retained, not just table summaries.

### Mac latency: median / p95, milliseconds

Native/Node and Native/Go are release-time ratios; **lower than 1 wins**.

| N×D | Kernel | Node | Go | Release | Speed | Native/Node | Native/Go |
|---|---|---:|---:|---:|---:|---:|---:|
| 20,000×384 | float | 5.006 / 5.942 | 4.508 / 4.816 | 3.202 / 3.378 | 3.261 / 3.538 | 0.640× | 0.710× |
| 20,000×384 | int8 | 4.931 / 6.035 | 2.508 / 2.586 | 4.708 / 4.820 | 4.648 / 4.862 | 0.955× | 1.877× |
| 20,000×384 | int8-i32 | 4.235 / 4.901 | 2.531 / 2.581 | 39.212 / 41.492 | 39.080 / 43.517 | 9.260× | 15.490× |
| 20,000×384 | int8-imul | 4.299 / 5.502 | 2.532 / 2.610 | 0.230 / 0.244 | 0.240 / 0.261 | 0.053× | 0.091× |
| 20,000×384 | binary | 0.267 / 0.277 | 0.094 / 0.101 | 0.141 / 0.153 | 0.140 / 0.145 | 0.528× | 1.505× |
| 100,000×768 | float | 51.550 / 53.401 | 50.765 / 51.782 | 37.815 / 38.989 | 39.781 / 44.826 | 0.734× | 0.745× |
| 100,000×768 | int8 | 49.541 / 52.508 | 24.997 / 25.488 | 48.939 / 50.872 | 49.188 / 50.373 | 0.988× | 1.958× |
| 100,000×768 | int8-i32 | 41.796 / 48.832 | 25.198 / 25.835 | 407.169 / 428.461 | 403.180 / 423.181 | 9.742× | 16.159× |
| 100,000×768 | int8-imul | 53.402 / 68.329 | 25.068 / 25.774 | 2.041 / 2.163 | 2.072 / 2.195 | 0.038× | 0.081× |
| 100,000×768 | binary | 2.541 / 10.134 | 0.889 / 0.956 | 1.382 / 1.452 | 1.380 / 1.453 | 0.544× | 1.555× |

Node's large `int8-imul` process medians were **41.944 and 59.462 ms**;
release's were **2.018 and 2.066 ms**. The pooled 53.402 ms Node median is
bimodal, so use approximately **20× Node** as the conservative Mac story,
not the pooled 26.16× ratio. The Go comparison is **12.28×**. A separate traced
Node diagnostic returned 41.582 ms and showed TurboFan scalar `madd`, not SIMD.
The cause of the slower process is not established.

Go's **SWAR** binary baseline is 0.227 / 0.229 ms at 20k×384 and
2.200 / 2.293 ms at 100k×768. Native beats that plain arithmetic but still
loses to the fair idiomatic Go intrinsic baseline in the table.

### Mac peak RSS, MiB

| N×D | Kernel | Node | Go | Release | Speed |
|---|---|---:|---:|---:|---:|
| 20,000×384 | float | 108.5 | 34.7 | 31.1 | 31.1 |
| 20,000×384 | int8 | 85.3 | 12.6 | 9.2 | 9.2 |
| 20,000×384 | int8-i32 | 84.9 | 12.7 | 9.2 | 9.2 |
| 20,000×384 | int8-imul | 84.5 | 12.7 | 9.2 | 9.2 |
| 20,000×384 | binary | 77.6 | 5.8 | 2.8 | 2.8 |
| 100,000×768 | float | 371.7 | 298.7 | 294.8 | 294.8 |
| 100,000×768 | int8 | 151.4 | 78.6 | 75.1 | 75.1 |
| 100,000×768 | int8-i32 | 151.4 | 78.7 | 75.1 | 75.1 |
| 100,000×768 | int8-imul | 151.1 | 78.8 | 75.1 | 75.1 |
| 100,000×768 | binary | 87.0 | 14.5 | 11.0 | 11.0 |

### Fair Go float controls

`controls.mjs` also builds a natural `sum += float64(x)*float64(query[j])`
variant and a variant that slices the query to D and uses `base:base+D` row
slices. Both match every float score exactly. The natural expression emits
FMADDD and measured **59.569 / 65.593 ms**; the query-bounds variant measured
**47.843 / 49.248 ms**, versus the main Go table's 50.765 ms median. Native
37.815 ms still wins against this faster Go control by **1.27×**. These are
additional 15-warmup/30-sample diagnostics, not replacements for the full sweep.

The explicit product conversion in the main Go loop prevents FMA and is faster
here. FMA is actually equivalent for these finite float32 inputs: their products
are exact in float64. Thus the stronger reason for retaining the separate
product is the measured faster Go baseline, not a claim that these input
products require a semantics concession. No float32 accumulation baseline is
substituted for JS's float64 arithmetic.

## Linux confirmation and budget

Two sequential **one-vCPU**, nonpersistent Vercel Sandboxes; Node **24.22.1**;
Go binaries cross-built with the same Go 1.27.3, `GOOS=linux GOARCH=amd64
CGO_ENABLED=0`. The caller loaded the existing OIDC file directly via
`--env-file=/Users/noah/code/next-scriptc/.env.local`. No token was copied into
the VM or committed.

First VM: Xeon @2.90 GHz, family 6/model 106; Linux x86_64. Source is pinned
in baseline commit **37d40b8** (TS SHA-256 starts `14977243`). Installed public
scriptc 0.4.6 in the VM and built both postures there. Largest case only,
**10 warmups + 30 timed searches** per runtime/case, one process each.
GNU time measured peak RSS. Float native is essentially tied with Go;
binary loses to both Node and Go here.

Each cell below is **median / p95 ms; peak RSS MiB**. Ratios compare only
runtimes inside the same VM.

### First VM: baseline kernels, 100k×768

| Kernel | Node | Go | Release | Speed | Native/Node | Native/Go |
|---|---:|---:|---:|---:|---:|---:|
| float | 115.127 / 120.623; 364.4 | 90.562 / 96.989; 296.4 | 91.175 / 91.527; 295.5 | 91.243 / 91.510; 295.5 | 0.792× | 1.007× |
| int8 | 114.703 / 115.008; 144.0 | 68.538 / 69.526; 76.4 | 87.183 / 87.478; 75.7 | 87.182 / 91.844; 75.7 | 0.760× | 1.272× |
| int8-i32 | 102.207 / 102.598; 143.6 | 68.507 / 68.830; 76.4 | 396.011 / 400.968; 75.7 | 396.177 / 397.129; 75.7 | 3.875× | 5.781× |
| binary | 6.581 / 21.507; 79.2 | 1.988 / 2.148; 12.3 | 6.713 / 6.766; 11.7 | 6.701 / 6.888; 11.9 | 1.020× | 3.376× |

### Second VM: int8-imul, 100k×768

Second VM: Xeon @2.50 GHz, Linux x86_64. This confirms the final shared TS
source (SHA-256 starts `0559a279`). Release/speed were cross-built on Mac using
Zig and the public **0.4.6 Linux runtime pack**, default portable x86-64/SSE2
code generation. No AVX-specific setting was used. The VM received only this
TS source, binaries and the tiny Go wait4 RSS wrapper; no install was needed.
The wrapper gets exact process high-water RSS from `wait4`/`rusage`.
It also uses 10 warmups and 30 timed calls. Do not compare absolute latency
between the two different VM hosts.

| Kernel | Node | Go | Release | Speed | Native/Node | Native/Go |
|---|---:|---:|---:|---:|---:|---:|
| int8-imul | 132.500 / 135.966; 142.4 | 61.400 / 63.817; 76.6 | 23.879 / 24.174; 75.2 | 23.643 / 23.958; 75.3 | 0.180× | 0.389× |

First-VM Go SWAR binary: **4.715 / 4.748 ms**, 12.3 MiB; Go intrinsic:
1.988 / 2.148 ms. The intrinsic is the fair main baseline.

Both sandboxes were stopped in `finally` and their final provenance is saved.
First elapsed wall time: **116.759 s**; second: **22.782 s**. At one vCPU each,
the combined wall-time upper bound is **0.038761 vCPU-hours**. API-reported
active CPU durations total **120.864 s = 0.033573 vCPU-hours**. The first lease
was 170 s; after it stopped, the follow-up script checked that actual first
elapsed time plus its 50 s hard lease stayed under 180 vCPU-seconds
(**0.046322 vCPU-hours** maximum for that follow-up decision). No sandbox
remains running and no deployment was made.

## Generated code: what explains the results

Inspection used actual emitted LLVM IR and optimized assembly, Go objdump,
and Node TurboFan `--print-opt-code`. Representative excerpts are retained in
[`codegen-excerpts.txt`](../examples/scout/vectors/codegen-excerpts.txt).
Emitted `.ll` is **pre-LLVM-optimization**; the assembly is the evidence for
which conversions survive optimization.

**Bounds and ownership:** scriptc emits a `bytes.version.fast` copy with a
per-row guard checking the affine `base+j` range, query length, integer index
exactness and loop limit. The successful inner copy has direct loads without
per-element bounds checks. Guarded slow copies preserve JS missing-index/NaN
behavior. The outer row/base still uses Number arithmetic and guard conversions.
No retain/release calls appear inside these hot dot-product loops. Borrowed
`sc_bf_*` functions and wrapper cleanup keep ownership traffic outside the
per-element work; result `.fill` calls have per-search lifetime operations.
The histogram's async ownership cost is not a sufficient explanation here.

**Float:** LLVM's fast loop loads float32, widens to float64, and emits ordinary
`fmul` / `fadd` without fast-math flags. Mac assembly batches eight elements
with NEON `ldp q`, `fcvtl`, `fmul.2d`, then extracts lanes into an **ordered
scalar fadd chain**. It vectorizes independent products and loads, not an
illegally reassociated sum. Go's main loop uses scalar FCVTSD/FMULD/FADDD,
with a query bounds comparison; the FMA control uses FMADDD. V8 likewise shows
scalar `ldr s`, `fcvt`, `fmul`, `fadd`, bounds/deoptimization checks and loop
polls. This explains a modest Mac win without claiming permission to change
IEEE reduction order. The Linux tie limits the float story.

**Ordinary int8:** direct signed-byte loads still become double operands and a
floating accumulation. It is not an integer SIMD reduction just because its
source arrays are Int8Array. The main Go int8 loop is scalar signed-byte loads
plus `MADDW` on arm64, `IMULL`/`ADDL` on x86-64, with one final score conversion.

**`(sum+a*b)|0`:** the accumulator has an i32 slot, but the hot path converts it
and both byte loads to double, emits `fmul` then `fadd`, and performs general
ToInt32 conversion on every dimension. Mac assembly retains SCVTF, FMUL, FADD,
FCVTZS, exponent extraction (`ubfx`), shifts and selection for the full numeric
coercion path. LLVM IR even carries an auxiliary i32 product but does not use
it as the reduction. Merely adding `|0` is a severe regression, not a speed tip.

**`(sum+Math.imul(a,b))|0`:** the accumulator, multiply and sum stay i32. Mac
LLVM auto-vectorizes **32 signed bytes per iteration** with `smull.8h` /
`smull2.8h`, widening `saddw.4s`, independent vector accumulators and final
`addv.4s`. Linux portable SSE2 uses eight bytes per iteration, sign extension,
`pmullw`, `paddd` and a horizontal integer sum. Reassociation is legal for
modular integer addition; under this fixture the sum does not even wrap.
V8's corresponding optimized loop is scalar integer `madd`; Go's plain loop
is scalar too. This is a real compiler vectorization advantage from the same
TS source, not an intrinsic implemented by a hidden native library.

**Binary:** no `llvm.ctpop`, ARM CNT or x86 POPCNT survives in native's
popcount loop. The SWAR function's first signed subtraction widens to i64,
then passes through double and back to integer; assembly retains that bridge.
LLVM vectorizes portions of the SWAR operations but does not recognize a clean
popcount idiom; the distance reduction remains an ordered floating sum.
V8 also emits SWAR shifts/ands/multiply. Idiomatic Go emits `VCNT` + `VUADDLV`
on arm64 and feature-guarded `POPCNTL` on x86-64. Portable x86-64 baseline code
cannot assume POPCNT without target features or dispatch, even if an idiom is
recognized. Native's loss to Go is genuine.

Coverage on the final file: **105 / 105 statements static, zero dynamic-tier
functions/statements and zero demotion requests**. Static coverage alone does
not imply good numeric lowering.

## General compiler opportunities and effort

I read the clean vendored backend checkout at
`/Users/noah/code/next-scriptc/vendor/scriptc`, HEAD
`ade56e0c73f0e7db30d94e0c574e4eb4a54b0c82`, including:

- `backend/llvm/wrapping-sums.ts` (`markWrappingOperands`, `integerOrNaNRange`,
  `emitWrappingSum`, `emitNanArithmetic`);
- `ir/integer-ranges.ts` (`integerArithmeticRange`), `llvm/int32-locals.ts`,
  `llvm/integer-values.ts`, `llvm/integer-views.ts`;
- `llvm/bytes-loop-versions.ts`, `llvm/expr-bytes.ts`, `llvm/byte-numbers.ts`,
  `llvm/bytes-bounds.ts`, loop emission/polling and target CPU handling.

That source checkout is evidence for investigation, not a claim that its HEAD
is the exact source revision of the installed public 0.4.6 binary.

1. **Highest value: preserve exact modulo arithmetic through signed products.**
   `integerArithmeticRange('*')` intentionally refuses a product that can be
   `-0`; `integerOrNaNRange` uses that rule when analyzing an enclosing sum.
   `emitWrappingSum` separately understands exact products whose signed zero
   is discarded by ToInt32, but a parent sum can still lose the product's
   usable range. This closely matches the emitted unused integer product and
   surviving floating parent sum. Extend integer facts for **bitwise-only
   consumers**, or propagate the product's valid modulo view into the parent,
   without erasing signed zero from ordinary Number expressions. Estimate:
   **2–5 engineer-days** for a focused fix and semantic/codegen tests. The
   exact root cause remains an inference until that patch is measured.
   Tests must cover mixed-sign zero products, negative zero observability,
   large products near the exact-Number limit, and OOB/NaN. In particular,
   `(sum+NaN)|0` resets the entire sum, whereas adding `Math.imul(NaN,x)`
   adds zero; only the successful in-bounds loop version admits the simple
   equivalence used here. Retain the correct fallback.
2. **Ordinary Number integer reductions:** infer/guard that a bounded int8
   reduction stays exact below 2^53, then represent it as integers and let LLVM
   reassociate. This would improve `sum += a*b` without requiring `|0` or
   `Math.imul`, but needs range/loop-trip reasoning and IEEE/-0/NaN care.
   Estimate **1–2 weeks**, materially broader than the first fix.
3. **Popcount canonicalization:** preserve low 32-bit views through the SWAR
   stages, then check whether LLVM recognizes ctpop. A generic canonical
   popcount idiom or integer-view improvement is appropriate; recognizing this
   particular vector-search function is not. Estimate **2–5 days** for the
   focused idiom, longer if the integer-view representation must change.
   ARM can then use architectural CNT; x86 needs appropriate lowering or
   feature dispatch. No claim yet that this beats Go's intrinsic.
4. Per-row bounds/exactness guards and integer outer counters are a secondary
   general improvement. The existing successful bounds version already removes
   the inner element checks, so deleting bounds checks indiscriminately or
   refcount hill-climbing is not the first experiment justified by these data.

The `Math.imul` version is an **already working exact shared-source candidate**.
The proposed upstream change aims to bring normal typed `*` code onto the same
path; no unmeasured compiler-patch speedup is included in the results.

## Story strength and limits

Strong fit: a route retaining a tenant's embeddings can spend tens/hundreds of
milliseconds scanning 100k documents for RAG retrieval. Quantized scores and
top-k IDs are useful application results; the memory footprint is manageable,
and int8/binary encodings have real library precedent. The int8 win is large
on both tested architectures, without a special CPU feature setting.

This is **resident exact brute-force retrieval**, not an end-to-end RAG or HTTP
latency claim. Corpus loading, cold starts, embedding model execution, decoding,
network, JSON and concurrent queries are unmeasured. Synthetic uniform inputs
do not establish recall. No comparison against BLAS, a SIMD Go library, tuned
native vector databases or ANN indexes is claimed. A highly tuned Go SIMD
implementation could change the ranking; the requested idiomatic plain-loop
baseline is what was measured. Float is a less convincing portable winner;
binary is not currently a winner against idiomatic Go.

## Reproduce

From the repository root (all generated binaries/IR/assembly are ignored):

```sh
pnpm install --frozen-lockfile
find node_modules/.pnpm -type f \( -name tsc-ts -o -name tsc -o -name scriptc-comptime \) -exec chmod +x {} +
/Users/noah/.local/share/fnm/node-versions/v24.22.0/installation/bin/node examples/scout/vectors/bench.mjs
/Users/noah/.local/share/fnm/node-versions/v24.22.0/installation/bin/node examples/scout/vectors/summarize.mjs
# Optional Go fairness controls, after the benchmark has finished:
/Users/noah/.local/share/fnm/node-versions/v24.22.0/installation/bin/node examples/scout/vectors/controls.mjs
```

Build/run one shared TS case directly:

```sh
SCRIPTC_CHECKER_SERVER=0 packages/next-scriptc/node_modules/.bin/scriptc build examples/scout/vectors/vectors.ts --optimization release --keep-llvm -o examples/scout/vectors/.artifacts/vectors-release
examples/scout/vectors/.artifacts/vectors-release int8-imul 100000 768 30 15
/Users/noah/.local/share/fnm/node-versions/v24.22.0/installation/bin/node examples/scout/vectors/vectors.ts int8-imul 100000 768 30 15
/opt/homebrew/bin/go build -o examples/scout/vectors/.artifacts/vectors-go examples/scout/vectors/vectors.go
examples/scout/vectors/.artifacts/vectors-go int8-imul 100000 768 30 15
```

Inspect code without changing numeric semantics:

```sh
SCRIPTC_CHECKER_SERVER=0 packages/next-scriptc/node_modules/.bin/scriptc build examples/scout/vectors/vectors.ts --emit llvm -o examples/scout/vectors/.artifacts/vectors-mac.ll
SCRIPTC_CHECKER_SERVER=0 packages/next-scriptc/node_modules/.bin/scriptc build examples/scout/vectors/vectors.ts --emit asm -o examples/scout/vectors/.artifacts/vectors-release.s
SCRIPTC_CHECKER_SERVER=0 packages/next-scriptc/node_modules/.bin/scriptc coverage examples/scout/vectors/vectors.ts --explain-dynamic
/opt/homebrew/bin/go tool objdump -s 'main\.(floatSearch|int8Search|binarySearch)' examples/scout/vectors/.artifacts/vectors-go
/Users/noah/.local/share/fnm/node-versions/v24.22.0/installation/bin/node --print-opt-code --print-opt-code-filter=int8imulSearch examples/scout/vectors/vectors.ts int8-imul 100000 768 1 30
```

The installed CLI refuses `--optimization release` with `--emit llvm`; omit it
there. Executable builds above explicitly use release/speed. Default assembly
emission is release. Do not use fast-math or a float32 reduction as a supposed
same-semantics optimization.

[`linux.mjs`](../examples/scout/vectors/linux.mjs) reproduces the first VM
pattern; run it from baseline commit 37d40b8 to reproduce the original
source. It has a 170 s hard lease and always stops. For the imul follow-up, first run the Mac build and cross-build:

```sh
mkdir -p examples/scout/vectors/.artifacts/runtime-linux
npm pack @scriptc/runtime-linux-x64-gnu@0.4.6 --pack-destination examples/scout/vectors/.artifacts/runtime-linux
tar -xzf examples/scout/vectors/.artifacts/runtime-linux/scriptc-runtime-linux-x64-gnu-0.4.6.tgz -C examples/scout/vectors/.artifacts/runtime-linux
# Zig must be installed. Repeat with speed / vectors-linux-speed for the second binary.
SCRIPTC_TARGET=x86_64-linux-gnu SCRIPTC_RUNTIME_PACK="$PWD/examples/scout/vectors/.artifacts/runtime-linux/package" SCRIPTC_CHECKER_SERVER=0 packages/next-scriptc/node_modules/.bin/scriptc build examples/scout/vectors/vectors.ts --optimization release -o examples/scout/vectors/.artifacts/vectors-linux-release
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 /opt/homebrew/bin/go build -o examples/scout/vectors/.artifacts/vectors-go-linux examples/scout/vectors/vectors.go
/Users/noah/.local/share/fnm/node-versions/v24.22.0/installation/bin/node --env-file=/Users/noah/code/next-scriptc/.env.local examples/scout/vectors/linux-imul.mjs
```

No additional Sandbox runs are required to assess the committed evidence.
`linux-imul.mjs` checks the first run's stopped status and elapsed budget before
creating its 50 s follow-up. It never reads or uploads the OIDC token itself.

## Files and provenance

- [Shared TS kernels](../examples/scout/vectors/vectors.ts),
  [Go kernels](../examples/scout/vectors/vectors.go),
  [Mac controller](../examples/scout/vectors/bench.mjs),
  [summary/parity validation](../examples/scout/vectors/summarize.mjs).
- [Mac raw results](../examples/scout/vectors/mac-results.json),
  [Go control results](../examples/scout/vectors/go-controls.json),
  [control generator](../examples/scout/vectors/controls.mjs),
  [derived summary](../examples/scout/vectors/summary.json).
- [Linux baseline results](../examples/scout/vectors/linux-results.json),
  [final stopped provenance](../examples/scout/vectors/linux-provenance.json).
- [Linux imul results](../examples/scout/vectors/linux-imul-results.json),
  [final stopped provenance](../examples/scout/vectors/linux-imul-provenance.json),
  [follow-up controller](../examples/scout/vectors/linux-imul.mjs),
  [Linux wait4 RSS helper](../examples/scout/vectors/rss.go).
- [Generated-code excerpts](../examples/scout/vectors/codegen-excerpts.txt).
  Full regenerated artifacts live under ignored `.artifacts/`.

Baseline sources remain available in commit **37d40b8**. The final Mac and
Linux imul results identify the final TS SHA-256
`0559a279b6520ff21e4dafb3b42bdd74e03076aa0eb3627e976eb71f99b1e625`.
The baseline Linux run predates the extra imul mode; its original source and
raw evidence are retained rather than relabeled as a final-source measurement.
