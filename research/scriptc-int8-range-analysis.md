# Signed products in wrapping integer sums

The candidate makes natural `(sum + a*b) | 0` over integer typed arrays use the integer reduction that `Math.imul` already gets. At 100k×768, paired release measurements improve from **649.839 to 3.152 ms on Mac** and **403.673 to 23.379 ms on Linux**. All measured results match Node and Go exactly.

**Validation is incomplete: the full scriptc suite has not run. This is a candidate for review, not an upstream-ready change.** Plain Number `sum += a*b` is analyzed below but retains its current lowering. No push, merge, deployment, or PR was made.

## Baseline and source build

The fork is `/Users/noah/code/scriptc-fork`, branch `next-scriptc/int8-range-analysis`. `git ls-remote origin refs/heads/main refs/tags/v0.4.7` confirmed main at `cedd2f27bb6bc07bdf1bf837d407ef95950026eb` and v0.4.7 at `6c60b0bcbfc6edd34ce5c1cdb588d42bdb7171ff`. The wrapping-sum and integer-range implementations are unchanged between that tag and main. Main still reproduces the slow lowering. The measurements below use source-built main, rather than reusing the scout's published 0.4.6 measurements.

Build on this M4 Pro used Node 24.22.0, pnpm 11.1.3, Homebrew LLVM 22.1.8, CMake, and Ninja. The shell's initial Node 23/pnpm 10 combination failed the frozen install because it interpreted patched-dependency configuration differently. With the pinned Node and pnpm 11, installation and workspace build passed without lockfile changes. Native artifacts needed explicit generation; the workspace build alone leaves their directories empty.

```sh
export PATH=/Users/noah/.local/share/fnm/node-versions/v24.22.0/installation/bin:/opt/homebrew/bin:$PATH
cd /Users/noah/code/scriptc-fork
pnpm install --frozen-lockfile
pnpm -r build
pnpm --filter @scriptc/llvm-darwin-arm64 build:native
pnpm --filter @scriptc/runtime-darwin-arm64 build:native
```

The runtime build produced seven flavors and five vendor archives and took approximately eight minutes. LLVM came from `packages/llvm-darwin-arm64`, built against the pinned LLVM 22.1.8. After the compiler edit, `pnpm --filter @scriptc/compiler build` passed. The built CLI is run with Node as `node packages/cli/dist/main.js`; this avoids rebuilding the self-hosted native CLI.

The next-scriptc adapter is [int8-range-analysis/source-cli.sh](int8-range-analysis/source-cli.sh). For example, from this next-scriptc worktree:

```sh
SCRIPTC_SOURCE=/Users/noah/code/scriptc-fork \
  research/int8-range-analysis/source-cli.sh build \
  examples/scout/vectors/vectors.ts --optimization release --keep-llvm \
  -o /tmp/scriptc-int8/adapter-smoke
```

`examples/scout/vectors/bench.mjs` now accepts `VECTOR_COMPILER` pointing to that adapter. The paired experiment uses [measure.mjs](int8-range-analysis/measure.mjs), with `INT8_MAIN_BINARY`, `INT8_PATCHED_BINARY`, and `INT8_GO_BINARY` pointing to separately built executables. The unchanged vector TS source runs under Node's type stripping. Neither benchmark source nor installed scriptc dependency was replaced.

## Root cause

The gap is in the LLVM backend's interpretation of numeric facts, rather than missing typed-array knowledge in the frontend:

