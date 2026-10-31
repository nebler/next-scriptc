# next-scriptc adapter notes

Prototype: Next 16.4.3, scriptc 0.4.6, Node 24. Source references below are
relative to the installed Next package unless prefixed `vendor/scriptc`.

## Production process ownership

Plain `next start` owns the native route binaries directly. The adapter's async
production-server `modifyConfig` reads the build-validated manifest, spawns all
routes in parallel, and awaits each exact listening line before returning.
Generated entries use literal dynamic imports **after** binding the HTTP port.
Next therefore initializes alongside route modules (including the search index);
early requests wait for module initialization instead of hitting an unbound port.
The listening line means transport readiness, not completed module execution.
Startup errors identify the route and native port; an occupied port preserves
scriptc's EADDRINUSE diagnostic. Failed startup kills and awaits started children.
A native crash after startup restarts only that binary. Delays are 500, 1,000,
2,000 and 4,000 ms; a fifth crash within 30 seconds stops retries for that route
and logs how to retry. Pages and sibling routes stay available. While the native
port refuses connections, this Next version returns **500**, not 502
(`dist/server/lib/router-utils/proxy-request.js:76-87`); no extra proxy is added.

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
Every child receives its owner's PID in `NEXT_SCRIPTC_PARENT`; stdin is ignored.
The shim checks `process.ppid` on an unref'd one-second interval and exits when
it differs, including during asynchronous never-ending responses. Supplying the
expected PID also covers owner death before the shim starts. This removes stdin
watching from the request event loop. Standalone binaries without the variable
have no monitor. Neither polling nor the previous stdin watcher can preempt a
handler that blocks the native event loop indefinitely.

scriptc 0.4.6 lowers `process.ppid` to a fresh `getppid()` read
(`vendor/scriptc/packages/compiler/src/frontend/lowering/builtins/process.ts:850-851`,
`vendor/scriptc/packages/runtime/src/scr_lib.c:2698-2720`). Interval unref is
implemented in `vendor/scriptc/packages/runtime/src/scr_async.c:1380-1413`.
A compiled probe with only the unref'd interval exited immediately; with a live
handle it detected actual parent SIGKILL and exited in 1,003 ms (indicative).

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

These are historical, indicative samples. The one-off measurement programs and
JSON results have been removed; the maintained benchmark suite owns measurement.

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
blob/formData and runtime route caching remain unsupported. Next retains ownership
of prerendered routes, including their cache/revalidation behavior. Parent-death
cleanup is tested with idle workers and an asynchronous never-ending stream;
normal polling cleanup takes approximately 1–2 seconds on a loaded host.

Next's proxy defaults to 30 seconds
(`dist/server/lib/router-utils/proxy-request.js:37`); the setting is supported by
`dist/server/config-schema.js:338` and consumed at `dist/server/lib/router-server.js:470`. On this loaded host, native
cost-10 bcrypt exceeded that budget and returned proxy HTTP 500 during route
verification. The demo config reads test-only `DEMO_PROXY_TIMEOUT_MS=180000`,
matching its HTTP client budget. Production defaults are unchanged; applications
with these slow handlers must choose an appropriate experimental.proxyTimeout.
The test must set that environment variable and must not preload or patch the adapter.
This override is absent from startup and direct-latency measurements.

Historical indicative direct-native comparison compiled
the actual hello handler against shims from `5536d9f`, `9d02686` and `72cf1c5`,
with the demo's Node declarations and without checking out files. Each sample
used a fresh binary process, one
HTTP/1.1 keep-alive connection, 300 warmup requests and 5,000 sequential timed
requests. Five rounds alternate variant order. Status and body bytes are checked.

Node 24.22.0/macOS arm64, five alternating rounds (25,000 timed requests per
variant), standalone binaries without the parent lease. Median of per-round
mean / p50 / p99, milliseconds:

- `5536d9f`: **0.502 / 0.299 / 3.732**; p50 range 0.197–0.386.
- Review 1 (`9d02686`): **0.436 / 0.254 / 3.026**; p50 range 0.149–0.645.
- `72cf1c5`: **0.366 / 0.210 / 2.247**; p50 range 0.139–0.247.

The same five-round protocol with the stdin parent lease enabled measured
the managed `72cf1c5` binary separately. Median
mean / p50 / p99: old **0.607 / 0.363 / 4.151**, review 1
**0.681 / 0.368 / 4.819**, current **0.838 / 0.387 / 6.205**. The predecessor
shims ignore this environment flag. Current managed p50 range: 0.274–0.771.
The stdin watcher adds runtime event-loop work; exact overhead is not isolated
by subtracting these independently scheduled cohorts. Load averages at the end
were approximately 26–34 (standalone) and 27–33 (managed). All numbers are
**indicative**: overlapping ranges and changing host load do not establish a
reliable speedup or prove recovery of all wrapper/streaming overhead. Keep the
single-chunk fast path for its reduced framing/writes; the request wrapper and
the prior stdin monitor remained costs.

