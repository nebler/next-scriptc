# Function-level native code on Vercel

Measured on 2026-10-31. **It works in a Vercel preview.** The existing revenue function runs in a bundled native sidecar, with identical complete result JSON to the Node fallback at 5k, 15k and 200k events. Native loses at 5k. Its median wins at 15k, but its p95 loses there. Both percentiles win at 200k. Eager startup does not eliminate the first-call wait in this experiment.

## Implementation

The Vercel adapter now runs function discovery and client transformation rather than warning and leaving function bodies on Node. It compiles a host binary for build-time/prerender calls, then cross-compiles the same generated dispatcher with the existing cached musl linux-x64 runtime, release optimization, `--cpu-dispatch`, stripping and `--node-islands=off`.

Packaging copies `scriptc-functions` into **every physical Next Node Function output directory**, rather than detecting individual client chunks in traces. Existing shared Function symlinks remain shared. This is the deliberately narrow packaging shortcut: thirteen local Node output directories receive the same 947,648-byte binary in the native demo, including bundles which may never call it. Vercel's subsequent bundling reduces these to four deployed Node Functions; the native preview has five deployed Functions total (four Node and one grouped executable route Function), below the Hobby limit used by the existing harness. No extra Function is created for the sidecar. The final packaging helper explicitly sets x86-64; the measured demo harness already applied that identical architecture setting.

The client starts one child eagerly when its module loads in a Vercel instance. A process-global singleton shares the startup promise across chunks and concurrent callers. The OS chooses a free loopback port through `PORT=0`; readiness comes from the existing functions server's listening line. All `VERCEL_IPC*` environment variables are removed from the child, so scriptc uses its plain HTTP server on 127.0.0.1. No copy to `/tmp` is needed. The client searches above Next's app working directory for the bundled executable. Calls await readiness and retain the strict JSON boundary. After a ready child exits, the next call starts one replacement; further exits fail loudly. Startup errors/timeouts fail calls, with no Node fallback. The parent exit hook and existing functions-server parent check clean up children. Self-hosted startup/ports remain unchanged.

## Method

Both measured previews were built from `d267b9621d52eedf267c2f4b6cae6c4d754091ac`, with the same source, lockfile, fixture and timing setup. The build-mode switch is `NEXT_SCRIPTC_BASELINE=node` for A; B enables the adapter. That existing switch also controls the demo's native routes, but every measured request is the same `/reports` page and the same `revenue(...)` call. The unrelated API route Function is not invoked. Build metadata's dirty flag comes from untracked research output, with no tracked source differences between builds.

Node 24.22.0 locally, Next 16.4.3, scriptc 0.4.6, Vercel CLI 65.8.0. Both previews use Node 24 Functions, x86-64, iad1, 2048 MiB and maxDuration 300. This is one deployment per variant, one C=1 window per size, ten warmups plus forty measured requests **per variant per size**. Request order alternates A/B then B/A. Nearest-rank p50/p95, no retries or discarded measured samples. All 302 final requests (300 warmup/measured plus two deployment-first requests) succeeded. Full decoded result JSON is hashed and checked byte-for-byte across both variants and every request of the same size. Each variant retained its initial instance token throughout all windows; native retained PID 16 and one spawn attempt.

The Mac is only the HTTPS client. `Server-Timing: function;dur=..., render;dur=...` uses server monotonic timing. Function duration brackets the caller's `await revenue(...)`: Node compute versus native readiness, strict argument validation/serialization, loopback request, native compute/result serialization and Node result parsing. Fixture generation remains module setup outside that bracket. Native and Node both generate the same stored fixture strings, and the original Node module's fixture initialization remains in the transformed bundle.

Timing is opt-in with `NATIVE_VERCEL_TIMING=1`. The timing build helper wraps the Vercel launcher in an AsyncLocalStorage request context and buffers the streamed report until completion to emit headers from its Suspense child. Its `render` metric is full launcher/handler-to-response-end elapsed time, including Next initialization and rendering; it is **not pure React CPU**. Both timing builds disable cacheComponents/partial prerendering to propagate those headers. Ordinary builds keep their defaults, streaming and displayed 5k fixture. The existing `?size=` selection already supported all measured sizes and was retained. Production deployment/protection settings were not changed.

## Results

All times are **milliseconds**, lower is better. First-request values are the first request to each fresh preview, at 5k only. Other sizes run after the instance is warm; their empty first-request cells are not missing experiments.

| Events | Variant | Function p50 | Function p95 | First-request function | First-request full handler/render | Warm full handler/render p50 |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 5,000 | Node fallback | 3.874 | 4.737 | 5.747 | 513.723 | 10.927 |
| 5,000 | Native sidecar | 5.139 | 7.702 | 66.034 | 805.884 | 8.554 |
| 15,000 | Node fallback | 11.188 | 12.104 | n/a | n/a | 17.921 |
| 15,000 | Native sidecar | 7.018 | 17.381 | n/a | n/a | 10.218 |
| 200,000 | Node fallback | 171.692 | 179.954 | n/a | n/a | 177.816 |
| 200,000 | Native sidecar | 67.438 | 82.299 | n/a | n/a | 70.759 |

