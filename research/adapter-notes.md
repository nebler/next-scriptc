# next-scriptc adapter notes

Prototype: Next 16.4.3, scriptc 0.4.6, Node 24. Source references below are
relative to the installed Next package unless prefixed `vendor/scriptc`.

## Production process ownership

Plain `next start` owns the native route binaries directly. The adapter's async
production-server `modifyConfig` reads the build-validated manifest, spawns all
routes in parallel, and awaits each exact readiness line before returning.
Startup errors identify the route and native port; an occupied port preserves
scriptc's EADDRINUSE diagnostic. Failed startup kills and awaits started children.
A native crash after startup fails the Next process and terminates its siblings.

The source trace establishes which process owns this work:

- `dist/bin/next:238` imports `next-start`; `dist/cli/next-start.js:104-110`
  awaits `startServer` directly. Production does not fork a server child.
- `dist/server/lib/start-server.js:159-170,381-389` initializes the router in
  that same process. It binds the frontend before loading config and holds
  incoming requests behind `handlersPromise` (`:178-195,417`). Its early
  "Ready" message (`:302`) is therefore insufficient to prove native readiness.
- `dist/server/lib/router-server.js:133-138` awaits production config, then
  `:673-698` initializes the render server in-process. Render initialization is
  memoized by directory (`dist/server/lib/render-server.js:139-146`).
- The render server's `NextServer` also calls `loadConfig`
  (`dist/server/next.js:223-229`). Both calls use the same cache key: directory,
  phase, customConfig=false, profiling=false, debugPrerender=false and PID
  (`dist/server/config.js:1176-1209`). The second is a cache hit, so
  `modifyConfig` runs once. Its async result is awaited at `:1155-1173` and
  cached at `:1418-1431`. The adapter also memoizes startup promises by distDir
  to cover concurrent loads through another config cache key.

Next owns graceful SIGINT/SIGTERM handling
(`dist/server/lib/start-server.js:304-379`); native binaries remain available
while it drains requests, with a five-second bound for stuck responses. On process
exit the adapter kills remaining children.
Every child also receives an unwritten stdin pipe and `NEXT_SCRIPTC_PARENT=1`.
The shim subscribes to stdin data/end; EOF exits immediately even with an active
response, so server SIGKILL cannot leave native orphans. Standalone binaries do
not monitor stdin without that flag. scriptc's piped stdin data/end support is
declared in `vendor/scriptc/packages/compiler/ambient/scriptc-node-fallback.d.ts:335-365`
and exercised with the installed compiler by both EOF and actual parent-SIGKILL tests.

`next-scriptc start` remains a same-process import of Next's CLI, preserving
existing package scripts and benchmark callers without a supervisor, a second
config load, or duplicate argument parsing. New callers can use plain `next start`.
Custom servers that only call `loadConfig` also trigger startup; they must own
that process's lifetime. Windows and export/standalone outputs are unsupported.

## Indicative process-tree measurement

Final native build `LcWmL4_VvxRK6EtQhxctu`; Node baseline
`VG1I3a8hFQzjoRO4uwzR9`. Node 24.22.0/macOS arm64, five alternating
process-cold samples per mode, one owned tree at a time. End-of-run load averages:
41.9 / 40.8 / 38.6. Cold time runs from immediately before spawn to a status/body
checked, fully drained hello response, retrying connections every 2 ms. OS caches
are retained. RSS is sampled after that response plus 500 ms idle, summing the
whole process tree; it can double-count shared mappings and is not PSS or peak RSS.

Median cold time and total idle RSS, with [min, max]:

- Plain Node Next: **1,387 ms [1,073, 1,688]**, **106.1 MiB [99.2, 118.3]**;
  one Next process.
- Reconstructed review-1 supervisor: **2,804 ms [2,110, 3,932]**,
  **219.8 MiB [204.4, 223.8]**; supervisor + Next + ten native binaries.
- Current plain next start: **2,244 ms [1,694, 2,862]**,
  **143.6 MiB [135.2, 154.0]**; Next + ten direct native children.

The median-RSS snapshots show the old supervisor at 71.7 MiB, Next at 108.9 MiB,
and natives totaling 39.2 MiB. Current Next is 105.1 MiB and natives total
38.5 MiB. The extra Node process is gone; native mode still costs more than plain
Node because all ten binaries and their module initializers are resident.
Cold ranges overlap substantially, so these short loaded-host samples establish
no reliable cold-start advantage beyond the observed cohort.

The legacy comparison reconstructs `9d02686`'s CLI and adapter guard in temporary
files, uses the same final native binaries, and redirects the adapter import with
a Node loader hook. That hook's overhead is included and not isolated. No checkout,
branch, index, app source, or benchmark-agent files are changed. The original
pre-streaming cohort in `benchmarks/local-indicative.md` measured 257.6 MiB / 1,057 ms
for native mode versus 118.5 MiB / 675 ms for Node; changed host load, memory
pressure and binaries prevent a direct before/after claim across those cohorts.

