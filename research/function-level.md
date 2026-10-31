# Function-level `"use scriptc"`

2026-10-31. Prototype on Next **16.4.3**, scriptc **0.4.6**, Node **24.22.0**, Apple M4 Pro / macOS arm64. Self-hosted `next build` + plain `next start`; no Next fork, internal monkeypatch, compiler change or deployment. Mac timings below are indicative; publishable results need Linux.

## What works

A named, module-level async function can start its block body with `"use scriptc"`, including in a `.tsx` Server Component module. A file-level directive selects all its named exported async functions (declarations or block-bodied arrows, including local export aliases). The original TypeScript signatures remain at the call site. Production stubs invoke one compiled binary containing all discovered functions. In dev there is no transform or native process; the same bodies execute as JS. Server Components, Server Actions and route handlers can call them.

The demo's `/reports` page copies the existing revenue route's **unchanged aggregation loop**, imports its existing `eventsJson` / `RevenueEvent` fixture, and returns the aggregation object instead of a Response. It still parses the same 5,000 events per query, groups by day/region, sums and sorts. No native-only algorithm or smaller fixture is used. `connection()` inside Suspense precedes the call: Cache Components produces a partial static shell with request-time report content. Search parameters select ranges; the default is January 2026. The form redirects using its native return value, making invocation observable. `lib/native-example.ts` demonstrates file-level `echo` and `fail`; `/api/function-example` and the report form exercise route-handler and Server Action callers.

## Verified Next extension points

Paths below are relative to `examples/demo/node_modules/next` (installed 16.4.3).

- `dist/server/config.js`, `applyModifyConfig`: `modifyConfig(config, {phase, nextVersion, projectDir})` runs while loading configuration, before the build graph. The existing `withScriptc` adapter registration is sufficient; no extra public config keys or index.ts changes are necessary.
- `dist/build/index.js`, `cleanDistDir`: Next cleans its output **after** config loading but preserves `cache`. Function compilation therefore happens in `<distDir>/cache/scriptc-functions` during production-build configuration. Its listener starts before bundling/prerendering, so build-time calls also have a real native destination. `onBuildComplete` copies only the binary into `<distDir>/scriptc-functions` and writes a build-ID-checked manifest. The compiler cache retains extracted sources for inspection.
- `dist/server/config-shared.d.ts`, `TurbopackLoaderBuiltinCondition` / `TurbopackRuleCondition`, plus `dist/server/config-schema.js`: support `production`, `node`, `browser`, `edge-light`, `all`, `any`, `not`. The executing transform requires production + node + not browser, excluding foreign dependencies to avoid running the loader across node_modules. A separate rejecting rule handles browser/Edge imports of discovered functions. It never replaces a browser function with a native stub. Tests also search emitted browser chunks for stub code. A temporary Client Component importing the native module was built and correctly rejected by Turbopack, then removed.
- `dist/docs/01-app/03-api-reference/05-config/01-next-config-js/turbopack.md`: loaders receive plain JSON options and can return transformed JS/TS. This loader only uses `getOptions` and `resourcePath`, returning source; it does not discover, emit files, compile, or mutate a registry. Its input hash must match the adapter's discovery snapshot.
- Webpack uses a server-only production `enforce: pre` loader rule; browser/Edge matches reject. Existing rules and callbacks are preserved. Both Turbopack and webpack production builds and the function E2E passed.
- `dist/docs/01-app/03-api-reference/04-functions/connection.md`: `connection()` excludes subsequent work from prerendering. The demo places its request-time component behind Suspense as required with Cache Components.

One observed Turbopack error was `Module not found: Can't resolve '/Users/.../packages/next-scriptc/src/functions/client.mjs'` for a generated absolute import. Generating a relative import fixes it using the supported loader API. No essential loader capability was missing.

## Extraction and constraints

Discovery walks project source files in sorted order, skipping hidden directories, node_modules, the output directory and native route files. Inline functions in ordinary route.ts are supported. The legacy route-level directive is left with the route pipeline for compatibility with the concurrent file-convention migration. No route discovery code or existing demo route was edited.

Babel resolves the selected function's references and copies only its module declarations, recursively needed helpers/types and imports into a native module. Relative imports become absolute compile-time imports; the existing native tsconfig writer retains project aliases. Local imported graphs are checked with the project's TypeScript resolution options for indirect React/Next imports and client modules. Installed libraries remain subject to scriptc diagnostics; their untyped JS may execute in scriptc's slower native dynamic tier. All function builds explicitly set `--node-islands=off`; there is no hidden Node execution fallback.

