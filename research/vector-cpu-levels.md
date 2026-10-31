# x86-64 CPU levels for vector routes

2026-10-31. Branch `test/vector-cpu-levels`, based on `hillclimb/int8-vectors` at
`a6ef54d8546e4e36fdf9b53a345dd631f74d027b`. No push or merge. Two Sandboxes stopped after setup failures; the user explicitly authorized
each replacement under the same combined 0.1 vCPU-hour cap. The third and final
Sandbox completed all kernel measurements and stopped.
One diagnostic preview was accepted; the first preview command was rejected locally.

## Method and scope

[Prospective method](vector-cpu-levels/method.md) was committed before provisioning.
[Builds](vector-cpu-levels/builds.json), [Go builds](vector-cpu-levels/go-builds.json),
[HTTP builds](vector-cpu-levels/http-builds.json), and
[runtime provenance](vector-cpu-levels/runtime-provenance.json) retain commands,
hashes, versions and sizes. Sources are the unchanged `examples/scout/vectors`
and real grouped `examples/demo` routes. No loop, dataset, scoring, tie-breaking,
within-query parallelism or compiler optimization level was changed.

Kernel: 100,000 rows × 768 dimensions, synthetic seeded resident corpus, exhaustive
dot products and top-10 insertion selection. Two fresh processes per runtime/mode,
5 warmups plus 10 timed searches each, with process order reversed within each of three prospectively selected phases:
patched natural int8 plus Go/Node controls first; binary second; remaining kernels
last. This ordering follows the user’s explicit priority after the failed upload;
no measurements had yet run when it changed. The fixture also performs one initial untimed reference search. Every
sample is retained. Tables use the conventional median of all 20 samples and
nearest-rank p95. Timed regions exclude allocation, corpus generation and output;
include result reset, scoring and selection. Fresh-process wall times are retained
separately. This is one shared host, not a confidence interval or fleet estimate.

Native: installed stock 0.4.6 versus source-built patched main
`cedd2f27bb6bc07bdf1bf837d407ef95950026eb`, each with baseline, explicit v3, and
CPU dispatch; release, stripped, cross-compiled on Mac with Zig 0.16.0 to static
`x86_64-linux-musl` executables. Stock→patched comparisons include main's other
changes since 0.4.6; CPU-policy comparisons **within** each compiler isolate the
flag. The earlier [range-analysis experiment](scriptc-int8-range-analysis.md)
is the main-versus-patch causal control. No full compiler-suite claim is made here.

Go 1.27.3: unchanged shared fair scout, plain `GOAMD64=v1`, plain `GOAMD64=v3`,
and `GOEXPERIMENT=simd`/v1 with explicit AVX2 `simd/archsimd`. Plain controls are
built without the SIMD experiment. Int8 widens signed bytes, multiplies and sums
in int32. Float32 storage is widened to float64, with explicit product rounding;
SIMD reorders additions. Binary has **no existing archsimd implementation**:
`go-binary` is the original `bits.OnesCount32` baseline, with Go's runtime feature
detection; `go-binary-v3` uses the same source built with v3. Neither is labelled
SIMD. SIMD ratios for binary are unavailable. Node runs the exact TS source with
type stripping and no runtime tuning.

All modes require identical top-10 IDs across every runtime. Integer scores must
match exactly. Float scores use the pre-existing, prospectively registered
reassociation tolerance `1e-10 + 1e-12 * abs(reference)`. Thus float equality is
not a claim of bit-identical sums. Natural int8-i32 and imul also compare to the
same integer reference. Both dispatcher copies are separately exercised for all
four full-size modes with `SCRIPTC_CPU_LEVEL=baseline` and `x86-64-v3`; those
1-warmup/3-sample diagnostics are excluded from headline results.

## CLI and cross-compilation

Both [stock help](vector-cpu-levels/stock-help.txt) and
[patched help](vector-cpu-levels/patched-help.txt) expose `--target-cpu
<baseline|x86-64-v2|x86-64-v3|x86-64-v4|native>` and `--cpu-dispatch`.
All six full kernel builds succeeded. Additional v2 and v4 smoke builds succeeded
for both CLIs. Both reject `native` on this ARM Mac with:

```text
--target-cpu=native needs an x86-64 Linux or macOS build host; name a level instead
```

[Flag probes](vector-cpu-levels/flag-support.json) retain statuses/diagnostics.
v4 smoke compilation is not proof that a v4 executable can run on this VM.
The runtime pack remains baseline; the program is specialized. Dispatch contains
baseline and v3 copies, checks CPU/OS support at startup, and keeps baseline
fallback. Its documented per-function heuristic can retain baseline code for
functions that do not benefit from wide vectors.

