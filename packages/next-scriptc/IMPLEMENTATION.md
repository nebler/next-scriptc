# Adapter core investigation — 2026-10-30

Implementation stays within `packages/next-scriptc/**` and `examples/demo/test/e2e.mjs`. No commits, checkout,
index, or branch changes. Other agents' demo/benchmark/probe changes are separate.

## Native-only next/server

The installed scriptc 0.4.6 CLI has no build alias or explicit tsconfig argument.
Its documented nearest-entry tsconfig adoption supports `paths` (vendor
`docs/content/docs/cli.mdx:44`; resolver implementation
`vendor/scriptc/packages/compiler/src/frontend/program.ts:294,326`). The adapter writes
`.next/scriptc/tsconfig.json`, extends Next's selected tsconfig/jsconfig, resolves
existing aliases against Next's effective base directory, and adds one exact
`next/server` mapping. This covers transitive imports, without copying or
rewriting the source graph or adding a bundler. Dev and Node retain real Next.
Next's own config loader handles JSONC, config inheritance and custom
`typescript.tsconfigPath`; see `next/dist/build/load-jsconfig.js:106,134-165`.
The package route test exercises an inherited alias without baseUrl, all six
route extensions, and a transitive next/server import.

The native subset includes NextResponse construction, JSON, redirects (307 by
default, with only 301/302/303/307/308 accepted), response cookie set/delete, and
NextRequest headers, Web body readers, URL pathname/searchParams and request
cookie get/getAll/has. Cookies preserve encoding, ordering, default Path=/,
replacement by name, initial Set-Cookie values, expires/maxAge and deletion
attributes. Request duplicates retain the last value, bare cookies are `true`,
and malformed percent encodings are ignored. URL/cookie objects are lazy; the
incoming cookie header is snapshotted before handler mutation.

Evidence from installed Next 16.4.3, paths relative to its package:

- `dist/server/web/spec-extension/request.js:31-50`: Request construction,
  duplex, NextURL and request cookies.
- `dist/server/web/next-url.js:15-20`: loopback-host normalization.
- `dist/server/web/spec-extension/response.js:36-69,90-106`: construction,
  cookies, JSON and redirects.
- `dist/compiled/@edge-runtime/cookies/index.js:32-64,178-215,292-329`:
  cookie parsing, serialization, set/delete and normalization.
- `dist/server/route-modules/app-route/module.js:570-575`: Next rejects both
  `NextResponse.rewrite()` and `NextResponse.next()` in route handlers. Neither
  is declared by this shim.

Composition is necessary: scriptc cannot subclass Web Request/Response. The
bridge constructs the wrapper directly around one Web Request; handlers using
ordinary Request types continue to work. `declare ...: never` marks unavailable
Web parsers/properties while satisfying wider Node structural declarations;
calling a forbidden parser is a compiler type error, with no runtime stub.
A method signature permits context types narrowed to names guaranteed by a
route's pattern (for example `Promise<{ slug: string }>`).

Limits: this is not NextURL's framework metadata API, middleware support, a full
next/server replacement, or Web subclass identity. Request blob/formData and
NextURL clone/locale/basePath/buildId are outside this subset. The
Response/NextResponse union uses scriptc's checked dynamic representation and
emits SC6104 warnings. It does not invoke Node. A seemingly cleaner structural
response record compiled but failed at runtime; details are below. These
warnings and wrapper allocations remain a performance limitation.

## Streaming

Plain `ServerResponse.write(chunk)` followed by `end()` compiles and works on
0.4.6. The bridge now reads and writes each chunk immediately, releases the
reader, cancels it on client disconnect, and cancels HEAD bodies. It does not
collect an arrayBuffer or retain prior chunks. The fixture enqueues `first:`,
waits 220 ms and enqueues the rest. Tests assert a separate first chunk at least
140 ms before completion, rather than only comparing the complete body.

An observed parity run delivered Node's first chunk at 1.2 ms and its end at
221.9 ms; native's first at 0.7 ms and end at 222.0 ms. Indicative local timings,
not a performance claim. Both runtimes also pass a never-ending-stream client
abort/cancellation test and shutdown with requests in flight.

