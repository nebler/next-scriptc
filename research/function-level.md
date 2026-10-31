# Function-level `"use scriptc"`

2026-10-31, review rounds 2–3. Next **16.4.3**, scriptc **0.4.6**, self-hosted `next build` + plain `next start`. No Next fork, monkeypatch, compiler change or deployment. The Linux Sandbox measurements below use the same committed dashboard source as macOS; macOS results remain indicative.

## What works

A named, module-level async function can start its block body with `"use scriptc"`, including in a `.tsx` Server Component module. A file-level directive selects all its named exported async functions (declarations or block-bodied arrows, including local export aliases). The original TypeScript signatures remain at the call site. Production stubs invoke one compiled binary containing all discovered functions. In dev there is no transform or native process; the same bodies execute as JS. Server Components, Server Actions and route handlers can call them.

The demo's `/reports?size=5000|15000|50000|200000` is one monthly revenue dashboard at four realistic input sizes. `lib/revenue.ts` uses a **function-body directive**, the existing revenue route's unchanged grouping/summing/sorting loop, and the existing fixture generator extended with a size parameter. Both runtimes pre-generate the same stored JSON exports during module initialization, parse an export per query, and return the same 248 day/region rows. Fixture generation is outside the timed function on both sides; no workload or algorithm was tuned for scriptc. The existing native route keeps its original 5,000-event default.

`connection()` inside Suspense precedes the call, so the partial static shell contains request-time report content. Search parameters select dates and size. The report's normal path makes **one** native call; its heading is ordinary JSX. The file-level `echo`/`fail` example lives in `lib/native-example.ts`, called by the separately tested `/api/function-example` route and Server Action. The form's redirect uses the action's returned value. The benchmark does not invoke that action or file-level example through the page. `?profile=1` enables the same `performance.now()` body timers in either runtime, with normal latency windows leaving profiling disabled.

## Verified Next extension points

Paths below are relative to `examples/demo/node_modules/next` (installed 16.4.3).

- `dist/server/config.js`, `applyModifyConfig`: `modifyConfig(config, {phase, nextVersion, projectDir})` runs while loading configuration, before the build graph. The existing `withScriptc` adapter registration is sufficient; no extra public config keys or index.ts changes are necessary.
- `dist/build/index.js`, `cleanDistDir`: Next cleans its output **after** config loading but preserves `cache`. Function compilation therefore happens in `<distDir>/cache/scriptc-functions` during production-build configuration. Its listener starts before bundling/prerendering, so build-time calls also have a real native destination. `onBuildComplete` copies only the binary into `<distDir>/scriptc-functions` and writes a build-ID-checked manifest. The compiler cache retains extracted sources for inspection.
- `dist/server/config-shared.d.ts` (`TurbopackRuleCondition`), `dist/server/config-schema.js`, and `dist/docs/01-app/03-api-reference/05-config/01-next-config-js/turbopack.md`: rule keys without `/` match filenames; keys containing `/` match project-relative paths. `condition.path` supports a glob string or RegExp, against the full path relative to the Turbopack root. We use an anchored, escaped RegExp for each discovered file, relative to the explicit root or Next's lockfile-derived root. This handles literal route segments such as `[id]` without glob interpretation. Only those files reach the loader. Production Node matches transform; browser/Edge matches reject. Existing user rules remain intact. Webpack already restricts execution with `include`. Unit tests check literal path matching and rule preservation; real builds cover both bundlers.
- `dist/docs/01-app/03-api-reference/05-config/01-next-config-js/turbopack.md`: loaders receive plain JSON options and can return transformed JS/TS. This loader only uses `getOptions` and `resourcePath`, returning source; it does not discover, emit files, compile, or mutate a registry. Its input hash must match the adapter's discovery snapshot.
- Webpack uses a server-only production `enforce: pre` loader rule; browser/Edge matches reject. Existing rules and callbacks are preserved. Both Turbopack and webpack production builds and the function E2E passed.
- `dist/docs/01-app/03-api-reference/04-functions/connection.md`: `connection()` excludes subsequent work from prerendering. The demo places its request-time component behind Suspense as required with Cache Components.

One observed Turbopack error was `Module not found: Can't resolve '/Users/.../packages/next-scriptc/src/functions/client.mjs'` for a generated absolute import. Generating a relative import fixes it using the supported loader API. No essential loader capability was missing.

## Extraction and constraints

Discovery walks project source files in sorted order, skipping hidden directories, node_modules, the output directory and native route files. Inline functions in ordinary route.ts are supported. Native routes now require `route.native.ts`; route-level directives fail with the route adapter's migration error before function discovery. The legacy skip in function discovery was removed. No route discovery or Vercel deployment code was edited in round 2.

