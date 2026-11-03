# W1: the shared forecast in browser wasm

2026-11-03. Stock scriptc wins on D1 in Node WebAssembly and real Chromium.
An opt-in browser lane is implemented for Next client bundles and Vite client
builds. The forecast source is unchanged. This is a local, purpose-built numeric
result, not evidence of automatic wins in held-out applications.

## Feasibility first

The CF1 reactor command compiles a string facade importing D1's `forecast`.
`build --lib --profile` uses stock scriptc 0.4.6, LLVM release emission,
`SCRIPTC_TARGET=wasm32-wasi`, the app-resolved runtime pack 0.4.6, ABI 47.
No compiler checkout or code changes are involved. The facade parses a tuple,
calls the original function and serializes its result. The compute-only Preview 1
shim initializes once, allocates/copies UTF-8, calls `bench_run`, copies the
result before the next call, and frees input/slot allocations. Unsupported imports
fail initialization. No filesystem, SharedArrayBuffer or cross-origin isolation.

The worktree started with 19 GiB free. Chrome was installed; no browser was
downloaded. The shared preview initially reported unavailable but opening a tab
made real Chromium available. Measurements use that automated Chromium 152 /
Electron 44 preview, not an independently launched Playwright Chromium. Node is
26.13.0 on macOS arm64, Apple M4 Pro. `crossOriginIsolated` was false.

For each lane/size: 30 warmups, then 51 alternating-order wall samples. Wasm
includes JSON serialization/parsing, UTF-8, allocation/copy and cleanup. Browser
clock resolution is about 0.1 ms; the 1k ratio is especially coarse. The benchmark
checks four seeds at each size and every measured output. All results agree
exactly, including the 10k/42 result of 5,191 solvent paths and $1,918,005,384
summed ending cash. Timing does not include download, compilation, HTTP or runtime
shadow checks. No task builds or suites ran during this feasibility window;
unrelated host activity was not isolated. There are no confidence intervals.

| Paths | Node JS ms | Node wasm ms | Speedup | Chromium JS ms | Chromium wasm ms | Speedup |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 1.318 | 0.209 | 6.29× | 0.30 | 0.20 | 1.50× |
| 10,000 | 13.840 | 2.065 | 6.70× | 3.30 | 2.10 | 1.57× |
| 100,000 | 138.894 | 20.463 | 6.79× | 33.60 | 20.50 | 1.64× |

The browser's much faster JS baseline narrows D1's native advantage considerably.
The dense Park–Miller numeric loop still clears this very small JSON boundary.
CF1's object-heavy revenue loss and CO1's scalar-boundary win remain consistent
with these results. This does not establish the same gain for arbitrary functions,
other browsers, mobile hardware, or cold short-lived pages.

[Raw samples, versions, parity results and sizes](browser-wasm/evidence.json).

## Build and runtime design

`scriptc-promote/browser/next` exports async `withBrowserWasm`; a separate
`scriptc-promote/browser/vite` plugin handles Vite client production builds.
Both reuse ordinary discovery, strict source closure, boundaries and source
rewrites. No B1 discovery file, existing Vite plugin or Next function build file
is edited. The first version selects functions explicitly by source/export.
Automatic promotion and `"use native"` eligibility use the existing checks.

The generated facade compiles the extracted source, with one reactor per selected
function and a content-hashed static asset. Next writes `public/scriptc/*.wasm`
and adds browser-only Turbopack / client webpack rules; Vite emits Rollup assets.
Original server imports retain the Node adapter. Next's wildcard rule list must
compose with the native adapter's rules, and generated imports must be relative
for Turbopack. A production-browser check caught and corrected both integration
issues after an initially successful build had silently left the browser in JS.

Calibration uses explicit log2 workload-size buckets, not tiny JSON byte lengths.
The example selects `args[0].trials` and enables only measured buckets 9, 13 and 16.
A build-reported key includes complete extracted source, schema, compiler, target,
ABI and policy version. Absent keys leave all buckets in JS; stale keys fail the
opt-in build. Ordinary builds never calibrate on a loaded host. Calibration is
local evidence, not a portable device performance guarantee.