Unsupported uses fail the build with source/function/reference context: component-scope closures, client modules, React/Next imports, JSX in the extracted closure, dynamic imports, unbound globals such as process/fetch, reassigned module bindings and non-async/generator functions. Parameters currently must be plain identifiers; defaults, rest and destructuring are rejected. File-level default exports/re-exports/value constants are rejected. Generic/type-system features still depend on scriptc. Additional top-level executable initialization statements are rejected; setup should be expressed in declaration initializers or imported ordinary modules.

This is an explicit **process and data boundary**. Native module instances are independent of Node module instances. Shared mutable globals, Node object identity, React request context, cookies/headers, Next's patched fetch, redirect/notFound error identities, caches and other framework effects are not transferred. Imported application modules must be suitable for independent native execution; this prototype does not prove purity or forbid every possible property mutation/alias. Use deterministic compute functions rather than relying on shared state or initialization side effects. No source-map/debugger integration is provided for extracted code.

Arguments and results must be strict JSON **at runtime**, rather than constrained by a recursive TypeScript type. This retains existing signatures but detects BigInt, undefined/void, nonfinite numbers, functions, symbols, cycles, class instances, Date/Map/Set, sparse/extended arrays, symbol properties, accessors and nonenumerable object properties. Native reflection on unsupported objects can itself throw; it is wrapped as an explicit JSON-serialization failure. Arguments are checked in Node before sending, results in native before serialization. Functions must still validate their application inputs; JSON transport is not schema validation. Dev/baseline execute ordinary JS without imposing the production transport boundary.

## Transport, errors and lifecycle

The production client uses `node:http.request` and a module-level keep-alive Agent (64 sockets, 8 idle sockets), directly to 127.0.0.1. It never calls global fetch, so Next's fetch instrumentation/cache cannot memoize a native call. Each POST carries a function ID in its path and an argument array as JSON. Generated typed dispatch calls preserve each function's parameter tuple. Results are JSON; error responses contain only a message, never native stacks. A thrown error rejects the stub promise; React/Next still applies its normal production Server Action error redaction when an uncaught rejection reaches that layer.

Socket failures reject in-flight calls without retrying possibly completed work. A 30-second socket inactivity timeout bounds stalled calls. Calls are buffered, with no streaming or cancellation protocol. The existing runtime now exposes its process supervisor for reuse: readiness line, startup barrier, exponential restart backoff/cutoff, exit/signal cleanup. The native listener also checks its parent PID to exit after a parent SIGKILL. All functions share one native event loop: CPU work blocks its siblings. Multiple self-hosted replicas need separate port namespaces; the prototype embeds one deterministic project-derived port, and occupation fails startup.

scriptc's local `docs/content/limitations/unix-domain-sockets.mdx` documents `listen(path)` and HTTP socketPath on Linux/macOS. The measurement script builds a second probe from the **same production server handler and JSON validator**, changing only the listener address and using an echo dispatcher. Unix sockets work and are faster in this run. Production keeps HTTP because its extra ~0.018 ms p50 is small against this page's compute/rendering cost and it reuses the existing readiness/port lifecycle without socket-path cleanup. This is an implementation tradeoff, not a claim that HTTP beats UDS.

## Local measurements

`node examples/demo/bench/functions.mjs --skip-build`, after the successful production native and Node builds. Sequential C=1; 100 warmups before each window; 500 full report-page responses per runtime and 1,000 trivial-function round trips. Full bodies are consumed and report event counts/results checked. Page order is native then Node, transport probe order HTTP then UDS; no randomized/alternating order or confidence interval. Shared host, no CPU affinity; these are one local window per case. Node baseline is `NEXT_SCRIPTC_BASELINE=node` (separate `.next-node`, no adapter). Both paths make the same revenue and echo calls. Browser rendering time is not included.

- Native report page: **6.179 ms p50 / 8.493 ms p99**.
- Node report page: **6.404 ms p50 / 8.789 ms p99**. Native p50 is ~3.5% lower in this window (too small to claim a reliable gain), not the route-level 2× CPU/throughput claim.
- Actual production native echo stub, including argument validation, keep-alive HTTP, dispatch, result validation and decode: **0.0541 ms p50 / 0.1427 ms p99**.
- Same-handler standalone HTTP probe: **0.0532 ms p50 / 0.1208 ms p99**.
- Same-handler standalone UDS probe: **0.0348 ms p50 / 0.0724 ms p99**.

[Machine-readable measurements](function-level-results.json) retain the exact values. Strict output traversal is included in these numbers; large returned objects consume material time. Small functions are slower than direct Node calls because of serialization/IPC. Exploratory windows varied (one earlier run was 6.00 ms native / 6.64 ms Node p50); the final source and this last window are recorded without choosing the strongest result. Earlier work also changed validation behavior. Linux measurement, throughput/concurrency, cold starts, memory and fair alternating windows remain open.