Babel resolves the selected function's references and copies only its module declarations, recursively needed helpers/types and imports into a native module. Relative imports become absolute compile-time imports; the existing native tsconfig writer retains project aliases. Local imported graphs are checked with the project's TypeScript resolution options for indirect React/Next imports and client modules. Installed libraries remain subject to scriptc diagnostics; their untyped JS may execute in scriptc's slower native dynamic tier. All function builds explicitly set `--node-islands=off`; there is no hidden Node execution fallback.

Unsupported uses fail the build with source/function/reference context: component-scope closures, client modules, React/Next imports, JSX in the extracted closure, dynamic imports, unbound globals such as process/fetch, reassigned module bindings and non-async/generator functions. Parameters currently must be plain identifiers; defaults, rest and destructuring are rejected. File-level default exports/re-exports/value constants are rejected. Generic/type-system features still depend on scriptc. Additional top-level executable initialization statements are rejected; setup should be expressed in declaration initializers or imported ordinary modules.

This is an explicit **process and data boundary**. Native module instances are independent of Node module instances. Shared mutable globals, Node object identity, React request context, cookies/headers, Next's patched fetch, redirect/notFound error identities, caches and other framework effects are not transferred. Imported application modules must be suitable for independent native execution; this prototype does not prove purity or forbid every possible property mutation/alias. Use deterministic compute functions rather than relying on shared state or initialization side effects. No source-map/debugger integration is provided for extracted code.

### JSON signature contract (round 3)

Production discovery creates a TypeScript program from the project's `typescript.tsconfigPath` (default `tsconfig.json`), including `extends`, paths, ambient declarations and imported types. The checker inspects each selected function's parameters and awaited return, including inferred returns. It accepts JSON primitives/literals, unions, readonly/mutable arrays, tuples, recursively defined object aliases/interfaces/anonymous objects and JSON-valued string/number index signatures. Errors include source, function, parameter/return, nested property/array/index path and offending type.

Optional parameters, properties and tuple elements are **rejected**, even with `exactOptionalPropertyTypes`; represent absence with a **required `| null`** slot. Explicit `undefined`, `void`, `any`, `unknown`, unresolved generics, bigint, symbols/symbol keys, callable/constructable objects, accessors and class instances are rejected. Date/Map/Set also fail through their non-JSON members. `strictNullChecks` must be enabled so the checker can see undefined unions; projects with no tsconfig use strict defaults. There is no unsafe opt-in. Functions still validate application inputs; this is a JSON contract, not an input schema or proof of purity.

TypeScript is structural and permits assertions, unchecked `JSON.parse` and extra properties. It cannot express finite numbers, dense arrays, acyclic objects or enumerable data descriptors. Consequently **type checking alone cannot safely remove the residual traversal**. Production results retain checks for all of these cases, including extra properties, Date/toJSON, symbols, accessors and hidden properties, then use plain `JSON.stringify`. The new traversal obtains all descriptors once per container and reads their values without invoking getters, instead of calling `getOwnPropertyDescriptor` and reading the original object separately for every field. An explicit descriptor type avoids scriptc's `any` tier. Shared acyclic objects remain legal; cycles fail. Array prototypes must be ordinary arrays as well. Node-side argument validation is unchanged.

The benchmark compares this production traversal with the previous strict traversal, plain stringify and a finite-number replacer. The replacer is a diagnostic lower bound only: JSON invokes `toJSON` before the replacer sees the value, and omits symbol/nonenumerable fields. It cannot preserve the existing rejection contract. No unsafe fast path or Node execution fallback is used. Dev/baseline continue to run untransformed JS; the demo produces byte-identical JSON in verification. Build errors prevent unsupported signatures from reaching production, while invalid values exposed by the compiler fail at the transport boundary. An existing record-narrowing limitation is documented below.

## Transport, errors and lifecycle

The production client uses `node:http.request` and a module-level keep-alive Agent (64 sockets, 8 idle sockets), directly to 127.0.0.1. It never calls global fetch, so Next's fetch instrumentation/cache cannot memoize a native call. Each POST carries a function ID in its path and an argument array as JSON. Generated typed dispatch calls preserve each function's parameter tuple. Results are JSON; error responses contain only a message, never native stacks. A thrown error rejects the stub promise; React/Next still applies its normal production Server Action error redaction when an uncaught rejection reaches that layer.

Socket failures reject in-flight calls without retrying possibly completed work. A 30-second socket inactivity timeout bounds stalled calls. Calls are buffered, with no streaming or cancellation protocol. The existing runtime now exposes its process supervisor for reuse: readiness line, startup barrier, exponential restart backoff/cutoff, exit/signal cleanup. The native listener also checks its parent PID to exit after a parent SIGKILL. All functions share one native event loop: CPU work blocks its siblings. Multiple self-hosted replicas need separate port namespaces; the prototype embeds one deterministic project-derived port, and occupation fails startup.

