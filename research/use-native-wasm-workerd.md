# "use native" as scriptc WebAssembly in workerd

2026-11-01. Branch `t3/research-wasm-workerd`, base `dcb4505663e8f633f63bb33447e80a8584d389ca`.

**NO-GO against the requested kill criterion.** GO requires at least 2× lower CPU, including the JSON boundary, for at least two distinct realistic workloads. In local workerd, none of the seven workload/size windows reaches 2×. Revenue wasm uses 1.47×, 1.05× and 1.09× the JavaScript CPU at 5k, 15k and 200k events. The regex control uses about 1.8× the CPU, and the int8 vector upper bound uses 10.75×. Treat sizes of revenue as one workload, not three independent successes.

The unchanged async revenue function cannot be a library export. A staged synchronous version of its compute body, with its existing fixture helper and a JSON facade, compiles and runs in workerd. This establishes a workable compute subset, not support for the adapter's current async function contract or a vinext integration.

## Builds and ABI

Stock scriptc **0.4.6**, the existing installed executable from the main checkout, and **@scriptc/runtime-wasm32-wasi 0.4.6**. Zig **0.16.0**, runtime-pack ABI 47. No patched-fork code or compiler was used. The project in this worktree initially had no node_modules; the existing stock compiler was reused without installing the complete Next workspace. Downloads, npm cache, Zig caches, staging files and build outputs stayed in `.checks/wasm-workerd`.

The command is `SCRIPTC_TARGET=wasm32-wasi scriptc build --lib --profile PROFILE.json -o OUTPUT.wasm`. Library mode pins release optimization through the profile's default. It rejects executable-only CLI flags, including the initial attempted strip/node-islands settings; the retained logs show those setup failures. Library builds are static-tier only. The final profiles use format 1, LLVM emission, `string` input and output, an initialization symbol and an optional collection symbol.

The unchanged export fails **SC4004**, "library export 'revenue' is an async function". Only `async` is removed from a staged revenue copy. Its algorithm, Map aggregation, JSON parser, sorting, fixture generator and fixture cache remain intact. The original helper's perf_hooks import and disabled startup-log branch compile without additional edits. The JS baseline keeps the async declaration. Worker bundling resolves perf_hooks to the Worker global performance object and statically disables the diagnostic startup-log branch. Production application files are untouched.

