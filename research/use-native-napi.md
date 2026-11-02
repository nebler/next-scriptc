# In-process scriptc revenue through N-API

2026-11-01. Branch `t3/research-native-napi`. Base `f28e0efa0fbad1fe65800fc0ef8c17d7152a71bc`.

The serialized native instance passes the speed gates locally: its async boundary costs **0.018 ms median / 0.023 ms p95**, and 5k revenue takes **1.402 ms / 1.554 ms**, versus plain Node **1.856 ms / 2.017 ms**. The thread-local alternative fails the 5k gate at **2.201 ms / 2.370 ms**. **GO for a local serialized synchronous-core prototype**, with identical results and no crashes or unbounded RSS growth observed in the completed soak. This is not a production adapter GO.

This is a feasibility experiment for synchronous native cores. It does not implement general async `"use native"` extraction or certify Vercel execution.

## What compiled and how values cross the boundary

Stock scriptc **0.4.6**, runtime-pack ABI **47**, release optimization. The compiler and macOS runtime are the installed packages in the main checkout's `node_modules`. Neither the source checkout at `/Users/noah/scriptc` nor the patched fork was modified or used as a compiler. The Linux pack is stock `@scriptc/runtime-linux-x64-gnu@0.4.6`. Zig is **0.16.0**. Apple clang and artifact hashes are recorded in [artifacts.json](napi/raw/artifacts.json).

The staging script copies the demo's revenue, fixture helper, and event generator. It removes only `async` from the native revenue declaration and adjusts import paths. The Map aggregation, date filtering, sort, JSON parser, deterministic generator, and lazy fixture cache remain unchanged. A facade parses `[from,to,size,profile]`, calls revenue, and applies the existing strict result validator with its typed JSON encoder. The original async declaration remains in the Node baseline and HTTP sidecar. Profile is false, so timings are null and every output is deterministic.

`scriptc build --lib --profile PROFILE -o revenue.lib.a` produces a static archive containing the program **and selected library runtime objects**. `localize_runtime:true` hides the runtime internals. On macOS the archive has one merged `library.localized.o`. It has no `main`. The final addon links that archive once; adding executable runtime archives would be wrong. The `--print=native-link-info` option is for program objects and is explicitly rejected in library mode, so it is unnecessary here. [Build and link commands](napi/build.mjs) and [symbol audits](napi/logs/symbols.log) preserve the actual recipe.

The minimal library profile does **not** automatically emit a contract JSON. Contract sidecars are opt-in via a separate `sidecar` profile section for an application Model/Msg schema. This function experiment preserves its [profile](napi/raw/profile.json), [serialized profile](napi/raw/profile-serialized.json), exported symbols, and artifact hashes as its ABI record.

The tested native C signatures are:

```c
void rev_init(void);
void rev_run(const uint8_t *input, size_t length,
             const uint8_t **output, size_t *output_length);
void rev_echo(const uint8_t *input, size_t length,
              const uint8_t **output, size_t *output_length);
```

The input is UTF-8, copied into a runtime string. Objects do not cross directly. Outputs belong to the runtime result arena and expire on the next application export, initialization, or collection. The shim copies output bytes before another call can reset that arena, then creates a Node string on the JS thread. Native input can be ordinary host `malloc` memory; Wasm's allocation exports and linear-memory offsets are unnecessary. Native slots are pointer-sized and `size_t`, not Wasm i32 slots. Embedded NUL, accented text, CJK, emoji, empty strings, and a 100 KB string round-trip correctly. A lone UTF-16 surrogate follows Node's UTF-8 replacement behavior.

The plain C shim uses `node_api.h`, without node-addon-api or node-gyp. Headers are cached Node 24.22.1 headers. It loads successfully on Node 24.22.0 and Node 26.13.0. `revenueJson` returns a string synchronously. `revenueJsonAsync` uses `napi_async_work`, copies arguments before scheduling, makes no N-API calls in the execute callback, and creates the result string on completion.

## Runtime ownership is the decisive choice