The supervisor has **one cache keyed by output directory**. Route startup reads its build manifest, then shares that cache with function startup. Function startup checks the build ID and an executable regular binary; it no longer pins a port range or display label. Missing/non-executable binaries fail with a rebuild instruction. The CLI build's exit hook kills its prerender worker on both successful and failed builds. `test/function-build.mjs` verifies a real static prerender contains the native return value, then deliberately fails TypeScript after the worker is ready, asserting the PID is gone after both exits. This confirms `next build` CLI lifecycle, not a process-lifetime guarantee for unsupported programmatic calls to Next's internal build API.

## Review-round-3 measurements (after)

The native result boundary is about **2.4× cheaper**, while retaining the rejection rules for values exposed by the compiler. It is still much more expensive than plain stringify. **Linux 5k still loses** (15.728 vs 14.201 ms), while 15k wins (14.866 vs 16.013 ms): the observed crossover is now **between 5k and 15k**, with overlapping scheduling tails and no confidence interval. macOS wins all four page windows, including 5k; this only gives an observed upper bound of 5k, not a measured lower crossover bracket. At macOS 5k the complete native call (2.099 ms) still exceeds Node parse+aggregate (1.796 ms), so the small page win is not evidence that the function offload itself is always faster.

The core revenue algorithm and existing fixture contents are unchanged; the only workload addition is a fourth stored export at 15k. Warm C=1 calls consume the full page and check event counts. **The new Linux window has 10 warmups and 50 page/profile samples**, versus 50/200 in round 2 and the new macOS window. Both retain 1,000 echo samples. Adding 15k changes the alternating runtime order: native first at 5k/50k, Node first at 15k/200k. Linux also uses the function-only fixture described below. These are single windows on shared hosts; page deltas cannot all be attributed to the serializer. The same-process legacy/new micro-benchmark provides the stronger direct comparison.

### Page curve: old vs new

All times are milliseconds. R2 is the retained round-2 window, R3 the new window; `—` means not measured in round 2.

| Platform | Events | R2 native p50 / p99 | R3 native p50 / p99 | R2 Node p50 / p99 | R3 Node p50 / p99 | R3 rendering control p50 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Linux | 5,000 | 17.246 / 47.348 | 15.728 / 28.299 | 12.660 / 28.607 | 14.201 / 28.374 | 11.193 |
| Linux | 15,000 | — | 14.866 / 31.111 | — | 16.013 / 27.285 | 8.558 |
| Linux | 50,000 | 27.301 / 88.701 | 19.121 / 86.386 | 36.018 / 92.142 | 35.532 / 46.715 | 8.444 |
| Linux | 200,000 | 52.328 / 111.701 | 48.097 / 98.049 | 119.972 / 203.565 | 112.881 / 195.632 | 7.841 |
| macOS (indicative) | 5,000 | 8.849 / 18.060 | 6.785 / 10.415 | 8.073 / 11.275 | 7.686 / 10.168 | 6.065 |
| macOS (indicative) | 15,000 | — | 7.544 / 9.555 | — | 11.177 / 13.372 | 5.826 |
| macOS (indicative) | 50,000 | 14.988 / 22.789 | 11.835 / 14.392 | 32.303 / 101.054 | 24.240 / 26.913 | 5.806 |
| macOS (indicative) | 200,000 | 32.704 / 35.525 | 31.740 / 34.294 | 78.466 / 88.310 | 82.139 / 90.216 | 5.785 |

### Boundary micro-benchmark at 5k: old vs new

The new probe imports the production `serializeResult`, the legacy argument/strict serializer and the same revenue function. Each native and Node probe compares all serialization outputs for equality. Result timing includes the same 248 rows plus diagnostic timing fields. Native probe builds use release optimization and `--node-islands=off`, with no compiler change.

| Operation (p50 ms) | R2 Linux | R3 Linux | R2 macOS | R3 macOS |
| --- | ---: | ---: | ---: | ---: |
| Node arguments: unchanged strict checks + stringify | 0.0033 | 0.0030 | 0.0012 | 0.0010 |
| Native arguments: parse | 0.0005 | 0.0004 | 0.0000 | 0.0000 |
| Native result: production checks + plain stringify | 4.0087 | 1.6901 | 3.0820 | 1.2800 |
| Native result: legacy checks + stringify, same R3 probe | — | 4.1576 | — | 3.1000 |
| Native result: plain stringify | 0.0147 | 0.0141 | 0.0100 | 0.0110 |
| Native result: finite-number replacer (insufficient contract) | — | 0.1761 | — | 0.1340 |
| Node result: checks + stringify (diagnostic only) | 0.2046 | 0.4929 | 0.1179 | 0.2667 |
| Node result: parse | 0.0868 | 0.0862 | 0.0564 | 0.0583 |