## Why this is not `"use go"`

The body remains ordinary typed TypeScript. There is no embedded language, string containing a Go program, separate implementation or handwritten FFI signature. Node dev, Node production baseline and native production compile/execute the same source. Editor signatures remain the caller's TypeScript signatures. This does not mean every TypeScript feature, npm library or Next API is native-compatible: the compiler's accepted subset, separate process semantics and JSON boundary are real constraints.

## What a real Next primitive needs

The adapter/loader combination proves the boundary, not a first-class Next feature. Next would need supported function discovery and compiler registration, server/client graph validation, dependency tracking/cache invalidation and cancellation, portable stable function identities, mapped diagnostics/source maps, deployment capability negotiation, artifact tracing/packaging, process lifecycle ownership, and a documented invocation/error/serialization protocol. Discovery currently scans the project eagerly; a native build is not integrated into Turbopack's incremental graph. The adapter occupies Next's single adapterPath, so it does not automatically compose with the Vercel deployment adapter. Next should own framework/request/cache semantics; compiler providers should not imitate them inside native code. See [the route-primitive investigation](next-primitive.md) for the related lifecycle/output gap.

## Vercel: sidecar or network call?

**Nothing was deployed.** The local adapter startup hook belongs to the self-hosted Next server. It does not establish that the same hook runs inside Vercel's packaged Node function.

A native sidecar inside each Node function instance would preserve local IPC, but needs explicit Linux binary tracing/packaging and executable modes, lazy per-instance startup, concurrent-call sharing, restart/freeze/thaw behavior and platform lifecycle ownership. Vercel documents full Node API coverage and limits on shared file descriptors, memory and duration. That makes spawning a process plausible, but is **not evidence of a guaranteed persistent sidecar contract** or automatic Next-adapter composition. Resource use belongs to the Node function instance. [Function limits](https://vercel.com/docs/functions/limitations).

A separate native function/service would give it its own scaling/lifecycle, but turns the call into an authenticated, versioned network RPC with serialization, network latency, timeout/retry and deployment-skew concerns. The local 0.054 ms figure says nothing about this latency. Build Output API describes function directories with runtime, handler and architecture; Vercel's Runtime Developer Reference documents custom runtimes. A bare loopback HTTP binary still needs a platform invocation bridge. These are evidence for a possible packaging path, not a verified scriptc deployment. [Build Output API primitives](https://vercel.com/docs/build-output-api/primitives), [Runtime Developer Reference](https://github.com/vercel/vercel/blob/main/DEVELOPING_A_RUNTIME.md), [existing native-function research](vercel-native-functions.md).

Current public Daemons documentation describes long-running containers that **do not receive traffic**, so that is not a drop-in HTTP RPC backend for this design. A supported container service/native function or a queue-based redesign is a separate investigation. [Daemon output contract](https://vercel.com/docs/build-output-api/daemons). Platform capability negotiation and an actual Linux-hosted test are prerequisites to choosing between sidecar and separate function; this prototype claims neither deployment works unchanged.

## Verification

Use a real Node 24+ executable on PATH (the measurements used fnm's Node 24.22.0). Initial fresh installation exposed `SC3004: TypeScript server startup: Permission denied`: scriptc's installed checker binaries lacked execute bits. Locally restoring executable modes on tsc-ts/tsc and scriptc-comptime fixed the installation; no repository/compiler source workaround was added.

```sh
pnpm install --frozen-lockfile
node --test packages/next-scriptc/test/functions.mjs packages/next-scriptc/test/function-native.mjs
node --test packages/next-scriptc/test/routes.mjs
node examples/demo/test/functions.mjs
# Optional webpack verification, followed by tests against that output:
pnpm --dir examples/demo exec next build --webpack
node examples/demo/test/functions.mjs --skip-build
node examples/demo/test/e2e.mjs --skip-build
# Rebuild with Turbopack before comparing the reported default configuration:
pnpm --dir examples/demo build
node examples/demo/bench/functions.mjs --skip-build
```

Function unit/native tests: **6 passed**. Existing route tests: **5 passed**. E2E builds native + Node, compares four report/error/range cases with dev, exercises route handlers and progressive-enhancement Server Actions, checks browser chunks, kills an in-flight function process and checks promise rejection/restart. Both bundlers passed build + function E2E. The existing route E2E also passed all 12 response/parity cases, thread-report results, native/static routing, startup conflicts, restart/cutoff, CLI ownership and SIGTERM/SIGKILL cleanup, now counting the function process. No merge, push or deployment.