The inspected source tree is commit `639d92327d7ab95bb0153930a2a8d0c8444cf468`. Relevant read-only files are `packages/compiler/src/library/library-profile.ts` and `packages/runtime/src/{scr_core.h,scr_library.c,scr_alloc.c,scr_console.c}`. Source hashes are recorded in the artifact record. These describe the contract; the stock package builds and runtime checks establish what worked here.

- The library runtime has no event loop, owns no worker threads, installs no signal handlers, and registers no process `atexit` hooks. Executable startup is excluded by `SCR_LIB`. Lazy cleanup registers with the library reset registry. The runtime owns an allocator, reference counts, a cycle collector, caches, and application globals. It does not use V8's heap or GC.
- A default instance must remain on **one OS thread for its whole life**. A mutex around calls from arbitrary libuv workers does not satisfy that contract.
- With `instance_per_thread:true`, mutable program and runtime state become thread-local. Each OS thread initializes once and has independent fixtures, arena, collector, and panic state. Four libuv workers can compute concurrently. The observed TLS variant is substantially slower than the default runtime. TLS access is a plausible cause, not an isolated causal measurement.
- The faster serialized variant disables thread instances and routes **all** entries to one permanent pthread. The sync path waits for that thread. The async path queues libuv work whose execute callback waits for the same owner. Up to 16 outstanding requests are supported but native computation is serialized. This extra wait is included in all reported timings.
- Neither design is reentrant. Runtime-owned bytes never escape a call. A production async queue should avoid occupying libuv workers while awaiting a separate owner, and must handle backpressure and shutdown.

Signal handler pointers for INT, TERM, PIPE, SEGV, BUS, ABRT, USR1, and USR2 remain unchanged after init and concurrent calls. TLS initialization adds no threads. After prestarting the libuv pool, its thread count stays at 11; serialized ownership adds exactly one thread (12). JS timer ticks continue during async calls. Four independent Node worker isolates also return correct results. These tests cover the selected compute workload, not every scriptc API.

A panic sink copies diagnostics and longjmps **out** of native frames. The instance is then permanently poisoned. Subsequent entries are rejected by the shim, without reentering scriptc. In TLS mode an unpoisoned sibling worker still answers. In serialized mode every later request fails until process restart. Recovery cannot safely call init. A native segmentation fault still kills Node. [Coexistence results](napi/raw/coexist.json) and [serialized results](napi/raw/coexist-serialized.json) include these tests.

## Warm call measurements

Apple M4 Pro, 12 cores, 24 GiB RAM, macOS 26.6.1. Primary host is **Node 24.22.0**. Each size has 50 discarded warmups and 300 measured samples **per mode**, with the mode order rotated on each iteration. Calls are sequential. Every result is SHA-256 checked against plain Node after the timer stops. All warmups, outliers, and samples remain in [measure.json](napi/raw/measure.json.gz). No sample was filtered.

The Node baseline is the direct original async function. Addon timings include strict argument serialization, native argument parsing, compute, native strict result validation and encoding, UTF-8 copies, and Node result parsing. The sidecar uses the existing `serveFunctions` and `callNative` code, built with the adapter's existing release/strip/node-islands-off flags. This is the local function RPC path, without a Next HTTP request around it. Fixtures initialize once per size and runtime during warmup. The boundary carries the four small arguments, not all event objects. These local numbers cannot replace the earlier 1-vCPU Vercel results.

| Events | Plain Node | Sidecar | TLS sync | TLS async | Serialized sync | Serialized async |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1000 | 0.400 / 0.434 | 0.982 / 1.182 | 1.213 / 1.318 | 1.248 / 1.365 | 0.827 / 0.915 | 0.837 / 0.932 |
| 5000 | 1.856 / 2.017 | 1.725 / 1.932 | 2.175 / 2.366 | 2.201 / 2.370 | 1.395 / 1.571 | 1.402 / 1.554 |
| 15000 | 5.377 / 5.669 | 3.005 / 3.253 | 4.245 / 4.503 | 4.258 / 4.543 | 2.602 / 2.828 | 2.602 / 2.800 |
| 200000 | 72.249 / 74.933 | 26.741 / 29.308 | 42.927 / 44.736 | 42.906 / 44.723 | 24.917 / 25.912 | 24.828 / 25.779 |