The historical scripts and raw JSON were removed after retaining these methods
and conclusions. Use the maintained benchmark suite for ongoing comparisons.

Final-review direct-native comparison used the same actual hello body, Node
24.22.0/macOS arm64, one HTTP/1.1 keep-alive socket, 300 warmups and 5,000 timed
sequential requests per fresh process, five alternating rounds (25,000 timed
requests per mode). It compared the previous shim with `NEXT_SCRIPTC_PARENT=1`,
the new shim with its owner's PID, and the new shim without monitoring. Every
status/body was checked. Compilation and owned processes ran sequentially.
Median per-round mean / p50 / p99 in milliseconds, with p50 [min, max]:

- No monitor: **1.511 / 0.574 / 15.225**, **[0.207, 0.654]**.
- Previous stdin monitor: **1.278 / 0.596 / 10.699**, **[0.204, 0.798]**.
- Parent PID interval: **1.175 / 0.454 / 11.942**, **[0.145, 0.635]**.

These numbers are **indicative**. End load averages were 53.0 / 41.2 / 37.5;
overlapping ranges and a slower unmonitored median than the polled median show
that scheduling noise dominates. The observed p50 decrease from 0.596 to 0.454 ms
is not a reliable 24% performance claim or proof of a precise overhead bound.
The implementation now does one parent syscall per second, with no stdin event
source and no lease work in the request handler. The reviewer's earlier 0.84–0.94
ms unmonitored versus 0.96–1.13 ms stdin p50 motivated this change; those numbers
are from a separate loaded-host cohort. The temporary comparison was kept outside
the repository; ongoing measurements belong in the benchmark suite.

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
These results precede the current lifecycle/fast-path and prerender changes.
Both historical builds marked hello STATIC: Node served its cached route while
the native rewrite recomputed JSON. The current adapter leaves prerendered routes
with Next. That old comparison measured different application paths, not identical
framework-cache execution or a compiler-only speedup. The public adapter hooks
do not expose native dispatch inside Next or httpxy agent configuration.

## Prerender ownership and rewrite ordering

With cacheComponents, Next can prerender pure GET handlers such as hello and
feed.xml. `onBuildComplete.outputs.prerenders` identifies the original matcher
in `route`; `routeType: "route"`, `response: "complete"`, `compute: "static"`
identify completed Route Handler bodies (`dist/build/adapter/build-complete.d.ts:91-120,177-182`;
construction in `dist/build/adapter/build-complete.js:711-715,803-847`). The adapter
skips compilation and manifest entries for these handlers, leaving all methods
and revalidation with Next. A dynamic route with prerendered paths also stays
with Next, preserving its static paths and fallback handling.

Discovery must inject rewrites during build-phase modifyConfig, before Next has
prerendered anything. At build completion we remove just the skipped routes'
native destinations from beforeFiles/afterFiles in routes-manifest.json. Next's
last manifest write is `dist/build/index.js:2679`, before the awaited adapter
hook at `:2864-2895`; no later write overwrites the adjustment. Plain next start
reads that file at `dist/server/lib/router-utils/filesystem.js:291-298` and adopts
its rewrites at `:425-435`. Build-time config and adapter routing summaries still
contain provisional rewrites, so this solution targets the supported local
production server, not a deployment adapter consuming those summaries.
User rewrites and native static-pattern routes that require request data remain.

## Final verification

Node 24.22.0/macOS arm64, `SCRIPTC_CHECKER_SERVER=0`, sequential checks:

```sh
node --test packages/next-scriptc/test/routes.mjs
node packages/next-scriptc/shim/test/parity.mjs
pnpm --filter demo build
E2E_PORT=3467 node examples/demo/test/e2e.mjs --skip-build
pnpm --filter demo exec tsc --noEmit --incremental false
DEMO_PROXY_TIMEOUT_MS=180000 ROUTES_PORT=3477 pnpm --filter demo test:routes --skip-build
```

- Package tests: 3 passed, including six route extensions, native-only aliases,
  unsupported helper refusals, literal rewrites, and prerender rewrite removal.
- Shim parity: 53 identical responses plus framing, early streaming chunks,
  cancellation, keep-alive reuse and graceful signals. Actual parent SIGKILL
  during never-ending streams cleaned up Node in 1,005 ms and native in 1,002 ms.
- Demo build `GNDt9FZee0Fa5xp4inCr7`: 8 native handlers. Both hello and feed.xml
  remain Next prerenders, absent from the native manifest and rewrites.