Same-probe native legacy → bulk traversal is **4.158 → 1.690 ms on Linux** and **3.100 → 1.280 ms on macOS**. Relative to the retained R2 production values (4.009 / 3.082), the new cost is about 58% lower. The finite-only replacer is faster (0.176 / 0.134 ms), but would miss lossy object shapes and cannot replace these checks safely. Bulk descriptor allocation is slower in Node than the old traversal (0.493 vs 0.201 ms in the R3 diagnostic); that is why the production Node **argument** path still uses its original cheap validator. The Node page has no result-transport serializer cost.

| Echo round trip | R2 p50 / p99 | R3 p50 / p99 |
| --- | ---: | ---: |
| Linux | 0.146 / 2.330 | 0.121 / 2.220 |
| macOS (indicative) | 0.077 / 0.164 | 0.080 / 0.190 |

### New compute and complete-call profile

Independent medians; these columns are not an additive per-request trace. Native body timers come from the real production binary; Node timers are the same TypeScript executed in-process.

| Platform | Events | Native parse | Native aggregate | Node parse | Node aggregate | Complete native call |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Linux | 5,000 | 0.417 | 0.283 | 1.390 | 0.963 | 2.692 |
| Linux | 15,000 | 1.247 | 0.820 | 4.073 | 2.738 | 4.191 |
| Linux | 50,000 | 4.131 | 2.659 | 13.902 | 9.078 | 9.436 |
| Linux | 200,000 | 16.738 | 10.726 | 54.896 | 57.047 | 33.126 |
| macOS (indicative) | 5,000 | 0.360 | 0.223 | 0.969 | 0.826 | 2.099 |
| macOS (indicative) | 15,000 | 1.095 | 0.607 | 2.872 | 2.312 | 3.488 |
| macOS (indicative) | 50,000 | 3.634 | 1.960 | 9.635 | 7.677 | 7.699 |
| macOS (indicative) | 200,000 | 14.495 | 7.988 | 38.569 | 33.545 | 26.814 |

### Provenance, budget and limits

- Linux: Intel(R) Xeon(R) Processor @ 2.90GHz, linux/x64, Node v24.22.1, scriptc 0.4.6, 2 vCPUs / 4 GiB, server/native pinned to CPU 0 and load to CPU 1. [Raw results](benchmarks/functions-linux-2026-10-31T08-55-36.833Z.json), [archive SHA, command steps, allocation and stopped status](benchmarks/functions-linux-2026-10-31T08-55-36.833Z.provenance.json).
- macOS: Apple M4 Pro, darwin/arm64, Node v24.22.0, scriptc 0.4.6, shared host, no affinity; **indicative**. [Raw results](benchmarks/functions-round3-macos-2026-10-31.json), [source/result/binary hashes and commands](benchmarks/functions-round3-macos-2026-10-31.provenance.json).
- Both retained windows use harness snapshot `1496b2b0c04ffeddfffc854c4bdb2da0feebd95f` and revenue source SHA-256 `8c5798815e497d271cbd9c89eb65c83868eec6250b18d8050841be667df963a2`. Runtime implementation was committed as `da6c7e3`; the next commit changes only the benchmark harness. Native artifacts are built on each OS.
- The original harness expected the literal `distDir: ".next-node"`; main now has a Vercel-dependent conditional. Both first attempts hit that stale assertion after page timing. The Linux attempt stopped after 310.000 s (no results file; its samples are not reconstructed or selectively retained). [Failure provenance](benchmarks/functions-linux-2026-10-31T08-48-35.713Z.provenance.json). The harness now matches the output-directory string and saves checkpoints after each size, so a later control/probe failure no longer discards page results.
- The Linux retry was capped at 135 s and completed in 111.644 s. To stay within budget it uses `FUNCTION_SANDBOX_FUNCTIONS_ONLY=1`: **only inside the disposable archive**, unrelated `route.native.ts` files are renamed `route.ts`. Their bodies execute as ordinary Node routes; the report, native function, stubs, HTTP handler and serializer are unchanged. This avoids compiling/starting 16 unused native route workers. No timed request targets those routes. The page floor/idle-worker setup therefore differs from R2 and macOS; do not interpret cross-window page deltas as a controlled serializer-only experiment. The in-process old/new micro-benchmark uses exactly the same result and process.
- **Both Linux sandboxes were stopped.** Combined conservative allocated upper bound: **0.234247 vCPU-hours**, below 0.25; reported active CPU totals 549,626 ms (0.152674 vCPU-hours). The first attempt used 0.172222 allocated hours; the retry 0.062024. No third sandbox was started. `.env.local` was copied from the requested main checkout, ignored by Git and excluded from both archives.

Retained retry command (its cap is a retry budget, not a claim that the full default benchmark fits in 135 seconds):

