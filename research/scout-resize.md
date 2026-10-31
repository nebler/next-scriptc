# Resize scout: correct pixels, no win over both Node and Go yet

2026-10-31. Base `2e520061a402f5484fd7d6d9508383a679beb161`, branch `t3/scout-resize-benchmark`. No deployment or upstream change.

**Recommendation:** do not select resizing as an already promising performance claim. It is a credible general typed-array compiler project, with substantial visible overhead, but beating idiomatic Go remains unproven. Native release wins the box kernel against Node on the M4 Pro, loses that advantage on Linux, and loses every equivalent-algorithm comparison against Go. Four-tap bilinear loses to both on both machines. A win against Go's wider tent filter would compare different work and image quality.

## Workload and fairness

The files in [`examples/scout/resize`](../examples/scout/resize/) contain synchronous, decoded, tightly packed RGBA kernels. There is no HTTP, upload, decode, encode, filesystem operation, input generation, checksum, or destination allocation in the timed region. Every call writes the entire reused destination. An observed byte is consumed after each timed call; full output is hashed and saved after timing. Process peak RSS includes the runtime, the input/destination, fixture setup, warmup, checksum, and file output; it is **not** incremental kernel memory.

- **Box:** the route's exact per-channel integer average and floor. The main harness parameterizes the block width as `width / size`: 4×4 for the first two sizes, 8×8 for 4096→512. The original route uses literal `4` bounds; [`literal4.mjs`](../examples/scout/resize/literal4.mjs) restores that constant in **both** TS and Go and measures it separately. The primary Mac table uses literal-4 results at the first two sizes and the generalized 8×8 result at the largest. This avoids silently assigning parameterized-loop performance to the literal route.
- **Bilinear:** center-sampled four-tap interpolation, clamp-to-edge, float64 arithmetic, `floor(value + 0.5)`. At these even integral shrink ratios, each coordinate has half-pixel weights. It reads four source pixels per output, independent of shrink factor. It is a common cheap resize, but it does **not** antialias like an area/tent filter; it cannot replace the box while claiming unchanged semantics or quality. Arbitrary ratios and transparency/color-space quality were not evaluated.
- **Inputs:** deterministic opaque RGBA noise from uint32 LCG state 42 (`1664525 * state + 1013904223`); R/G/B use bits 24/16/8, A=255. Dimensions are squares: 1024→256, 2048→512, 4096→512, with 4/16/64 MiB decoded source buffers. Opaque pixels also satisfy Go `image.RGBA`'s premultiplied representation.
- **Identical algorithms:** one typed TS source per experiment is executed unchanged by Node and scriptc; Go is a straightforward slice/int/float64 port, with ordinary bounds checks and default optimizing `go build`, no unsafe code, cgo, parallelism, or disabled checks. Every emitted byte is compared with `Buffer.equals` between runtimes, not just a sampled checksum. Literal and parameterized box hashes also match. All largest Linux hashes match Mac.
- **Library controls:** `golang.org/x/image/draw` is pinned at **v0.32.0** in `go.mod`/`go.sum`. `draw.BiLinear.Scale` is a separable antialiased tent filter, with coefficient setup and temporary allocations included on every call. `draw.ApproxBiLinear.Scale` is the closer four-neighbor downsampling control. Both use `draw.Src`, concrete `*image.RGBA`, and reused destination storage. Their bytes differ from our bilinear, so **their numbers are timing comparisons only**, never evidence of an equivalent-algorithm speedup. We do not time a deliberately generic per-pixel image interface port. The [pinned package documentation](https://pkg.go.dev/golang.org/x/image@v0.32.0/draw) distinguishes ApproxBiLinear's four-neighbor downsample from the wider BiLinear tent kernel.

## Method

Mac: Apple M4 Pro, macOS arm64, Node **24.22.0** at the requested fnm path, scriptc **0.4.6**, Go **1.27.3** at `/opt/homebrew/bin/go`. Default release and speed, `--node-islands=off`, checker server disabled. Cold builds excluded. Each fresh process performs **20 warmup calls + 40 individually timed calls**. Three sequential fresh-process rounds rotate runtime order: Node/release/speed/Go, Go/speed/Node/release, release/Node/Go/speed. Library controls run once per size per round. Thus each Mac cell has **120 measured calls**; all are retained. Median is the upper middle order statistic; p95 is nearest rank. RSS is the maximum of the three `/usr/bin/time -l` process peaks. No application benchmark ran concurrently. The small ApproxBiLinear follow-up was separate; its elevated p95s are retained.

Host load averages were **3.91/3.97/4.78 → 4.61/4.21/4.80** for the main matrix. This is a shared Mac without affinity or thermal controls; treat differences as indicative, not publication-quality cross-language claims. Raw per-call samples, process orders, versions, hashes, build commands, coverage, and RSS are committed in [`mac-results.json`](../examples/scout/resize/mac-results.json), [`mac-literal4-results.json`](../examples/scout/resize/mac-literal4-results.json), and [`mac-approx-results.json`](../examples/scout/resize/mac-approx-results.json). The Go source subsequently gained the isolated ApproxBiLinear case; the original measured box/bilinear bodies did not change.

## Mac results

Each runtime cell is **median ms / p95 ms / peak RSS MiB**. Sizes denote square widths.

| Kernel | Size | Node | Native release | Native speed | Go hand port |
| --- | --- | ---: | ---: | ---: | ---: |
| Box, literal 4 | 1024→256 | 3.469 / 3.805 / 85.5 | 3.119 / 3.263 / 6.1 | 3.097 / 3.189 / 6.1 | 2.303 / 2.470 / 9.7 |
| Box, literal 4 | 2048→512 | 14.288 / 15.656 / 101.4 | 12.382 / 12.663 / 18.8 | 12.432 / 12.801 / 18.8 | 9.304 / 10.627 / 22.5 |
| Box, general 8 | 4096→512 | 63.139 / 78.389 / 149.3 | 49.007 / 49.965 / 66.8 | 49.121 / 49.826 / 66.8 | 27.069 / 29.255 / 70.5 |
| Bilinear | 1024→256 | 0.564 / 0.600 / 85.4 | 0.654 / 0.688 / 6.1 | 0.655 / 0.683 / 6.1 | 0.402 / 0.423 / 9.8 |
| Bilinear | 2048→512 | 2.215 / 2.353 / 101.8 | 2.659 / 2.799 / 18.9 | 2.654 / 2.741 / 18.9 | 1.601 / 1.739 / 22.4 |
| Bilinear | 4096→512 | 2.290 / 2.413 / 150.1 | 2.682 / 2.834 / 66.9 | 2.687 / 2.830 / 66.9 | 1.643 / 1.728 / 70.8 |

Release time ratios, **lower is better**; above 1 loses:

| Kernel | Size | Native / Node | Native / Go |
| --- | --- | ---: | ---: |
| box | 1024→256 | 0.899× | 1.354× |
| box | 2048→512 | 0.867× | 1.331× |
| box | 4096→512 | 0.776× | 1.810× |
| bilinear | 1024→256 | 1.159× | 1.627× |
| bilinear | 2048→512 | 1.201× | 1.661× |
| bilinear | 4096→512 | 1.171× | 1.632× |

The parameterized-4 control is also retained: 1024→256 Node/release/speed/Go medians **4.410/3.414/3.400/2.496 ms**; 2048→512 **18.371/13.632/13.708/9.911 ms**. Constant bounds help all three implementations but do not change the winner. Release/speed are effectively tied; small reversals are not meaningful improvements.

Library controls, **different outputs**; same median/p95/RSS notation:

| Size | Go BiLinear tent | Go ApproxBiLinear four-neighbor |
| --- | ---: | ---: |
| 1024→256 | 4.572 / 4.858 / 35.4 | 0.476 / 0.825 / 9.7 |
| 2048→512 | 20.373 / 21.346 / 120.1 | 2.003 / 4.360 / 22.5 |
| 4096→512 | 72.050 / 74.060 / 328.8 | 1.971 / 4.798 / 70.5 |

The tent filter's greater work and temporary storage explain why comparing its 72 ms to our 2.7 ms bilinear would be a poor compiler story. Even the closer ApproxBiLinear library control is faster than native here despite its differing rounding/coordinate behavior.

## Linux confirmation, largest size only

One ephemeral Vercel Sandbox, **1 vCPU**, Linux x64 Intel Xeon @ 2.90 GHz, Node **24.22.1**, scriptc **0.4.6**, baseline x86-64 release/speed. Go is the same **1.27.3** toolchain cross-compiled locally with `GOOS=linux GOARCH=amd64 CGO_ENABLED=0`, `GOAMD64=v1`, and the pinned library. This avoids toolchain installation inside the time budget. Every process gets 20 warmups and **40 measured iterations**, one fresh-process round; it is a confirmation, not a repeated Linux study. VM load **0.56/0.13/0.04 → 0.79/0.25/0.09**. RSS uses `/usr/bin/time -v` (KiB converted to MiB).

| Kernel | Runtime | Median ms | p95 ms | Peak RSS MiB |
| --- | --- | ---: | ---: | ---: |
| box | node | 115.461 | 118.490 | 140.9 |
| box | release | 154.078 | 154.541 | 67.5 |
| box | speed | 154.298 | 158.293 | 67.5 |
| box | go | 49.383 | 49.624 | 68.4 |
| bilinear | node | 7.420 | 7.544 | 142.2 |
| bilinear | release | 12.028 | 13.249 | 67.4 |
| bilinear | speed | 11.874 | 12.227 | 67.5 |
| bilinear | go | 7.664 | 7.772 | 68.4 |
| ximage | go | 227.506 | 237.401 | 262.2 |
| ximage-approx | go | 6.570 | 6.663 | 68.7 |

Release/Node and release/Go: **box 1.334× / 3.120×; bilinear 1.621× / 1.569×**. No equivalent-algorithm native win. Speed does not change that conclusion.

The VM **stopped successfully** after **77.722 s**, upper-bound allocation **0.02159 vCPU-hours** (reported active CPU 71.786 s), below the 0.05 cap. Hard lifetime was 180 s on one vCPU; command deadline 160 s, cleanup in `finally`, persistence off. The token was loaded only in the local SDK process from an ignored `.env.local` copy; it was never written to the VM or committed. [`linux-results.json`](../examples/scout/resize/linux-results.json) and [`linux-provenance.json`](../examples/scout/resize/linux-provenance.json) retain the results, source hashes, successful steps, and stopped state. No deployment was made. Later controller changes only add literal-4 source/size selection; the Linux kernel and TS runner bytes still match their recorded hashes.

## Generated code: actual obstacles

Both the main and literal-4 programs report **57/57 statements static, 0 dynamic-tier functions/statements, 0 demotions**. This is not third-party dynamic dispatch. Findings below come from the installed 0.4.6 compiler's retained `.ll` and **optimized** arm64 `--emit asm`, plus Go objdump and Node's final TurboFan dump. The retained LLVM IR is pre-optimization; the assembly checks prevent attributing eliminated loads to the runtime hot path.

**Box still computes addresses and sums as unboxed doubles.** `width`, `size`, `scale`, y/x/dy and `sum` are f64; c and the guarded innermost dx can be integer inductions. Every input byte in the parameterized fast inner loop still requires double address construction, conversion to i64 and back, exact-integrality comparison, an unsigned bounds comparison, byte-to-double conversion and floating addition. The literal-4 diagnostic retains the same essential address validation. The out-of-range read must propagate JS `undefined` as NaN to arithmetic; output writes must ignore invalid indices. Those semantics explain the checked fallback, but not why valid image loops cannot select a much cheaper guarded region.

Representative **optimized** box inner loop (ordinary integer dx path):

```asm
ucvtf d25, x15          ; dx -> number
fadd  d25, d24, d25
fmul  d25, d25, d5     ; pixel -> byte index
fadd  d25, d25, d22    ; channel
fcvtzs x16, d25
scvtf d26, x16
fcmp  d25, d26         ; exactly integral?
ccmp  x16, x14, #2, eq ; within src length?
b.hs  LBB3_18          ; NaN fallback
ldr   x17, [x0, #24]   ; source data pointer
ldr   b25, [x17, x16]
ucvtf d25, d25
fadd  d21, d21, d25
```

The source header length is hoisted outside the innermost dx loop, but a data-pointer load remains next to the byte read. There is no vectorized pixel accumulation here. Output `floor(sum / scale²)` then executes general JS ToUint32-to-byte coercion, including exponent/sign manipulation and selection for values outside the cheap i64 conversion range. In this image contract sums and outputs are bounded integers, but that proof has not reached this path.

**Bilinear already versions the four-channel loop**, rather than having no fast path. At each output pixel it builds five affine range checks (four read bases plus destination), exact-integer/range checks on those bases, and a src/dst disjointness test (LLVM hoists the latter). The fast copy unrolls the four channels and removes their individual read bounds checks. Its address guard includes NEON `.2d` calculations, but the four-channel interpolation and byte conversions remain scalar; this is not SIMD interpolation across output pixels. The large per-pixel guard remains in optimized assembly. Each channel's rounded result still has the general byte-store coercion sequence. Hoisting a valid image-region guard outside x/y, propagating integer bases, and narrowing those stores are more specific targets than merely asking LLVM to vectorize.

**No per-iteration RC or heap boxing in either hot kernel.** The borrowed kernel bodies have no `scr_bytes_retain*`, `scr_bytes_release*`, dynamic number boxing, allocation, or runtime element-get calls. Ownership wrappers exist, and setup/logging have runtime work, but they do not explain these loop timings. `speed` cannot recover a missing numeric/bounds proof just by inlining RC. The async histogram's ownership problem should not be assumed to explain this synchronous reduction.

**Go is ordinary scalar compiled code, with bounds checks.** `go build -gcflags=-d=ssa/check_bce/debug=1` identifies input and output checks in both kernels. Objdump shows box integer MADD/MUL/ADD addressing, `MOVBU`, integer `ADD` accumulation and `SDIV`; one unsigned comparison per load branches to `runtime.panicBounds` on failure. Bilinear also uses integer address bases and byte loads converted to float64, with scalar floating interpolation; no hand SIMD. Go may fuse floating expressions under its normal rules (the dump contains FMA-family instructions); the tested half-pixel cases remain byte-identical. We do not propose enabling unsafe reassociation/FMA for arbitrary JS as a fix.

**V8's final TurboFan box uses speculative int32 arithmetic**, with `smull`/`adds`, overflow deopt exits, byte loads and bounds checks; it also guards integral `width / size`. It is scalar and has several checks in the inner path, which helps explain why it can lose to native on arm64 despite native's doubles. Bilinear mixes integer address construction with double interpolation and type/bounds/deopt guards. These are extra diagnostic processes, not timed result samples; early Maglev/OSR deopts in the logs are not asserted to be the cause of the warmed numbers. No observation establishes that LLVM auto-vectorization alone will beat either implementation.

## General compiler changes and effort

Source inspection used `/Users/noah/code/next-scriptc/vendor/scriptc` at **`ade56e0c73f0e7db30d94e0c574e4eb4a54b0c82`**, whose CLI package declares 0.4.6. These are investigation locations, not a claim that every local source optimization ships in the npm artifact:

- `packages/compiler/src/backend/llvm/expr-bytes.ts`: `emitBytesIndex` exact-index/bounds guards; `emitScopedBytesGet` NaN-coded invalid reads; `emitToUint32` already has a cheap route when integer range facts exist. `emit-statements.ts`'s `bytesSet` emission forwards bounds and alias facts without ownership moves.
- `backend/llvm/bytes-loop-versions.ts`: small synchronous-loop versions with guarded invariant terms, affine range checks and alias scopes. `affineShape` recognizes **positive literal multipliers** of a counter; runtime strides such as `row * width` are a more general case. The recognizer has explicit cost/check budgets and avoids unproductive nested-loop duplication. Bounds/versioning and broader loop-nest integerization must be designed together, rather than deleting guards unconditionally.
- `backend/llvm/bytes-bounds.ts`: existing relational proofs for length/counter offsets; `backend/llvm/counted-loops.ts`, `backend/llvm/integer-values.ts` and `packages/compiler/src/ir/integer-loops.ts`: integer induction/ranges. The latter limits guarded nested-loop copies and node budgets. `backend/llvm/borrowed-inputs.ts` already supports the ownership-free synchronous case observed here.

My engineering estimates, **not measured speedup promises**:

1. **Guarded nested numeric regions and runtime-stride range proofs: roughly 1–2 weeks** for a contributor familiar with this backend, including semantic tests. Establish finite, positive integral dimensions/strides, bounded integer intermediate products, sufficient byte lengths, stable backing/ownership and necessary alias relationships once per function/loop nest. Execute integer-address fast loops under that guard and retain the original JS path otherwise. This is useful for image kernels, convolutions, matrix-style loops, audio and typed-array numerics. Merely adding a runtime multiplier to the affine matcher without overflow/integrality and nested-loop facts is insufficient.
2. **Carry byte/sum/floor range facts into arithmetic and stores: several days to a week**, partly overlapping (1). Valid byte loads are 0..255; bounded box reductions can use exact integer accumulation. A bounded finite integral floor result should not need the full general ToUint32 machinery. Keep NaN, infinities, signed zero, fractional indices, out-of-range ignored writes, overflow, zero-trip loops and alias semantics on the fallback path. Never use blanket fast-math or remove checks based only on this fixture.
3. **Profitable SIMD across pixels/channels and reductions: another 1–3+ weeks**, depending on how much existing LLVM vectorization recovers after (1)/(2). Expose integer loops, non-alias facts and exact bounded reductions before judging whether a new emitter is needed. No native image-library substitution, Go slowdown, changed filter, reduced precision, or semantic-changing source rewrite counts as a compiler win.

For the largest workload, release must improve **more than 1.81× on Mac and 3.12× on Linux** to beat the current Go box port, while bilinear needs about **1.63× and 1.62×** to beat both respective baselines. The guard/coercion overhead makes that plausible enough to prototype, but there is **no measured general compiler patch or demonstrated ceiling here**. A compiler engineer could first prototype guard hoisting plus store range propagation on bilinear, demand byte parity on edge cases, then rerun all baselines. Its weak downsampling quality limits the thumbnail story; a matched antialiased separable filter would be a stronger follow-up if a general numeric improvement lands. For this scouting round, return the loss honestly and rank this below a candidate with an existing same-work Linux win.

## Reproduce

From the repo root (Node 24 on PATH):

```sh
pnpm install --frozen-lockfile
# This pnpm install lost executable mode bits on checker helpers on this Mac:
find node_modules/.pnpm -type f \( -name tsc-ts -o -name tsc -o -name scriptc-comptime \) -exec chmod +x {} +
/opt/homebrew/bin/go -C examples/scout/resize mod download
REPRO_GO=/opt/homebrew/bin/go node examples/scout/resize/run.mjs
REPRO_GO=/opt/homebrew/bin/go node examples/scout/resize/literal4.mjs
# Equivalent to the separately recorded ApproxBiLinear follow-up:
REPRO_GO=/opt/homebrew/bin/go node examples/scout/resize/run.mjs --skip-build --kinds ximage-approx --output examples/scout/resize/mac-approx-results.json
# Uses the existing ignored credential file locally; VM hard cap is 0.05 vCPU-hours:
node --env-file=/Users/noah/code/next-scriptc/.env.local examples/scout/resize/sandbox.mjs
```

Codegen diagnostics (artifacts ignored):

```sh
SCRIPTC_CHECKER_SERVER=0 packages/next-scriptc/node_modules/.bin/scriptc build examples/scout/resize/bench.ts --optimization release --node-islands=off --keep-llvm -o examples/scout/resize/.artifacts/release
SCRIPTC_CHECKER_SERVER=0 packages/next-scriptc/node_modules/.bin/scriptc build examples/scout/resize/bench.ts --optimization release --node-islands=off --emit asm -o examples/scout/resize/.artifacts/release.s
/opt/homebrew/bin/go tool objdump -s 'main\.(box|bilinear)$' examples/scout/resize/.artifacts/go
/opt/homebrew/bin/go -C examples/scout/resize build -gcflags=-d=ssa/check_bce/debug=1 -o .artifacts/go-bce .
WIDTH=4096 SIZE=512 KIND=box WARMUP=30 ITERATIONS=40 node --print-opt-code --print-opt-code-filter=box --trace-opt --trace-deopt examples/scout/resize/bench.ts
# Repeat the last command with KIND=bilinear and filter=bilinear.
```

The harness and literal-bound diagnostic are the verification: complete byte comparisons, deterministic hashes across hosts, and all timing samples retained. No route, adapter, compiler, or project dependency was changed; the pinned Go module is local to this scout.