- E2E passed: six curl bodies and report results at 1/4/1 threads; static-pattern
  native routing; static sibling precedence; direct child ownership; server-only
  SIGTERM/SIGKILL cleanup within 2.5 seconds; one-route crash/recovery with proxy
  HTTP 500 and healthy pages/siblings; fifth-crash retry cutoff; startup port
  conflicts; same-process CLI alias.
- TypeScript: exit 0, no diagnostics.
- The tracked route suite passed its 31 Node dev cases but failed production
  startup with ERR_MODULE_NOT_FOUND for its removed proxy-timeout.mjs preload.
  That file belongs to the companion agent and was not edited here. It must
  remove the preload, set `DEMO_PROXY_TIMEOUT_MS=180000` in its child environment,
  and expect no native marker for prerendered feed.xml (prefer manifest-based
  marker expectations). A temporary copy outside the repo made only those
  compatibility changes, with import paths adjusted for its location: all 31
  dev/production status, content/cache/security/auth headers and body comparisons
  passed; all 8 native PIDs exited and port 3477/native ports were free. The
  tracked command remains an integration follow-up, not a claimed passing check.

No runtime loop monitor can preempt an indefinitely blocking synchronous native
handler. Linux, a quiet-host performance comparison, exhaustive basePath/i18n/
proxy.ts combinations, and deployment adapters consuming provisional routing
summaries remain unverified. The current manifest adjustment is for local Next
production startup. No commits, index updates, or branch changes were made;
HEAD remains `72cf1c52a71b0e45cac80413a3fe67ffe3f0ce4a` on main. All changes are
uncommitted, and companion-agent files were left untouched.

Final bind checks passed for test ports 3467/3477 and all original native ports
29996–30005 (including the two now-unused prerender ports). The final process
scan found no commands referencing this checkout; no owned server/compiler or
probe processes remain. Other worktrees' processes were not touched.

## Fix round: App Route Vary and proxy compression

Next 16.4.3's `dist/server/base-server.js:1409-1427,1489` sets the
App Router Vary value before dispatch. It includes `next-url` only for
interception paths; the regexes come from interception rewrites
(`dist/server/next-server.js:637-640`). The shim now follows that order,
including automatic methods and handler failures, and removes `next-url` from
ordinary handler requests. `dist/server/send-response.js:28-52` appends the
handler's Vary. `dist/server/base-http/node.js:120-126` deduplicates whole
values, not individual tokens; even `*` is appended after the framework value.

### Known divergence: external-rewrite compression

Native responses go through Next's external-rewrite HTTP proxy, rather than its
App Route response pipeline. With default compression enabled, compressible
native responses can therefore have an additional `Vary: Accept-Encoding` and
be gzip/deflate encoded, while equivalent Node App Route responses are not.
The decoded body bytes still match. The extra Vary token can appear even on
small bodies, HEAD requests, or requests that don't accept compression: Next's
middleware appends it before checking size, method, or accepted encodings.

Source evidence below refers to the installed, pinned Next 16.4.3 `dist/` files
(relative to `examples/demo/node_modules/next/`):

- `server/lib/router-server.js:142-144,318-320` constructs `compression()`
  unless `config.compress === false`, then runs `compress(req, res, ()=>{})`
  before route resolution. At `468-470`, external destinations return
  `proxyRequest(...)`; `server/lib/router-utils/proxy-request.js:28-34` creates
  a `ProxyServer` from `next/dist/compiled/httpxy`.
- `server/send-response.js:34-52` copies App Route response headers using
  `res.appendHeader(name, value)`. `server/base-http/node.js:120-126` stores
  these as arrays: `this._res.setHeader(name, [...currentValues, value])`.
  In particular, Content-Type becomes an array in this path; the HTTP proxy
  instead receives a string Content-Type across the loopback hop.
- `compiled/compression/index.js:14` rejects non-string MIME values with
  `if(!a||typeof a!=="string"){return false}`. The default `shouldCompress`
  filter at line 22 reads `e.getHeader("Content-Type")` and calls this check.
  Thus a normal Node App Route's array Content-Type skips compression before
  the Vary append; the proxied string Content-Type passes for compressible MIME
  types. A user-configured string Content-Type can change the Node behavior too.
- At that same minified line 22, the exact order is
  `if(!i(a,o)){nocompress("filtered");return}`, then
  `if(!shouldTransform(a,o)){nocompress("no transform");return}`, then
  `r(o,"Accept-Encoding")`, followed by threshold, existing Content-Encoding,
  HEAD and negotiation checks. `shouldTransform` reads Cache-Control and tests
  `/(?:^|,)\s*?no-transform\s*?(?:,|$)/`.