```sh
FUNCTION_SANDBOX_LIFETIME_MS=135000 FUNCTION_SANDBOX_FUNCTIONS_ONLY=1 \
  FUNCTION_BENCH_PAGES=50 FUNCTION_BENCH_WARMUP=10 \
  node --env-file=.env.local scripts/sandbox-functions.mjs
```

### Verification and remaining questions

All requested suites passed with Node 24.22.0 and `SCRIPTC_CHECKER_SERVER=0`:

```sh
node --test packages/next-scriptc/test/*.mjs
node --test packages/next-scriptc/shim/test/parity.mjs
node examples/demo/test/functions.mjs
FUNCTION_WEBPACK=1 node examples/demo/test/functions.mjs
node examples/demo/test/function-build.mjs
DEMO_PROXY_TIMEOUT_MS=180000 node examples/demo/test/e2e.mjs
DEMO_PROXY_TIMEOUT_MS=180000 node examples/demo/test/routes.mjs
```

- Package: **19 passed**. The type tests cover 26 accepted/rejected signature cases plus extended-tsconfig/imported-inference integration, strict-null requirements, standard utility types through extraction, and path-rich errors. Runtime tests compare Node/native rejection of Date, undefined, NaN/Infinity, cycles, getters, sparse arrays, symbols and an invalid extra property retained in a dynamic record after a narrowing assertion. Node tests additionally cover nonenumerable properties and sparse arrays with a compensating extra key. Shared acyclic objects serialize normally.
- Shim: **104 HTTP comparisons** passed, including parent death during streams.
- Function E2E: Turbopack and webpack passed; **raw JSON text** is byte-identical between native production and untransformed dev at **5k, 15k, 50k and 200k**. Range/empty/error cases, file-level echo/fail, route and Server Action calls, browser chunks, native crash/restart and no native worker in dev all passed.
- Build lifecycle: native prerender succeeded; successful and deliberately failed builds terminated their worker. The isolated fixture now explicitly enables strict TypeScript, matching the JSON checker requirement.
- Default demo E2E: 12 curl/report comparisons plus process ownership, crash/recovery/cutoff and SIGTERM/SIGKILL cleanup passed. Default routes: **85 cases per runtime**, headers/status/body parity, all **17** native processes and ports cleaned up. No Vercel integration source was edited and no deployment was made.

**Existing compiler limit:** a statically narrowed record may lose extra fields during scriptc lowering *before either validator sees it*. For example, with `const value = { value: 1, hidden: undefined } as { value: number }`, native `Object.getOwnPropertyNames(value)` exposes only `value`; both the old and new serializers emit `{"value":1}`, whereas Node rejects the hidden undefined field. This was reproduced against both serializers with scriptc 0.4.6. The dynamic-record assertion regression retains and rejects that extra field, but it does not prove arbitrary assertion/assignment equivalence. Signature checks are not a proof of body soundness, and the adapter cannot validate fields the compiler has erased. This is a pre-existing compiler parity question, not a removed runtime check; applications should avoid narrowing away result fields. A compiler fix or a stricter source-level restriction needs separate investigation.

Other open questions: lowering the remaining bulk-descriptor allocation cost without dropping checks, repeated Linux windows/confidence intervals (especially the 5k–15k bracket), a lower-size macOS crossover, and concurrent/cold-start/memory/data-placement costs. This remains a warm C=1 prototype measurement.

## Review-round-2 measurements (before)

The 5k case loses in both final windows. Native compute is substantially faster, but strict result reflection/validation erases that small saving. As the event count grows while the dashboard result remains 248 rows, compute amortizes the fixed boundary/rendering costs. The observed crossover is **between 5k and 50k events**, not a precisely identified threshold.

All figures are **milliseconds**, sequential C=1, 50 warmups/window, 200 samples per page/profile window and 1,000 echo round trips. Page windows consume/decode full HTML and check the event count. Runtime order alternates by size (native first at 5k/200k, Node first at 50k), not randomized repeated windows; no confidence intervals. The same three stored January exports are used by both variants, with identical parsing/grouping/summing/sorting source. Only date bounds, size and a boolean cross as arguments; the returned daily array is about 22 KB, not the entire event export. Both final page variants use **Turbopack**. The macOS baseline was rebuilt with Turbopack after webpack verification before this final window.

### Page curve

| Platform | Order events | Native p50 / p99 | Node p50 / p99 | Precomputed rendering control p50 |
| --- | ---: | ---: | ---: | ---: |
| Linux | 5,000 | 17.246 / 47.348 | 12.660 / 28.607 | 10.251 |
| Linux | 50,000 | 27.301 / 88.701 | 36.018 / 92.142 | 9.170 |
| Linux | 200,000 | 52.328 / 111.701 | 119.972 / 203.565 | 8.256 |
| macOS (indicative) | 5,000 | 8.849 / 18.060 | 8.073 / 11.275 | 5.908 |
| macOS (indicative) | 50,000 | 14.988 / 22.789 | 32.303 / 101.054 | 5.815 |
| macOS (indicative) | 200,000 | 32.704 / 35.525 | 78.466 / 88.310 | 5.637 |