The original `/Users/noah/code/scriptc-fork` working tree was neither modified
nor rebuilt. Its built CLI was invoked read-only through `source-cli.sh`, with
`SCRIPTC_SOURCE` set explicitly and all caches/output under `/tmp`. The JS source
backend resolves runtime packages through `createRequire` rather than honoring
`SCRIPTC_RUNTIME_PACK`; the narrow [preload](vector-cpu-levels/runtime-pack.cjs)
redirects only the musl package's manifest lookup to the selected unpacked pack.
It changes no compiler or runtime implementation.

Kernel packs are public musl 0.4.6 (stock) and 0.4.7 (patched), matching the previous
numeric-kernel experiment. The complete HTTP app could not link against public
0.4.7: main emits `scr_builtin_statics_install`, missing from that pack.
[Failure retained](vector-cpu-levels/http-published-runtime-failure.log).
The permitted separate checkout `/Users/noah/code/scriptc-fork-v4` was created at
`cedd2f27b`, and `compiler.patch` applied. **Only its musl runtime was rebuilt**, with
`SCRIPTC_BUILD_CROSS=1 node packages/runtime-linux-x64-musl/scripts/build.mjs`;
its [six-flavor/five-archive build passed](vector-cpu-levels/runtime-source-build.log).
The original already-built patched CLI still compiled the HTTP entries. Both
HTTP policies use this exact same source runtime pack. The shared original
fork's complete diff SHA-256 remained
`345419416fef6d32a3adfe4ccc14b961222812c4856ce45bcb2faceac537d54f`.

## Measurements

[Interactive table](vector-cpu-levels/results.html) and
[machine-readable summary](vector-cpu-levels/summary.json).

**Natural TS beats the explicit Go SIMD control in this kernel run when using the
patched compiler plus v3/dispatch.** Patched dispatch is **9.251 ms**, versus Go
SIMD **11.892 ms** (ratio **0.778**, 22.2% lower latency, 1.29× speed). Patched
baseline is 17.571 ms: dispatch improves it by **1.90×**. Go plain and Go plain/v3
are 58.661 and 58.479 ms; Node natural i32 is 102.198 ms. The comparison is within
this VM; Go SIMD is also much faster here than its older 22.4 ms result, so do
not attribute old-versus-new absolute differences solely to native CPU flags.

This does **not** make stock natural TS competitive: stock dispatch is 377.894 ms.
Stock **imul** does benefit substantially: 16.942→8.850 ms (1.91×). Float stays
around 91–92 ms for native, versus Go SIMD 43.228 ms. Binary does **not** flip:
patched dispatch 6.457 ms versus default Go bits/popcount 2.248 ms and Go/v3
2.073 ms. Stock binary dispatch pooled median is 6.968 versus baseline 6.855 ms,
with a notably slower first dispatch process preserved (9.096 ms process median,
second 6.491); this is no claim of a universal dispatch speedup.

Host: one provisioned vCPU, Intel Xeon @ **2.90 GHz**, family 6/model 106, Node
**24.22.1**. `/proc/cpuinfo` has one visible processor and includes AVX2, POPCNT,
all v3 features, and AVX-512. `/sys/fs/cgroup/cpu.max` is `max 100000`; SDK
allocation is one vCPU. Raw complete flags, every sample, process wall times,
IDs/scores and forced-copy checks: [kernels.json](vector-cpu-levels/kernels.json).
The final remote JSON is exactly equal to the incrementally saved local
[streamed checkpoints](vector-cpu-levels/kernels-stream.json).

All **78 process results**, **180 startup samples**, and **16 forced-copy results**
completed. Integer scores and IDs agree exactly across all variants. Float IDs
also agree; the maximum observed SIMD score error is **1.07e-13**,
inside the declared tolerance. No sample was excluded. The two main Go SIMD
natural process medians are 11.044 and 12.918 ms; this variability remains visible
rather than being turned into a confidence claim.

Ratios below are **runtime latency / control latency**, so lower is better;
0.5 means twice as fast as that control. Go plain for binary means the labelled
`bits.OnesCount32` default build. `—` means the existing Go archsimd control has
no implementation for that mode.