The observed **median crossover is between 5k and 15k events**. At 5k native function p50 is 1.33x Node, a loss. At 15k it is 0.63x, but p95 is 1.44x Node, also a loss. At 200k p50 is 0.39x Node (2.55x faster) and p95 is 0.46x. This brackets a crossover for this fixture and instance pair, not a general threshold. A native 5k measured sample reached 62.338 ms and the 200k maximum was 118.145 ms; both remain in the raw data. No tail was removed to improve the result.

Warm handler and function timings need not move together: an awaited native call lets React perform other work while the child computes. Do not infer pure rendering cost by subtracting independently summarized medians.

## First-call cost and eager start

The first native call took **66.034 ms**, versus **5.747 ms** for Node. Its sidecar was **not reported ready before the call**. Spawn-to-readiness notification was **529.987 ms**, overlapping module initialization/Next work; eager start hid much of that interval but not all of it. This is elapsed time observed by the Node client, including event-loop scheduling of the stdout notification, not an isolated native initialization CPU measurement. It does not establish the exact instant the native listener became ready while Node was synchronously initializing fixtures.

The native full first handler/render was 805.884 ms versus Node's 513.723 ms. Client end-to-end was 1287.258 ms versus 1039.788 ms, included only for context. The WAN and local host load do not enter the server's function timing. These are first-observed requests to fresh deployments, not a certified platform-cold decomposition; the two deployments may have different platform initialization/scheduling. One pair cannot attribute the entire handler difference to spawning a child.

## Failures, validation and limits

The first baseline setup preview retained normal partial prerendering. Its first 5k request failed the harness's CDN-cache guard; a diagnostic 15k request returned the correct event count but `x-vercel-cache: HIT` and no timing header. That preview is retained below and was not used in the results. The two final timing previews disable partial prerendering symmetrically. The first version of the local sidecar unit fixture also failed because a CommonJS script lacked a `.cjs` extension; fixing the fixture made the suite pass. Neither failure is a workload result that was silently replaced.

Validation: root `pnpm test` passes (20 package unit tests and 24 demo harness tests). The native dispatcher/JSON parity test passes. Function build lifecycle tests pass for prerender success, deliberate type failure and both old-directive errors, with worker cleanup. Default Turbopack function E2E passes for native/Node/dev result equality at 5k/15k/50k/200k, date/error cases, route-handler and Server Action calls, browser chunk exclusion, in-flight crash rejection and self-hosted restart. Details are recorded in [validation.json](use-native-vercel/validation.json).

Limits: a single preview pair and short sequential windows, no confidence intervals, concurrency throughput, whole-instance memory or billed CPU comparison. This deployment validates the dynamic SSR report path. Native route calls and Server Actions remain covered by local function E2E rather than additional hosted measurement windows; native partial prerendering is not measured here. Long-idle freeze/thaw/recycle behavior is the supplied prior probe's evidence and was not re-tested. All extracted functions in a Node instance share one native event loop and failure domain. The Node frontend and native child share the Function's resources; native-process-only RSS would omit Node. Packaging all Node bundles adds binary size and does not eliminate the duplicated fixture setup. These are preview observations, not a persistent-sidecar platform guarantee.

## Previews and reproduction