The rendering control is a separate `.next-render` **benchmark-only build**. It renders the identical report JSX, form, 248 rows, JSON-in-HTML and RSC payload, with the compute function returning precomputed results. The harness temporarily replaces that module, builds a separate Node output, checks the full result, then restores source/config/tsconfig bytes in `finally`. There is no benchmark cache/switch in the app. This measures **Next routing + React/HTML/RSC response rendering + HTTP + client decoding/checks**; it does not isolate pure React CPU or browser hydration. Its full-result equality check adds a little client work beyond the page curve's count check. The roughly flat control is the useful rendering floor; its variation across sizes is window/JIT/GC/host variation, not evidence that larger dashboards render faster.

### In-function profile and complete function round trip

`performance.now()` from `node:perf_hooks` brackets JSON parsing and aggregation **inside the same function body** on each side. Node is the original TypeScript run in-process; native body timings come from the actual production binary/client. Aggregation includes Map grouping, summing, array creation and sorting, and excludes JSON parsing and transport. Diagnostic timing windows are separate from unprofiled page windows.

| Platform | Events | Native parse | Native aggregate | Node parse | Node aggregate | Full native revenue call | Rendering control |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Linux | 5,000 | 0.456 | 0.315 | 1.455 | 0.940 | 5.343 | 10.251 |
| Linux | 50,000 | 4.628 | 3.160 | 14.512 | 8.928 | 13.660 | 9.170 |
| Linux | 200,000 | 18.389 | 12.338 | 57.402 | 57.353 | 39.418 | 8.256 |
| macOS (indicative) | 5,000 | 0.363 | 0.212 | 0.945 | 0.792 | 3.983 | 5.908 |
| macOS (indicative) | 50,000 | 3.617 | 1.960 | 9.427 | 7.558 | 9.424 | 5.815 |
| macOS (indicative) | 200,000 | 14.323 | 7.936 | 37.786 | 32.834 | 27.980 | 5.637 |

### JSON boundary at 5k events

The native serialization probe imports the **same revenue function, strict validator and production HTTP handler**, compiled with the same release/node-islands-off flags. It times `serialize(result)` (strict checks + stringify), plain `JSON.stringify(result)`, and parsing separately, in-process. Node executes the same probe source. The profiled result includes two timing fields in addition to the same 248-row daily array; these diagnostic serialization timings slightly overstate the unprofiled result. The actual native revenue-call row above checks the complete production boundary without profiling.

| Boundary operation | Linux | macOS (indicative) |
| --- | ---: | ---: |
| Arguments: strict validation + stringify in Node | 0.0033 | 0.0012 |
| Arguments: parse in native | 0.0005 | 0.0000 |
| Result: strict validation + stringify in native | 4.0087 | 3.0820 |
| Result: plain stringify in native | 0.0147 | 0.0100 |
| Result: strict validation + stringify in Node (diagnostic, not a Node-page transport cost) | 0.2046 | 0.1179 |
| Result: parse in Node | 0.0868 | 0.0564 |
| Echo: full production client/handler round trip, p50 / p99 | 0.146 / 2.330 | 0.077 / 0.164 |

**Why the headline previously tied:** at 5k on Linux, native parse+aggregation is 0.771 ms versus Node's 2.394 ms, a saving of about 1.62 ms. Native strict result validation/stringify costs 4.009 ms, of which plain stringify accounts for only 0.015 ms. Reflection-heavy strict checking, not JSON encoding or a 0.146 ms trivial round trip, dominates the boundary. The page then has an 8–10 ms framework/render/response floor. The route-level aggregation directly uses `Response.json` and avoids this strict RPC traversal and React/RSC page output, explaining why the route showed a much clearer win. Removing the unrelated echo is correct but cannot eliminate the multi-millisecond validator cost.

Component windows are independent: **their medians are not an additive per-request trace**. GC, dispatch, allocator state, HTTP scheduling and the render-control verification work leave residuals. In particular, the rendering floor is measured by a control, not inferred by claiming `page p50 - function p50` is pure React time. The native result serializer stays around 4.0–4.3 ms on Linux as inputs grow, because the output still contains 248 rows. No validator requirement was weakened to improve the curve.

### Provenance and limits

