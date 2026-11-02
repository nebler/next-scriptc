# Vector retrieval: fair Go controls and an HTTP before measurement

2026-10-31. Next.js adapter only; no Next.js or scriptc fork changes, no push,
merge or preview deployment. Method was registered in [benchmarks.md](benchmarks.md)
before implementation/measurement. Measured scout source: `49e130a`; route source:
`52f0a6a`; final synchronous-kernel route source: `98463cc`.
All three experiments completed; the first HTTP implementation is retained too.

The original native-versus-plain-Go scouting claim does **not** survive comparison
with the stronger Go SIMD control on this Linux host: at 100k×768, native imul
24.354 ms versus Go SIMD 22.441 ms (native 1.085× Go, lower is better).
Stock natural code is still 402.545 ms. The scalar unroll loses to plain Go in the Linux scout/first HTTP run, and
wins modestly in the second HTTP run on another VM. Keep both observations.

## What is compared

- **Go plain:** idiomatic row slices, signed widening multiply and int32 sum;
  query sliced once to prove bounds. The original scout loop remains in
  `examples/scout/vectors/vectors.go`; the new shared implementation lives in
  `examples/demo/go/vectors` and is used unchanged by the scout and HTTP server.
- **Go unrolled:** four independent scalar accumulators, four elements per
  iteration, scalar tail. Pure Go, no unsafe/assembly/cgo. It is a common
  optimization to try, not a guarantee of faster code on every architecture.
- **Go SIMD:** **Go 1.27.3's experimental `simd/archsimd`**, explicitly enabled
  with `GOEXPERIMENT=simd`. NEON 128-bit on arm64; feature-checked AVX2 256-bit
  on amd64. Signed bytes are widened before multiplication; AVX2 uses
  signed int16 pair dot products into int32; NEON widens products and sums.
  Multiple vector accumulators and scalar tails; no threads or cgo. A missing
  backend is unavailable/503, never a silently relabelled scalar fallback.
  This is handwritten code against the official experimental intrinsics API,
  not a third-party library call or automatic Go vectorization.