| Variant | Preview | Deployment ID |
| --- | --- | --- |
| Node fallback | [next-scriptc-in7eplui1](https://next-scriptc-in7eplui1-noahs-projects-8a075d15.vercel.app/reports) | `dpl_48jMQxVF3LQNmRzaprYtJZvmDec4` |
| Native sidecar | [next-scriptc-mfslscoju](https://next-scriptc-mfslscoju-noahs-projects-8a075d15.vercel.app/reports) | `dpl_9NrjA5AnECgqyDfMWqvzqnUmz8PR` |
| Failed timing setup, PPR | [next-scriptc-28eelflq2](https://next-scriptc-28eelflq2-noahs-projects-8a075d15.vercel.app/reports) | `dpl_8qkoJWz3adfsNewiNS69ip2T1pxK` |

No production deployment, push, Sandbox or Docker operation. The project link and private bypass were reused locally. The bypass is loaded from ignored `.env.local`, never printed or committed. `vercel pull` introduced no tracked `.gitignore` changes. The musl cache was reused from an existing worktree rather than downloading another toolchain. Generated `.next*`, `.vercel/output` and this run's cross-compile outputs are removed after validation.

With Node 24 on PATH, an authenticated CLI, the existing root project link, preview env and private `.env.local`:

```sh
NEXT_SCRIPTC_BASELINE=node NEXT_SCRIPTC_DEMO_GROUPS=vercel NATIVE_VERCEL_TIMING=1 node research/use-native-vercel-build.mjs
node research/use-native-vercel-measure.mjs node
NEXT_SCRIPTC_DEMO_GROUPS=vercel NATIVE_VERCEL_TIMING=1 SCRIPTC_CHECKER_SERVER=0 node research/use-native-vercel-build.mjs
node research/use-native-vercel-measure.mjs native
node research/use-native-vercel-measure.mjs measure
pnpm test
SCRIPTC_CHECKER_SERVER=0 node --test packages/next-scriptc/test/function-native.mjs
SCRIPTC_CHECKER_SERVER=0 node examples/demo/test/function-build.mjs
SCRIPTC_CHECKER_SERVER=0 node examples/demo/test/functions.mjs
```

The deployment script refuses an already-saved variant label; use a new raw-data destination before deliberately reproducing a deployment. It verifies traced build inputs before upload, records accepted identity before HTTP, checks preview state and Function count, and uses the explicit prebuilt preview command. [Raw requests](use-native-vercel/measurements.json), [Node first request](use-native-vercel/node.json), [native first request](use-native-vercel/native.json), [failed setup](use-native-vercel/node-setup-ppr.json) and [build metadata/binary hashes](use-native-vercel/builds.json) are retained.

## Cold start and packaging

2026-10-31 follow-up, base `53da3a7`, branch `opt/use-native-vercel-startup`. **Removing eager report fixtures and spawning before Next initializes cuts full first render, but does not improve the first native call in these samples.** Two fresh previews per before/after native/Node variant, plus one retained failed bootstrap preview. All use the existing E3 iad1 near-client, the same 5k report and complete result hash, Node 24, x86-64, iad1, 2048 MiB and maxDuration 300. There are 32 successful responses: one deployment-first request plus three subsequent requests per successful preview. No warm percentile or fleet-wide cold-start claim follows from this small experiment. The nine preview identities, first responses, subsequent responses and runtime logs are retained in [use-native-startup](use-native-startup/summary.json).

### Timeline breakdown

The baseline still eagerly constructs all four report exports, totaling 270k events, at module load in both runtimes. Measurement instrumentation wraps that same initializer without changing its values. The native compiler shim instruments only generated sources, leaving `functions/serve.ts` and the call protocol untouched. Native `performance.now()` reports time since its runtime starts, including imported module initialization. Native and Node `process.hrtime.bigint()` timestamps share the host monotonic clock, so listener time can be compared with Node's observation even when stdout is not processed promptly. Log ingestion timestamps are not used for this subtraction.

All times below are milliseconds. Spawn-to-listening also includes OS launch/loader time before the native clock origin. “Observation lag” is the interval from the native listening callback to Node consuming its announcement, not native work.

| Native preview | Native fixture initialization | Native start to listening | Spawn to listening | Spawn to Node observation | Observation lag |
| --- | ---: | ---: | ---: | ---: | ---: |
| Before 1 | 176.578 | 182.139 | 193.707 | 428.399 | 234.696 |
| Before 2 | 242.289 | 257.224 | 268.663 | 430.962 | 162.328 |
| After 2 | lazy, 1.652 at first call | 6.549 | 16.266 | 142.952 | 126.695 |
| After 3 | lazy, 1.385 at first call | 5.244 | 20.825 | 2232.300 | 2211.529 |

Before, native fixture generation accounts for nearly all native initialization. Node independently spends **365.434 / 368.568 ms** generating the same four report exports. The baseline Node-only controls spend **295.214 / 283.058 ms** there. The long Node-side eager initializer prevents timely event-loop handling of the child's stdout. The two runtimes also share the Function's CPU allocation, so contention can contribute to elapsed initialization time; these samples do not isolate contention from GC and scheduling. No child-priority change was made or claimed to help.

The Node timeline below uses Node process uptime. It separates module evaluation, the request handler and sidecar observation. Platform preparation/idle time between launcher evaluation and invocation is included in uptime, outside the response's render interval.

| Native preview | Timing launcher module | Spawn | Readiness observed | First handler starts |
| --- | ---: | ---: | ---: | ---: |
| Before 1 | 141.104 | 3222.224 | 3650.627 | 3050.949 |
| Before 2 | 155.958 | 2558.395 | 2989.382 | 2376.610 |
| After 2 | 148.519 | 160.177 | 303.119 | 2330.359 |
| After 3 | 120.285 | 129.859 | 2362.212 | 2367.626 |

After 3 is a useful loss in the notification metric: Node observes readiness **2.232 seconds** after spawn even though native listened after 5.244 ms of native uptime. Node accumulates only **125.864 ms of process CPU** between spawn and observation. Platform holding/freezing or delayed scheduling can enter this interval; this is not evidence of two seconds of native initialization. Readiness is nevertheless observed **before the first handler** in both optimized previews, so its notification wait is outside the first native call. Native imported modules finish at **6.370 / 5.096 ms**. The shared API events module retains its existing small 5k initializer; the four report exports are now lazy.

### Fixes and packaging

The adapter reads each physical Node output's `.vc-config.json` `filePathMap`, resolving sources against Next's `outputFileTracingRoot`. It detects the client source, its manifest, or the stable singleton marker in traced bundled JavaScript. A handler `.nft.json` is supported when there is no file map. Missing, malformed, empty or unreadable traces include the binary conservatively. Aliases continue sharing their existing physical output.

Only **4 of 13 physical Node outputs** now get `scriptc-functions`, versus **13 of 13** before: `/reports`, `/api/function-example`, and their RSC outputs. The instrumented optimized binary is **958,608 bytes**; the exact instrumented baseline binary size was not retained, while N1's uninstrumented binary was 947,648 bytes. There are nine fewer copies. Vercel still deploys **five Functions: four Node and one executable route group**, unchanged in every successful native preview. Its two Node groups without native callers shrink by about 514 KB compressed each. Shared groups containing a native caller retain the binary, since those Functions can call native code.

Every Node output gets a tiny conditional CommonJS bootstrap. It starts the shared sidecar when the binary exists, then requires the original Next launcher without moving or editing that launcher. Wrapping all outputs preserves compatibility when Vercel unions traced files into shared Functions. A digest of the original launcher in the wrapper preserves Vercel's existing handler-based grouping boundaries. Without this, wrapping only selected outputs could split groups, or identical wrappers around different launchers could merge incompatible outputs. The bootstrap preserves the original exports, including `getRequestHandlerWithMetadata`.

Vercel's loader rejects `require(ESM)` even on this Node 24 runtime. The adapter therefore compiles its own small sidecar module to CommonJS with Next's shipped Babel. It does not compile user handlers. The bootstrap and transformed client reuse the same process-global singleton. `sidecar.mjs` keeps the unchanged loopback readiness parser in `watchReadiness`, exports `startSidecar(binary)` for the bootstrap, drains stdout after readiness, and clears the old readiness duration on restart. IPC environment filtering, startup timeout, rejected startup, one replacement after a ready child exits and exit cleanup remain intact.

The report fixture helper memoizes only a requested supported size, separately in each runtime. The transformed Node report module no longer builds unused large exports. Its generator and result order are unchanged. **First-call timing now includes that size's fixture generation**, which was formerly module setup outside the call bracket. The after Node helper logs 2.302 / 3.423 ms generating the requested 5k export. Larger sizes pay their own generation cost on first use; this moves work rather than claiming that setup is free.

### First-request results

All times are milliseconds, lower is better. Each row is the first observed request to its own fresh preview. End-to-end is measured inside the existing iad1 client, excluding the Mac WAN. “Render” retains N1's full handler-to-response-end definition and excludes pre-invocation module evaluation. It includes lazy Next initialization and rendering, not just React CPU.

| Variant | Function | Full first handler/render | iad1 end-to-end |
| --- | ---: | ---: | ---: |
| Before Node 1 | 6.349 | 581.313 | 693.811 |
| Before Node 2 | 5.315 | 527.823 | 630.495 |
| Before native 1 | 57.477 | 629.328 | 777.719 |
| Before native 2 | 63.718 | 647.974 | 752.196 |
| After Node 1 | 18.826 | 367.427 | 466.759 |
| After Node 2 | 18.910 | 298.610 | 430.865 |
| After native 2 | 60.563 | 259.622 | 390.535 |
| After native 3 | 63.025 | 328.322 | 546.448 |

Native first-render time falls from **629.328 / 647.974** to **259.622 / 328.322 ms**. Node controls improve too when their eager large fixtures are removed. Native's first function interval **does not improve**, at **60.563 / 63.025 ms** versus **57.477 / 63.718 ms** before, and still loses to Node's **18.826 / 18.910 ms** after. Node's own first function interval also loses against its eager-fixture baseline because setup moved inside the bracket and first-use execution history changed. Readiness was resolved before either optimized handler began, so the remaining native first-call cost cannot be attributed to waiting for native startup. No transport or first-RPC optimization is claimed here.

All successful target responses route `iad1::iad1::`, reject cached HIT/STALE/PRERENDER, retain one instance per preview, and match the full 5k result SHA-256 `58e99230368693d8899627a9c334b197a66005e8504ac2874e55fb6596ef720c`. Native retains one child and one spawn attempt across all four requests to each successful preview. Three subsequent samples per deployment are retained without filtering, including slow samples, but are insufficient for a new warm-performance conclusion. Native vs Node timing is still sensitive to placement, scheduling, JIT and platform preparation. This is first-observed preview evidence, not a certified platform-cold benchmark or a general guarantee.

### Failures, validation and previews

The first optimized preview is retained as `after-native-1`: READY deployment, first request HTTP 500, no result or server timing, because Vercel rejected the bootstrap's synchronous ESM import. The corrected CommonJS artifact produced the two successful optimized previews. That failed request remains in the raw data; it was not retried on the same deployment or counted as a successful cold sample. Initial local compiler checks also failed because the newly installed checker executables lacked execute permission, then passed after repairing those local dependency permissions. Runtime-log ingestion initially returned no records for an optimized deployment; a later read supplied the retained timeline. No request was reissued to obtain that timeline.

Validation: root `pnpm test` passes with 22 package unit tests and 24 demo tests. Native dispatcher/JSON parity, function build lifecycle and complete function E2E pass. The E2E checks identical native/Node/dev results at 5k/15k/50k/200k, dates/errors, route calls, Server Actions, browser exclusion, in-flight crash rejection and restart. New tests cover traced source paths, bundled markers, NFT fallback, conservative unknowns, aliases, executable/Edge exclusion, bootstrap-before-launcher singleton startup, original exports, Vercel's CommonJS requirement, repeat packaging and preserved bundling boundaries.

| Variant | Preview | Deployment ID |
| --- | --- | --- |
| Before Node 1 | [next-scriptc-imilaiqla](https://next-scriptc-imilaiqla-noahs-projects-8a075d15.vercel.app/reports) | `dpl_F1Vwtu6XPjPguim7D1xphRSVYpfH` |
| Before Node 2 | [next-scriptc-ctrbco3uf](https://next-scriptc-ctrbco3uf-noahs-projects-8a075d15.vercel.app/reports) | `dpl_6jZjPCenpP7vQmFnhrQ8YDdinKqP` |
| Before native 1 | [next-scriptc-5zrnt4j8b](https://next-scriptc-5zrnt4j8b-noahs-projects-8a075d15.vercel.app/reports) | `dpl_A7UbpD3L2DBMaTgWFGEjM6UU8J9z` |
| Before native 2 | [next-scriptc-b7i84mu69](https://next-scriptc-b7i84mu69-noahs-projects-8a075d15.vercel.app/reports) | `dpl_D9uc4fXnfYJNubVsF8qr3zkUqGfk` |
| After Node 1 | [next-scriptc-km4jy09qp](https://next-scriptc-km4jy09qp-noahs-projects-8a075d15.vercel.app/reports) | `dpl_8vmxYozCfNQmXcsw8oXbhoL77YvH` |
| After Node 2 | [next-scriptc-o92x5iktb](https://next-scriptc-o92x5iktb-noahs-projects-8a075d15.vercel.app/reports) | `dpl_7Dr3a29uZxCiCuD7A4cGSSWM3LJP` |
| After native 2 | [next-scriptc-6cf0kta00](https://next-scriptc-6cf0kta00-noahs-projects-8a075d15.vercel.app/reports) | `dpl_BmvnjZSWXQgSX3SdzWfZYRF2FNn5` |
| After native 3 | [next-scriptc-en2hr53dc](https://next-scriptc-en2hr53dc-noahs-projects-8a075d15.vercel.app/reports) | `dpl_3K84DFfjrt8vTnQYs8VFc9i24JvB` |
| Failed ESM bootstrap | [next-scriptc-87e96g38u](https://next-scriptc-87e96g38u-noahs-projects-8a075d15.vercel.app/reports) | `dpl_6GJ9sUSQcgsFcuynGfvfebPEJdWx` |

No production deployment, push, project-setting change, Sandbox, Docker operation or additional client deployment. The existing project link, ignored `.env.local` bypass and cached musl runtime were reused. The bypass was never printed or committed. `vercel env pull` added no tracked `.gitignore` lines. Build outputs were reused only for the paired fresh uploads, then removed before the next variant and after validation. The code and research remain local on the requested branch.

With Node 24 on PATH and the existing authenticated project link and private env files, reproduce with unique deployment labels:

```sh
node research/use-native-startup-build.mjs before
node research/use-native-startup-measure.mjs before-native-1
node research/use-native-startup-build.mjs after
node research/use-native-startup-measure.mjs after-native-2
NEXT_SCRIPTC_BASELINE=node node research/use-native-startup-build.mjs before
NEXT_SCRIPTC_BASELINE=node node research/use-native-startup-build.mjs after
node research/use-native-startup-summarize.mjs
```

The build helper temporarily selects the base adapter/runtime and eager fixture for `before`, and restores source files in `finally`. Run it without concurrent builds or edits. The compiler shim adds instrumentation only to generated native sources. The retained baseline measured fixture completion directly; the later shim also logs `modules-ready`. The successful optimized native artifacts use the same compiled native binary as the failed ESM attempt, with the generated bootstrap/runtime corrected to CommonJS before upload. Later source cleanup adds trace fallback coverage and repeat-packaging protection without changing the measured demo path. Measurement labels refuse to overwrite existing records; set `STARTUP_OUTPUT` to a new directory when reproducing the retained run. Fetch runtime logs for each saved deployment before regenerating the summary.

## First-call cost

2026-10-31 follow-up from local `main` at `137257a`, branch `opt/first-call`. **The native handler is not spending 55 ms on first-use initialization. Most of the first-call interval is on the Node side.** A reserved bootstrap RPC can prepare the HTTP client and reuse its connection. The caller still waits for the busy Node process to handle the result during its first SSR render. This change does not make the complete first `await revenue(...)` interval equal to the native handler's compute time.

### Before timeline

`NEXT_SCRIPTC_CALL_TIMING=1` enables monotonic timestamps in the real client, function server and generated dispatcher. The client records call start, serialization, resolved port, socket assignment, connect, request write completion, response headers, body end and result parsing. The server records request callback entry, body read, argument parsing, dispatch, user completion, strict validation, encoding and return from `outgoing.end`. The demo separately records fixture generation, fixture parsing and aggregation in both runtimes. The last server timestamp is write submission, not a claim that the peer has received the bytes. Only enabled traces allocate timestamp arrays or log observations. Arguments and result bodies are not logged.

Two fresh native previews reproduce the first-call problem at **58.565 / 55.298 ms**. Readiness is already observed before their handlers. Each has one first request and ten subsequent C=1 requests from the existing E3 iad1 client. All times below are milliseconds. Native stages are nested inside the client's write-to-headers interval, so those rows must not be added twice.

| Client interval | First native 1 | Second call 1 | First native 2 | Second call 2 |
| --- | ---: | ---: | ---: | ---: |
| Argument validation and serialization | 0.229 | 0.029 | 0.199 | 0.030 |
| Resolve `sidecar.port()` | 0.366 | 0.024 | 0.344 | 0.028 |
| Resolved port to socket assignment | 10.033 | 1.419 | 9.010 | 1.505 |
| Socket assignment to connect callback | 35.176 | reused | 29.397 | reused |
| Connect or socket assignment to request write | 0.429 | 0.150 | 0.255 | 0.163 |
| Request write to response headers | 8.888 | 5.436 | 13.347 | 14.561 |
| Headers to body end | 1.369 | 0.251 | 1.212 | 0.341 |
| Result JSON parse | 0.192 | 0.150 | 0.227 | 0.166 |
| Complete client trace | 56.682 | 7.459 | 53.990 | 16.793 |

The outer function header also includes the small caller, trace logging and promise-completion costs after the final client timestamp. The socket interval includes Node event-loop scheduling. It is not an isolated 29 to 35 ms TCP handshake measurement.

| Native stage | First 1 | Second 1 | First 2 | Second 2 |
| --- | ---: | ---: | ---: | ---: |
| Request callback to body read | 0.131 | 0.016 | 0.132 | 0.014 |
| JSON parse arguments | 0.012 | 0.007 | 0.013 | 0.007 |
| Parsed arguments to dispatch | 0.001 | <0.001 | 0.001 | <0.001 |
| User function, including fixture and trace | 3.373 | 1.553 | 4.025 | 1.614 |
| Strict result validation | 1.879 | 1.392 | 2.131 | 1.348 |
| Typed result encoding | 0.055 | 0.049 | 0.065 | 0.052 |
| Submit response write | 0.111 | 0.061 | 0.104 | 0.073 |

Native generates the lazy 5k fixture in **1.661 / 1.675 ms**, parses it in **0.964 / 1.608 ms**, and aggregates it in **0.600 / 0.595 ms**. Second calls spend about 0.002 ms looking up the stored fixture. The traced Node fallback first call takes **18.238 ms**, including **2.803 ms** fixture generation, **2.092 ms** fixture parsing and **12.586 ms** aggregation. Its second call spends **0.009 / 1.536 / 1.728 ms** in those stages. The fixture is not a native first-call slowdown. No fixture generation or user algorithm was changed.

### Root cause and generic change

Before the change, the first real request needs a new Node HTTP connection. Node does not enter the native request handler until **46.152 / 39.298 ms** after the client's call starts. The native JSON parser, fixture, strict validator and typed encoder then complete within roughly six milliseconds. The connection phases and parent scheduling dominate, rather than native startup or a hidden 50 ms native encoder initialization.

`startSidecar`, the Vercel bootstrap entry point, now schedules one `POST /__warmup` after readiness. The reserved path is handled inside `serveFunctions` before the generated dispatcher. It parses `[]`, constructs an internal result, runs the existing strict validator and encoder, and drains/parses the reply in Node. It never calls an application function or invents arguments for one. A process-global HTTP agent is shared by the CommonJS bootstrap and Next's separately bundled clients. Sharing only the sidecar singleton would leave the real call on a different socket pool.

Warm-up is asynchronous and best effort. Callers waiting on readiness are released before a `setImmediate` schedules it. Real calls do not await warm-up and can use other connections while it is pending. The warm-up has a 30-second total wall deadline, the same timeout duration used for real RPCs, an unreferenced timer and consumed error events. A one-second wall deadline is unsafe across Vercel's multi-second initialization holds. Self-hosted startup does not call the Vercel entry point and keeps automatic warm-up disabled. Restarts prepare a new connection after the replacement becomes ready.

The successful diagnostic preview confirms both an internal warm-up before the first real call and `reused: true` on that call. Native serves the warm-up in **0.392 ms** from request entry through write submission. The first real native request finishes its own write in **5.976 ms**. The outer function interval is still **39.808 ms**. From the client's write to response headers, **31.961 ms** elapse while the Node process consumes **31.821 ms of CPU**. Native writes its response **26.058 ms before Node's headers callback runs**. This remaining delay is parent CPU execution and callback scheduling during SSR. It cannot be removed by warming the native JSON parser or calling user code with fake arguments. Exact Node CPU stacks were not profiled, so Next/React work and GC are not separated here. Making this asynchronous RPC block Node to change that overlap would be a different execution contract and is outside this change.

### Final first-request and subsequent results

The final four previews keep `NEXT_SCRIPTC_CALL_TIMING` and `NEXT_SCRIPTC_STARTUP_TIMING` off. They use only N1's `NATIVE_VERCEL_TIMING=1` launcher. Native was built separately for each upload, with identical final binary and runtime source hashes. Both final native binaries are **1,001,616 bytes**, SHA-256 `da9f119a3bc2aeb04d5814c42c424e18372e2c65b0e8a2da1642b13d65ecc260`. The dormant tracing hooks remain compiled into the binary. Deployed Function counts remain five for native and four for Node; warm-up adds no Vercel Function.

Each first-request row belongs to a fresh deployment. The subsequent window has ten requests, no discarded warmups and no retries. Its p95 is the maximum of those ten samples under the nearest-rank rule. All times are milliseconds. The baseline tracing rows are kept separate from the final timing-only rows.

| Preview | First function | First full handler/render | First iad1 end-to-end | Subsequent function p50 | Subsequent function p95 | Subsequent render p50 | Subsequent iad1 p50 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Before native 1, traced | 58.565 | 281.459 | 416.333 | 7.907 | 29.075 | 17.585 | 56.756 |
| Before native 2, traced | 55.298 | 254.776 | 371.819 | 7.017 | 17.473 | 15.975 | 47.317 |
| Final native 1 | 40.583 | 264.522 | 375.426 | 5.877 | 12.036 | 12.717 | 42.174 |
| Final native 2 | 41.850 | 257.789 | 378.851 | 5.394 | 7.805 | 12.411 | 40.338 |
| Final Node 1 | 13.269 | 284.623 | 404.195 | 4.497 | 5.606 | 17.791 | 50.906 |
| Final Node 2 | 15.946 | 347.522 | 465.832 | 2.952 | 4.336 | 15.064 | 57.518 |

The first native caller interval improves from **58.565 / 55.298 ms** in the two traced controls, and O2's **60.563 / 63.025 ms** without call tracing, to **40.583 / 41.850 ms**. This is a partial improvement. It still loses to the final Node controls at **13.269 / 15.946 ms**. N1's roughly six-millisecond Node first call had eager fixture setup outside the bracket; the current lazy fixture setup is inside it. Native's final full first renders overlap the before range, so these samples do not establish a consistent full-render gain from warm-up alone. In the final pair, native full first render is lower than Node's, despite its longer awaited-function metric.

Native still loses on warm 5k function time. The subsequent windows show no large new latency failure, but ten samples per preview cannot prove a tail-latency non-regression. Tracing adds overhead to the before windows, so their warm percentiles are not a controlled comparison against the final tracing-off windows. No size crossover, throughput, resource or fleet-wide cold-start claim is added here. No slow response was filtered out.

### Retained attempts, validation and previews

The initial warm-up attempt, `after-native-1`, returned a first function time of **41.245 ms**, but did not prove socket reuse. Its diagnostic follow-up, `warm-trace-native-1`, took **56.731 ms** and still showed a new connection. The explicitly enabled short-deadline attempt, `warm-trace-native-2`, was worse at **77.765 ms**. That trace shows readiness at **4660.269 ms**, the warm-up reaching native at **6614.801 ms**, and the first real handler at **6617.669 ms**. A one-second wall timer can expire across such a hold and destroy a healthy connection. The warm-up client start/timeout events were not logged, so the precise closure sequence in this attempt is not conclusively isolated. It also retains **10.614 ms** result validation and **12.439 ms** Node result parsing on its first call. Those losses remain in the raw data. A short deadline was not shipped. The environment-only explanation considered during diagnosis was not established by these logs; the Vercel entry point nevertheless now enables warm-up explicitly and is tested with `VERCEL` absent.

`ready-trace-native-1` uses the final 30-second deadline, records the reserved request and confirms first-real-call socket reuse. Its first function time is **39.808 ms**. Its subsequent maximum is **37.039 ms**, also retained. This diagnostic provides the parent CPU and response-callback evidence above. It is not one of the two final timing-only performance previews.

Across all eleven previews, **121 of 121 responses** succeed, route `iad1::iad1::`, avoid cached HIT/STALE/PRERENDER, and match the complete 5k result SHA-256 `58e99230368693d8899627a9c334b197a66005e8504ac2874e55fb6596ef720c`. Each preview retains one observed instance throughout its eleven requests; every native response retains one child and one spawn attempt. These are first-observed requests to fresh previews, not certified platform-cold measurements. Long-idle socket expiry and freeze/thaw beyond these initialization holds remain unmeasured.

Validation passes: root `pnpm test` with 23 package unit tests and 24 demo tests; the requested combined native/protocol/Vercel suite with 16 tests; the complete demo function E2E; and function build lifecycle checks. New checks prove that warm-up bypasses user dispatch in Node and native, succeeds alongside a delayed real call, leaves real calls free to proceed while it is stalled, times out harmlessly, survives a response delayed beyond one second, and supplies a reusable socket to the real client. The CommonJS bootstrap check covers `VERCEL` unset, singleton startup, the shared pool and existing export/grouping behavior. Self-hosted parity, errors, strict validation, Server Actions, browser exclusion, crash rejection and restart remain covered.

Local setup losses are retained in [validation.json](use-native-first-call/validation.json): unsupported unbound timing globals during the first instrumentation build, non-executable checker files after the offline install, a missing test import, a wrong-id local probe, and one root-suite warm-up-test timeout at ten seconds while compiler tests were running concurrently. The helper/import/setup errors were corrected. The final regression fixture allows twenty seconds, includes a response delayed beyond the old one-second deadline, and passes in both the root and combined suites. No hosted measurement request was retried to replace a bad sample.

| Role | Preview | Deployment ID |
| --- | --- | --- |
| Before native 1, traced | [next-scriptc-6ai878uo4](https://next-scriptc-6ai878uo4-noahs-projects-8a075d15.vercel.app/reports) | `dpl_ErJLztBHqK5tgsXYJwS7B1kWkS5G` |
| Before native 2, traced | [next-scriptc-6cfpqyitu](https://next-scriptc-6cfpqyitu-noahs-projects-8a075d15.vercel.app/reports) | `dpl_9TLoyKJgPnymrHD3GHf25NvAbcPG` |
| Node first-call trace | [next-scriptc-8bk42fmfu](https://next-scriptc-8bk42fmfu-noahs-projects-8a075d15.vercel.app/reports) | `dpl_4fEv5GGFiLDG3AVomnxLRhSkCn89` |
| Intermediate short deadline, tracing off | [next-scriptc-4gg1rykkt](https://next-scriptc-4gg1rykkt-noahs-projects-8a075d15.vercel.app/reports) | `dpl_4ErvZDSsdgmkGp1xNu5Qg8RmYuKR` |
| Intermediate short deadline, traced | [next-scriptc-3lyxxt3se](https://next-scriptc-3lyxxt3se-noahs-projects-8a075d15.vercel.app/reports) | `dpl_4FdBUqSNz6EzJz9qy7rdXJLdarnF` |
| Explicit warm-up, short deadline, traced | [next-scriptc-8kl1uxqq2](https://next-scriptc-8kl1uxqq2-noahs-projects-8a075d15.vercel.app/reports) | `dpl_HCU2ACTdmmZFKh9hvTD2CSLh7wmi` |
| Final warm-up diagnostic, traced | [next-scriptc-70qt710js](https://next-scriptc-70qt710js-noahs-projects-8a075d15.vercel.app/reports) | `dpl_5JHiaB2JjB3h6RPf1yZGXEnrpkz7` |
| Final native 1 | [next-scriptc-3jq3vpwwh](https://next-scriptc-3jq3vpwwh-noahs-projects-8a075d15.vercel.app/reports) | `dpl_3X6bAxyboB5ZoEk6Fq8MQoWZ9V3Q` |
| Final native 2 | [next-scriptc-3g43kosco](https://next-scriptc-3g43kosco-noahs-projects-8a075d15.vercel.app/reports) | `dpl_2KvZpMSmWJhLLTzivQ2vzd1aPkCx` |
| Final Node 1 | [next-scriptc-lvpcxreoa](https://next-scriptc-lvpcxreoa-noahs-projects-8a075d15.vercel.app/reports) | `dpl_E3Gsja8YZb5h5y3yxKQF5qaoMBuP` |
| Final Node 2 | [next-scriptc-l9d9iriae](https://next-scriptc-l9d9iriae-noahs-projects-8a075d15.vercel.app/reports) | `dpl_3zDp9NZQHBLY3wJpdLBy5FLxhFmC` |

[Compact summary and trace breakdowns](use-native-first-call/summary.json), per-preview response JSON and runtime JSONL logs are in [use-native-first-call](use-native-first-call/). Source/build metadata and final artifact hashes accompany the final preview records. Preview artifacts were built from the local base with this branch's uncommitted changes; build metadata keeps that dirty status. No production, push, project-setting change, Sandbox, Docker, sub-agent or new iad1 client deployment was used. The main checkout's ignored `.env.local` supplies the bypass without printing or committing it. No `.gitignore` change was needed. Existing toolchain caches were reused, and generated outputs were removed after measurement.

To reproduce in a new raw-data directory, use Node 24, the existing authenticated preview project link and private env files. Each label refuses to overwrite a prior deployment record. Build and measure sequentially, with no concurrent build or source edits in this checkout:

```sh
export FIRST_CALL_OUTPUT=research/use-native-first-call-repro
node research/use-native-first-call-build.mjs before
node research/use-native-first-call-measure.mjs trace-native-1
# Rebuild before each fresh upload; remove generated outputs between builds.
node research/use-native-first-call-build.mjs before
node research/use-native-first-call-measure.mjs trace-native-2
NEXT_SCRIPTC_BASELINE=node node research/use-native-first-call-build.mjs after
node research/use-native-first-call-measure.mjs trace-node-1
node research/use-native-first-call-build.mjs after
node research/use-native-first-call-measure.mjs final-native-1
node research/use-native-first-call-build.mjs after
node research/use-native-first-call-measure.mjs final-native-2
NEXT_SCRIPTC_BASELINE=node node research/use-native-first-call-build.mjs after
node research/use-native-first-call-measure.mjs final-node-1
NEXT_SCRIPTC_BASELINE=node node research/use-native-first-call-build.mjs after
node research/use-native-first-call-measure.mjs final-node-2
node research/use-native-first-call-summarize.mjs
```

The `before` helper disables automatic warm-up only for that build and restores the source in `finally`; its reserved server branch is dormant. `trace-*`, `warm-trace-*` and `ready-trace-*` labels enable call/startup tracing at deployment time. Other labels use only the N1 timing headers. Log ingestion can lag responses, so the helper retries bounded log reads without issuing more target requests. A reproduction need not repeat the retained unsuccessful intermediate implementations. The remaining parent CPU attribution is intentionally bounded to what the monotonic timestamps and process CPU counters establish.