- Linux: Intel Xeon @ 2.90 GHz, x86_64, Node 24.22.1, scriptc 0.4.6, `vercel/sandbox/node:24`, 2 vCPUs / 4 GiB. `taskset` pins app/native to CPU 0 and the load generator to CPU 1; the VM reports one core/two threads. Single VM/window, shared infrastructure, with visible p99 scheduling tails. [Raw Linux measurements](benchmarks/functions-linux-2026-10-31T08-18-25.210Z.json), [archive SHA, steps, resource use and stopped status](benchmarks/functions-linux-2026-10-31T08-18-25.210Z.provenance.json).
- macOS: Apple M4 Pro, arm64, Node 24.22.0, scriptc 0.4.6, shared host, no CPU affinity. **Indicative**, with substantial variation from earlier windows; final numbers are retained rather than selecting the fastest run. [Raw macOS measurements](benchmarks/functions-macos-2026-10-31.json), [provenance](benchmarks/functions-macos-2026-10-31.provenance.json).
- Both use source snapshot `0f1142c3459585e9e3c06e93cc54370fe507a935`; the revenue source SHA-256 is `edcc1f5e29477c3e151f06e3e43d6b4edc9c4ec89cf6a7d0be65122c8d90e6ea`. Native artifacts are built locally in each OS, not copied between architectures. No deployment.
- Linux sandbox lifecycle: one failed setup (old harness assumed `/vercel/sandbox`; the image reports `/vercel`) was stopped after 17.3 s; the corrected run completed in 359.9 s and was stopped. Conservative allocated bounds total **0.2095 vCPU-hours**, below 0.3. Reported active CPU totals 492,112 ms (**0.1367 vCPU-hours**). Both attempts' provenance is retained; [failed setup](benchmarks/functions-linux-2026-10-31T08-17-17.848Z.provenance.json). The retry's 8-minute lifetime capped combined allocation below 0.277 vCPU-hours even if commands stalled. `.env.local` was copied locally as requested, ignored by Git and excluded from `git archive`/the VM.

Reproduce (Node 24, `SCRIPTC_CHECKER_SERVER=0`, no concurrent local builds/tests during measurement):

```sh
pnpm --filter demo build
NEXT_SCRIPTC_BASELINE=node pnpm --filter demo build
node examples/demo/bench/functions.mjs --skip-build --output=research/benchmarks/functions-macos-2026-10-31.json
node --env-file=.env.local scripts/sandbox-functions.mjs
```

The Sandbox script archives **committed HEAD**, checks its SHA, installs the frozen lockfile, builds both variants, runs the same benchmark and always stops in `finally`. Its own provenance records each command step/exit status. The [interactive curve](benchmarks/functions-curves-2026-10-31.html) contains both datasets. [Round-1 measurements](function-level-results.json) are historical, included the extra echo, and are superseded by these windows.

Open performance questions are strict-reflection cost without weakening JSON semantics, repeated Linux windows/confidence intervals, a finer crossover bracket, concurrent callers competing on the one native event loop, and cold start/memory/data-placement costs. None is answered by this C=1 warm resident-fixture curve.

## Build-time impact

`node examples/demo/bench/function-builds.mjs --output=research/benchmarks/functions-builds-macos-2026-10-31.json` performs three builds of each mode, rotating order and restoring source bytes in `finally`. The no-modules control changes only the two discovered modules' directives into ordinary strings; it keeps the same demo, native routes, types and imports. Broad mode uses the round-1 config verbatim from `9af72da`; targeted mode uses round 2. These are **retained-cache macOS** builds, not clean install/build measurements. All nine builds succeeded.

| Mode | Total seconds, each run | Median total | Median Next compilation | Median function compile + startup |
| --- | --- | ---: | ---: | ---: |
| No function modules | 4.285, 4.364, 4.301 | 4.301 s | 199 ms | 0 ms |
| Round-1 broad rules | 5.134, 5.073, 4.937 | 5.073 s | 375 ms | 397 ms |
| Discovered-file conditions | 17.826, 5.509, 4.819 | 5.509 s | 283 ms | 424 ms |

The first targeted run incurred a 17.826 s outlier total; it is retained, not silently discarded. The median enabled-versus-no-modules difference is +1.207 s, including native compilation, fixture initialization, discovery and Next work. This small demo **does not demonstrate a total build speedup** from targeting: the targeted median total is actually 0.435 s higher than broad. Observed bundling medians are 92 ms lower than broad, with insufficient repetitions/cache control to attribute that delta precisely. The engineering improvement is deterministic: unmatched files no longer invoke a JavaScript loader. The original eager source discovery still scans the project. [Raw runs](benchmarks/functions-builds-macos-2026-10-31.json).

## Why this is not `"use go"`

The body remains ordinary typed TypeScript. There is no embedded language, string containing a Go program, separate implementation or handwritten FFI signature. Node dev, Node production baseline and native production compile/execute the same source. Editor signatures remain the caller's TypeScript signatures. This does not mean every TypeScript feature, npm library or Next API is native-compatible: the compiler's accepted subset, separate process semantics and JSON boundary are real constraints.