Reproducer: `node packages/next-scriptc/test/startup-cost.mjs` (both existing
builds required). Full per-process PID/PPID/RSS/command snapshots, samples, build
IDs and port cleanup: `packages/next-scriptc/test/startup-cost-results.json`.

## Native-only next/server

The adapter writes `.next/scriptc/tsconfig.json`, extending Next's selected
config and preserving inherited aliases, with an exact `next/server` mapping to
the package shim. Nearest-entry tsconfig adoption supports paths; scriptc 0.4.6
has no CLI alias/tsconfig option (`vendor/scriptc/docs/content/docs/cli.mdx:44`;
resolver `packages/compiler/src/frontend/program.ts:294,326`). Next resolves
JSONC, inheritance and custom tsconfigPath via `dist/build/load-jsconfig.js:106,134-165`.
Development and ordinary Node builds still import real Next. Tests cover all
six route extensions, inherited aliases without baseUrl, and transitive imports.

The shim supports NextResponse construction/JSON/redirects, response cookie
set/delete, and NextRequest headers/body readers/URL/request cookies. Cookies
snapshot the initial request header; URL and cookie objects are parsed lazily.
Request/Response composition is required because scriptc cannot subclass those
Web classes. Unsupported Web parsers are declared `never`, producing type errors
instead of runtime stubs. The method-signature handler type allows named params.
The Response/NextResponse union emits SC6104 checked-dynamic warnings; attempted
structural alternatives failed at runtime. Exact refusals are in
[scriptc-refusals.md](scriptc-refusals.md).

Next evidence: `dist/server/web/spec-extension/request.js:31-50`,
`dist/server/web/spec-extension/response.js:36-69,90-106`,
`dist/server/web/next-url.js:15-20`, and
`dist/compiled/@edge-runtime/cookies/index.js:32-105,292-329`.
The initial Set-Cookie value really is decoded twice: parseCookie at `:60`,
parseSetCookie at `:89`. `%2525` becomes `%`, serialized as `%25` after another
cookie is set; `%25` throws URIError. Both cases have native/real-Next parity
coverage. Removing the second decode would disagree with this pinned Next release.
Next rejects rewrite()/next() from route handlers
(`dist/server/route-modules/app-route/module.js:570-575`); neither is declared.

## Response transport and request cost

The bridge streams Web chunks with ServerResponse.write and cancels the reader
on disconnect or HEAD. When the first chunk closes the stream, one microtask
allows closure notification and `end(bytes)` emits that chunk directly. It does
not wait for a second chunk from an open stream. Parity explicitly checks
Content-Length for a single chunk, a separately delivered first chunk at least
140 ms before stream completion, cancellation, and signals during active requests.
The parity fixture includes the demo's actual Node declarations; the byte overload
of end is pinned explicitly after those overloads exposed a runtime failure
(see refusal 19).

Backpressure remains unavailable: scriptc exposes neither write's boolean result
nor drain/write completion callbacks. The bridge retains one chunk, but the
transport can queue unbounded bytes for a slow client. Uploads remain buffered;
request AbortSignal propagation, full NextURL metadata, Web subclass identity,
blob/formData and Next's route caching remain unsupported. EOF notification is
handled at native event-loop turns (`vendor/scriptc/packages/runtime/src/scr_events.c:1917-1940`);
it does not preempt a handler that blocks that loop indefinitely. SIGKILL cleanup
is tested with idle workers and stdin EOF with an asynchronous never-ending stream.

Next's proxy defaults to 30 seconds
(`dist/server/lib/router-utils/proxy-request.js:37`). On this loaded host, native
cost-10 bcrypt exceeded that budget and returned proxy HTTP 500 during route
verification. The route parity test preloads a test-only 180-second config override,
matching its HTTP client budget. Production defaults are unchanged; applications
with these slow handlers must choose an appropriate experimental.proxyTimeout.
This test override is absent from the startup and direct-latency measurements.

Direct-native comparison: `packages/next-scriptc/test/request-cost.mjs` compiles
the actual hello handler against shims from `5536d9f`, `9d02686` and the working
copy, with the demo's Node declarations and without checking out files. Each sample uses a fresh binary process, one
HTTP/1.1 keep-alive connection, 300 warmup requests and 5,000 sequential timed
requests. Five rounds alternate variant order. Status and body bytes are checked.
Raw results: `packages/next-scriptc/test/request-cost-results.json`.

Node 24.22.0/macOS arm64, five alternating rounds (25,000 timed requests per
variant), standalone binaries without the parent lease. Median of per-round
mean / p50 / p99, milliseconds:

- `5536d9f`: **0.502 / 0.299 / 3.732**; p50 range 0.197–0.386.
- Review 1 (`9d02686`): **0.436 / 0.254 / 3.026**; p50 range 0.149–0.645.
- Current: **0.366 / 0.210 / 2.247**; p50 range 0.139–0.247.