- [`ir/integer-ranges.ts:50`](https://github.com/vercel-labs/scriptc/blob/cedd2f27bb6bc07bdf1bf837d407ef95950026eb/packages/compiler/src/ir/integer-ranges.ts#L50), `integerArithmeticRange`, rejects multiplication when a zero operand and negative operand can produce `-0`. This is correct for its contract: exact integers excluding negative zero.
- The same file's `bytesIntrinsic` branch around line 836 already propagates Int8/Uint8/clamped/Int16/Uint16/Int32/Uint32 element ranges for reads proved valid. Invalid numeric reads remain NaN-coded.
- [`llvm/wrapping-sums.ts`](https://github.com/vercel-labs/scriptc/blob/cedd2f27bb6bc07bdf1bf837d407ef95950026eb/packages/compiler/src/backend/llvm/wrapping-sums.ts), `integerOrNaNRange`, similarly excludes negative zero and knows the integer typed-array ranges for NaN-coded reads. `emitWrappingSum` already permits a signed-zero product directly feeding ToInt32/ToUint32.
- The enclosing addition queried `integerOrNaNRange` for that product, got no range, and retained full floating addition and general ToInt32 conversion. The product's existing modulo view became unused.
- [`llvm/expr-primitives.ts:477`](https://github.com/vercel-labs/scriptc/blob/cedd2f27bb6bc07bdf1bf837d407ef95950026eb/packages/compiler/src/backend/llvm/expr-primitives.ts#L477) attaches wrapping views beside the authoritative double. Existing byte-loop versioning supplies the direct, in-bounds loads in the hot loop and preserves a fallback for other indices.

The patch adds private `wrappingRange` in `llvm/wrapping-sums.ts` and uses it for the two operand-range queries in `emitWrappingSum`. It leaves ordinary integer ranges, Number emission, index proofs, bounds guards, and runtime code unchanged. Its production diff has 25 insertions and two deletions. There is no benchmark or loop-shape recognition.

[codegen-excerpts.txt](int8-range-analysis/codegen-excerpts.txt) contains actual before/after LLVM and optimized assembly. Main's hot loop has byte-to-double conversions, `fmul`, `fadd`, and exponent/shift-based ToInt32. The patched ARM64 hot loop has `smull`, widening `saddw`, independent vector accumulators, and `addv`. The emitted `int8i32Search` body loses its general coercion branches. `floatSearch`, `int8Search`, `int8imulSearch`, `binarySearch`, and `popcount` are byte-identical in emitted LLVM before and after.

## Rule and soundness

A wrapping arithmetic subtree can use the low 32 bits of its operands when:

1. Each leaf is a proven integer or integer-or-NaN value, using existing facts. This includes every integer typed-array width and clamped bytes, but excludes arbitrary fractional numbers and float-array loads.
2. Every addition/subtraction intermediate has a safe integer range, and every product has a magnitude bound strictly below 2^53. Product extrema are computed from the four endpoint products. The existing strict product bound rejects values such as `3 * 3002399751580331`, whose exact integer product is 2^53+1 but whose double product rounds to 2^53.
3. Zero's sign is ignored only for the additional wrapping proof. The expression's ordinary double and the strict integer-or-NaN proof remain authoritative for other consumers.
4. NaN validity propagates through the entire arithmetic subtree. A missing typed-array element makes `(sum + a*b) | 0` zero, rather than preserving `sum` as a substitution with `Math.imul` would do.

Finite integer addition, subtraction, and multiplication commute with reduction modulo 2^32 when their JS intermediates are exact. Either zero sign has low bits zero under ToInt32/ToUint32. Replacing signed zero with integer zero inside this restricted arithmetic proof cannot change a finite nonzero result or create NaN/infinity. Invalid operands retain their ordered-bit dependency and select zero for the entire wrapping result. Unknown, fractional, overflowing-exactness, and ordinary Number cases retain the original lowering.

For Int8 operands, a product lies in [-16256, 16384], possibly with negative zero. Adding it to an int32 accumulator remains far below 2^53, independently of the loop's trip count. Each iteration's ToInt32 is therefore a valid modular integer addition. LLVM can reassociate that modular reduction and vectorize it without fast-math flags or a bound on the final reduction.

### Plain Number accumulation

A sound rule exists under stronger premises. For a `+0` initial accumulator, finite integer products, and a proof that every partial sum stays strictly below 2^53 in magnitude, integer accumulation followed by conversion to double is bit-identical. Products may be `-0`: `+0 + -0` is `+0`, and exact cancellation of nonzero finite integers under JS's default rounding yields `+0`. Thus induction from `+0` proves that the accumulator never becomes `-0`.

That argument fails for an arbitrary initial accumulator: starting at `-0` and adding only negative-zero products preserves `-0`; a zero-trip loop also preserves its initial sign. Missing elements produce NaN, and a plain Number reduction must retain it rather than resetting like `|0`.

For this fixture, 768×16384 = 12,582,912 is a sufficient bound. However, `d` is a runtime Number parameter in the actual source. The compiler's existing loop proofs (`ir/integer-loop-facts.ts`, `boundedIntegerLoopFacts`) bound constant cursor increments, not a data-dependent sum of typed-array products. Its general typed-array-length bound reaches 2^48, which multiplied by the int8 product bound exceeds the exact-Number range. A correct improvement needs a trip-count/partial-sum proof or a guarded integer loop version, including runtime `d`, fractional limits, empty loops, bounds, writes, and exceptional control flow. This is a separate loop-analysis change. The candidate does not infer safety from the benchmark's callers or dimensions, and plain `int8` performance is unchanged.

## Measurements

Mac: Apple M4 Pro, Node 24.22.0, Go 1.27.3. Two fresh processes per runtime/kernel/size, 15 warmups and 30 timed searches each; the runtime order reverses in round two. Both 20k×384 and 100k×768 are retained in [mac-results.json](int8-range-analysis/mac-results.json). Timings below use conventional medians pooled over all 60 timed samples. The host is shared and has no CPU affinity; compare main and patched within this run, rather than attributing differences from the older scout to the compiler. The absolute Mac timings were slower than the earlier scout across Go and both native controls as well.

Linux: one fresh process per runtime/kernel, 10 warmups and 30 timed searches, all in the same two-vCPU Vercel Sandbox. Search itself is synchronous. Node 24.22.1; the Go executable is cross-built from the unchanged Go source with Go 1.27.3. Native binaries are cross-built on Mac with LLVM 22.1.8, portable x86-64 code generation, and the published 0.4.7 Linux runtime pack. `scr_number.c`, `scr_bytes.c`, and `scr_array.c`, and the LLVM helper sources have no differences between v0.4.7 and tested main. This pack substitution is sufficient evidence for the numeric kernels; it is not a full main-runtime validation. RSS and host details are in [linux-results.json](int8-range-analysis/linux-results.json).

### 100k×768 latency, median milliseconds

| Host | Kernel | Node | Go | Main | Patched | Main/patched |
|---|---|---:|---:|---:|---:|---:|
| Mac | natural int8-i32 | 63.916 | 38.174 | 649.839 | 3.152 | 206.2× |
| Mac | int8-imul | 63.796 | 38.523 | 3.187 | 3.162 | 1.01× |
| Mac | plain int8 | 75.982 | 38.609 | 76.684 | 76.691 | 1.00× |
| Mac | float | 78.055 | 79.710 | 61.743 | 61.819 | 1.00× |
| Mac | binary | 3.847 | 1.367 | 2.143 | 2.142 | 1.00× |
| Linux | natural int8-i32 | 135.540 | 61.334 | 403.673 | 23.379 | 17.27× |
| Linux | int8-imul | 134.309 | 61.859 | 24.570 | 24.108 | 1.02× |
| Linux | plain int8 | 161.091 | 62.296 | 101.829 | 101.214 | 1.01× |
| Linux | float | 160.067 | 104.966 | 104.551 | 104.446 | 1.00× |
| Linux | binary | 8.742 | 2.714 | 8.516 | 8.517 | 1.00× |

Every measured top-10 ID and score matches across runtimes. The three int8 forms also match each other exactly. There are 80 Mac process results and 20 Linux process results, with all raw samples retained. [summary.json](int8-range-analysis/summary.json) contains medians, p95s, and sample counts.

### Other scout regressions

[regressions.mjs](int8-range-analysis/regressions.mjs) runs the unchanged workloads under main, patched, and Node, reversing process order across two rounds. Each process uses 10 warmups and 30 timed calls. Dashboard uses 200k events, resize uses 4096→512, and BlurHash uses 2048×2048. Dashboard output bytes, resize SHA-256 digests, and BlurHash strings match exactly. Raw samples are in [regressions.json](int8-range-analysis/regressions.json).

| Kernel | Node ms | Main ms | Patched ms | Change |
|---|---:|---:|---:|---:|
| Dashboard | 75.705 | 23.461 | 23.770 | +1.32% |
| Box resize | 91.931 | 75.030 | 75.108 | +0.10% |
| Bilinear resize | 3.472 | 4.098 | 4.099 | +0.03% |
| BlurHash | 152.396 | 63.080 | 63.164 | +0.13% |

These changes are within the variation observed on this shared host; this run does not establish a statistically significant slowdown. No claim of a dashboard or resize speedup is made.

## Tests and remaining gate

The new `tests/corpus/signed-products-wrapping-sums.ts` covers signed-zero observation via `Object.is` and reciprocal, `+0`/`-0` starts and empty loops, OOB/undefined-to-NaN reads, NaN reset and later recovery, integer typed-array widths including clamped, Int32/Uint32 and mixed-sign products, inexact large products and enclosing sums, repeated accumulation, fractional ordinary Numbers, float-array values, NaN, and infinity. Existing `4812-int32-wrapping-sums.ts` supplies additional wrapping accumulator/overflow coverage. No expected numeric output is hand-written: the harness compares Node stdout/stderr/exit status to native behavior.

The new backend unit test first failed on main with `expected undefined to be defined`. It tests that wrapping parents accept signed-zero products, strict range proofs still reject them, and rounded products/inexact enclosing sums are refused. Its TypeScript preflight/order baseline has no diagnostics and the expected single-module order.

Completed local checks:

- Workspace/source build, `pnpm lint`, `pnpm format:check`, and `pnpm test:ts7 --baselines-only` pass.
- All 111 test files under compiler IR and LLVM backend pass: 1,256 tests, 40.47 seconds. The same selection with `SCRIPTC_SAN=1` passes in 40.24 seconds; individual unit helpers choose their own compilation options, so this is not a claim that every unit test instruments a native executable.
- Seven selected numeric corpus programs pass both `differential.test.ts` and `llvm-differential.test.ts`: 14 cases, release plus dev, 31.51 seconds.
- All seven pass with ASan and the RC audit. The new program's cold sanitized selection takes 73.50 seconds across the two harness files; the six existing programs pass in a subsequent 33.55-second run using warmed runtime caches.
- The affected 20-entry TS7 order/preflight batch passes, and the completeness check passes. The first attempt filtered by the new filename selected no batch; the actual affected batch starts with `runtime-optional-string-flows.ts`.

The corrected Linux run passes 36 unit tests, all 14 selected corpus cases (54.19 seconds), and the new corpus under ASan/RC audit in release and dev (95.80 seconds). Clang is 22.1.8. The new per-program cost entry records the measured Linux case sums: 4,001 ms plain and 74,781 ms sanitized. The latter includes cold sanitizer runtime compilation, so it is a conservative Sandbox estimate rather than a GitHub CI remeasurement. [linux-retry-provenance.json](int8-range-analysis/linux-retry-provenance.json) and the associated logs preserve the result. Both VMs are stopped; combined wall-time allocation upper bound is **0.290249 vCPU-hours**, and API active CPU durations total 520.903 seconds (0.144695 hours). The first VM completed measurements and 36 unit tests, but the early differential cases failed with `spawn clang ENOENT`. LLVM-differential and the later cases passed after clang was installed. That VM stopped in `finally`; the second run fixes the setup order, installing Clang/ASan 22.1.8 before parity. Both attempts are preserved, rather than reporting the first as a green run.

**The full validation gate is not met.** The fork changes remain uncommitted because its test harness guide requires both full lanes green before a commit. The complete five-file candidate is preserved in [compiler.patch](int8-range-analysis/compiler.patch), and the live fork has the same diff, with new paths marked intent-to-add. The next-scriptc handoff contains this report, reproduction tools, raw measurements, and test evidence.

**Full-suite scope:** The current corpus has 4,810 programs, before the remaining harness/package suites. `CONTRIBUTING.md`, `AGENTS.md`, and `tests/harness/README.md` prescribe focused local runs followed by the full `pnpm test:sandbox` plain and sanitized lanes. The documented full-gate wall time is about four minutes with a prepared image or nine minutes cold, using sharded multi-vCPU infrastructure. The historical cost table covers only 3,096 corpus programs and sums to 8,993 plain and 14,708 sanitized case-seconds across both differential harnesses; these are serial case durations, not measured CPU-hours. I did not run a full suite or claim a full-suite duration. A cold full gate cannot be responsibly budgeted from those figures into this task's 0.5 vCPU-hour sandbox cap. Full Linux plain/sanitized lanes, plus the platform contracts, remain required before upstream submission.

## Upstream PR draft

Title: **Preserve wrapping integer views through exact signed products**

Natural integer reductions such as `(sum + a[i] * b[i]) | 0` lose the enclosing sum's integer view when the product may be negative zero. The product already has a valid ToInt32 view, but the parent's strict integer-or-NaN range query rejects it and leaves floating addition and full numeric coercion in the loop.

Add a wrapping-only range query that permits either zero sign while requiring exact arithmetic intermediates and preserving NaN validity. Keep ordinary Number and index range proofs unchanged. This allows LLVM to vectorize signed-byte reductions using the same modular arithmetic already available for `Math.imul`.

Add Node/native differential coverage for signed zero, invalid reads, integer typed-array widths, mixed signs, exactness boundaries, and floating inputs, plus focused backend tests. Paired 100k×768 dot-product measurements improve 649.839→3.152 ms on M4 Pro and 403.673→23.379 ms on Linux, with exact result parity. The existing float, plain Number, binary, and imul control functions emit identical LLVM before and after.

Validation: focused parity and new-corpus ASan/RC audit pass on Mac and Linux; compiler IR/backend tests, lint, formatting, TS7 completeness, and the affected order batch pass locally. Full plain/sanitized Linux suite and platform contracts are pending. **Do not submit this draft as a fully validated PR.**

## Open work

- Run the sanctioned full plain/sanitized Linux gate and the platform contracts with an adequate budget/prepared environment.
- Decide whether the scoped wrapping-only fix should land first; plain Number reductions require separate trip-count, partial-sum, and signed-zero loop proofs or guards.
- Consider a future sign-of-zero lattice for product locals used only by wrapping consumers. This patch follows expression subtrees and intentionally does not relax the ordinary local-range contract.

## Files changed

Fork candidate (uncommitted, base `cedd2f27b`):

- `packages/compiler/src/backend/llvm/wrapping-sums.ts`
- `packages/compiler/src/backend/llvm/wrapping-sums.test.ts`
- `tests/corpus/signed-products-wrapping-sums.ts`
- `packages/compiler/test/ts7/baselines/order-parity/tests/corpus/signed-products-wrapping-sums.ts.json`
- `tests/harness/corpus-costs/signed-products-wrapping-sums.ts.json`

Next-scriptc branch `t3/int8-range-analysis`: `examples/scout/vectors/bench.mjs`, this report, and `research/int8-range-analysis/` (compiler patch, CLI adapter, paired vector/regression/Sandbox runners, raw JSON/provenance, LLVM/assembly excerpts, and test logs). Generated native executables, compiler bundles, and runtime packs are outside version control.

## Local validation (partial, stopped)

On 2026-10-31 the user stopped validation because host disk space was exhausted. **The plain lane is incomplete, the full Linux sanitized lane never started, and the fork patch remains uncommitted.** No completed failure was demonstrated to be patch-caused; the incomplete coverage and unresolved retries do not establish absence of regressions. The official full `pnpm test:sandbox` plain and sanitized gate remains required before an upstream PR.

The environment was native Linux arm64 Ubuntu 24.04 in Docker Desktop, rather than x86-64 Sandbox. The user increased VM RAM from 8 to 16 GiB; the container retained six effective CPUs. The linked summary records toolchain versions, exact base and unchanged candidate hash.

| Completed scope | Passed | Failed | Skipped |
|---|---:|---:|---:|
| Plain corpus, both harnesses | 9,433 | 11 | 176 |
| Plain packages, 756 of 774 files | 6,861 | 9 | 506 |
| Partial completed subtotal | 16,294 | 20 | 682 |

Corpus counts combine valid shard 1 and 3 JSON, shard 2's completed differential file summary, and the successful LLVM-only shard 2 repair. The interrupted LLVM results are discarded. Package counts sum only terminal `moduleEnd.counts` in `linux-plain-files.ndjson` (178 files: 4,025/8/342) and `linux-plain-files-resume.ndjson` (578 files: 2,836/1/164). Their completed-file sets are disjoint. Every partial-file result from either attempt is excluded; the original partial `emit-llvm.test.ts` was completed in the resume. Both Effect files remain incomplete, so their 227 observed passes and three pause-associated failures are outside the table. Eighteen package files remain unfinished: two interrupted and sixteen unstarted. Focused recoveries do not replace raw failures or add to these totals.

The following accounts for all 20 completed failures. Evidence filenames resolve under `/tmp/scriptc-full-validation.JRQXQc`; [local-validation-partial.json](int8-range-analysis/local-validation-partial.json) records the complete evidence references, journal hashes, commands and unfinished-file list.

| Failure | Count | Classification and evidence |
|---|---:|---|
| `5963-date-to-string.ts` | 1 | Environment, base reproduced: missing `US/Pacific`. Installing `tzdata-legacy` makes both harnesses pass on candidate and base. `base-linux-date-legacy.json`, `candidate-linux-date-legacy.json`. |
| `net-unix-socket-connect.ts` | 2 | Environment, base reproduced: Node oracle IPv4/IPv6 ordering. Both harnesses pass on both revisions with `--dns-result-order=ipv4first`. `base-linux-net-ipv4.json`, `candidate-linux-net-ipv4.json`. |
| `7009-finalization-registry-wasm-loader/main.ts`, `8217-intl-segmenter-word-construct/main.ts` | 4 | Pre-existing missing Linux arm64 libnode pack, SC8005. `base-linux-corpus-failures-plain.json`. |
| `7717-math-fdlibm.ts`, `7718-math-fdlibm.cjs` | 4 | Pre-existing arm64 Node/native numeric mismatch. Candidate/base native stdout, stderr and status are byte-identical. `math-base-candidate-comparison.json`. |
| `errors.test.ts`, 7000-level expression | 1 | Pre-existing TS7 stack panic before backend lowering. `base-linux-deep-expression.json`. |
| `coverage.test.ts`, whole-corpus static audit | 1 | Resource/time-limit observation: 600-second timeout. Base comparison and eight-shard recovery were not run. It uses frontend analysis without codegen; this is unresolved validation, not a recovered pass. `linux-plain-files.ndjson`. |
| `library-mode.test.ts`, K10 | 1 | Pre-existing 56-byte LeakSanitizer trap-probe leak, base reproduced. Both pass with `detect_leaks=0`, retaining ASan and RC audit. `base-linux-ffi-library-plain.json`, `base-linux-k10-rcaudit.json`, `candidate-linux-k10-rcaudit.json`. |
| `ffi.test.ts`, manifest ABI case | 1 | Pre-existing timer-fairness assertion, base reproduced. Only the timer-ticked boolean differs; callback count, sum and order agree. `base-linux-ffi-library-plain.json`, `candidate-linux-ffi-retry.json`. |
| `self-hosting-native-driver.test.ts` | 1 | Infrastructure, base reproduced: hidden Zig causes `ENOENT`. Correct-PATH native-extra was not run. `base-linux-bootstrap-hidden-zig.json`. |
| `input-tracker.test.ts`, settled-file identity | 1 | Pre-existing test/filesystem timing collision. Official focused retries pass on both; exact test read/write logic reproduces the identity collision on base. `base-linux-input-tracker-repro.json`. |
| `self-hosting-llvm-emitter.test.ts` | 2 | Resource, base reproduced at the original 2048 MiB heap limit. A 3072 MiB candidate attempt passed its first case, then was resource-aborted during fixed point. Full recovery remains pending. `base-linux-emitter-heap2048.json`, `linux-plain-emitter-overlap-interrupted.ndjson`. |
| `rpc-process.test.ts`, FIFO server | 1 | Infrastructure, base reproduced: container PID 1 leaves an orphaned `cat` zombie. A local subreaper wrapper passes all three file cases on both revisions. `base-linux-rpc-process-repro.json`, `base-linux-rpc-process-reaper.json`, `candidate-linux-rpc-process-reaper.json`. |

The interrupted Effect cases `gen-number-typed.ts`, `state-sync-ref.ts` and `stream-error.ts` exceeded 600-second deadlines across disk-pressure `SIGSTOP` pauses. These are classified as validation infrastructure observations; healthy candidate/base retries were canceled before execution, so they are not independently base-confirmed. Their raw failures remain in `linux-plain-files-resume.ndjson` and are excluded from completed-file totals.

Earlier host lint, formatting and TS7 baselines passed. Selected Darwin checks passed: invariants 34 with one conditional skip, artifact checks 6 with 42 filtered skips, and behavior 14 each plain and sanitized with LLVM 22.1.8. An initial Apple Clang 21 coroutine-intrinsic failure reproduced on base and recovered with pinned LLVM 22 (`base-host-old-clang.json`, `base-host-clang22.json`, `host-san-clang22.json`). These selections do not replace the full Linux sanitized lane.

Corpus used three shards with one worker each, followed by the LLVM-only repair. Package resume used two workers and an explicit 596-file list. Commands and phase durations are in the summary. Total elapsed time was 7h 58m 31s, including restart and pauses; package resume occupied 3h 33m 4s.

The original 8 GiB VM incurred two kernel OOM kills, one package attempt and one corpus shard; their incomplete results were discarded or repaired as described above. The resumed cgroup OOM counter stayed at zero. One emitter retry was manually resource-aborted. Disk pauses included 552 seconds, then 809 seconds before one worker resumed, followed by another pause until shutdown. macOS swap allocation reached about 13 GiB. Despite workers already being paused, host headroom later fell below the 4 GiB floor: 22 resource samples, minimum 3,201,708,032 bytes (2.98 GiB). No new shards were launched. `resource-samples.ndjson` and `plain-disk-guard-events.ndjson` retain these events.

Verified archival removed 4,009,584,342 bytes of completed generated corpus/npm-static output; a separate executable prune removed 650,277,296 bytes. `NOTES.md` and the summary record archive paths/hashes, member checksums, sample extractions, removal manifests and reuse audits. Source, patch, CAS, incomplete outputs and evidence were retained.

Not run: the 18 remaining package files, healthy retries of the three Effect timeouts, coverage recovery and base audit, a complete isolated higher-heap emitter retry, plain native-extra, and the entire planned Linux sanitized lane (corpus, case shards, emitter, ordinary files and native-extra). All validation controllers, guards, pruners, tests and comparisons were terminated. `scriptc-int8-validation` was stopped at 21:08:49 UTC and retained; no Supabase container was modified. Only this report and its concise summary are committed.