There is no supported per-response compression switch preserving all headers.
`Cache-Control: no-transform` does skip both compression and the Vary append,
but adding it changes observable cache policy. Changing Content-Type does too.
Setting Content-Encoding (even an existing non-identity encoding), using HEAD,
or staying below the default 1024-byte threshold does not prevent the append.
The public `compress: false` config option is documented in
`dist/docs/01-app/03-api-reference/05-config/01-next-config-js/compress.md`;
it disables compression globally, changing unrelated responses. The adapter
does not set any of these. The httpxy prototype monkeypatch and its test have
been removed; the runtime no longer modifies Next's response handling.

**Input for what a proper in-Next primitive would need:** only Next can remove
this divergence while retaining its public API contract: native dispatch needs
to participate in App Route response sending, or Next needs to expose a
supported per-route opt-out before its compression/Vary logic. An adapter
using external rewrites cannot preserve the internal Content-Type array across
HTTP or control that middleware without an observable header/config change.

The demo route comparison requires Next's exact App Route Vary prefix and
retains any handler Vary suffix; native Vary must match that complete Node
value or have only `, Accept-Encoding` appended, in that order. Every other
compared header, status and decoded body stays
byte-for-byte equal. Shim parity additionally checks `next-url` removal and
preservation against Next's actual `BaseServer.setVaryHeader` for ordinary,
interception-rewrite matching/nonmatching, and all four interception markers. This
test-only use of the pinned Next implementation does not patch the server.

The E2E prerender fixture is now `/api/static-fixture`; hello and feed remain
dynamic demo/benchmark routes. Its report assertions also follow the current
RSS-only payload. Runtime lifecycle helpers keep startup readiness,
restart policy and cleanup separate. Child stdout chunks are forwarded with
writes on data events, avoiding pipe listeners on shared stdout.

Follow-up verification uses Node 24.22.0 and `SCRIPTC_CHECKER_SERVER=0`.
All requested checks pass:

- `pnpm --filter demo build`: 11 native routes; static fixture prerendered.
- `node examples/demo/test/e2e.mjs`: seven curl responses and report results
  byte-equal; lifecycle, recovery, crash cutoff and port-conflict checks pass.
- `pnpm --filter demo test:routes --skip-build`: 49 comparisons pass with only
  the documented Vary allowance; all 11 native processes exit, ports free.
- `node packages/next-scriptc/shim/test/parity.mjs`: 64 comparisons pass;
  streaming gaps are 221–222 ms, parent-death cleanup is 990–999 ms.
- `node packages/next-scriptc/test/routes.mjs`: three tests pass.
- `node examples/demo/bench/check.mjs`: harness checks pass; sockets closed.
- Package `tsc --noEmit`: exit 0 with the explicit command below.

The explicit package type check uses the package's Node web declarations:

```sh
pnpm --filter demo exec tsc --noEmit --strict --skipLibCheck --allowJs \
  --allowImportingTsExtensions --target ES2022 --lib ESNext \
  --module ESNext --moduleResolution Bundler --types node \
  ../../packages/next-scriptc/src/index.ts \
  ../../packages/next-scriptc/shim/serve.ts \
  ../../packages/next-scriptc/shim/next-server.ts
```

The previous round's busy-port preflights and E2E signal cleanup are retained.
Final binds succeed for 3417, 3427, 3437 and 29996–30007, including the skipped
fixture's reserved port. No owned Next servers, native workers, shim fixtures,
test compilers or checker servers remain. HEAD stays at `42a2368` on `main`;
no commits or index/branch changes were made. Companion probe/performance files
and processes were left untouched.

## Optimization round 2 — 2026-10-31

**Indicative only: loaded shared Apple M4 Pro / macOS arm64, Node 24.22.0,
scriptc 0.4.6, Next 16.4.3.** These local measurements do not replace the quiet
four-vCPU Linux [round 1 baseline](benchmarks/sandbox-2026-10-31T00-39-05.856Z.md).
The ≤ Node cold-start target and a large hello CPU improvement are **not proven**.
No grouping, compiler/runtime patch, response caching, route algorithm change,
optimization-mode change, or git mutation was performed.

### Startup: bind before importing the route

`entrySource` now emits a literal dynamic import inside a loader passed to
`serve`. scriptc 0.4.6 supports this ordering: a probe printed `BEFORE LISTEN`,
`LISTEN`, then `MODULE INIT` before a deliberately slow initializer. The HTTP
server binds, reports its exact listening line, and starts the loader. The
adapter still awaits all listening lines, preserving initial port-conflict
failure and cleanup. It no longer waits for every route's module execution
before allowing Next to initialize. Synchronous module work leaves incoming
connections in the kernel queue; request callbacks await asynchronous module
initialization. The promise check clears after initialization. Import failures
print their error and exit the route process, entering existing supervision.
There is no additional proxy or process in the serving path.

The shim test now imports a fixture with a 250 ms top-level await. Three requests
sent immediately after listening all wait and succeed. Existing method, route,
stream, cookie, crash/restart and process-ownership checks continue to pass.

