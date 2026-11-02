# CF1: stock scriptc on Cloudflare through OpenNext

2026-11-02. **Integration works locally; select JS in every measured bucket.**
Stock scriptc 0.4.6 compiles the demo's synchronous `revenueCore` to a reusable
WASI reactor. The complete demo builds through OpenNext with `withScriptc`, and
Wrangler serves identical JS and wasm response bytes. The realistic 5k and 15k
cases use 6.2% and 10.8% more total workerd CPU on the wasm lane. No deployment,
login, account access, Vercel call, compiler fork change, or Papermark use occurred.
All performance results **need hosted confirmation**.

## Build integration

The prototype adds explicit `target: 'cloudflare'` and an optional
`cloudflare: { entry: 'cloudflare/revenue.ts' }` to `withScriptc`. The entry exports
`run(input: string): string`. It is an explicit facade, not automatic discovery.
Without an entry the target is JS-only. The Node target remains the default.

The Cloudflare branch runs before Node route/function discovery. It preserves
Next's route handlers as JS, skips sidecars, N-API construction, rewrites to local
processes, and Node startup. This matters because OpenNext sets standalone build
mode; the original adapter rejects standalone with native routes/functions.
`nativePromotion: 'auto'` is rejected on Cloudflare because its policy uses Node
CPU timers. Existing route group settings have no Cloudflare effect.

In `modifyConfig`, before Next compiles the app, the adapter emits
`.scriptc/cloudflare/compute.wasm`, a profile, and a Worker wrapper. This output
survives Next's cleanup of `.next`. OpenNext then builds its normal
`.open-next/worker.js`. Wrangler's main points to the wrapper, which statically
imports both the OpenNext worker and the wasm module, initializes the reactor
lazily on the first request, and forwards all OpenNext exports and handlers.
Instantiation/import failures preserve JS. Missing optional runtime packs or
compiler failures fail the opt-in build visibly. An unresolved static wasm import
is a bundling error, not a recoverable runtime fallback.

The runtime pack is resolved with `createRequire(app/package.json)`. No optional
dependency lookup falls back to an example or another checkout. The stock compiler
is the adapter's pinned dependency. The prototype requires runtime pack 0.4.6.
The demo fixture references this workspace's JSON validator explicitly; this is
research fixture source, not a published portable application template.