This is streaming **without backpressure**. scriptc declares `write` as returning
void and only exposes response close/finish events, not drain or write completion
callbacks. The bridge holds one chunk at a time; the transport can still queue
unbounded bytes for a slow client. Uploads remain buffered, and request
AbortSignal propagation remains unsupported. Callback/drain refusals already
exist in the repository's research log.

## The Next proxy hop

Facts from installed Next 16.4.3:

- `dist/server/lib/router-utils/proxy-request.js:20-41` creates a ProxyServer
  per request, uses changeOrigin, serializes the query and forwards the public
  host. Lines 118-124 call web() and close the proxy when done.
- `dist/compiled/httpxy/index.js:1` is minified. Its module-scoped `u` contains
  `new http.Agent({keepAlive:true,maxSockets:256,maxFreeSockets:64})` and the
  HTTPS equivalent. `setupOutgoing` selects these agents unless an explicit
  agent, an upgrade, or HTTP/2 requires otherwise. The ordinary web path calls
  `http.request(setupOutgoing(...))`. ProxyServer.close only closes its optional
  listening `_server`; it does not destroy the shared agents.
- The same line preserves explicit Connection: close and forces close for
  transfer-encoding uploads. Therefore reuse is conditional on request framing
  and connection headers, not guaranteed for every request.
- Node 24.22.0's globalAgent also reports keepAlive=true (and timeout=5000), but
  that is not the agent this httpxy path uses.
- scriptc's server accepts HTTP/1.1 reuse. Vendor
  `packages/runtime/src/scr_http.c:37-42,2739-2766` documents/implements idle
  timeout plus buffer. The installed compiler is independently exercised by
  the parity test: two requests reuse one socket and advertise timeout=60.

The low-risk tuning implemented is server.keepAliveTimeout=60000 rather than
5000, allowing reuse across longer idle gaps. It does not improve an already
busy reused connection. Idle shutdown is verified. No new agent or monkeypatch
is needed. Next's httpAgentOptions populates different global agents
(`dist/server/setup-http-agent-env.js:22-24`); it cannot tune httpxy's private
pool through this code path.

Routing remains in Next. Headers, redirects, middleware/proxy.ts and beforeFiles
run in order before filesystem matching; afterFiles retains static filesystem
precedence (`dist/server/lib/router-utils/resolve-routes.js:49-83`). BasePath and
locale matching are applied to custom routes; external destinations do not
inherit a basePath (`dist/lib/load-custom-routes.js:325-356`). Moving all native
routes ahead of this machinery, enabling minimalMode, or replacing the public
router would change semantics. Dynamic routes stay in afterFiles so static
siblings still win. Those config combinations have source evidence here, not
new runtime coverage for every basePath/i18n/proxy.ts combination.

The realistic-route integration test exposed a separate build-time rewrite bug:
source pattern `/api/feed\\.xml` was also used as the external destination,
whose backslash became a path separator during URL parsing. Next parses the URL
before compiling its path (`dist/shared/lib/router/utils/prepare-destination.js:140-149,185-206`).
`routeRewrite` now builds source patterns and URL-encoded destination segments
separately. Unit tests exercise Next's actual destination parser with seven
literal punctuation cases; E2E now includes the real `/api/feed.xml`. Dynamic
parameter templates and rewrite phases stay unchanged.

Further safe opportunities are native/request allocation improvements or an
upstream Next/httpxy integration that reuses ProxyServer machinery while keeping
all routing phases. The public adapter hooks used here do not expose in-process
native dispatch or httpxy agent configuration. Avoiding Next's routing cannot be
claimed as a safe local optimization. Platform dispatch to separate native
functions would remove this local self-hosting hop; that is an architectural
inference, not a measured capability of this adapter.

Next's own [route.go prototype, vercel/next.js#100130](https://github.com/vercel/next.js/pull/100130)
explicitly keeps routing, rewrites and proxy.ts in Node for next start and uses
supervised private loopback workers. Its deployment adapter outputs an
independent APP_ROUTE per handler. This is a fact from that draft PR, not proof
this package implements its deployment integration.

