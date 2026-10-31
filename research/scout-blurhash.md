# BlurHash scouting: native wins on M4, ties stronger Go on Linux

Measured 2026-10-31, fresh worktree from main `2e520061a402f5484fd7d6d9508383a679beb161`. No deployment, push, merge, or upstream compiler modification.

**Assessment:** worth a guarded numeric-loop compiler experiment, but not yet a robust “faster than Node AND Go” Linux story. At 2048², scriptc release is **41.664 ms** on the M4 Pro versus Node **99.808 ms** and the strongest tested Go port **48.989 ms**. On the one-vCPU Linux Sandbox it is **135.964 ms**, Node **222.721 ms**, and stronger Go **136.045 ms**: a **tie**, not a meaningful 0.06% win. Comparing only with the established Go library would overstate the result. Its image interface allocates per pixel; both direct Go ports avoid that cost. No fast-math, approximate cosine, reduced precision, FMA contraction, subsampling, or compiler-specific source branch was used in native TS.

The kernel has plausible upstream headroom: residual integer-validity/bounds checks, floating-point image-coordinate arithmetic, and repeated factor loads/stores. Unlike the asynchronous histogram repro, this synchronous numeric kernel already gets useful two-channel LLVM SIMD and has essentially no hot-path boxing/refcount cost.

## Contract and implementation

Harness: [`examples/scout/blurhash/`](../examples/scout/blurhash/). One primary [`blurhash.ts`](../examples/scout/blurhash/blurhash.ts), unchanged under Node and scriptc. It encodes **4×3 components**, producing a 28-character hash from already decoded, packed, **opaque** RGBA. Components are compile-time constants; dimensions are runtime arguments. This is a fixed common setting, not a general 1–9-component benchmark. No image decode, upload/body copy, HTTP, Next, resizing, BlurHash decode, PNG encoding, or data-URL generation is timed.

The deterministic fixture has horizontal red and vertical green gradients, textured blue `((x ^ y) + ((x*y) >>> 8)) & 255`, and alpha 255. For red/green, byte values are `floor(coordinate*255/(size-1))`. This is a synthetic image with nontrivial low-frequency content, not a photographic corpus. At these sizes all fixture integer arithmetic agrees with Go. Generation happens once per process outside all encode timers; every iteration reads the same pixels and computes a new hash.

Algorithm: build a global 256-entry float64 sRGB→linear LUT once; per encode allocate float64 cosine tables and 36 coefficients; build `cos(π*component*coordinate/dimension)` tables; visit pixels in row-major order; accumulate all 12 RGB factors; quantize DC/AC; serialize base83. The LUT is outside timing in all variants; cosine preparation, coefficient allocations, quantization and output serialization are **inside** every timed encode. Alpha is ignored for the opaque fixture.