[Cloudflare's Wasm API](https://developers.cloudflare.com/workers/runtime-apis/webassembly/)
uses a bundle-time module import and `new WebAssembly.Instance(module, imports)`.
The runtime never compiles bytes or fetches wasm. The initial configuration used
compatibility date 2026-11-01, which the installed workerd rejected; the successful
build and run use 2026-10-30. OpenNext warns that Node middleware support is
experimental. The demo's middleware and `/api/cf1` nevertheless ran locally.
This does not certify every demo route on Workers.

## Library mode and transport

The installed CLI README explicitly documents `build --lib --profile` as a Wasm
reactor build on wasm32-wasi. The successful command was:

```sh
SCRIPTC_TARGET=wasm32-wasi SCRIPTC_RUNTIME_PACK=<app-resolved-pack> \
  scriptc build --lib --profile <profile.json> -o compute.wasm
```

This is stock **0.4.6**, runtime ABI 47, LLVM emission and default release
optimization. No IR rewriting, SIMD relink, fork, command-process startup or
per-call instantiation is used. `_initialize` and `bench_init` execute once per
isolate. Each subsequent call uses `bench_run(ptr, len, outPtrSlot, outLenSlot)`.
The bridge supplies a minimal compute-only WASI Preview 1 environment, rejects
unknown imports, and exposes no filesystem. It is not a general WASI host.
The installed-version build, module exports and imports are retained in
[build.json](cloudflare-provider/raw/build.json). The
[scriptc Wasm guide](https://scriptc.dev/docs/wasm) also describes reactors and
string ownership. Its illustrative package version is not the tested version.

The facade calls the existing synchronous demo `revenueCore` unchanged. Its
three strings contain the date range and an entire event JSON payload. The outer
argument tuple crosses as JSON, so event-string quotes are escaped once more.
The route validates the tuple before dispatch. Transport includes UTF-8 encoding,
allocation and a copy into linear memory, parsing the outer tuple, the existing
inner event parse, compute, strict result validation and typed JSON encoding,
output decoding, and allocation cleanup. Result slots are read after possible
memory growth; output bytes are copied before the next call resets their arena.

Input sizes are **32, 428,948 and 1,286,783 bytes** at 0, 5k and 15k events.
The empty case is a framework and boundary floor, not an isolated ABI benchmark.
Its total CPU is 2.631 ms JS versus 2.940 ms wasm. At realistic sizes the full
wasm lane adds 0.456 ms and 1.465 ms total CPU/request in this window. These
differences include compiler execution costs and cannot be attributed entirely
to copying or JSON. No standalone nanosecond transport-cost claim is supported.

## Timers and correctness policy

[Cloudflare documents](https://developers.cloudflare.com/workers/runtime-apis/performance/)
that deployed `Date.now()` and `performance.now()` advance after I/O as a Spectre
mitigation; local development may behave differently. In this local configuration,
a synchronous 20-million-iteration integer loop advances both timers by identical
amounts: **108, 5, 6, 6, 5 ms** in five final probes (JIT warmup affects the loop).
Thus local Wrangler does **not** reproduce frozen deployed timers. Local advancing
timers cannot justify shipping the Node thread-CPU dispatcher to Workers.

The prototype has no timing-based decisions. JS is the default static lane. An
explicit research-only request parameter selects wasm for the experiment. That
lane verifies the first three results per log2 UTF-8-input-byte bucket against
JS **as exact serialized bytes**, returns JS on mismatch, and permanently disables
the reactor for the isolate on mismatch or trap. Every 32nd call rechecks. Each
isolate starts fresh. Tests cover separate bucket counts, byte differences,
traps, absent modules, JS default behavior, and periodic demotion. The periodic
check does not guarantee detection of an error that occurs only on an unshadowed
input; this is the same inherent limitation of sampled shadow verification.

Recommendation: production uses an explicit, content-keyed calibration manifest
with lane choices per candidate and size bucket, plus the same correctness gate.
Include source closure, compiler, runtime, ABI, policy version, and target in its
key. Missing, stale or unmeasured buckets select JS. Keep calibration separate from
application builds so ordinary builds do not benchmark a loaded CI host. Accept
hosted calibration only after it exists; these local data select **zero wasm
buckets**. Timing across I/O measures scheduling and I/O too, adds request cost,
and is not a substitute for thread CPU. Do not use it for automatic promotion.

## End-to-end measurements

Next 16.4.3, OpenNext Cloudflare 1.20.15 (AWS core 4.1.14), Wrangler 4.156.0,
workerd 1.20261023.1, compatibility date 2026-10-30, Node 24.22.0 client,
Apple M4 Pro macOS arm64. The wasm is 548,518 raw bytes; its hash and gzip size
are in build.json. Final warmed linear memory is 34,930,688 bytes (33.31 MiB).
This is not a peak isolate memory measurement or hosted memory certification.

One Wrangler session serves both lanes of the **OpenNext-built** demo route.
Requests run sequentially: 40 warmups/lane/case, then six rotating-order batches
of 20 requests/lane/case. All **960 warmup and measured response hashes** agree
within their case, with zero failures or filtered samples. Status reports confirm
the reactor remains available and each measured bucket reaches 320 successful
wasm calls across the preliminary and final windows. The preliminary window is
excluded because its sampler read only the front workerd process.

The final sampler records macOS libproc cumulative user+system CPU for **both**
Wrangler workerd processes before and after each batch, with W2's Mach timebase
conversion. The first process fronts requests; the second contains most compute.
The table shows both their sum and the application process alone. Node fetch and
Python sampler CPU are excluded. No task build, test or other task computation
overlapped timing. Other agents and the existing Docker validation continued;
there is no affinity pinning or host isolation. CPU includes framework, JSON
boundary, GC/JIT, and periodic JS shadows (about 1/32 after gating). Wall is external
HTTP through the full response body. These are batch-average CPU means, not
individual request CPU tails or Cloudflare billed CPU.

| Events | JS total CPU ms | Wasm total CPU ms | JS app CPU ms | Wasm app CPU ms | JS wall p50/p95 ms | Wasm wall p50/p95 ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 2.631 | 2.940 | 1.903 | 2.160 | 2.927 / 4.255 | 3.089 / 4.459 |
| 5,000 | 7.355 | 7.811 | 6.094 | 6.485 | 6.632 / 8.278 | 7.381 / 9.206 |
| 15,000 | 13.528 | 14.993 | 11.540 | 12.896 | 12.240 / 14.666 | 13.718 / 20.355 |

The realistic cases lose on both total and application-process CPU and wall.
One workload at two sizes is not two independent workload results. There is no
stock win here. W2 previously found stock losses on all five synthetic kernels;
its fork-plus-SIMD gains do not transfer to this stock-only integration. This
prototype establishes local compatibility and correctness, not a performance
reason to enable the lane.

[Raw counters, response hashes and probes](cloudflare-provider/raw/measurement.json),
[successful build log](cloudflare-provider/logs/build.log),
[91-test full adapter suite](cloudflare-provider/logs/tests.log), and
[both shim checks](cloudflare-provider/logs/shim.log) are retained.

## Packaging recommendation and limits

Keep `target: 'node' | 'cloudflare'` explicit. Do not infer Cloudflare from a
runtime global or environment variable that might also exist in CI. A future
Cloudflare options object should contain static calibration and correctness
settings, not Node promotion thresholds. Resolve OpenNext, Wrangler and the wasm
runtime from the app. Test their supported versions and require a clear opt-in
before generating a Worker wrapper. Warn or reject Node-only route group options
rather than silently treating them as Worker process isolation.

CF1 deliberately supports one manually selected facade and no automatic promotion,
multi-candidate registry, production calibration schema, automatic module pruning,
or general WASI implementation. The demo's `lane=wasm` is a research override,
not a production recommendation. Unsupported discovery/compilation should retain
JS with a build diagnostic when best-effort discovery is implemented; an explicit
entry currently fails the build so missing integration cannot pass unnoticed.
Runtime initialization errors, traps and mismatches fall back to JS. No Cloudflare
CPU timing API is assumed. Keep the N-API dispatcher separate from this runtime.

## Reproduce locally

```sh
pnpm install
# If install scripts were disabled, reinstall with scriptc build scripts enabled.
NEXT_SCRIPTC_CLOUDFLARE=1 NEXT_TELEMETRY_DISABLED=1 WRANGLER_SEND_METRICS=false \
  pnpm --filter demo exec opennextjs-cloudflare build
WRANGLER_SEND_METRICS=false pnpm --filter demo exec wrangler dev --local --port 18995
# In another shell, after all builds/tests finish, identify both workerd PIDs:
ps -axo pid,ppid,command | rg 'workerd serve'
node research/cloudflare-provider/measure.mjs FRONT_PID APPLICATION_PID
pnpm --filter next-scriptc test
pnpm --filter next-scriptc test:shim
```

Use Node 24.22.0 and no more than two compilation/test jobs. The initial install
left scriptc's incomplete native-install placeholder; invoking its installer via
the resolved module repaired this worktree installation before the retained full
suite. All 91 adapter tests and both shim checks pass. Remove task-created
node_modules, `.next`, `.open-next`, `.wrangler`, and `.scriptc` after reproduction.
No artifact needs to be published to reproduce CF1.