| Mode | Runtime | p50 ms | p95 ms | / Go SIMD | / Go plain | / Node |
|---|---|---:|---:|---:|---:|---:|
| int8-i32 | node | 102.198 | 103.470 | 8.594 | 1.742 | 1.000 |
| int8-i32 | patched-baseline | 17.571 | 18.822 | 1.478 | 0.300 | 0.172 |
| int8-i32 | patched-v3 | 9.180 | 11.013 | 0.772 | 0.156 | 0.090 |
| int8-i32 | patched-dispatch | 9.251 | 10.465 | 0.778 | 0.158 | 0.091 |
| int8-i32 | go-plain | 58.661 | 59.286 | 4.933 | 1.000 | 0.574 |
| int8-i32 | go-v3 | 58.479 | 59.350 | 4.918 | 0.997 | 0.572 |
| int8-i32 | go-simd | 11.892 | 15.867 | 1.000 | 0.203 | 0.116 |
| int8-i32 | stock-baseline | 396.536 | 397.957 | 33.346 | 6.760 | 3.880 |
| int8-i32 | stock-v3 | 377.825 | 383.105 | 31.772 | 6.441 | 3.697 |
| int8-i32 | stock-dispatch | 377.894 | 381.330 | 31.778 | 6.442 | 3.698 |
| int8-imul | node | 101.942 | 102.964 | 8.886 | 1.745 | 1.000 |
| int8-imul | stock-baseline | 16.942 | 17.214 | 1.477 | 0.290 | 0.166 |
| int8-imul | stock-v3 | 8.674 | 9.070 | 0.756 | 0.149 | 0.085 |
| int8-imul | stock-dispatch | 8.850 | 9.452 | 0.771 | 0.152 | 0.087 |
| int8-imul | patched-baseline | 17.235 | 18.108 | 1.502 | 0.295 | 0.169 |
| int8-imul | patched-v3 | 9.054 | 9.625 | 0.789 | 0.155 | 0.089 |
| int8-imul | patched-dispatch | 9.351 | 12.250 | 0.815 | 0.160 | 0.092 |
| int8-imul | go-plain | 58.411 | 58.910 | 5.092 | 1.000 | 0.573 |
| int8-imul | go-v3 | 58.464 | 73.243 | 5.096 | 1.001 | 0.574 |
| int8-imul | go-simd | 11.472 | 11.859 | 1.000 | 0.196 | 0.113 |
| float | node | 115.948 | 117.054 | 2.682 | 1.251 | 1.000 |
| float | stock-baseline | 92.388 | 100.995 | 2.137 | 0.997 | 0.797 |
| float | stock-v3 | 91.477 | 92.552 | 2.116 | 0.987 | 0.789 |
| float | stock-dispatch | 91.329 | 91.696 | 2.113 | 0.986 | 0.788 |
| float | patched-baseline | 91.971 | 92.213 | 2.128 | 0.992 | 0.793 |
| float | patched-v3 | 91.456 | 91.857 | 2.116 | 0.987 | 0.789 |
| float | patched-dispatch | 91.225 | 91.691 | 2.110 | 0.984 | 0.787 |
| float | go-plain | 92.672 | 93.141 | 2.144 | 1.000 | 0.799 |
| float | go-v3 | 92.163 | 92.861 | 2.132 | 0.995 | 0.795 |
| float | go-simd | 43.228 | 44.372 | 1.000 | 0.466 | 0.373 |
| binary | node | 7.002 | 8.995 | — | 3.115 | 1.000 |
| binary | stock-baseline | 6.855 | 9.148 | — | 3.049 | 0.979 |
| binary | stock-v3 | 6.516 | 6.713 | — | 2.898 | 0.931 |
| binary | stock-dispatch | 6.968 | 9.219 | — | 3.100 | 0.995 |
| binary | patched-baseline | 6.780 | 6.818 | — | 3.016 | 0.968 |
| binary | patched-v3 | 6.461 | 6.606 | — | 2.874 | 0.923 |
| binary | patched-dispatch | 6.457 | 7.286 | — | 2.872 | 0.922 |
| binary | go-binary | 2.248 | 2.330 | — | 1.000 | 0.321 |
| binary | go-binary-v3 | 2.073 | 2.348 | — | 0.922 | 0.296 |

| Native binary | Stripped bytes | Tiny fresh process p50 ms | p95 ms |
|---|---:|---:|---:|
| stock-baseline | 386640 | 1.115 | 1.413 |
| stock-v3 | 388272 | 0.985 | 1.518 |
| stock-dispatch | 404504 | 1.036 | 1.366 |
| patched-baseline | 387968 | 1.047 | 1.553 |
| patched-v3 | 390240 | 0.990 | 1.304 |
| patched-dispatch | 406584 | 1.009 | 1.532 |