Cells are **median / p95 milliseconds**. At 5k, serialized async is 24.5% faster than direct Node. At 200k, it is 2.91× faster. Both addons still lose at 1k. TLS loses at 5k despite its cheap echo boundary. The local sidecar already narrowly wins at 5k; the historical Vercel loss is not reproduced on this workstation. In-process serialization widens the local margin but has not demonstrated the flip on Vercel hardware.

No builds, downloads, Docker operations, or other agent-owned CPU workloads overlapped timed runs. The shared workstation was **not fully idle**: existing UI, VM, and system processes used CPU. They were left untouched. A process snapshot is retained in [environment-during-measure.log](napi/logs/environment-during-measure.log). Rotating comparisons reduce ordering bias but do not remove this limitation. The Node 26 TLS-only pilot is retained separately in [measure-node26-tls.json](napi/raw/measure-node26-tls.json.gz), including its losses.

## Fixed boundary and first call

The echo test discards 1,000 warmups and retains 20,000 calls per size and mode. It includes UTF-8 conversion, native input copy, result arena, host copy, async scheduling where applicable, and return to JS. It excludes JSON parsing and validation. At one byte, median / p95 milliseconds are TLS sync **0.000958 / 0.001209**, TLS async **0.010875 / 0.013500**, serialized sync **0.007417 / 0.011375**, serialized async **0.018000 / 0.023167**. At 24 KB, serialized async is **0.024708 / 0.043042**. Both pass the 0.1 ms boundary gate at median and p95. Rare scheduling outliers exceed it, including a 1.84 ms maximum for the serialized one-byte async echo. The gate is interpreted as steady median overhead, not a hard latency bound. [All samples](napi/raw/boundary.json.gz) remain available.

Cold tests use ten fresh processes per size and mode, with warm filesystem caches. The addon initializes lazily on its first call, once per owning thread. Module-load time, first-call time, total in-child time, and parent spawn-to-exit time are separate. Types are stripped **at build time** for the Node and sidecar client baselines. An initial run loaded `.ts` files directly and paid about 47 ms in the Node type loader; that unsuitable comparison is retained in [cold-typescript-loader.json](napi/raw/cold-typescript-loader.json). Corrected results are in [cold.json](napi/raw/cold.json).

At 5k, median total load-plus-first-call time is Node **6.172 ms**, sidecar **29.699 ms**, TLS sync **5.575 ms**, TLS async **5.663 ms**, serialized sync **4.130 ms**, and serialized async **4.284 ms** (p95 **4.599 ms**). Serialized async splits into **1.533 ms load** and **2.741 ms first call**, including initialization and fixture generation. A cold serialized async echo is **2.276 ms total**, with **0.734 ms** in first-call runtime initialization, thread setup, and boundary work. These are in-child timings. Parent spawn-to-exit measurements in the raw data additionally include Node startup, hash verification, and exit.

## Soak and correctness

The completed serialized async run verifies **100,000 calls at 1k**, **1,000 at 200k**, and **2,000 mixed-size calls with 16 outstanding requests**. Every SHA-256 matches plain Node. There are no crashes or mismatches. The small phase uses four outstanding requests and the large phase four, all executing on the single owner thread. RSS falls from **258.0 to 117.8 MiB** during the small phase, then rises to a large-workload plateau of **166.2 MiB**. The last ten large-phase samples span **166.0–166.2 MiB**, without unbounded growth. See [soak-serialized.json](napi/raw/soak-serialized.json).

An interrupted earlier run completed **100,000 synchronous 1k calls** and recorded **500 synchronous 200k calls**, all correct, before the orchestration interruption stopped the process. That run is retained in [soak-serialized-interrupted.json](napi/raw/soak-serialized-interrupted.json) and its log. It is not counted as a completed large synchronous soak. TLS receives the concurrency, Unicode, worker-isolate, panic-isolation, warm benchmark, and echo checks, but not a separate 100k soak: it already fails the 5k speed gate. The local GO applies to the serialized async design.