The independent [hop measurement](test/hop.mjs) makes 40 warmup and 600 timed
keep-alive GETs for each case, sequentially and at concurrency 16. It checks
identical hello body bytes, alternates native proxy/direct targets, and starts
and stops its own servers without rebuilding. Node 24.22.0 on macOS arm64;
no CPU affinity, shared loaded machine (load average about 14.7 shortly after
this run). These short samples are **indicative**, not publishable benchmarks.
Raw samples and three socket snapshots: [hop-results.json](test/hop-results.json).

Mean response times (milliseconds), with achieved requests/second:

- Node `next start`: c1 **1.464 ms / 683 rps**; c16 **8.468 ms / 1,864 rps**.
- Native through Next: c1 **1.425 ms / 702 rps**; c16 **3.181 ms / 4,993 rps**.
- Native direct: c1 **0.291 ms / 3,433 rps**; c16 **0.977 ms / 16,176 rps**.

The native-through minus native-direct mean is about **1.13 ms** sequentially
and **2.20 ms** at c16 (including queuing). This measures the complete topology
and routing difference, not only TCP or the ProxyServer constructor. It is not
a percentile of paired hop samples. Warmup is short and execution order plus
shared-machine scheduling can bias the Node/native comparison.

Both manifests mark `/api/hello` STATIC. Node's baseline measures Next's cached
route delivery; the native rewrite recomputes the trivial JSON response. Thus
the Node comparison is the requested same-path application comparison, not a
compiler-only speedup or identical framework-cache execution. This adapter does
not yet reproduce Next's route caching.

Actual socket reuse was also observed through Next: after each of three complete
frontend requests, lsof reported the same native PID 93012 fd 7 and Next PID 93028
fd 22, connected at `127.0.0.1:54667 ↔ 127.0.0.1:29997`. All three snapshots are
identical in the raw result. Both processes are stopped; all manifest ports plus
3427 were bind-checked free after the run.

## Verification

Commands used Node 24.22.0 on PATH, with SCRIPTC_CHECKER_SERVER=0 for final native
checks to avoid leaving compiler checker daemons. Native builds ran sequentially.
The adapter sources and both build directories stayed unchanged throughout the
benchmark agent's final successful quick profile.

```text
node packages/next-scriptc/shim/test/parity.mjs
Compared 51 requests: identical status, statusText, headers (except date/runtime marker), and body.
pass 1, fail 0 (9.4 s)
Streaming: Node first 0.9 ms / end 222.5 ms; native first 0.6 ms / end 222.0 ms

node --test packages/next-scriptc/test/routes.mjs
Compiled all six route extensions and named function/variable/alias/re-exports;
native-only next/server and inherited aliases; unsupported middleware helper rejected.
pass 2, fail 0 (12.7 s)
Also compiled named dynamic params under the demo's actual Node typings and
rejected the forbidden formData call at type checking.

pnpm --filter demo exec tsc --noEmit --incremental false
exit 0, no diagnostics

node examples/demo/test/e2e.mjs
E2E passed: 6 curl responses and report results (threads 1, 4, 1) byte-equal;
native/static precedence, wrapper SIGTERM cleanup, native crash,
native/Next EADDRINUSE, and direct-next-start guard.
```

HTTP parity compares body bytes, status/statusText, and header values, preserving
separate Set-Cookie strings and their order. It excludes Date and the intentional
runtime marker; it does not claim identical raw HTTP header insertion order.
The streaming timing/cancellation and connection reuse assertions are additional
to the 51 full-response comparisons. The E2E runner adds the literal RSS path as a regression case.

The coordinated benchmark agent reports its separate final quick suite complete:
127.13 s, 112 observations, all response hashes, 18 thread totals, source/artifact
snapshots, and process cleanup passing. Its results are outside this task's
owned files and were not modified here. Its recorded cohort precedes the final
literal-destination fix; the independent hop sample above uses the final native
build X1XikaCNiIpyQh8dV1IhX and Node baseline VG1I3a8hFQzjoRO4uwzR9.