The [scriptc Wasm documentation](https://scriptc.dev/docs/wasm) describes a WASI Preview 1 reactor. Strings are supported, rather than limited to primitive scalar arguments. The measured wrapper parses a JSON argument tuple, calls the synchronous compute function, runs the existing strict result validator from `functions/json.ts`, and invokes a typed JSON.stringify encoder. Arbitrary objects do not cross the ABI directly. A direct record result mapped as string fails SC4003. Attempting to stringify the unchanged async function's Promise from a synchronous facade fails SC1090. Both diagnostics are retained in [abi-probes.json](wasm-workerd/raw/abi-probes.json). Supplementary round trips with emoji, accented text, CJK and an embedded NUL match JavaScript exactly.

The tested ABI is `bench_run(inputPointer, inputByteLength, outputPointerSlot, outputLengthSlot)`. Both slots are four-byte little-endian i32 values. The host allocates input bytes and eight bytes of slots with `scriptc_alloc`, writes UTF-8, calls the export, refreshes views after possible memory growth, decodes the result, and frees only its own allocations with `scriptc_free`. Module-owned result bytes are copied before the next application export resets the result arena. `_initialize` precedes `bench_init`. No raw reference or promise crosses this interface.

### Imports and size

Every measured module imports `scriptc.panic` and these thirteen Preview 1 functions:

`fd_close`, `environ_get`, `environ_sizes_get`, `clock_time_get`, `fd_fdstat_get`, `fd_fdstat_set_flags`, `fd_prestat_get`, `fd_prestat_dir_name`, `fd_read`, `fd_seek`, `fd_write`, `path_open`, and `proc_exit`.

A compute-only JS adapter supplies an empty environment, no preopened directories, a clock, standard-stream behavior and explicit WASI errors for unavailable filesystem operations. Unsupported import names fail instantiation. Errors/panics throw. The observed calls are environment sizing, a preopen probe and initialization/fixture clocks; no filesystem or network access is needed by the hot loops. This small adapter is experimental, not a general WASI implementation. Native Worker Wasm imports do not automatically supply a Preview 1 environment. Full import/export lists and hashes are in [artifacts.json](wasm-workerd/raw/artifacts.json).

| Reactor | Raw bytes | Gzip bytes | SIMD instructions |
| --- | ---: | ---: | ---: |
| sync-original-fixture | 421,506 | 155,496 | 0 |
| revenue | 564,549 | 200,052 | 0 |
| regex | 639,072 | 241,860 | 0 |
| vector | 494,397 | 178,345 | 0 |

Sizes include the runtime and generated fixture logic, not precomputed fixture payloads. Gzip uses Node zlib's default settings. Every module fits the brief's 3 MB free and 10 MB paid compressed budgets. The [current Cloudflare limits page](https://developers.cloudflare.com/workers/platform/limits/#worker-size), checked on 2026-11-01, instead lists a 64 MiB uncompressed limit and no compressed size limit; these modules fit that limit too. A complete vinext application bundle was not built or size-certified.

WABT disassembly finds **zero v128 or lane-vector instructions** in all four reactors, including the int8 kernel. The initial memory is 266 pages, about 16.6 MiB. There is no evidence of native SIMD acceleration carrying over to this stock Wasm target. The patched native-compiler results in earlier research are not evidence for this target.

## Workloads and measured boundary

- **Revenue:** the demo's existing revenue function and generator at 5,000, 15,000 and 200,000 events. Arguments are the full January date interval, size, and profile=false. As in the prior reports, fixtures are generated lazily once per size/runtime and parsed on every query. Fixture initialization is in the recorded warmup, outside the measured window. The input boundary carries the same four arguments as the current sidecar, not all event objects. Every response includes all 248 daily rows and timings=null.
- **Regex control:** a synthetic access-log normalization workload at the same three sizes. Each iteration splits a stored log, redacts emails, IPv4 addresses and tokens with regexes, extracts status/path, normalizes IDs and groups routes with a Map. It returns deterministic counts and route groups. This is a new string-heavy control, not an existing use-native demo export. Its fixture is generated and cached before measured calls.
- **Int8 vector upper bound:** the repository's xorshift corpus generator, signed int8 dot-product loop, integer truncation and top-10 insertion at 100,000 × 768 dimensions. The HTTP Request/Response shell is replaced by JSON arguments/results; the arithmetic and tie behavior remain the same. A fixed 768-element query crosses the JSON boundary. A synthetic immutable corpus is generated separately in each runtime. This is a diagnostic upper bound, not a second independent realistic application win. **Review note:** the kernel uses the natural `corpus[i]*embedding[j]` form (src/vector.ts:23), which stock scriptc lowers through its slow path (409 ms vs 10 ms natively on Vercel; see [scriptc-int8-range-analysis.md](scriptc-int8-range-analysis.md)). The 10.75× vector loss therefore mostly reflects that known compiler gap, not WebAssembly itself; a `Math.imul` variant was not measured. The verdict rests on revenue, which does not have this issue.

The two Worker variants receive the same POST argument JSON. JS parses it, awaits the function and emits JSON. Wasm additionally performs the production strict argument validation and stringify in JS, UTF-8 encoding/copy, the Wasm facade's JSON parse, compute, strict result validation and typed encoding, output decoding and host JSON parse, before the common response encoding. This includes the JSON boundary and its safety checks. There is no unsafe numeric-only fast path. No profiling timers inside a workload are used as measurements.

All warmup and measured responses are hashed over **the complete result JSON bytes** using SHA-256, not selected fields. Workerd variants, Node variants and the native revenue reference agree with the stored full-result fixtures. Hashes and every sample are committed. Allocation/fixture initialization is warm, not removed from the raw record. Cold startup, concurrent requests and a full framework render are outside this experiment.

## Workerd method and results

Local **workerd 1.20261031.1**, compatibility date 2026-10-31, macOS arm64 on an Apple M4 Pro with 24 GiB RAM. Esbuild 0.28.2, WABT 1.0.39. Each workload/size uses two fresh, separate workerd processes and separate isolates, one per variant. Only one variant receives requests at a time. Both share the same machine, source and fixture definitions. No deployment or Cloudflare account was used.

Thirty warmups **per variant per case** alternate JS/wasm order. Six measured batches of twenty requests follow per variant, with JS-first/wasm-first order alternating by batch. Thus there are **120 measured responses and 30 warmups per variant per case**, 2,100 successful workload requests in the full workerd run. There are no measured retries or filtered outliers. Wall times use the external Node client's performance.now, from request submission through reading the complete response. Hashing occurs after that bracket.

CPU is cumulative **workerd process user+system CPU**, sampled immediately before/after each twenty-request batch through macOS libproc proc_pid_rusage. Raw Mach counters and the 125/3 timebase conversion are retained. The calibration measured 263.438 ms through libproc against Node process.cpuUsage's 262.329 ms around a 250 ms busy loop. CPU averages below divide each batch CPU delta by twenty and average all six batches. They include workerd background/JIT/GC/runtime overhead, but exclude the external client and sampler processes. They are useful local CPU evidence, **not Cloudflare billed CPU readings**.

CPU numbers below are means in milliseconds/request. Wall columns are nearest-rank median / p95 in milliseconds over all 120 individual requests. Speedup is JS CPU divided by wasm CPU; GO requires at least 2.000× for two distinct realistic workloads.

| Workload | Size | JS CPU | Wasm CPU | CPU speedup | JS wall p50 / p95 | Wasm wall p50 / p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| revenue | 5,000 | 1.870 | 2.754 | 0.679× | 2.189 / 2.693 | 2.914 / 3.496 |
| revenue | 15,000 | 5.499 | 5.799 | 0.948× | 5.365 / 8.586 | 5.368 / 8.722 |
| revenue | 200,000 | 48.369 | 52.847 | 0.915× | 48.893 / 49.986 | 52.279 / 59.093 |
| regex | 5,000 | 4.117 | 7.332 | 0.562× | 4.290 / 4.993 | 7.254 / 7.897 |
| regex | 15,000 | 11.733 | 21.316 | 0.550× | 11.891 / 12.732 | 21.324 / 22.665 |
| regex | 200,000 | 162.033 | 283.177 | 0.572× | 162.452 / 167.733 | 279.298 / 313.139 |
| vector | 100,000 | 52.656 | 566.305 | 0.093× | 52.733 / 55.771 | 563.925 / 569.609 |

The large-revenue smoke test initially showed a wall-time win for wasm. It does not survive the complete warmed workerd window: the final 200k wasm CPU is 9.3% higher, and the median/p95 both lose. That initial favorable sample remains in [workerd-smoke.json](wasm-workerd/raw/workerd-smoke.json).

The machine was **not otherwise idle**. Background browser, camera, UI, virtualization and intermittent Spotlight work were already running; none was stopped or manipulated. Process inventories before and after the full run are in the raw data. No compiler, other benchmark, Docker action or agent-started CPU-heavy work overlapped the measured run. Existing load, scheduling and DVFS can affect elapsed time and CPU ratios. Alternating order and direct process CPU help, but this is one host and one window, without confidence intervals or a production billing claim.

[Cloudflare's timer documentation](https://developers.cloudflare.com/workers/runtime-apis/performance/) says deployed timer values advance after I/O; local development may have advancing timers. The experiment follows the stricter requested method regardless and takes no timings from inside the Worker.

### Memory is a separate integration blocker

| Workload | Size | Wasm linear memory bytes after run | MiB |
| --- | ---: | ---: | ---: |
| revenue | 5,000 | 22,544,384 | 21.50 |
| revenue | 15,000 | 31,064,064 | 29.63 |
| revenue | 200,000 | 129,302,528 | 123.31 |
| regex | 5,000 | 20,643,840 | 19.69 |
| regex | 15,000 | 24,510,464 | 23.38 |
| regex | 200,000 | 111,214,592 | 106.06 |
| vector | 100,000 | 152,240,128 | 145.19 |

The vector reactor alone reaches **145.19 MiB** of linear memory. The [Workers memory limit](https://developers.cloudflare.com/workers/platform/limits/#memory) is 128 MB per isolate, including JS and Wasm allocations. Standalone workerd did not enforce that hosted quota here, so a successful local vector response is not proof of hosted feasibility. Revenue 200k reaches about 123.31 MiB in linear memory alone, leaving little room for the host heap. Linear memory is its current committed capacity, not a measurement of the highest transient isolate usage. Process RSS is retained per batch but includes workerd's other allocations and cannot be equated to isolate memory.

## Node V8 cross-check

Node **v24.22.0**, V8 **13.6.233.17-node.57**, same host, source algorithms, Wasm artifacts and bridge. This compares JS and Wasm inside one Node/V8 process, rather than comparing a Wasm runtime to a different language runtime. It does not assert that Node and workerd have the identical V8 revision or flags. Thirty warmups and 120 measured calls per variant/case, alternating variant order per call. performance.now and process.cpuUsage bracket request-JSON parsing through final result encoding; no loopback HTTP or Response object is involved. Every result is checked against the complete workerd result. CPU figures are individual-call means; wall percentiles use all measured samples.

| Workload | Size | JS CPU | Wasm CPU | CPU speedup | JS wall p50 / p95 | Wasm wall p50 / p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| revenue | 5,000 | 1.814 | 2.318 | 0.783× | 1.751 / 1.940 | 2.205 / 2.334 |
| revenue | 15,000 | 5.220 | 4.396 | 1.188× | 5.093 / 5.662 | 4.275 / 4.709 |
| revenue | 200,000 | 82.730 | 47.056 | 1.758× | 70.622 / 77.809 | 46.163 / 52.395 |
| regex | 5,000 | 9.829 | 6.208 | 1.583× | 9.585 / 9.991 | 6.184 / 6.453 |
| regex | 15,000 | 29.086 | 18.598 | 1.564× | 29.095 / 29.951 | 18.614 / 19.022 |
| regex | 200,000 | 402.250 | 247.114 | 1.628× | 395.998 / 407.837 | 246.107 / 250.735 |
| vector | 100,000 | 61.310 | 557.358 | 0.110× | 61.226 / 62.066 | 558.229 / 560.943 |

Node retains real gains in this run: 200k revenue reaches 1.76× and the regex control reaches 1.56–1.63×. Neither reaches 2×, and those gains are absent in workerd. Node is a diagnostic, not the go/no-go source. The alternating variants share a Node process and heap, so process-wide GC/JIT CPU can be charged to the current variant; fixtures also accumulate across sizes on the JS side, while each Wasm case starts with a new instance. Keep those limits when reading differences from the separate-process workerd comparison. All Node wins and losses remain in [node.json](wasm-workerd/raw/node.json).

## Native sidecar reference

The stock native executable uses the existing production serveFunctions listener, strict serializer and callNative Node client, with the same async revenue source. It is an optional local wall-time reference, not a Workers implementation or combined-parent/child CPU comparison. Thirty warmups and 120 measured calls per size, all complete-result hashes match.

| Revenue events | Native call p50 / p95 ms |
| ---: | ---: |
| 5,000 | 1.400 / 1.457 |
| 15,000 | 2.661 / 2.857 |
| 200,000 | 25.659 / 27.486 |

## Integration decision

Do not build a production Cloudflare/vinext adapter on the expectation that this stock scriptc Wasm path will cut CPU bills in half. No measured Worker case meets the CPU threshold, and current function eligibility conflicts with synchronous library exports.

A real adapter would still need synchronous-compute extraction or a compiler ABI that supports the existing async functions. Removing async is valid for this revenue body because it contains no await; it is not a valid general transformation for promises, timers, I/O or framework effects. The [scriptc platform documentation](https://scriptc.dev/docs/platforms) distinguishes standalone WASI programs from library mode; executable async support does not make reactor exports asynchronous.

It would also need a supported WASI adapter and capability policy, strict JSON wrappers and memory ownership, trap recovery by discarding failed instances, memory budgeting for independent fixtures/caches, and per-isolate initialization/lifecycle handling. The prototype bridge throws on panic but does not implement production instance replacement. Clocks used for compute profiling remain unsuitable in deployed Workers. No networking, child process, filesystem or arbitrary Node fallback has been demonstrated inside these reactors. Bundle size is not the blocker for these functions; heap capacity and CPU are.

[vinext uses Vite and workerd](https://github.com/cloudflare/vinext/blob/main/README.md), rather than the next build/Turbopack path used by this adapter today. An integration would need a server-only Vite extraction/transform, Wasm module emission/bundling and appropriate development behavior. A .wasm imported as a Worker module is viable, as this direct workerd test demonstrates, but no Vite plugin, Next server render, Server Action or vinext application was built in this research. Supporting vinext would not by itself change these compute results.

## Reproduce and audit

Use Node 24 or newer, Python 3 on macOS, Zig on PATH and a stock scriptc 0.4.6 executable. From the worktree root:

```sh
mkdir -p .checks/wasm-workerd
cp research/wasm-workerd/scratch-package.json .checks/wasm-workerd/package.json
cp research/wasm-workerd/scratch-package-lock.json .checks/wasm-workerd/package-lock.json
npm ci --prefix .checks/wasm-workerd --cache .checks/wasm-workerd/npm-cache --no-audit --no-fund
export SCRIPTC=/absolute/path/to/stock/scriptc.exe
node research/wasm-workerd/build.mjs
node research/wasm-workerd/prepare.mjs
node research/wasm-workerd/measure.mjs
node research/wasm-workerd/node-measure.mjs
node research/wasm-workerd/native-reference.mjs
node research/wasm-workerd/abi-probes.mjs
node research/wasm-workerd/inspect.mjs
node research/wasm-workerd/verify.mjs
```

Run those commands sequentially. The benchmark intentionally binds only 127.0.0.1, uses ports 18990/18991 for the paired workers, and shuts down its own children. Existing raw filenames are overwritten on a deliberate reproduction; preserve the committed run first or use BENCH_OUT for measurements. Set WARMUPS/BATCHES/BATCH_SIZE only for a separately named workerd smoke run; Node uses WARMUPS/SAMPLES.

[Raw data and scripts](wasm-workerd/), [full workerd samples](wasm-workerd/raw/workerd.json), [Node samples](wasm-workerd/raw/node.json), [summary and verification](wasm-workerd/raw/summary.json), [full output fixtures](wasm-workerd/raw/revenue-5000-result.json), and [setup failures](wasm-workerd/logs/setup-notes.txt) are retained. The smoke run's CPU fields mistakenly label Mach ticks as nanoseconds; those CPU summaries are invalid, clearly separated from the corrected full run, and retained rather than silently replaced. All CLI/profile/schema setup errors occurred before the full measurements. No measured response failed or was removed.

Generated binaries, Wasm/WAT files, staging files, downloaded tools and caches from this experiment are removed after recording sizes, exports, imports, hashes and results. No file outside this worktree was deleted or modified intentionally. No secret file was read, printed or committed. No deployment, push, upstream issue/PR, Vercel Sandbox or Docker operation was performed.