Cold measurements reuse `bench/processes.mjs` (`start`, `ready`, `stop`,
`portsFree`) and `bench/config.mjs`'s normal production command. Each sample is
spawn `next start` to a fully drained successful HTTP 200; connection refusal is
retried every 2 ms, and an HTTP 500 fails the sample. Each path uses three fresh
processes per runtime, alternating runtime order. Both native and baseline Node
builds have the same unchanged demo route sources; the baseline `.next-node`
build is reused. No server modes run together. Median milliseconds:

- `/api/hello`: native **1,065.8 → 350.2**; Node **572.9 → 323.0**.
- `/api/search?q=desk%20lamp&limit=7`: native **888.3 → 622.4**; Node
  **604.3 → 423.2**.
- `/`: native **901.6 → 408.9**; Node **405.2 → 370.3**.

Node's changing baseline demonstrates substantial environmental drift. Native
hello after samples are **4,655.4, 320.2, 350.2 ms**; the first launch of the new
binaries is retained, not discarded. Search still pays its native index setup
when search itself is requested. The serialization regression is addressed, but
native did not reach Node's median on these three paths. Quiet Linux repeats
remain necessary; neither a universal ≤ Node claim nor the source of the first
launch outlier is established.

### Request adaptation and bounded responses

Transport-owned requests retain their header pairs and cookie snapshot, build
Headers on first access, and materialize a Web Request only for body, signal,
clone or other Web-only state. URL/method/headers-only handlers avoid that Web
Request and its additional URL parse/header copy. Public two-argument
NextRequest construction still eagerly validates and snapshots its inputs.
Header and signal identities survive materialization; clone takes the current
headers, and cookies retain their original snapshot. Routing still parses the
URL and canonicalizes forwarded query strings, preserving escape/path/query
semantics. `nextUrl` remains lazy.

Native NextResponse tracks string, Uint8Array and JSON construction as bounded.
Those bodies use `arrayBuffer()` and one `end(bytes)` without reader/cancellation
bookkeeping. HEAD still cancels without reading. NextResponse streams retain the
streaming path; a new delayed-stream test verifies that the first chunk is sent
before completion. Ordinary Web Responses retain the existing single-closed-
chunk coalescing and streaming/cancellation path. There is no supported portable
API to recover a Web Response's original body type; content type/length cannot
safely identify a non-stream body. The general plain-Response `arrayBuffer()`
lever is therefore **not implemented**. In particular, hello uses plain
`Response.json`, so its response is not put through the new NextResponse branch.
No private symbols, compiler-specific runtime hooks or blanket buffering were
introduced.

Direct hello measurements reuse `perf/transport.py`'s server/client/process-CPU
helpers and the unchanged `perf/http-client.mjs`: one keep-alive connection,
500 initial warmup requests, then a server-only `ps TIME` delta across another
500 warmups plus three windows of 5,000 requests. Three fresh processes per
variant are interleaved after/before, before/after, after/before. Production after
uses the actual stripped `.next` hello binary, including its deferred generated
entry; before uses the original shim and NextRequest snapshot with the unchanged
hello handler. First responses in every window match body and all headers except
Date. CPU is quantized to 10 ms. Medians [observed min,max]:

- CPU µs/request: **41.29 [40.65,41.94] → 39.35 [38.06,39.35]** (~4.7% lower).
- p50 ms: **0.07533 [0.07342,0.07629] → 0.07417 [0.07217,0.07713]**.

These small local differences do not establish a general latency/throughput win.
A separate interleaved static-entry helper check measured **52.90 → 51.61 µs**
and p50 **0.09758 → 0.10113 ms**. Earlier non-interleaved runs looked much better
(**87.74 → 65.81 µs**, p50 **0.21396 → 0.12646 ms**); they are retained as evidence
of host drift, not credited as a 25% optimization. The NextResponse fast path was
parity-tested but not given a separate isolated performance claim.

### Production stripping and diagnostics

Production compilation now passes `--strip`, retaining the default release
optimization and serial builds. The same new hello helper entry is **2,020,008 →
1,879,872 bytes** unstripped/stripped (**6.9% smaller**). Across the eleven actual
production route binaries, total bytes changed **36,366,408 → 34,214,280**; that
comparison includes the shim/startup changes as well as stripping and is not an
isolated strip measurement. No RSS, steady-state or startup gain is attributed
to file size.

Two tiny fixtures were each compiled with and without stripping. Both uncaught
exceptions exited 1 and printed exactly `Uncaught Error: round2 native crash
diagnostic`; neither printed a source stack. Both deliberate SIGSEGV fixtures
exited with signal 11 and printed no runtime stderr stack. Core dumps were
disabled for the crash probe. E2E confirms the supervisor still reports route,
port and exit signal. Existing stderr diagnostics are preserved sufficiently for
this prototype; native symbolication/profiling needs an unstripped rebuild.
OS crash-report symbolication and Linux crash diagnostics were not verified.