On first invocation the synchronous wrapper returns JS and schedules one cached
async fetch/compile/instantiate promise. Initial rendering does not wait for wasm.
Once ready, a validated input in an enabled bucket can use wasm. The first three
calls per bucket and every 32nd call compare canonical results to JS. A mismatch
returns JS and permanently disables that function's reactor; traps, missing
assets, failed fetch and instantiation also permanently select JS until reload.
The aggregate snapshot contains lane, readiness, checks, mismatches, fallbacks
and wasm calls without arguments/results. Sampled verification is not a proof.

The example preserves its server panel and adds independent browser lane,
verification counts and duration. First verification calls execute both lanes.
Ready wasm runs synchronously on the main thread, so long computations can still
block interaction. Worker execution is follow-up work.

## Size and scope

The emitted production reactor is **324,844 bytes raw / 123,244 bytes gzip**.
Its SHA-256 is `45662743a9f78a75e853a9d5cf21c661883bf374da13dac1bbf6d7125ac5d298`.
Warmed linear memory in the feasibility run is 17,825,792 bytes, about 17 MiB;
this is not peak memory. The runtime/shim source adds about 5.3 KB before its
shared boundary-validation dependencies and bundler compression. Reactors include
runtime overhead per function. Download and cold compile costs can outweigh
small-call savings; nothing fetches until a selected function is first called.
Generated wasm is ignored, never committed.

Only synchronous pure ordinary parameters with primitive/JSON boundaries are
supported, one selected function per source module. Defaults/destructuring,
opaque handles and byte boundaries are refused. Next supports production client
bundles and configuration-time generation in dev; Vite SSR/dev remain JS.
Other framework integrations, shared multi-function reactors, Web Workers,
cold-start measurements, mobile/Safari/Firefox calibration and automatic browser
calibration are follow-ups. CSP must allow wasm compilation and the asset fetch.

## Reproduce

```sh
pnpm install --frozen-lockfile
node research/browser-wasm/build.mjs /tmp/w1-browser-wasm
node research/browser-wasm/node.mjs /tmp/w1-browser-wasm/compute.wasm /tmp/w1-node.json
node research/browser-wasm/serve.mjs /tmp/w1-browser-wasm/compute.wasm
```

Open the local benchmark at `http://127.0.0.1:18996`, then evaluate:

```js
const {forecast} = await import('/forecast.mjs');
const {instantiate} = await import('/bridge.mjs');
const {measure} = await import('/measure.mjs');
measure(forecast, instantiate(await WebAssembly.compile(
	await (await fetch('/compute.wasm')).arrayBuffer()
)), {userAgent: navigator.userAgent, crossOriginIsolated});
```

The installed stock compiler helpers initially lacked executable permissions, as
in D1. Private file copies were made inside this worktree before running scriptc's
postinstall. No shared-store inode permissions were changed. The original
checkouts and node_modules, protected compiler trees, root README, Docker,
accounts, hosting services and secrets are untouched. No deploy, push, PR,
issue or public post occurred.

## Validation

- `packages/next-scriptc pnpm test`: 103 pass, no failures or skips.
- `packages/scriptc-promote pnpm test`: 79 pass, two existing skips, no failures.
- Example unit suite: two pass. Example production Next/Turbopack build passes.
- Vite integration builds a client bundle with the wasm asset and no Node imports,
  then instantiates that emitted reactor and compares all 12 seeded cases to JS.
- Runtime tests cover cached asynchronous readiness, calibrated/unmeasured sizes,
  periodic verification, missing wasm, initialization failure, trap, mismatch and
  permanent fallback. Invalid boundaries preserve JS without poisoning wasm.
- Next integration checks emitted public asset, basePath, both bundler scopes and
  stale calibration rejection. The production browser first serves JS, then wasm
  with two checks and no browser mismatches/fallbacks. The same page observes
  server native service, 26 server checks, no mismatches/fallbacks and exact parity.
  Verification-call browser duration includes both implementations, so it is not
  compared to the warmed feasibility table. The network records one 123,244-byte
  compressed wasm response.

The retained automated preview is real Chromium. A separate standalone headless
Chrome/Playwright launch and a webpack production build were not run. Turbopack
production execution, webpack rule tests, and Vite production artifact execution
are the validation boundaries of this change.