## What a real Next primitive needs

The adapter/loader combination proves the boundary, not a first-class Next feature. Next would need supported function discovery and compiler registration, server/client graph validation, dependency tracking/cache invalidation and cancellation, portable stable function identities, mapped diagnostics/source maps, deployment capability negotiation, artifact tracing/packaging, process lifecycle ownership, and a documented invocation/error/serialization protocol. Discovery currently scans the project eagerly; a native build is not integrated into Turbopack's incremental graph. The adapter occupies Next's single adapterPath, so it does not automatically compose with the Vercel deployment adapter. Next should own framework/request/cache semantics; compiler providers should not imitate them inside native code. See [the route-primitive investigation](next-primitive.md) for the related lifecycle/output gap.

## Vercel: sidecar or network call?

**Nothing was deployed.** The local adapter startup hook belongs to the self-hosted Next server. It does not establish that the same hook runs inside Vercel's packaged Node function.

A native sidecar inside each Node function instance would preserve local IPC, but needs explicit Linux binary tracing/packaging and executable modes, lazy per-instance startup, concurrent-call sharing, restart/freeze/thaw behavior and platform lifecycle ownership. Vercel documents full Node API coverage and limits on shared file descriptors, memory and duration. That makes spawning a process plausible, but is **not evidence of a guaranteed persistent sidecar contract** or automatic Next-adapter composition. Resource use belongs to the Node function instance. [Function limits](https://vercel.com/docs/functions/limitations).

A separate native function/service would give it its own scaling/lifecycle, but turns the call into an authenticated, versioned network RPC with serialization, network latency, timeout/retry and deployment-skew concerns. The loopback measurements above say nothing about remote network latency. Build Output API describes function directories with runtime, handler and architecture; Vercel's Runtime Developer Reference documents custom runtimes. A bare loopback HTTP binary still needs a platform invocation bridge. These are evidence for a possible packaging path, not a verified scriptc deployment. [Build Output API primitives](https://vercel.com/docs/build-output-api/primitives), [Runtime Developer Reference](https://github.com/vercel/vercel/blob/main/DEVELOPING_A_RUNTIME.md), [existing native-function research](vercel-native-functions.md).

Current public Daemons documentation describes long-running containers that **do not receive traffic**, so that is not a drop-in HTTP RPC backend for this design. A supported container service/native function or a queue-based redesign is a separate investigation. [Daemon output contract](https://vercel.com/docs/build-output-api/daemons). Platform capability negotiation and an actual deployment test are prerequisites to choosing between sidecar and separate function; this prototype claims neither deployment works unchanged.

## Verification

Run with Node **24.22.0** and pnpm **11.1.3** on PATH and `SCRIPTC_CHECKER_SERVER=0`. Exact successful commands after the merge:

```sh
pnpm install --frozen-lockfile
node --test packages/next-scriptc/test/*.mjs
node --test packages/next-scriptc/shim/test/parity.mjs
node examples/demo/test/function-build.mjs
node examples/demo/test/functions.mjs
node examples/demo/test/e2e.mjs --skip-build
node examples/demo/test/routes.mjs --skip-build
NEXT_SCRIPTC_DEMO_GROUPS=light node examples/demo/test/e2e.mjs
NEXT_SCRIPTC_DEMO_GROUPS=light node examples/demo/test/routes.mjs
FUNCTION_WEBPACK=1 node examples/demo/test/functions.mjs
```

- Package tests: **15 passed**, including native dispatcher/JSON/error parity, migration/discovery, literal targeted paths, user-rule preservation, stale builds and invalid binaries.
- Shim parity: **1 passed, 98 HTTP comparisons**, including parent death/active streams.
- Function build lifecycle: successful native prerender and deliberate TypeScript failure both terminate their worker.
- Function E2E, **Turbopack and webpack** production: native/Node/dev output equality, three dashboard sizes, date ranges, errors, route-handler/file-level calls, progressive-enhancement Server Action redirects, browser chunk inspection, in-flight native crash rejection and restart. Dev remains untransformed and spawns no native worker.
- Demo E2E, **default and light**: 12 response comparisons plus threaded-report equality, routing/static precedence, Next/CLI process ownership, crash recovery/cutoff, EADDRINUSE and SIGTERM/SIGKILL cleanup.
- Route parity, **default and light**: **85 response cases each** in Node dev and native production, matching status/headers/body. Cleanup checks both route and function manifests: **17** default or **10** grouped native processes, including the function port.

Use Node 24 on PATH. A fresh macOS install again exposed scriptc's non-executable checker helpers (`SC3004: TypeScript server startup: Permission denied`); restoring installed `tsc-ts`, `tsc`, and `scriptc-comptime` execute bits fixed it. No compiler/source workaround was added. The Linux harness applies the same executable-mode repair after the frozen-lockfile install.