### Verification and retained local evidence

All required commands passed under Node 24, sequentially where they compile or
run application workloads:

- `pnpm --filter demo build` (then E2E's normal second production build).
- `node examples/demo/test/e2e.mjs`: seven response cases and report results for
  threads 1/4/1; plain Next ownership, static precedence, signal cleanup, isolated
  crash/recovery/cutoff, native/Next port conflicts and CLI alias.
- `pnpm --filter demo test:routes --skip-build`: **49 comparisons**, all workers
  exited and ports free. The existing test-only 180 s bcrypt proxy timeout remains.
- `node packages/next-scriptc/shim/test/parity.mjs`: **68 comparisons**, delayed
  module requests, header/signal/clone/cookie behavior, streaming/cancellation,
  HEAD, cookies, routing/methods, shutdown and parent-death cleanup.
- `node packages/next-scriptc/test/routes.mjs`: **three tests**, including native
  compilation of deferred entries, all six extensions, aliases/re-exports, and
  prerender/rewrite behavior.
- `node examples/demo/bench/check.mjs`: harness checks pass, all sockets closed.
- Package `tsc --noEmit`: passes with the explicit Node-only Web declarations
  command in the preceding round's section (`--lib ESNext --types node`).
- `git diff --check`: passes.

Raw samples, original shim snapshots/binaries, actual production-binary hash,
probe controllers, command logs, crash diagnostics, sizes and provenance are
retained in the ignored local directory
`packages/next-scriptc/node_modules/.cache/adapter-round2-2026-10-31/`.
`cold-before.json`, `cold-after.json`, `http-paired-production.json`,
`http-paired.json`, `strip-size.json` and `crash-diagnostics.json` are the primary
evidence. The controllers invoke existing benchmark/profiling helpers instead
of adding a second committed harness. Only local artifact import paths were
adjusted when moving evidence out of the source tree.

The final process audit found no owned compiler, server, native worker, probe or
fixture. Port binds succeeded for **3417, 3427, 3437, 45173 and every native port**
(29996–30007 except prerendered 30005). No process or listener was left running.
No commit, branch, index or other git mutation was performed. The initial HEAD
was `adc6ff5`; another actor advanced main to `05c896f` (the round 1 benchmark
record) during this run. All implementation changes here remain uncommitted.

## Optimization round 3 — upload copies, startup tooling, regression check

2026-10-31; implementation base `fd40dda` on main, with the round 2 merge and
sandbox reports already present. Node 24.22.0, scriptc 0.4.6 release, Next 16.4.3,
Apple M4 Pro/macOS arm64. **All local timings below are indicative:** shared
loaded host, no CPU affinity, another research worktree active. They cannot
replace the quiet, pinned four-vCPU Linux round 2 baseline. No route algorithm,
fixture, password cost, parity expectation, optimization mode or git state was
changed. Builds and application modes owned by this task run sequentially.

### Profile first, then remove the two avoidable body copies

The round 2 baseline remains direct native/Node p50 **5.254/2.198 ms** for the
1 MiB RGBA histogram and **2.750/2.086 ms** for 1 MiB SHA-256 verification.
The unchanged handlers were first profiled under sequential HTTP keep-alive
upload load, with `/usr/bin/sample PID 5 1 -file FILE` for native and
`node --cpu-prof --cpu-prof-dir=... --cpu-prof-name=... ENTRY.ts` for Node.
Native binaries for this diagnostic retain symbols; production still strips.

Histogram's native main thread has **3,842 samples**, with **2,557 (66.6%)** in
the handler: 997 handler leaves, 921 `scr_bytes_release`, 639
`scr_bytes_retain_v`. The ownership calls sit inside the handler's numeric loop.
`Buffer.concat` accounts for 62 inclusive samples, Request construction 45,
and Web body collection 159. These disjoint observed call paths are diagnostic
sample shares, not exact per-request CPU-cycle attribution. Node spends **46.5%**
in POST, **6.7%** in GC, **2.2%** in BufferSource snapshot copying and **1.9%**
in concat (whole-process profile including idle/setup).

SHA-256 upload has **3,265/3,815 native samples (85.6%)** in
`scr_sha256_blocks`. Node spends **37.7%** in Hash.update, **7.5%** in GC and
**28.5%** idle. On this platform the request-body path is secondary to hashing;
the histogram also pays typed-array ownership traffic absent from the simpler
module-global kernel probe. The kernel-only parity result did not establish
parity for the full async upload handler.

`toRequest` now gives Web Request a closed stream of the owned HTTP chunks.
This removes **Buffer.concat** and the **BufferSource constructor snapshot**;
it needs neither an allocation based on an untrusted content-length nor a
second implementation of Web body state. It still waits for HTTP end before
calling the handler. Web Request retains bodyUsed, clone/tee, locking, text,
JSON, bytes and arrayBuffer semantics. ArrayBuffer readers still make their
required independent result; this is not a zero-copy claim. Chunked uploads
use the same path. Public NextRequest construction is unchanged.

An expanded interrupted-upload check exposed a pre-existing runtime discrepancy:
for a 1 MiB Content-Length and only seven bytes followed by FIN, native emits
close without end/aborted/error and reports complete=true. Node reports aborted,
error and complete=false. Pending collection now rejects on close; a local end flag avoids relying on
complete and avoids allocating an Error on every successful upload's close. No timeout or
request-body shortcut was added. AbortSignal propagation after handler dispatch
remains outside the shim's supported subset.

A same-file Request-construction/arrayBuffer microdiagnostic, 1 MiB and three
windows of 1,000 calls, measures BufferSource → owned closed stream:
**native 0.0911 → 0.0834 ms/call; Node 0.1694 → 0.0898**. This excludes HTTP and
is not an application speed claim. A separate Request/typed-array reduction
places the same luma sum inline in an async frame versus in a typed helper:
native **0.497 vs 0.356 ms/call**, with identical 32554081 totals. Its global
kernel is **0.261 ms**, excluding Request work. The reduction and the real
profiles are appended to [upstream issue drafts](upstream-issues.md), together
with the incomplete-FIN discrepancy and the newly measured SHA profile. No
issue was filed and no compiler/runtime fork or route rewrite was introduced.

Final direct HTTP measurements use the same generated static entry, handler,
1 MiB deterministic payload, valid digest/JWT and C=1 keep-alive client on each
side. Three fresh processes per variant, alternating before/after order;
100 warmups and three windows of 500 calls per process. Every status and full
body is checked on every call; bodies also match across all variants/runtimes.
Server-only ps TIME deltas include 1,600 calls and have 10 ms quantization.
Medians of nine p50 windows, with observed window ranges in brackets:

- Histogram native: **1.504 [1.449,2.665] → 1.400 [1.390,3.130] ms**;
  server CPU **1.363 → 1.288 ms/request**.
- Histogram identical shim under Node: **1.076 [1.040,1.302] →
  0.945 [0.893,1.098] ms**; CPU **1.869 → 1.319 ms/request**.
- SHA upload native: **4.648 [4.596,8.171] → 4.553 [4.500,4.618] ms**;
  CPU **4.425 → 4.350 ms/request**.
- SHA upload identical shim under Node: **1.178 [1.070,2.012] →
  0.937 [0.904,1.071] ms**; CPU **1.731 → 1.338 ms/request**.

Native median latency improves about 6.9%/2.1% locally, and still loses to Node.
The shared shim optimization helps Node more. Slow final windows (including
3.130 ms after histogram and 8.171 ms before SHA) are retained in the ranges;
these are not confidence intervals or evidence of a stable tail improvement.
Earlier exploratory windows varied widely while the other worktree built
(native SHA 4.5–9.2 ms); they remain local artifacts rather than being pooled
with the final interleaved pass. No Linux upload improvement or universal ratio
is inferred from these Mac results.

### Startup: defer build-only config tooling

Tracing timestamps surround modifyConfig, readManifest, each spawn and parsed
readiness line. In the original three-run trace, manifest reads take **1.5–3.5
ms**; all 16 listeners become ready **12.4–32.6 ms** after the first spawn.
Final interleaved traces using the rebuilt binaries show manifest ranges of
**0.7–7.4 ms** before / **1.5–3.5 ms** after; spawn-to-all-ready is
**10.3–16.9 ms** before / **10.6–13.0 ms** after. Readiness callbacks are
processed in a batch after the spawn loop. There is no evidenced large
readManifest or readline bottleneck to justify a new readiness protocol.

The static import graph did eagerly require Next's build/load-jsconfig module,
which also loads TypeScript/config tooling, during production startup. Its
require now lives inside writeNativeConfig, the only function that uses it.
This is a small build-only dependency change with no worker lifecycle or
per-request overhead. The 16 route processes and existing listener/module
initialization overlap remain intact.

Five fresh processes per mode, alternating order, measured spawn of plain
`next start` to a successful drained hello. Both native variants reuse exactly
the same **final rebuilt production binaries**; a Node load hook restores the
original eager require for the before variant, while recording the same
timestamps. Medians [min,max]:

- Native before: **337.1 [329.9,364.3] ms**.
- Native after: **322.3 [318.6,325.3] ms**.
- Node baseline: **314.2 [309.6,410.4] ms**.
- Next's config-timing line: **50 → 42 ms** median.

The concrete dependency removal yields an indicative local **14.7 ms / 4.4%**
end-to-end median improvement, with native still about **8.2 ms** behind Node.
An earlier five-run pass reused the original round 2 binaries and measured
native **418.5 → 331.9 ms**, Node **524.6 ms**; those much noisier samples are
retained in `startup-round2-binaries/`, not credited as an 86.6 ms saving or
pooled with the final pass. There is no two-CPU Linux affinity facility on this
host. The remaining Linux **463 vs 402 ms** gap is not resolved or attributed
to inherent contention by this experiment. The observed spawn budget and loaded
outliers are consistent with contention, but a pinned Linux trace is still
required to separate process startup/initialization competition from Next
startup itself.

### Round 1 versus round 2 hot-path check

The exact `4ddbf17` shim and next-server snapshot were compared with current
round 2 sources, using the unchanged real hello and successful JWT verify
handlers. This reuses the perf-levers method: C=1 keep-alive, 500 warmups, three
windows of 5,000 calls, three fresh native processes per variant, alternating
order; server CPU excludes the generator, spans 15,500 requests and is quantized
to 10 ms. Builds use the same installed release compiler, unstripped for local
diagnostics. All full response bodies match. There is no Next proxy in this
comparison.

- Hello CPU **37.42 [36.77,37.42] → 34.84 [34.84,50.97] µs/request**;
  p50 **0.07217 → 0.07017 ms**. One round 2 window reaches 0.17179 ms;
  it is retained, not dropped.
- Verify CPU **60.65 [60.00,60.65] → 58.06 [57.42,58.06] µs/request**;
  p50 **0.09475 → 0.09263 ms**.

There is **no measured net per-request regression** from the round 2 shim.
Deferred import runs once at listener startup; after initialization the request
callback checks a null promise without awaiting. Lazy headers/Web Request avoid
work on hello and defer it until required on verify. The bounded NextResponse
branch and its guard are included in the aggregate measurements; these two
handlers return ordinary Response.json, so the bounded-body path itself is not
exercised. Individual branch costs were not separately attributed. No GET-path
optimization was justified or shipped. The pinned Linux C=64 throughput loss
cannot be causally reproduced here; both original rows flagged generator
saturation and had unchanged CPU/request. Do not call the lower saturated
throughput a demonstrated adapter regression, or claim this sequential check
calibrates C=64 server capacity.

### Verification and evidence

The shim parity suite now has **87 comparisons**, adding empty/Unicode/1 MiB
bodies, content-length and chunked transport, clone mutation isolation,
bodyUsed/repeated reads, text/bytes/JSON/arrayBuffer, locked-stream rejection and
incomplete uploads. It still checks every previous status/header/body, cookie,
streaming, routing, lifecycle and parent-death expectation. No parity is weakened.

All required commands passed under Node 24 on the final code, with builds and
application workloads run sequentially:

- `pnpm --filter demo build`: 16 native routes, static precedence preserved.
- `node examples/demo/test/e2e.mjs`: its normal second build, seven curl cases,
  report threads 1/4/1, plain Next ownership, graceful/forced cleanup,
  crash/recovery/cutoff, port conflicts and CLI alias all pass.
- `pnpm --filter demo test:routes --skip-build`: **85 cases** pass against Node;
  all 16 workers exit and the HTTP/native ports are free. Existing test-only
  180-second bcrypt proxy timeout remains; production timeout is unchanged.
- `node packages/next-scriptc/shim/test/parity.mjs`: **87 comparisons** pass,
  including the new body-state/abort cases; parent-death cleanup is about 1 s.
- `node packages/next-scriptc/test/routes.mjs`: **three tests**, all pass.
- `node examples/demo/bench/check.mjs`: all harness checks pass, sockets closed.
- Package `tsc --noEmit`: the explicit Node-web-declarations command documented
  above exits 0 with an empty diagnostic log.
- `git diff --check`: passes.

Raw profiles, exact before/round1 snapshots, generated entries, binaries, clients,
source-load trace, timings, reductions and command logs are retained locally in
ignored `packages/next-scriptc/.next/round3/`. `summary.json` contains final HTTP
aggregates; `startup.json` contains all 15 interleaved cold samples. No new
committed benchmark harness duplicates examples/probe/perf.

Final cleanup found no owned probe, load generator, native server or shim fixture.
Bind checks pass for **3417, 3427, 3437, every native reserved port 29996–30012,
45383, 45384 and the final shim stream ports**. The required tests also verify
all their spawned workers exit. `completion.json` records the exact free-port
list, final source hashes, load and checks. The one-minute load at final audit is
12.50, reinforcing the indicative-only treatment of close measurements.
HEAD remains **fd40dda66ca0cc13e66fd624ce1e6b238e703444** on **main**, with an
empty index diff. All seven changed files are uncommitted. No commit, checkout,
branch, index, merge or other git mutation was performed.