The same five-round protocol with `COST_PARENT_LEASE=1` records the managed
current binary separately in `request-cost-managed-results.json`. Median
mean / p50 / p99: old **0.607 / 0.363 / 4.151**, review 1
**0.681 / 0.368 / 4.819**, current **0.838 / 0.387 / 6.205**. The predecessor
shims ignore this environment flag. Current managed p50 range: 0.274–0.771.
The stdin watcher adds runtime event-loop work; exact overhead is not isolated
by subtracting these independently scheduled cohorts. Load averages at the end
were approximately 26–34 (standalone) and 27–33 (managed). All numbers are
**indicative**: overlapping ranges and changing host load do not establish a
reliable speedup or prove recovery of all wrapper/streaming overhead. Keep the
single-chunk fast path for its reduced framing/writes; the request wrapper and
managed stdin monitoring remain costs.

Reproduce sequentially with Node 24 on PATH:

```sh
COST_COUNT=5000 node packages/next-scriptc/test/request-cost.mjs
COST_PARENT_LEASE=1 COST_COUNT=5000 node packages/next-scriptc/test/request-cost.mjs
```

## Routing and the Next proxy hop

Routing remains in Next: headers/redirects/middleware/beforeFiles precede
filesystem matching; dynamic native routes use afterFiles so static siblings
win (`dist/server/lib/router-utils/resolve-routes.js:49-83`). BasePath and locale
matching are applied to custom routes; external destinations do not inherit a
basePath (`dist/lib/load-custom-routes.js:325-356`). These combinations have
source evidence, not exhaustive runtime coverage. Literal destinations are URL
encoded separately from source-pattern escapes; feed.xml and seven punctuation
cases exercise Next's real destination parser
(`dist/shared/lib/router/utils/prepare-destination.js:140-149,185-206`).

`dist/server/lib/router-utils/proxy-request.js:20-41,118-124` creates a ProxyServer
per request, changes Host, preserves the public host and serializes query params.
Its minified `dist/compiled/httpxy/index.js:1` has module-scoped HTTP(S) keep-alive
agents (maxSockets=256, maxFreeSockets=64). Closing ProxyServer does not destroy
these pools. Explicit Connection: close and transfer-encoding uploads can
prevent reuse. Next's httpAgentOptions configures different global agents
(`dist/server/setup-http-agent-env.js:22-24`). The native server's 60-second
keepAliveTimeout allows reuse across idle gaps; busy connections gain nothing.
The parity test verifies reuse; the earlier hop run observed one persistent
Next/native socket pair across three complete frontend requests.

Earlier indicative hop run (review 1, Node 24.22.0/macOS arm64, loaded host):
600 requests after 40 warmups, mean milliseconds at concurrency 1 / 16:
Node Next 1.464 / 8.468; native through Next 1.425 / 3.181; native direct
0.291 / 0.977. Native topology difference: about 1.13 / 2.20 ms, including
routing/serialization/scheduling/queueing, not a pure TCP-hop measurement.
Reproducer/raw evidence remain `packages/next-scriptc/test/hop.mjs` and
`hop-results.json`. Those results precede the current lifecycle/fast-path changes.
Both builds mark hello STATIC: Node serves its cached route while the native
rewrite recomputes JSON. This is an application-path comparison, not identical
framework-cache execution or a compiler-only speedup. The public adapter hooks
do not expose native dispatch inside Next or httpxy agent configuration.

## Final verification

All use Node 24.22.0 on PATH and `SCRIPTC_CHECKER_SERVER=0`, sequentially:

```sh
pnpm --filter demo build
E2E_PORT=3467 node examples/demo/test/e2e.mjs --skip-build
ROUTES_PORT=3477 pnpm --filter demo test:routes --skip-build
node --test packages/next-scriptc/test/routes.mjs
node packages/next-scriptc/shim/test/parity.mjs
pnpm --filter demo exec tsc --noEmit --incremental false
node packages/next-scriptc/test/startup-cost.mjs
```

The fresh final build compiled all ten routes. E2E passed six curl responses,
report results at 1/4/1 threads, static precedence, exactly-once direct child
ownership, server-only SIGTERM/SIGKILL, native crash, native/Next port conflicts,
and the same-process CLI alias. The route suite passed all 31 status/header/body
comparisons and PID/port cleanup checks with its documented test-only proxy budget.
Package tests passed both discovery/native compilation and literal-destination
cases. Shim parity passed 53 full response comparisons plus single-chunk framing,
separate early streaming chunks, disconnect cancellation, graceful signals during
requests, socket reuse, and stdin EOF during a never-ending response. The final
stream sample was Node first/end 9.0/234.4 ms and native 1.6/227.0 ms (indicative). TypeScript exited 0 with no diagnostics.

EOF cannot preempt an indefinitely blocking native handler. Linux, a quiet-host
benchmark, exhaustive basePath/i18n/proxy.ts combinations, and full deployment
adapter integration remain unverified. No commits or index/branch changes were made.

Final process scan found no owned servers or compiler processes. Bind checks passed
for 3417, 3427, 3437, 3447, 3467, 3477, and every native port (29996–30005).
HEAD remains `9d02686917c54c92a42631407a67a058b8420da5`; the index is unchanged and
all implementation/documentation changes are uncommitted.