An additional [forced-Node-GC check](napi/raw/leak-check.json) verifies **3,100 more 200k calls**. After batches ending at 100, 1,100, 2,100, and 3,100 calls, RSS is **206.1, 229.3, 176.8, and 99.0 MiB**, respectively. Node heap usage settles around 19.2 MiB. No monotonically growing native-memory footprint is observed. This brings the completed async validation to **106,100 calls**, separate from the interrupted sync run. Reproduce with `node --expose-gc research/napi/leak-check.mjs`.

RSS checks are observations of high-water behavior, not proof that all allocations are freed. Fixtures and allocator capacity intentionally remain resident. No explicit native collection is added to the call loop. TLS instances have no teardown when their OS thread exits: the documented contract retains their memory until process exit. Reusing a stable libuv pool is essential; Node Worker churn or unload requires separate lifecycle work. The experimental permanent owner thread similarly has no addon unload hook.

## Linux and packaging

Both TLS and serialized variants compile and link as **ELF x86-64 shared objects**, targeting `x86_64-linux-gnu.2.34`, using Zig 0.16.0 and the matching stock runtime pack. The generated runtime is suitable for shared linking; no non-PIC relocation failure occurred. Final unresolved-symbol audits contain no `scr_*` or `rev_*` references. Node N-API imports remain unresolved for the Node host, as expected. ELF dependency records name libc, libm, and the ELF loader; required GLIBC versions top out at 2.34. [TLS audit](napi/logs/linux-elf.log) and [serialized audit](napi/logs/linux-serialized-elf.log) preserve the evidence.

Linux **was not executed**. There was no Docker, Vercel Sandbox, or deployment. Linking alone does not certify Lambda loading, runtime safety, or Linux performance. macOS TLS addon is 1,389,440 bytes (645,736 gzip), serialized addon 1,372,856 bytes (648,810 gzip). Linux TLS is 665,704 bytes (326,052 gzip), serialized 676,944 bytes (334,533 gzip). These include the selected runtime and generated fixture logic. The local sidecar binary is 804,904 bytes. The full compiler runtime pack download is about 203 MB unpacked and is a build dependency, not a required runtime artifact.

## Failed approaches and adapter blockers

The unchanged async export fails **SC4004**. Mapping its record result directly to `string` fails **SC4003**. [Probe logs](napi/raw/abi-probes.json) retain both diagnostics. A synchronous facade and JSON string boundary are required. Library mode is static-only and excludes async functions, promises, and timers. Outbound FFI is executable-only. Merely exposing an async N-API wrapper does not make arbitrary async TypeScript library-compatible.

A real adapter still needs synchronous-core extraction or a restricted directive contract; Linux execution and performance validation; a queue with cancellation, backpressure, env cleanup, and panic restart policy; fixture-state ownership rules; independent-symbol prefixes for multiple libraries; artifact tracing and bundling of architecture-specific `.node` files; and a stable Node/runtime-pack ABI build matrix. TLS offers concurrency with duplicated fixtures and a measured speed penalty. A serialized owner offers better single-call speed but limits throughput and currently occupies libuv workers. Native traps share Node's failure domain. Packaging size appears manageable, but a complete Next/Vercel bundle was not built.

## Reproduce locally

Set `SCRIPTC` to the stock 0.4.6 executable and `NODE_HEADERS` to a cached Node include directory if the defaults do not apply. Use Node 24 for the measurement scripts. Run builds and measurements sequentially.

```sh
node research/napi/build.mjs
node research/napi/build.mjs --serialized --addon-only
node research/napi/probes.mjs
node research/napi/coexist.mjs
NAPI_SERIALIZED=1 node research/napi/coexist.mjs
node research/napi/measure.mjs
node research/napi/cold.mjs
NAPI_SERIALIZED=1 node research/napi/soak.mjs
node research/napi/summarize.mjs
```

For cross-linking, download `@scriptc/runtime-linux-x64-gnu@0.4.6` once into `.checks/napi`, extract it there, and pass its directory as `LINUX_PACK` to `build.mjs --linux`, then `build.mjs --linux --serialized`. No files outside this worktree were deleted. Downloads and unused archives were removed after artifact inspection; binaries and generated sources are ignored under `.checks/napi`. Scripts, raw evidence, failures, and this report are committed.