HTTP performance was **not measured**. After kernels/startup/fallback, 65.198 s
remained in the final controller's command window. The prospectively reserved
85 s included a 25.0 MB upload, frozen dependency installation and the real Next
HTTP protocol; the controller skipped that phase instead of risking incomplete
kernel retrieval. The full 250 s lease still retained its cleanup margin. The
overall 0.1 vCPU-hour cap was **not exhausted**, but no further Sandbox was
allowed. The prepared route binaries and eight local emulated HTTP correctness
smokes are retained as setup/validation evidence, not Linux HTTP performance.


## Binary size, startup and code generation

Tiny-input startup samples are 30 fresh `exec`s per native binary, interleaved
with reversed order on alternating rounds. They use the unchanged kernel program
at 10×32, zero explicit warmups and one sample, measuring process creation,
runtime initialization, tiny fixture/search and JSON output. They are a practical
launch-cost proxy, not isolated CPUID timing, page-cache-cold startup or Vercel
Function cold starts. Full-size process wall times also remain in the raw runs.

The grouped HTTP route binary is **11,142,976 bytes baseline** and **18,121,744 bytes
dispatch**: +6,978,768 bytes, **+62.63%**. Its independent function sidecar is
954,016 bytes and is held baseline in both HTTP runs. The kernel binary's small
percentage increase should not be extrapolated to this larger application.
Build durations are retained but had mixed warm caches; they do not establish
a controlled compilation-time ratio.

[Disassembly audit](vector-cpu-levels/assembly.json) finds no YMM/AVX matches in
baseline kernels and does find YMM accumulation and widening/pair dot-product
instructions in v3/dispatch. Neither stock nor patched v3 contains a `popcnt`
instruction. Merely allowing POPCNT did not cause LLVM to recognize this TS SWAR
popcount as that instruction. This is code-generation evidence, not attribution
of every timing difference to vector width.

## Vercel iad1 hardware