The [Wolt reference](https://github.com/woltapp/blurhash/blob/master/TypeScript/src/encode.ts) defines the DCT/quantization structure. We intentionally align traversal and normalization with [buckket v1.1.0](https://github.com/buckket/go-blurhash/blob/v1.1.0/encode.go), rather than preserve the npm reference's x-first pixel traversal, repeated sRGB conversions, callback, or final normalization placement. TS uses a byte LUT, flattened typed cosine tables, row-major accumulation, and `channel*basis*scale` **per addition**, exactly as the direct Go controls do. The maximum is the maximum **absolute** AC coefficient, as in buckket. There is no deliberately expensive per-pixel trig/pow implementation.

Go [`main.go`](../examples/scout/blurhash/main.go), pinned by `go.mod`/`go.sum`:

- **go-library:** `github.com/buckket/go-blurhash v1.1.0`, ordinary `Encode(4,3,*image.RGBA)`, zero-origin packed image, default Go build. The library already caches byte linearization and cosines. Its internal `image.Image.At().RGBA()` interface path differs materially from raw TS access.
- **go-port:** straightforward direct-byte/flat-cosine-table port with the same pixel-first loop and factor order as TS. Fixed `[36]float64` coefficients and normalization divisions hoisted outside the loops; no image interfaces or per-pixel allocations. The small hoist did not erase the native advantage.
- **go-components:** conventional component-first Go implementation: keep three scalar accumulators, visit pixels row-major for each component, then store the three coefficients. It reads pixels/LUTs twelve times, but avoids per-pixel component-loop branches and coefficient-array updates. **Each individual coefficient receives the same contributions in the same order with the same normalization placement**; hashes agree. This is the stronger tested Go baseline, not a claim to exhaust all optimized Go implementations.

The Go ports explicitly convert intermediate products to `float64` to prevent optional Go FMA fusion across the final accumulation. Their inspected ARM64 assembly contains separate multiply/add operations. The unmodified library **does** use `FMADDD` on ARM64, which can change intermediate rounding; it still produces identical hashes for every fixture. Native TS has separate `fmul`/`fadd`, no `fast`, `reassoc`, or `contract` LLVM flags, and no FMA in inspected ARM64/x86 kernels. Neither FMA nor reordered floating-point reductions is proposed as an upstream win. Transcendental implementations can differ in last bits between JS-compatible runtime/Go, so parity here is the externally relevant **hash string**, not a claim that every intermediate cosine bit matches.

All variants/iterations, across both machines, agree:

| Input | Hash |
| --- | --- |
| 512² | `L%HV9,2C$1SKdJfOfPfSgYfPfRfO` |
| 1024² | `L%HV9#2G$4SKdNfRfPfPgbfPfPfP` |
| 2048² | `L%HV9y2F$6SNdMfRfRfQgdfRfPfQ` |
| 32² diagnostic | `L$Her%2qwxX6l{WCjte;gJfjfQfj` |

## Measurement method

Mac: Apple M4 Pro, macOS 26.6.1 (25G76), arm64; Node **24.22.0** at the requested fnm path; Go **1.27.3** at `/opt/homebrew/bin/go`; scriptc **0.4.6**, release and speed. `pnpm install --frozen-lockfile` succeeded. Fresh installed checker helper executables needed `chmod +x`; `SCRIPTC_CHECKER_SERVER=0` alone did not fix their initial permission error. No project dependency/lockfile changes were needed beyond the isolated Go module.

Each variant/size runs in a fresh process, synchronously, one call at a time. An untimed encode establishes the hash, followed by **5 warmup and 30 measured encodes**. Each encode is independently timed with `performance.now()` or Go's monotonic `time.Now`; parity checking occurs after the elapsed timer. [`run.mjs`](../examples/scout/blurhash/run.mjs) verifies hashes across variants and writes all unsorted samples. Median/p95 are nearest rank: samples 15 and 29 of 30 after sorting. No outlier removal, confidence interval, power/thermal control, affinity, or capacity/concurrency claim. Variant start order rotates between Mac sizes; variant windows are sequential, not randomly interleaved per call. This is an indicative workstation scout, with visible tail noise in some windows.

Peak RSS covers the **entire fresh process**, including initialization, fixture, warmup, runtime, GC/allocator and measured calls. Mac uses `/usr/bin/time -l` bytes; Linux uses the tiny Go [`rss/main.go`](../examples/scout/blurhash/rss/main.go) wrapper's child `wait4` rusage KiB. It excludes the measurement wrapper itself and is not incremental allocation per encode. Native timings exclude process startup; peak RSS includes startup. Raw arrays and RSS stderr are retained alongside the harness.

The final complete matrix is `mac-results.json` / `linux-results.json`; prior passes are explicitly retained as `mac-initial-results.json` (before Go scale hoist) and `mac-pixel-major-results.json` / `linux-pixel-major-results.json` (before adding stronger Go). Final tables below use the final full matrix, not the fastest window selected from multiple passes. Native/Node medians broadly agree across Mac passes; some p95s roughly double, so do not treat these tails as stable production estimates.

### Mac M4 Pro

| Size | Variant | Median ms | p95 ms | Peak RSS MiB |
| --- | --- | ---: | ---: | ---: |
| 512² | Node | 6.211 | 6.458 | 83.45 |
| 512² | scriptc release | 2.635 | 2.674 | 2.84 |
| 512² | scriptc speed | 2.610 | 2.693 | 2.86 |
| 512² | Go library v1.1.0 | 6.778 | 6.995 | 11.11 |
| 512² | Go pixel-first port | 3.524 | 3.599 | 6.70 |
| 512² | Go component-first port | 3.147 | 3.304 | 6.70 |
| 1024² | Node | 26.076 | 49.395 | 82.66 |
| 1024² | scriptc release | 10.497 | 10.734 | 5.92 |
| 1024² | scriptc speed | 10.361 | 10.628 | 5.91 |
| 1024² | Go library v1.1.0 | 26.931 | 27.940 | 16.02 |
| 1024² | Go pixel-first port | 13.979 | 14.300 | 11.42 |
| 1024² | Go component-first port | 12.373 | 20.446 | 11.38 |
| 2048² | Node | 99.808 | 195.803 | 95.36 |
| 2048² | scriptc release | 41.664 | 49.117 | 18.12 |
| 2048² | scriptc speed | 41.656 | 42.210 | 18.11 |
| 2048² | Go library v1.1.0 | 109.063 | 115.297 | 41.55 |
| 2048² | Go pixel-first port | 55.620 | 56.070 | 25.42 |
| 2048² | Go component-first port | 48.989 | 50.386 | 25.31 |

### Linux Sandbox, one vCPU

| Size | Variant | Median ms | p95 ms | Peak RSS MiB |
| --- | --- | ---: | ---: | ---: |
| 2048² | Node | 222.721 | 297.068 | 91.43 |
| 2048² | scriptc release | 135.964 | 137.839 | 16.58 |
| 2048² | scriptc speed | 136.319 | 164.630 | 16.58 |
| 2048² | Go library v1.1.0 | 220.674 | 222.989 | 37.96 |
| 2048² | Go pixel-first port | 149.551 | 151.475 | 23.34 |
| 2048² | Go component-first port | 136.045 | 136.524 | 23.46 |

### Ratios of median encode time

Below 1 favors native. Use release as the consistent primary posture; speed offers no dependable extra gain.

| Host / size | Release / Node | Release / Go library | Release / Go pixel-first | Release / Go component-first |
| --- | ---: | ---: | ---: | ---: |
| Mac 512² | 0.424× | 0.389× | 0.748× | 0.837× |
| Mac 1024² | 0.403× | 0.390× | 0.751× | 0.848× |
| Mac 2048² | 0.417× | 0.382× | 0.749× | 0.850× |
| Linux 2048² | 0.610× | 0.616× | 0.909× | 0.999× |

### Linux provenance and budget

Node **24.22.1**, Linux x86_64, Intel Xeon @ 2.90 GHz (family 6/model 106), one visible/allocated vCPU. This is a Sandbox confirmation, **not a Vercel Functions deployment**. Linux binaries were cross-built on the Mac from the same source: native `x86_64-linux-musl`, default baseline CPU; Go `CGO_ENABLED=0 GOOS=linux GOARCH=amd64`, default GOAMD64 v1. No AVX/FMA flags, host-native CPU tuning or PGO. The static musl runtime pack is pinned `@scriptc/runtime-linux-x64-musl@0.4.6`. Cross-building avoids installation/compilation time in the VM. Source/binary SHA-256 values, CPU description, Node version, stop results and elapsed times are retained in the JSON provenance. `parentCommit` is the clean starting commit, **not** a claim that then-uncommitted harness files came from its git archive; exact uploaded bytes are separately hashed.

Two short setup-only failures are retained: the Node image lacks both `/usr/bin/time` and Python. They were each stopped in `finally`. The third sandbox completed the original five variants; a fourth added the stronger Go component-first baseline and repeated all six. **All four are stopped.** Their summed wall-time allocation upper bound, including creation/transfer/stop overhead, is **105,179 ms × 1 vCPU = 0.02922 vCPU-hours**, below 0.05. The final run had a 115-second hard VM lifetime; adding the 55.455 seconds of prior attempts gave a pre-run ceiling of 0.04735 vCPU-hours. No more Sandbox work is needed for this scout. The authorized `.env.local` was copied only to the ignored worktree file for the controller and removed afterward; uploads were an explicit source/binary whitelist and never contained the credential.

## Where native time goes

Retained evidence: [`profiles/codegen.txt`](../examples/scout/blurhash/profiles/codegen.txt), native `sample` report, V8 profile summary and Go pprof summaries. Full generated LLVM/assembly and raw profiler outputs are reproducible with the commands below; their hashes are in `provenance.json`. Profiles are **separate runs**, not timings used in the result matrix.

- **Native sample, 2048²:** 4,241 main-thread samples over five seconds; 4,228 (99.69%) have `sc_bf_encode` as the sampled leaf in the collapsed report. Only a handful reach `scr_ieee754_cos` or allocation. There is no sampled refcount hotspot. This establishes a numeric-kernel problem; it does **not** attribute an exact percentage to individual branch instructions.
- **Coverage:** 68/68 statements static, zero dynamic-tier functions/statements, zero demotions. The numeric loop contains unboxed doubles/integers and direct typed-array storage. JSON/reporting runtime references elsewhere in the module do not indicate per-pixel boxing.
- **LLVM already helps:** versioned fast paths have `alias.scope`/`noalias` metadata after view-disjointness guards. LLVM hoists normalization divides out of the pixel loop, unrolls the four x-components, and packs **red/green arithmetic into two float64 lanes** (`fmul.2d`/`fadd.2d` on ARM64; `mulpd`/`addpd` on baseline x86). Blue remains scalar. The three y-components still loop, and factors are loaded/stored in that loop. This is channel SLP, **not** a claim that the ordered reduction over pixels vectorizes.
- **Residual checks:** even the emitted `bytes.version.fast68` copy still converts the computed double pixel index with `fptosi`, converts back, checks exact equality, compares with RGBA length, and branches to a NaN-coded invalid read. Chained byte→LUT accesses also retain bounds/validity checks. Basis expressions `xc*width+x` and `yc*height+y` similarly retain exact-integer and bounds branches. Optimized ARM64 still has `fcvtzs`, `scvtf`, `fcmp`, conditional branches and bounds compares beside the loads. These are necessary for unrestricted JS indices **unless** a safe entry guard proves the whole iteration space; removing the checks outright would be wrong.
- **Refcounts/boxing:** typed-array allocation/release happens at encode boundaries. There are no retain/release, dynamic invoke or boxed element operations in the pixel/component hot loop. `speed`'s inlined ownership does not materially improve medians. This is different from the async-frame histogram issue, not evidence that its ownership diagnosis applies here.
- **Math calls:** cosine is computed `4*width+3*height` times per encode, not per pixel/component; at 2048² that is 14,336 calls versus 50,331,648 pixel/component visits. The byte `pow(...,2.4)` LUT initializes only once. DC transfer functions and AC square roots/base83 are tiny output work. The runtime's `scr_math_pow` handles exponent 0.5 with JS-compatible sqrt edge cases; optimized assembly also exposes square roots. Replacing cos/pow with approximations would both miss the measured hotspot and risk semantics.
- **V8:** 9,242/9,301 CPU profile samples (99.37%) are in `encode`; three GC samples. The final **non-OSR TurboFan** code (optimization id 8, not just the early OSR version) has scalar `fmul`/`fadd` for all three channels, map/detach/bounds/overflow guards, and component-loop work. Retained code excerpts show those operations. Early warmup did perform Maglev/TurboFan OSR and deopts; the numbers are not interpreter-only comparisons. The five-warmup protocol does not establish that all background JIT effects disappeared from tails.
- **Go:** the pixel-first pprof run has 94.26% flat / 98.09% cumulative in `main.encode`; component-first 93.86% flat / 98.25% cumulative. Inspected ports use scalar FP, integer coordinates and ordinary bounds checks. Component-first keeps independent r/g/b sums in registers and removes much coefficient-indexing/branch overhead. The library has 66.18% flat in `multiplyBasisFunction`, with `image.(*RGBA).At` 27.82% cumulative and `runtime.convTnoptr` 21.45% cumulative (overlapping stacks, **do not add them**). Its interface conversion/per-pixel allocation explains why the library alone is an insufficient fair-Go control.

## General compiler changes and expected effort

Read the clean compiler/runtime source at `/Users/noah/code/next-scriptc/vendor/scriptc`, commit `ade56e0c73f0e7db30d94e0c574e4eb4a54b0c82`. Binary observations above are from installed 0.4.6, not a locally modified compiler. Source locations are proposed intervention points, not proof that a patch already works:

| Opportunity | Relevant source under vendor/scriptc | Generality / rough effort |
| --- | --- | --- |
| Guarded nested-loop range proof | `packages/compiler/src/backend/llvm/bytes-loop-versions.ts`, `loop-entry-versions.ts`, `emit-statements.ts` | Highest priority. Existing versioner handles fixed ranges and constant-scaled affine counters; its `affine()` multiplication path requires a numeric literal scale. Runtime image strides/dimensions and nested-counter relationships need stronger proof. Prototype roughly **3–7 engineering days**, then **1–2 weeks** of semantic/regression hardening. |
| Preserve exact integer facts through address arithmetic and byte gathers | `backend/llvm/expr-bytes.ts` (`emitBytesIndex`, `emitScopedBytesGet`), `integer-values.ts`, `wrapping-sums.ts`, IR integer-range/counting-loop analyses | Complement the first change: once a valid byte read is proved, `[0,255]` and a LUT-length guard should cover the second access. Avoid repeated double↔integer round trips after an exactness proof. Roughly **2–5 days** for a focused extension; range/overflow coverage may grow this. |
| Better fixed coefficient scalar replacement/unrolling | `backend/llvm/emit-statements.ts`, loop/alias metadata and native LLVM optimization pipeline | 36 independent accumulators could remain in scalar/vector registers after proof that the fresh factor view does not escape/alias and all constant indices are valid. Keep **each coefficient's pixel-add order unchanged**. Roughly **1–3 weeks**, with register-pressure/code-size risk, especially x86's smaller baseline SIMD register file. Lower certainty than bounds work. |
| Faster trig, RC, global fast-math or reassociated pixel reductions | `packages/runtime/src/scr_ieee754.c`, `scr_lib.c`; ownership emission | **Not recommended for this workload.** Sampling gives little upside for trig/RC. Approximation, FMA contraction and reassociation are not legitimate JS-semantic wins here. |

A sound guard would establish positive integral dimensions within a safe exact range; RGBA coverage of `4*width*height`; cosine-table coverage; byte-LUT length; and stable/disjoint storage where relevant. Then integer pointer increments and unchecked accesses are valid in the fast copy; preserve the original checked path for nonintegral, negative, huge, NaN/out-of-range values. Existing immutable typed-array headers and alias-scoped versions are useful foundations. This benefits image filters, histograms, stencil/array kernels and LUT-based transforms rather than recognizing BlurHash by name. Simply increasing versioner budgets or deleting bounds checks is not a proposed solution.

The profile cannot promise a particular speedup. On Linux, only a genuine few-percent gain is needed to move beyond the stronger-Go tie, but a publishable story should demand a reproducible margin (say 15–20%) across machines/repeats and further Go review. The current Mac win comes from a combination of specialized fixed-component code, SLP and less runtime guarding; it does not establish that scriptc generally beats Go on image workloads. No upstream issue or PR was filed.

## Product relevance and recommendation

This is a real encoding algorithm, but **full-resolution BlurHash is a weaker product story than the timings initially suggest**. A 4×3 placeholder only represents low-frequency color. Downsampling before encoding is an obvious application alternative; it changes which pixels are encoded and can change the exact hash, so it is not substituted into the primary same-input comparison. A separate 32² diagnostic uses 100 warmups and 1,000 iterations: Node median **0.026 ms**, release **0.012 ms**, Go component-first **0.014 ms**. Its hash differs from full-size inputs because the pixels differ. At that size there is no meaningful CPU-heavy request to justify a native route; image decode/resize can dominate instead. Earlier five-warmup small-input samples are retained separately and are not used for this conclusion.

Also, a BlurHash string is not itself `blurDataURL`: [Next's Image contract](https://nextjs.org/docs/app/api-reference/components/image#blurdataurl) expects an image data URL. A production pipeline must decode the hash to a tiny raster and encode a supported image/data URL (or use a BlurHash-aware client). That work is outside this kernel. Next recommends a very small placeholder image, 10px or less. We therefore have **not** demonstrated an end-to-end `next/image` placeholder improvement.

**Recommend a short upstream range-analysis spike if the orchestrator values a compact, already mostly static numeric repro.** Native beats Node materially on both hosts and beats a fair direct Go port on M4; the robust Linux Go win is still unachieved. If another candidate has a wider cross-platform lead and a less avoidable CPU workload, prefer that one. An honest eventual claim would specify “full-resolution 4×3 BlurHash encoding of opaque decoded pixels,” not image uploads or placeholder generation generally.

## Reproduce

Run from repository root (program binaries/generated full code stay in `/tmp`):

```sh
pnpm install --frozen-lockfile
find node_modules/.pnpm -type f \( -name tsc-ts -o -name tsc -o -name scriptc-comptime \) -exec chmod +x {} +
SCRIPTC_CHECKER_SERVER=0 packages/next-scriptc/node_modules/.bin/scriptc build examples/scout/blurhash/blurhash.ts -o /tmp/scout-blurhash-release --optimization release --keep-llvm
SCRIPTC_CHECKER_SERVER=0 packages/next-scriptc/node_modules/.bin/scriptc build examples/scout/blurhash/blurhash.ts -o /tmp/scout-blurhash-speed --optimization speed --keep-llvm
(cd examples/scout/blurhash && /opt/homebrew/bin/go build -o /tmp/scout-blurhash-go .)
BLURHASH_NODE=/Users/noah/.local/share/fnm/node-versions/v24.22.0/installation/bin/node BLURHASH_GO=/opt/homebrew/bin/go /Users/noah/.local/share/fnm/node-versions/v24.22.0/installation/bin/node examples/scout/blurhash/run.mjs /tmp/blurhash-results.json
SCRIPTC_CHECKER_SERVER=0 packages/next-scriptc/node_modules/.bin/scriptc coverage examples/scout/blurhash/blurhash.ts --explain-dynamic
SCRIPTC_CHECKER_SERVER=0 packages/next-scriptc/node_modules/.bin/scriptc build examples/scout/blurhash/blurhash.ts --emit llvm -o /tmp/scout-blurhash.ll
SCRIPTC_CHECKER_SERVER=0 packages/next-scriptc/node_modules/.bin/scriptc build examples/scout/blurhash/blurhash.ts --emit asm -o /tmp/scout-blurhash.s
```

Installed 0.4.6 rejects `--optimization` together with non-executable `--emit`, despite the newer checkout's CLI docs; the emitted assembly above uses the default release posture. For native sampling, run `2048 200 5` in the background, then `/usr/bin/sample PID 5 1 -file /tmp/blurhash.sample`, and wait for the process. V8 profile: `node --cpu-prof --cpu-prof-dir=/tmp --cpu-prof-name=blurhash.cpuprofile examples/scout/blurhash/blurhash.ts 2048 100 5`. Disassembly: `node --print-opt-code --print-opt-code-filter=encode --trace-opt --trace-deopt ... 512 10 5`; inspect the final non-OSR code too. Go: set `BLURHASH_GO_PROFILE=/tmp/blurhash.pprof` and run `port`/`components 2048 100 5` or `library 2048 50 5`, then `go tool pprof -top`; `go tool objdump -s main.encode /tmp/scout-blurhash-go` shows both direct loops.

Linux preparation (the Linux run itself is already complete; do not automatically rerun against this scout's spent budget):

```sh
npm pack @scriptc/runtime-linux-x64-musl@0.4.6 --pack-destination /tmp --silent
mkdir -p /tmp/scout-blurhash-linux-runtime
tar -xf /tmp/scriptc-runtime-linux-x64-musl-0.4.6.tgz -C /tmp/scout-blurhash-linux-runtime --strip-components=1
SCRIPTC_CHECKER_SERVER=0 SCRIPTC_TARGET=x86_64-linux-musl SCRIPTC_RUNTIME_PACK=/tmp/scout-blurhash-linux-runtime packages/next-scriptc/node_modules/.bin/scriptc build examples/scout/blurhash/blurhash.ts -o /tmp/scout-blurhash-linux-release --optimization release --keep-llvm
SCRIPTC_CHECKER_SERVER=0 SCRIPTC_TARGET=x86_64-linux-musl SCRIPTC_RUNTIME_PACK=/tmp/scout-blurhash-linux-runtime packages/next-scriptc/node_modules/.bin/scriptc build examples/scout/blurhash/blurhash.ts -o /tmp/scout-blurhash-linux-speed --optimization speed --keep-llvm
(cd examples/scout/blurhash && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 /opt/homebrew/bin/go build -o /tmp/scout-blurhash-linux-go .)
(cd examples/scout/blurhash && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 /opt/homebrew/bin/go build -o /tmp/scout-blurhash-linux-rss ./rss)
```

[`sandbox.mjs`](../examples/scout/blurhash/sandbox.mjs) consumes only a local ignored OIDC env file, uploads the explicit hash-recorded files, runs the largest size, records raw output/provenance and always stops in `finally`. It uses the existing `@vercel/sandbox` dependency; there is no deployment or remote credential upload.