Additional integration verification, using the other agent's test unchanged:

```text
ROUTES_PORT=3437 node examples/demo/test/routes.mjs --skip-build
Node dev: 31 response cases passed.
Native: 31 responses byte-equal (status, content/cache/security/auth headers and body);
x-next-scriptc: native verified.
Cleanup passed: all 10 native processes exited; HTTP port 3437 and all native ports are free.
```

This covers bcrypt login, malformed JSON and auth failures, JWT verification,
search, named markdown route params, and RSS through the actual Next proxy.
Scratch compiler outputs/logs were removed. Final bind checks cover 3417, 3427,
3437, and all ten native manifest ports; no owned servers or compiler daemons
remain.

## Exact new compiler refusals / handoff appendix

`research/scriptc-refusals.md` is outside this task's owned files, so it was not
edited. The parent can append this section there. The vendor checkout was not
modified. Diagnostics below retain the exact diagnostic text (absolute source
paths and code frames omitted).

1. Web subclassing:

```text
error SC1090: extending classes not declared in the program ('Request') is not supported yet
error SC1090: extending classes not declared in the program ('Response') is not supported yet
```

Resolution: composition, not subclassing or a Node fallback.

2. DOM-only body type alias:

```text
error SC0001: Cannot find name 'BodyInit'.
```

Resolution: spell the supported string/byte/ReadableStream/null input union.

3. Optional record/capture formulations in cookie code:

```text
error SC1090: reading 'name' from a value of type '{ name: string; }' is not supported yet
error SC1090: a logical or conditional receiver containing a runtime-optional capture is not supported yet
```

The first occurred for `key?.name` on an optional string-or-record parameter.
The second occurred on a conditional Date receiver and on a conditional string
receiver inside the initial-cookie loop. Resolution: explicit undefined/type
branches and named intermediate strings.

4. Older app Node declarations versus scriptc's fallback declarations:

```text
error SC0001: Property 'isReloadNavigation' does not exist on type 'Request'.
error SC0001: Property 'isHistoryNavigation' does not exist on type 'Request'.
error SC0001: Property 'bytes' does not exist on type 'Request'.
error SC0001: Property 'bytes' does not exist on type 'Response'.
```

Resolution: unavailable navigation fields are declared never, and bytes() uses
`new Uint8Array(await arrayBuffer())`. No cast to an invented Request shape.
Wider Node declarations also required structural compatibility for blob/formData:

```text
error SC0001: Type '(_request: Request, context: { params: Promise<Record<string, string | string[]>>; }) => Promise<Response>' is not assignable to type 'RouteHandler'.
  Types of parameters '_request' and 'request' are incompatible.
    Type 'NextRequest' is missing the following properties from type 'Request': blob, formData
```

Resolution: declare unsupported methods never, so their calls fail preflight.

5. A structural response record instead of the Response/NextResponse union
compiled without warnings, but the first ordinary JSON response returned 500.
Native stderr was exactly:

```text
[TypeError: expected object at $, got Response]
```

Resolution: keep the working union and report its SC6104 checked-dynamic cost.
A mapped `Pick<Response,...>` also emitted SC6104 rather than providing a static
record. Neither attempted formulation remains in the implementation.

6. Named route context versus the original broad callback signature:

```text
error SC0001: Type '(_request: Request, context: { params: Promise<{ slug: string; }>; }) => Promise<Response>' is not assignable to type 'RouteHandler'.
  Types of parameters 'context' and 'context' are incompatible.
    Type 'RouteContext' is not assignable to type '{ params: Promise<{ slug: string; }>; }'.
      Types of property 'params' are incompatible.
        Type 'Promise<Record<string, string | string[]>>' is not assignable to type 'Promise<{ slug: string; }>'.
          Property 'slug' is missing in type 'Record<string, string | string[]>' but required in type '{ slug: string; }'.
```

Resolution: a method signature accepts each handler's narrowed context. Runtime
pattern matching constructs those named params. Both the compile test and real
posts handler now pass.