A single minimal Build Output API preview was deployed to the existing linked
`next-scriptc` test project, explicitly Node 24, x86_64, iad1 and 2048 MB. Its
`/api/heavy/diagnostics` handler reads `/proc/cpuinfo`; it does not run the vector
benchmark. [Raw evidence and exact handler/config](vector-cpu-levels/vercel-hardware.json).
The [Build Output API primitives](https://vercel.com/docs/build-output-api/primitives)
document the explicit Function configuration used.

Deployment `dpl_Ex7FvnjSCUqypZqwpDad2YmsJtVi`,
[preview](https://next-scriptc-eizf24ecn-noahs-projects-8a075d15.vercel.app/api/heavy/diagnostics),
is recorded READY with target `preview`. Two authenticated HTTP 200 responses
report `region: iad1`, `arch: x64`, Node 24.22.2, and Intel Xeon @ 2.50 GHz,
family 6/model 63. Both processors list `avx2`, `avx`, `popcnt`, `fma`, `bmi1`,
`bmi2`, `f16c`, `movbe`, `abm`, `xsave`, SSE3/SSSE3/SSE4.1/SSE4.2 and related v3
features. The response's `x-vercel-id` also contains `iad1`. **Observed iad1
Functions do expose AVX2.** This is not a guarantee about every instance, future
hardware or native Function performance; dispatch retains fallback for that reason.

The first deploy command was rejected locally because preview does not accept
`--skip-domain`; no deployment was created by it
([record](vector-cpu-levels/vercel-rejected-command.json)). The corrected command
created exactly one preview. The third authenticated invocation returned a
non-JSON protection response; the two successful hardware responses are retained,
and collection is labelled partial. No second deployment, project-setting or
domain change followed.

## Recommendation and verification

Add **`--cpu-dispatch` to `packages/next-scriptc/src/vercel.mjs`**. That call site
already forces `x86_64-linux-musl`, and both installed stock 0.4.6 and the patched
CLI support it. The change preserves CPU compatibility through runtime fallback;
it does not force every Function to require AVX2. Stock imul's 1.91× improvement
justifies the adapter change even before the separate compiler patch is released.
Natural TS needs both the range-analysis patch and v3/dispatch for the measured
win. This task does not change the installed compiler dependency or merge its
patch. Actual hosted native performance remains unmeasured.

**Keep the general self-hosted adapter default unchanged.** For this CPU-heavy
vector service on x86-64 Linux, dispatch is also a useful opt-in. The tiny launch
proxy shows no measurable added startup cost (patched 1.047→1.009 ms, overlapping
p95s); it does not certify larger-service cold starts. Scout dispatch adds only
18,616 bytes/4.80% patched, but the real grouped route binary adds **6.98 MB/62.63%**.
That larger size, extra compilation work, stock binary variability, and lack of
broader self-hosted workload/startup measurements do not justify changing all
self-hosted builds. There are no changes to the self-hosted route/function
compiler call sites. Direct scriptc self-hosted builds can opt in explicitly.

`node --test packages/next-scriptc/test/*.mjs` passes **21/21** on final adapter
source ([log](vector-cpu-levels/adapter-tests.log)); the same suite passed before
this change. `git diff --check` passes. The [offline auditor](vector-cpu-levels/report.mjs)
recomputes all medians, ratios, p95s, exact integer/float-tolerance parity, sample
counts, forced-copy parity and the combined stopped-budget bound. The original
fork's diff and built compiler file hashes remained unchanged.

## Cost and failure ledger

| Attempt | Sandbox | Outcome | Controller wall s | Wall vCPU-h upper bound | API active CPU ms | Explicit stop |
|---|---|---|---:|---:|---:|---|
| Initial | `azure-petite-xerinae-AhnnpR` | 30 s upload abort; no benchmark commands | 33.155 | 0.009210 | 1,662 | yes |
| Approved replacement | `olive-comprehensive-gamefowl-dBhEz7` | hard-coded nonexistent cwd; no benchmark commands | 17.487 | 0.004858 | 1,457 | yes |
| Final approved replacement | `tan-convincing-hare-Cne3KA` | all kernel/startup/fallback rows complete; HTTP skipped | 166.504 | 0.046251 | 153,372 | yes |
| **Combined** | **3, including both failures** | | **217.146** | **0.060318 / 0.1** | **156,491** | **all stopped** |

[Structured combined cost ledger](vector-cpu-levels/cost-ledger.json).
Initial [controller](vector-cpu-levels/controller.json), failed
[replacement](vector-cpu-levels/replacement.json), and final
[controller](vector-cpu-levels/final-attempt.json) retain the complete ledger.
API active CPU totals are 0.043470 CPU-hours; they are not substituted for the
larger controller-wall allocation bound. Unused portions of already-stopped
leases are not counted as consumed allocation. Before the final creation, both
failed controller walls plus its 250 s lease and 30 s margin reserved at most
**0.091845 vCPU-hours**. No fourth VM was created.

An attempted resume of the original nonpersistent Sandbox failed with `snapshot_not_found`
and created no session ([record](vector-cpu-levels/recovery.json)). A later OIDC
preflight failed before contacting Sandbox creation; credentials were refreshed
privately through the already linked project, with no VM allocated
([record](vector-cpu-levels/replacement-auth-failure.json)). These are not counted
again as additional Sandbox active CPU. Tokens, environment files and binaries
remain ignored/outside Git. The diagnostic preview had two successful hardware
responses; hosted Active CPU billing for those requests was not measured.

Before the final VM, the required local dry-run used the existing amd64
`node:24-alpine` Docker image under Rosetta, **not a performance comparison**.
It ran 78 small-input kernel processes, 16 forced-copy checks and 8 real Next-hop
HTTP smoke rows; validated archive hashes, executable modes, build ID, `/vercel`
relative paths and commands; and proved both full and truncated stdout
checkpoints survive independent of result download
([dry-run checks](vector-cpu-levels/dryrun.json)). Each full-size Linux row and
startup/fallback sample was then streamed locally as it completed. The failed
setup attempts are retained rather than hidden by the final successful run.


## Reproduction

Use the pinned Node 24.22.0, Go 1.27.3 and Zig path recorded in the build scripts.
Download/extract the 0.4.6/0.4.7 musl runtime packs into the recorded temporary
paths, then run `build.mjs` and `build-go.mjs`. For HTTP, build the existing grouped
Next app with `NEXT_SCRIPTC_DEMO_GROUPS=vercel` and
`HEAVY_GO_ORIGIN=http://127.0.0.1:3520`, create the separate fork worktree/runtime
as above, run `build-http.mjs`, and `prepare-http.mjs`. The historical `linux.mjs`, `recover.mjs` and `replacement.mjs` retain the failed
controller versions. **Do not rerun them.** The final exact controller is
`final-attempt.mjs`, using `sandbox.cwd`, a compressed kernel-first upload, a
combined budget guard and streaming checkpoints. It refuses to run when its saved
artifact exists. A future rerun needs a separate evidence directory, a fresh
single-attempt controller and a new explicit budget; never overwrite evidence.

```sh
# Locally, after preparing all artifacts; .env.local stays ignored/on the caller.
node --env-file=.env.local research/vector-cpu-levels/final-attempt.mjs
# Offline, allocates no VM or invocation:
node research/vector-cpu-levels/report.mjs
```
