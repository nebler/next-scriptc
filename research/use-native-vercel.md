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