The [Go release notes](https://go.dev/doc/go1.27),
[official SIMD introduction](https://go.dev/blog/simd-experiment) and
[architecture API article](https://go.dev/blog/archsimd) confirm availability
on both targets; the installed toolchain's `go doc` and actual builds/tests
were also checked. This is a credible explicit option for a performance-minded
Go developer on this pinned toolchain, **not evidence of widespread production
adoption or a stable API**. The portable `simd.Int8s.Mul` truncates to int8;
`archsimd` gives the widening operations needed for exact scoring.

Other options investigated: [vek](https://github.com/viterin/vek) documents
float32/float64/bool and x86 acceleration, so it does not supply this int8/NEON
comparison. [go-highway](https://github.com/ajroetker/go-highway) has integer
and float dot products and runtime dispatch; it is a credible third-party
alternative, but was not measured here. Gonum BLAS's floating dot products
also do not supply an int8 baseline. The chosen package ships with Go, so the
version pin is Go **1.27.3**; no new Go modules or npm dependencies were added.
Existing x/crypto stays pinned at v0.45.0. All measured Go functions are in one
experimental build; offline disassembly checks show that **all four scalar
functions have the same instructions as default non-experimental Go on both
architectures**, after normalizing relocated addresses. Evidence:
[vector-go-codegen.json](benchmarks/vector-go-codegen.json).

Node measures the shared scout source using number accumulation, i32 coercion,
and `Math.imul`. At the large Linux size the fastest of those three is i32
(127.927 ms); imul is 134.185 ms. These are plain JS idioms, not a claim that no
other hand-tuned JS loop can be faster. Native uses ordinary release, portable
x86-64 baseline/SSE2, without AVX target flags or CPU dispatch. Go explicitly
opts into AVX2. This asymmetry is disclosed because the question is how native
compares with a Go developer's explicit SIMD option, not equal instruction sets.

## Route and input design

`POST /api/heavy/vectors` receives `{ "embedding": [768 signed int8 integers] }`.
The imul control is `/api/heavy/vectors-imul`; only the multiply differs.
Both run the same files in Node and scriptc. Validation rejects missing/null/
non-array input, wrong dimension, fractions, strings, booleans, nonfinite or
out-of-range elements; the text is capped at 8192 characters. Query storage is
an Int8Array. JSON is convenient for a service-to-service quantized embedding
request and requires no base64 signed-byte convention; the benchmark body is
**2,813 bytes** for the benchmark fixture. The caller has already quantized the query with the corpus's
quantization scheme. This endpoint does not generate embeddings or quantize
a float model output inside the timing.

The immutable row-major corpus is **100,000×768 = 76,800,000 bytes (73.242 MiB)**.
Xorshift32 seed 0x12345678, values uint32%255−127, generated at module/server
initialization. The route query fixture has its own seed and covers −128.
This is a synthetic resident-index retrieval primitive, not a model-quality,
recall, cosine-normalization, ANN or external-vector-database benchmark.
A real app would load a versioned tenant corpus from storage. Generation here
makes every environment reproduce the same data without shipping random bytes;
its duration is measured separately in `x-vector-init-ms`. Both TS routes share
one imported corpus module. Go initializes its identical corpus before listening.

The [documented Vercel limits](https://vercel.com/docs/functions/limitations)
are 2 GB/1 vCPU by default and a 250 MB uncompressed Function bundle, with a
4.5 MB request/response limit. This corpus comfortably fits default memory;
even its raw bytes are below the bundle ceiling, but generating at init avoids
an unnecessary 77 MB fixture and transfer. No large-function beta is required.
The complete grouped Mac native binary is about 10 MiB; no preview bundle size
or hosted memory measurement is claimed. Grouped app memory includes other
routes/sidecars, so corpus size alone is not a Function's total RSS.

Scoring is exhaustive signed dot product with `(sum + a*b)|0`. Its worst-case
magnitude is 768×128×128 = 12,582,912, safely inside int32. Top-10 insertion
selection is descending score, ascending ID on ties; result arrays are request
local. Return `{"results":[{"id":...,"score":...},...]}` with `no-store`.
Go's two matching paths take `?kernel=plain|unrolled|simd` (default unrolled).
All five runtime/kernel targets return byte-identical successful/error bodies
for both route paths in the registered cases.
No result is memoized; independent tests verify that changing the query changes
the result and compare single-coordinate retrieval to a separate full-sort oracle.

## Scout method and evidence

Mac M4 Pro, Node 24.22.0, Go 1.27.3, scriptc 0.4.6. Two reversed process orders,
10 warmups + 20 samples each. **High, changing shared-host load** (28.59 initially)
and the local native build's early overlap with scout setup/possibly small-case
timing make these values indicative. No sample was dropped or selectively rerun.

Linux one 1-vCPU iad1 Sandbox, Node 24.22.1, cross-built Go 1.27.3 and public
scriptc 0.4.6 Linux runtime pack. Two reversed orders, 5 warmups + 10 samples each.
Kernel timing excludes initialization, serialization and validation; includes
buffer reset, all dot products and selection. Fresh process per row/order.
Peak process RSS includes allocation/init/JIT. Float32 storage is widened to
float64 before products/accumulation. Unroll/SIMD reassociation is labelled:
require identical top-10 IDs and score error ≤1e-10+1e-12×|reference|. Int8 scores
are exact. All checks passed. Raw evidence retains every sample/error/RSS:
[Mac](benchmarks/vector-scout-mac.json),
[Linux](benchmarks/vector-scout-linux.json),
[controller](benchmarks/vector-scout-linux-controller.json).

Tables pool both processes: 40 Mac/20 Linux samples, nearest-rank p50/p95.
They are descriptive single-host observations, without confidence intervals.
The float SIMD result uses float64 arithmetic, not a faster float32 sum substituted
for JS semantics. All float IDs agree; the small nonzero score errors remain
visible in [the offline audit](benchmarks/vector-audit.json).

### int8, 100,000 × 768

| Variant | Mac p50 / p95 ms | Linux p50 / p95 ms |
| --- | ---: | ---: |
| node-number | 76.299 / 86.699 | 153.087 / 258.442 |
| node-i32 | 66.060 / 70.091 | 127.927 / 205.811 |
| node-imul | 71.270 / 126.685 | 134.185 / 199.929 |
| go-plain | 36.242 / 65.693 | 67.815 / 79.410 |
| go-unrolled | 25.405 / 40.921 | 91.479 / 116.876 |
| go-simd | 5.367 / 15.575 | 22.441 / 26.899 |
| native-natural | 711.608 / 1388.865 | 402.545 / 418.707 |
| native-imul | 3.221 / 7.349 | 24.354 / 27.814 |

### float, 100,000 × 768

| Variant | Mac p50 / p95 ms | Linux p50 / p95 ms |
| --- | ---: | ---: |
| node-float | 80.723 / 266.424 | 159.322 / 205.590 |
| go-plain | 95.002 / 184.516 | 282.370 / 306.433 |
| go-unrolled | 33.861 / 78.020 | 173.863 / 187.392 |
| go-simd | 19.849 / 45.889 | 59.335 / 64.220 |
| native-float | 72.279 / 100.281 | 104.084 / 112.838 |

### int8, 20,000 × 384

| Variant | Mac p50 / p95 ms | Linux p50 / p95 ms |
| --- | ---: | ---: |
| node-number | 7.601 / 8.056 | 16.491 / 28.592 |
| node-i32 | 6.473 / 7.220 | 13.530 / 18.181 |
| node-imul | 6.470 / 7.646 | 13.657 / 75.047 |
| go-plain | 3.640 / 4.077 | 5.888 / 6.615 |
| go-unrolled | 2.522 / 2.572 | 8.390 / 11.606 |
| go-simd | 0.555 / 0.566 | 1.956 / 2.511 |
| native-natural | 63.684 / 70.679 | 41.505 / 44.612 |
| native-imul | 0.359 / 0.390 | 2.429 / 2.700 |

### float, 20,000 × 384

| Variant | Mac p50 / p95 ms | Linux p50 / p95 ms |
| --- | ---: | ---: |
| node-float | 9.043 / 14.280 | 17.537 / 28.118 |
| go-plain | 7.250 / 9.437 | 18.824 / 28.960 |
| go-unrolled | 3.224 / 6.832 | 9.627 / 18.076 |
| go-simd | 2.053 / 3.561 | 5.664 / 6.390 |
| native-float | 5.544 / 8.575 | 10.528 / 10.663 |

### Initial async-loop HTTP implementation (stock 0.4.6)

| Variant / route | C=1 p50 / p95 ms | C=16 req/s | CPU ms/request | Tree RSS MiB |
| --- | ---: | ---: | ---: | ---: |
| node / vectors | 128.864 / 131.257 | 6.910 | 129.000 | 208.195 |
| node / vectors-imul | 129.728 / 174.306 | 7.604 | 140.250 | 200.969 |
| native / vectors | 502.485 / 573.294 | 1.969 | 510.750 | 322.957 |
| native / vectors-imul | 420.606 / 456.039 | 2.367 | 426.000 | 328.582 |
| go-plain / vectors | 58.769 / 59.992 | 16.804 | 58.500 | 217.313 |
| go-unrolled / vectors | 82.951 / 86.942 | 12.059 | 83.250 | 216.352 |
| go-simd / vectors | 15.452 / 17.061 | 65.552 | 15.750 | 217.461 |

### Final synchronous-kernel HTTP implementation (stock 0.4.6)

| Variant / route | C=1 p50 / p95 ms | C=16 req/s | CPU ms/request | Tree RSS MiB |
| --- | ---: | ---: | ---: | ---: |
| node / vectors | 104.188 / 105.734 | 10.080 | 104.500 | 208.066 |
| node / vectors-imul | 104.057 / 106.642 | 9.882 | 104.250 | 199.473 |
| native / vectors | 402.056 / 403.387 | 2.492 | 402.500 | 319.434 |
| native / vectors-imul | 18.756 / 19.644 | 53.245 | 18.500 | 320.809 |
| go-plain / vectors | 59.906 / 61.212 | 16.879 | 60.250 | 215.602 |
| go-unrolled / vectors | 52.830 / 54.344 | 18.662 | 52.750 | 215.516 |
| go-simd / vectors | 12.452 / 13.964 | 79.494 | 12.250 | 215.848 |



## Why there are two complete HTTP experiments

The first implementation put the loop in async POST and loaded the corpus/dimension
module bindings directly inside it. It passed correctness but **native imul was
420.606 ms**, nowhere near the scout. A prospectively registered revision moved
**both** kernels into synchronous functions with explicit typed-array and N/D
parameters, then called them after reading the body. Same input, corpus, scoring,
selection, response, Go code and compiler version. Local parity still passed;
the imul fast path returned. The final source keeps that shape so the compiler
patch can be assessed on its intended integer reduction.

This treatment changes both the async context and global-versus-parameter access;
no isolated proof assigns the original slowdown solely to ownership or one
frontend pass. The generated borrowed helper's IR has an int32 multiply/add for
imul and floating multiply/add for natural code; it is pre-optimization IR, not
proof of final SIMD assembly ([IR excerpts](benchmarks/vector-route-ir.txt)).
The scalar Go default/experimental disassembly
checks are independent of that diagnosis.

The second run repeats **every one of the seven rows**, not just native imul.
All variants/cases/CPU validation precede measurement. To fit the remaining
budget, the second run uses locally built Next artifacts plus cross-compiled
public Linux runtime binaries, instead of building inside Linux. Node uses the
same newly built TS code. Linux still installs the frozen lockfile and runs real
`next start` for every variant. Build IDs, native binary hashes, prepared-tar hash,
archive SHA and source commit are retained. The two VMs and build hosts differ;
**do not pool them or attribute their absolute deltas exclusively to the refactor**.
Within the second VM, final native imul beats Node by **5.55×**, plain Go by
**3.19×**, unrolled Go by **2.82×**, but is **1.51× slower than experimental Go
SIMD**. Natural native remains **3.86× slower than Node**, and 32.29× Go SIMD.
Thus the imul control suggests a useful compiler improvement, not a win over
all optimized Go. A patched compiler has not been measured by this task.

HTTP raw evidence:
[initial implementation](benchmarks/vector-route-before.json.gz),
[initial controller](benchmarks/vector-route-before-controller.json),
[final implementation](benchmarks/vector-route-sync-before.json.gz),
[final controller](benchmarks/vector-route-sync-before-controller.json).
Both are successful measurements, including all regressions.

## HTTP metrics, initialization and limits

Both HTTP runs use two provisioned vCPUs, application affinity **CPU 0**, generator
**CPU 1**, default Next proxy timeout and untuned Node. Node 24.22.1 / Next 16.4.3 /
scriptc 0.4.6 / Go 1.27.3. Final host is Xeon @2.90 GHz. Five fresh validation
servers, then five fresh measurement servers; runtime order Node/native/plain Go/
unrolled Go/SIMD Go, natural then imul for TS. Go is reached through an explicit
Next external rewrite, matching native's Next hop. Go runs one query on one core;
concurrent requests use ordinary handler goroutines, not within-query sharding.

Each row is 5 warmup + **40 C=1** requests; C=16 warmup 1s/100 then measurement
2s/100, first limit wins, **draining every dispatched request**. This is the
registered heavy self-hosted protocol, not the larger hosted protocol. Final
C=16 measured counts are 35/34/17/100/45/48/100 in table order. Fast imul/SIMD rows
are count-capped; slow natural can drain well beyond the dispatch window. Raw
samples retain warmup, counts, elapsed time, pools/reuse and generator CPU.
There are no retries or excluded samples. These are short closed-loop observations,
not open-loop tails, sustained capacity or confidence intervals.

Latency ends at body drain, before digest validation; throughput includes client
work. CPU is the owned **whole process tree**: Next plus native route and function
sidecars, or Next plus Go. CPU/request encloses the measured C=1 window, includes
background work, and is quantized by 100 Hz procfs ticks (40 requests gives a
0.25 ms/request tick). All ten serving-process/procfs CPU validation checks across
the two runs passed. RSS is the 100 ms sampled summed tree high point during C=1;
shared pages can be double-counted, and it is not PSS, per-request allocation,
Vercel Function memory or billed Active CPU. Native's 320.809 MiB imul tree is
1.54× Node natural's 208.066 MiB: keep this memory loss alongside the speedup.
C=16 accounting and process components are in the raw JSON. No hosted value is
inferred from Sandbox.

Final measured corpus generation durations: **Node 233.988 ms**, **native 716.985
ms**, Go plain/unrolled/SIMD **291.738 / 291.011 / 291.375 ms**, per fresh serving
process. These header values measure generation only, not full initialization.
First requests to each route were 363.844/112.742 ms (Node natural/imul),
404.300/18.939 ms (native natural/imul), 62.422/55.256/15.027 ms (Go variants).
Natural precedes imul in the same process: imul already has a resident corpus.
Native/Go generate before serving; Node may initialize lazily. **These are not
comparable certified cold-start samples.** The initial artifact's generic
`routeFirst.note` overstates freshness for the second route; actual order was the
same natural-then-imul order, and the final harness annotation corrects that label.

## Costs and verification

| Experiment | Stopped controller wall | Provisioned wall vCPU-h | API active CPU ms |
| --- | ---: | ---: | ---: |
| Linux scout, 1 vCPU | 114.494 s | 0.031804 / 0.1 limit | 98,444 |
| Initial HTTP, 2 vCPU | 310.969 s | 0.172761 | 378,571 |
| Final HTTP, 2 vCPU | 131.208 s | 0.072893 | 114,869 |
| Both HTTP runs | — | **0.245654 / 0.3 limit** | 493,440 |

Every Sandbox was explicitly stopped in finally; no VM remains. Full hard leases
and observed stopped wall are separate in controller JSON. Before starting the
second VM, first actual wall plus its 199s lease and 30s cleanup/provisioning margin
was bounded at 0.299983 vCPU-h. Do not add the unused part of the first lease to
confirmed elapsed allocation, or substitute API active CPU for provisioned wall.
No previews, hosted invocation attempts, push, merge or compiler-fork edits.
Credentials/project linkage were copied into ignored `.env.local`/`.vercel` only.

Verification on final source:

- **181 route cases** pass Node dev/native status, relevant headers and byte parity,
  with native marker and process cleanup. This correctness-only suite retains its
  existing 180s bcrypt timeout; performance clears that override.
- **36 vector cases × five targets** pass locally and in **each** Linux HTTP run:
  seeded, zero/tied, all −128, all 127, invalid dimensions/types/ranges and malformed
  bodies, both paths. Every measured response is digest-checked afterward.
- **6 workload tests**, including the independent full-sort coordinate oracle,
  query dependence and zero ties; **8 adapter/compiler tests**; Go tests with and
  without the SIMD experiment pass. SIMD tests cover signed extremes and vector
  tails at 0/1/3/15/16/17/31/32/33/384/768 dimensions.
- Offline report/audit recomputes all scout/HTTP percentiles, parity, score error,
  throughput, CPU/tree arithmetic and stopped-budget checks. Maximum retained top-10 float score
  error is **1.066e-13**, IDs identical. `git diff --check` passes.

The final two TS routes, shared corpus/validation/selection code, Go kernels/server,
fixtures, parity and runners are under `examples/demo`. Scout controls are
`examples/scout/vectors/fair.mjs`; adapter CLI resolution is centralized in
`packages/next-scriptc/src/paths.mjs` and used by route/function/Vercel builds.
All raw artifacts start `research/benchmarks/vector-`. Offline tables/audit:

```sh
node scripts/vector-report.mjs
```

## Reproduce or switch to the patched compiler

Use Node 24.22.0 and Go 1.27.3. No pnpm link/override is needed: **the general
`SCRIPTC_COMPILER=/absolute/executable` build-time override** is smaller and avoids
lockfile churn. The resolver handles all three compiler call sites, validates an
absolute file path and passes arguments directly to spawn. It does not shell-eval
a command string. Unset means the installed scriptc 0.4.6. Custom CLI/runtime ABI
must match; Vercel runtime packs still follow the installed dependency version.
The compiler patch described in this task should not need an ABI change.

```sh
pnpm install --frozen-lockfile
node node_modules/.pnpm/scriptc@0.4.6/node_modules/scriptc/scripts/install-native.mjs

# Local patched build; leave this env var inline so stock controllers remain explicit.
SCRIPTC_COMPILER=/absolute/path/to/patched/scriptc SCRIPTC_CHECKER_SERVER=0 \
  NEXT_SCRIPTC_DEMO_GROUPS=vercel HEAVY_GO_ORIGIN=http://127.0.0.1:3520 \
  pnpm --filter demo build
NEXT_SCRIPTC_BASELINE=node HEAVY_GO_ORIGIN=http://127.0.0.1:3520 pnpm --filter demo build
GOEXPERIMENT=simd CGO_ENABLED=0 go build -C examples/demo/go -o /tmp/heavy-go .
HEAVY_VECTOR_SUITE=1 HEAVY_WORKLOADS=vectors,vectors-imul \
  HEAVY_OUTPUT=research/benchmarks/vector-patched-local-parity.json \
  node examples/demo/bench/heavy/local-check.mjs

# Same scout source under a different CLI, with a new output filename.
SCRIPTC_COMPILER=/absolute/path/to/patched/scriptc \
  node examples/scout/vectors/fair.mjs research/benchmarks/vector-patched-mac.json
```

For a **separately budgeted future Linux route run**, commit the patched-run
method/adapter sources, build a Linux-compatible patched CLI, keep the pinned Go
binary, and pass it to the existing controller. It uploads/hashes the CLI, runs
`--version`, applies SCRIPTC_COMPILER during native builds, and repeats all targets
using the same self-hosted counts/accounting. Record the compiler fork commit too.
This task's route allocation is finished; **do not provision another run under its
budget**. The default custom run reserves 2×510s plus cleanup and needs a new budget.

```sh
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 GOEXPERIMENT=simd \
  go build -C examples/demo/go -trimpath -buildvcs=false -ldflags='-s -w' \
  -o ../../../.vercel/vector-tools/heavy-go-linux .
node --env-file=.env.local examples/demo/bench/heavy/vector-sandbox.mjs \
  --label=route-patched --compiler=/absolute/path/to/linux-scriptc
```

The exact final stock build was prepared from the generated Mac `.next` and
`.next-node` trees. Cross-build `.next/scriptc/entry-0.ts` and
`.next/cache/scriptc-functions/entry.ts` with `SCRIPTC_TARGET=x86_64-linux-gnu`,
`SCRIPTC_RUNTIME_PACK` pointing to unpacked `@scriptc/runtime-linux-x64-gnu@0.4.6`,
and an executable `SCRIPTC_CC` wrapper running Zig 0.16.0 `cc -target
x86_64-linux-gnu "$@"`. Use release/strip, no CPU flags. Stage both Next trees
excluding caches/dev; replace `scriptc/route-0` and `scriptc-functions/functions`
with those Linux binaries. Tar them and pass `--label=route-sync-before
--prebuilt=/absolute/builds.tar`. Existing evidence makes that exact label refuse
a duplicate run. Prepared-tar SHA is in the final controller. Full remote build
mode remains the straightforward choice for a future properly budgeted experiment.

Hosted wiring is ready through `HEAVY_WORKLOADS=vectors,vectors-imul` and
`HEAVY_VECTOR_SUITE=1`: deploy helper creates Node/native previews and three
labelled Go targets, pinned public Vercel IPC proxy plus one Go executable Function,
shared diagnostics and both routes. `HEAVY_RUN_NAME`, `HEAVY_JOB` and `HEAVY_OUTPUT`
keep new evidence separate. Hosted revision 2 uses 20+200 C=1, C=16 2s/400 warmup
and 3s/400 measurement, separate process CPU windows with instance-token checks.
See [heavy README](../examples/demo/bench/heavy/README.md). No hosted claim or
assurance about deployed topology is made until that packaging is actually run.

## Open questions

1. Does the compiler patch restore **natural** code to imul's final route behavior
   while retaining compiler semantics/regression tests? This work supplies the
   harness, not that proof; SIMD Go is still the faster existing control here.
2. How repeatable are the SIMD gap, scalar-unroll variability and loaded RSS across
   hosts? An alternative scalar unroll/bounds shape or go-highway baseline needs
   a new prospective comparison, not selection among these existing samples.
3. How does the complete route behave on Vercel with real model-derived embeddings,
   loaded indexes, recall goals and deployment initialization? No deployment was
   necessary for this task; no Sandbox result answers those questions.
