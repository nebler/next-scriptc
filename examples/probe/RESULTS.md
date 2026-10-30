# Route handler probe results

Measured 2026-10-30 on macOS arm64, scriptc **0.4.6**, Node **24.22.0**,
Next **16.4.3**, zod **4.6.7**, and `@types/node` **24.19.2**.
The compiler is the installed workspace dependency, not the vendor checkout.
All builds used default release optimization and ran sequentially.

**Seven of eight handlers compile and match Node for the exercised requests.**
`next/server` is the sole failing route. A small local shim unlocks that route.
No native execution crashed or produced a parity mismatch.

| Route | Coverage | Compiles? | Output matches Node? | First refusal diagnostic |
| --- | --- | --- | --- | --- |
| `query` | 24/24, 100% | Yes | Yes | — |
| `zod` | 4505/4512, 99%; 9 deferred sites | Yes | Yes | — |
| `headers` | 27/27, 100% | Yes | Yes | — |
| `next-server` | Coverage exits 1 without a report | No | N/A | `error SC3004: undefined is not representable in the target union (a value narrowed or asserted past it still held it)` |
| `fetch` | 24/24, 100% | Yes | Yes | — |
| `crypto` | 19/19, 100% | Yes | Yes | — |
| `cpu` | 24/24, 100% | Yes | Yes | — |
| `stream` | 25/25, 100% | Yes | Yes | — |

Machine-readable results: [.artifacts/summary.json](./.artifacts/summary.json).
Coverage counts include entry/printing code and any dependency statements the
compiler includes; they are not percentages of the Next.js API surface.
Several entries have native dynamic-tier statements despite the compiler's
“fully static” summary; see [coverage's dynamic-tier definition](../../vendor/scriptc/docs/content/docs/coverage.mdx).

The entries cover 15 request cases: query filtering/invalid limits; valid,
invalid, and malformed zod JSON; present/absent cookie and language headers;
Next preview/cookie reads; successful loopback fetch/missing upstream config;
SHA-256 and UUID v4; a generated 2,500-row filter/sort/reduction plus invalid
input; and NDJSON streaming plus unsupported format. The 14 cases belonging to
compiled baseline routes all passed. Node's real Next implementation also
successfully answers the fifteenth case.

## `next/server`: exact refusal and cause

[The route](./routes/next-server/route.ts) imports the actual `NextRequest` and
`NextResponse`, reads `request.nextUrl` and `request.cookies`, and calls
`NextResponse.json`. Build stderr is exactly:

```text
/Users/noah/code/next-scriptc/examples/probe/entries/next-server.ts:1:1 - error SC3004: undefined is not representable in the target union (a value narrowed or asserted past it still held it)

1 error.
```

Coverage stderr is exactly:

```text
scriptc: undefined is not representable in the target union (a value narrowed or asserted past it still held it)
```

Both commands exit **1**; neither receives a signal. Logs:
[build.stderr](./.artifacts/next-server/build.stderr),
[coverage.stderr](./.artifacts/next-server/coverage.stderr).

This is a compiler failure with poor source attribution, rather than a useful
unsupported-Next-API diagnostic. The local registry defines `SC3004` as
**“native helper code-generation failure”**:
[diagnostic codes](../../vendor/scriptc/packages/compiler/src/diagnostics/codes.ts),
[the catch-all failure conversion](../../vendor/scriptc/packages/compiler/src/native/compiler.ts).
The message also appears as the compiler's deferred undefined-field read trap:
[property-access.ts, `DEFERRED_READ_MESSAGE`](../../vendor/scriptc/packages/compiler/src/frontend/lowering/expressions/property-access.ts).
These identify the failure class, but do **not** identify the offending field
inside Next or prove the underlying implementation cause.

Related documented constraints are [union representations](../../vendor/scriptc/docs/content/limitations/types-and-class-definitions/unions.mdx)
and [checked casts/null assertions](../../vendor/scriptc/docs/content/limitations/runtime-type-checks.mdx).
Neither documents this Next import failing at build time. Do not describe this
as a normal, precisely diagnosed unsupported user assertion: the route has no
such assertion. [Package support is partial](../../vendor/scriptc/docs/content/docs/dependencies.mdx),
and installing the package is not enough to establish it compiles.

A four-line repro is [repros/next-request.ts](./repros/next-request.ts).
The runner's `next-request` case reproduces the same SC3004 failure; Node prints
`200`. A direct build of the four-line repro also reproduces it:

```sh
SCRIPTC_CHECKER_SERVER=0 SCRIPTC_CACHE_DIR="$PWD/examples/probe/.artifacts/cache" \
  packages/next-scriptc/node_modules/.bin/scriptc build \
  examples/probe/repros/next-request.ts \
  -o examples/probe/.artifacts/next-request/reduced --no-keep-llvm
```

This is worth an upstream compiler issue. No upstream issue was filed.

## Reduced JSON-only import: separate declaration failures

[repros/next-import.ts](./repros/next-import.ts) contains only an import and
`console.log(NextResponse.json({ ok: true }).status)`. Its build fails with
**1,005 errors**. The exact first diagnostic is:

```text
/Users/noah/code/next-scriptc/node_modules/.pnpm/@scriptc+cli-darwin-arm64@0.4.6/node_modules/@scriptc/cli-darwin-arm64/dist/lib/declarations/node-fallback/assert-strict.d.ts:1:1 - error SC0001: Duplicate identifier 'strict'.
```

The full diagnostics are retained verbatim:
[next-import/build.stderr](./.artifacts/next-import/build.stderr).
They include duplicate `assert`, `AsyncLocalStorage`, Buffer, and crypto
declarations, and missing browser globals such as `PopStateEvent` in Next's
transitive declarations. The reduced [.js-spelled import](./repros/next-import-js.ts)
also fails with the same first diagnostic and count:
[next-import-js/build.stderr](./.artifacts/next-import-js/build.stderr).
Node prints `200` for both.

This exposes an integration problem between scriptc's bundled Node fallback
ambient declarations and Next's declaration graph. It does not establish a
runtime failure in `NextResponse.json` itself. `SC0001` is the compiler's
TypeScript-preflight error category; see the [diagnostic registry](../../vendor/scriptc/packages/compiler/src/diagnostics/diagnostic.ts)
and [documented type-checking environment](../../vendor/scriptc/docs/content/limitations/type-checking.mdx).
The latter uses `es2025` plus scriptc's own ambient declarations, so arbitrary
Next/browser declaration surfaces need not typecheck as they do in a Next app.

A direct `@types/node@24.19.2` dev dependency did not fix these failures. Before
adding it, the first error was `Namespace 'assert' has no exported member
'AssertOptions'.`, with 1,010 total errors. Those exploratory logs remain under
`.artifacts/next-import-without-node-types/` and
`.artifacts/next-import-js-without-node-types/`. The final package pins the Node
24 typings and the table above reflects the final dependency set.

The reduced entries pass the installed TypeScript compiler under conventional
Next/bundler settings (`--module esnext --moduleResolution bundler --lib
esnext,dom --skipLibCheck --noEmit`). Treat the fallback-declaration collision
as a second upstream integration issue candidate, separate from SC3004.

## Verified workaround: 40-line shim

[rewrites/next-shim.ts](./rewrites/next-shim.ts) implements only:

- `NextResponse.json(body, init)` by delegating to Web `Response.json`.
- `NextRequest(url, init)` as a wrapper around Web `Request`.
- A `nextUrl: URL` field and cookie `get(name)` returning `{ name, value }`.

[rewrites/next-server.ts](./rewrites/next-server.ts) is the same handler with its
import changed to the local shim. [entries/next-shim.ts](./entries/next-shim.ts)
uses the shim for construction too. Coverage is **32/32, 100%**; build and
execution succeed. Its output matches both Node running the shim and Node
running the actual Next implementation for the probe request.

This demonstrates a small shim can unlock this handler. It is an explicit
subset, not a general replacement for NextRequest/NextResponse: it omits
NextURL's routing metadata, middleware features, response cookies, redirects,
rewrites, subclass identity, and general request/body forwarding. An integration
would need to redirect imports and adapt incoming Requests to this subset.
For handlers that use only JSON responses, replacing `NextResponse.json` with
Web `Response.json` is smaller still; the other seven baseline routes already
exercise that API successfully. Cookie logic can use Web `request.headers`,
as the `headers` route demonstrates.

## Zod: successful, with deferred unsupported paths

Zod validation matches Node exactly, including the full array of email,
quantity, and SKU validation issues and the malformed-JSON response. The native
build emits no stderr. Coverage reports zod as `static`, but reports nine
**deferred runtime** sites: SC2001 ×2, SC1090 ×2, SC2002 ×1, SC2004 ×2, and
SC2020 ×2. Complete messages/locations:
[zod/coverage.stdout](./.artifacts/zod/coverage.stdout).

The sites cover code-generation helpers, dynamic `instanceof`, spreading
`unknown[]` into `Math.min`, JSON-schema record shapes, and a `Map.get`
lowering. They were not reached by the exercised schema. The docs explicitly
allow [unsupported package operations to become runtime fences](../../vendor/scriptc/docs/content/docs/dependencies.mdx#unsupported-code-inside-a-package).
[Runtime code evaluation](../../vendor/scriptc/docs/content/limitations/runtime-code-evaluation.mdx)
is also a deliberate Node divergence: `Function`/`eval` throw `EvalError`;
zod 4 detects this and uses its interpreted validation path. Therefore, passing
this probe does not prove all zod features compile or behave identically.

Coverage's “Node islands (would-be, report-only)” suggestion for zod is **not**
an actual runtime Node fallback. The CLI help says this policy is report-only
in 0.4.6. The binary was executed directly, and the observed validation paths
ran successfully in it.

## Parity, bounds, and reproducibility

There are **no nonempty Node/native diffs** for compiled baseline routes or the
shim. Every native and Node program in those comparisons exits **0**, with
empty stderr. Their exact `.stdout`, `.stderr`, `.json` metadata and empty
`parity.diff` files live in the corresponding `.artifacts/<name>/` directories.
The shim-versus-real-Next diff is also retained at
[next-shim/versus-real-next.diff](./.artifacts/next-shim/versus-real-next.diff).

The comparison prints sorted response header strings and full response bodies.
It does not compare header insertion order or HTTP wire serialization. The
crypto entry validates the random request ID as a UUID v4 and substitutes
`<uuid-v4>` before printing; randomness is not claimed byte-identical. Its
SHA-256 body is compared byte-for-byte. Streaming is tested by consuming the
entire response text, not by timing chunk delivery or testing cancellation.
The fetch route performs real HTTP only against the runner-owned loopback
server, with authentication and an abort timeout; no public upstream is used.
Crypto/URL/stream support is consistent with the local
[crypto](../../vendor/scriptc/docs/content/limitations/builtin-apis/crypto.mdx),
[URL](../../vendor/scriptc/docs/content/limitations/builtin-apis/url.mdx), and
[Web streams](../../vendor/scriptc/docs/content/limitations/builtin-apis/streams-and-readline.mdx)
references. The vendor docs describe main and can be ahead of npm 0.4.6;
measurements here take precedence over broad compatibility claims.

From the workspace root:

```sh
pnpm install --filter probe
PROBE_NODE=/Users/noah/.local/share/fnm/node-versions/v24.22.0/installation/bin/node \
  node examples/probe/run.mjs
PROBE_NODE=/Users/noah/.local/share/fnm/node-versions/v24.22.0/installation/bin/node \
  node examples/probe/run.mjs --only=next-shim,next-import,next-import-js,next-request
```

Use any Node 24 executable in `PROBE_NODE` on another machine. See
[README.md](./README.md) for timeout, cleanup, exit-status, and subset behavior.
The Node reference preloads [node-resolve.mjs](./node-resolve.mjs) solely to map
`next/server` to the real installed `next/server.js`. Raw Node ESM rejects that
extensionless path with `ERR_MODULE_NOT_FOUND` and suggests `next/server.js`;
that resolution issue is separate from scriptc's build failures. The runner
only runs the reference with the resolver preload.

No dependency build scripts were blocked in the normal final `pnpm install`;
`allowBuilds` was not edited. Initial dependency linking used `--ignore-scripts`,
then normal installs completed successfully. All authored files and retained
build artifacts are inside `examples/probe/`; pnpm updated the workspace's
shared dependency installation/lockfile as part of installing this package.
No git operations or commits were performed.

## Realistic application libraries and demo handlers — 2026-10-30

The versions below were the npm registry's current published releases when
queried and are pinned exactly. Measurements use the installed scriptc 0.4.6,
Node 24.22.0, and sequential release builds. Native-only probe runs use
`--node-islands=off`; the passing application paths were also compiled together
with that flag. This tests native execution rather than an embedded Node fallback.

| Library | Version | Compiles natively? | Output matches Node? | First native-only refusal |
| --- | --- | --- | --- | --- |
| bcryptjs | 3.0.3 | Yes | Yes | — |
| jose | 6.2.14 | Yes | Yes | — |
| marked | 18.1.2 | Yes | Yes | — |
| minisearch | 7.2.0 | Yes | Yes | —; see stored-field restriction below |
| papaparse | 5.7.0 | No | Not run natively | `SC1090: the reference to 'unparse' (a binding form with no lowering) is not supported yet` |
| satori | 0.63.2 | No | Not run natively | `SC2013: cannot compile npm package 'fflate' statically: its createRequire import is used outside a supported call based on the current file` |

Every Node reference exits 0. The four successful library comparisons have
identical stdout and stderr and matching zero exit status. Their successful
builds emit no stderr. Passing these exercised operations does not establish
support for every API in each package: jose coverage still lists three deferred
unsupported sites, and MiniSearch has unsupported static-method paths outside
this workload. Complete coverage reports live under `.artifacts/<case>/`.

The bcrypt probe hashes with a fixed salt at **cost 10**, then checks a correct
and an incorrect password. Its first native run exceeded the original 15-second
execution bound. A bounded 180-second run completed and matched Node exactly;
the runner now supports `PROBE_RUN_TIMEOUT_MS` for this case. The original
result is preserved in `.artifacts/bcryptjs-initial/`, and the successful rerun
in `.artifacts/bcryptjs/`. This is a correctness check on a heavily loaded
machine, not a benchmark or a claim that native bcrypt is faster. The longer
bound does not change the cost factor or remove work.

Jose signs and verifies an HS256 JWT with fixed `iat`, `exp`, issuer, audience
and subject, and rejects a modified token. Marked renders headings, tables,
task lists, fenced code, links and Unicode. MiniSearch exercises exact, prefix,
fuzzy and empty searches. Papa Parse's Node reference round-trips CSV with
commas, quotes, a newline, Unicode and formula escaping. Satori's Node reference
renders an SVG with the installed Next package's Geist font; it does not fetch
a remote font. Supporting declaration packages are also pinned:
`@types/papaparse` 5.5.2 and `@types/react` 19.3.0.

### Exact refusals and a supported search formulation

Papa Parse's native-only build reports these first two blockers at
`routes/papaparse/route.ts:6:20` and `:7:23`:

```text
error SC1090: the reference to 'unparse' (a binding form with no lowering) is not supported yet
error SC1090: the reference to 'parse' (a binding form with no lowering) is not supported yet
```

Its initial default-options build also attempted a Node-island build and hit
961 declaration errors, beginning with `error SC0001: Duplicate identifier
'strict'.` in scriptc's Node fallback `assert-strict.d.ts`. The final native-only
logs are in `.artifacts/papaparse/build.stderr`; the original first diagnostic
remains in the initial library summary JSON.

Satori's final native-only refusal comes from `satori/dist/index.js:5:46174`:

```text
error SC2013: cannot compile npm package 'fflate' statically: its createRequire import is used outside a supported call based on the current file
```

An earlier default-options build produced a binary with SC8023/SC8001 warnings,
but native startup exited 1 before rendering:

```text
Uncaught Error: require() of the package 'camelize' in an expression (the package is not compiled into this program) is not supported yet [SC1090 at /Users/noah/code/next-scriptc/node_modules/.pnpm/css-to-react-native@3.2.0/node_modules/css-to-react-native/index.js:15]
```

Those initial logs are preserved in `.artifacts/satori-default/`. The final
probe uses `React.createElement` and matching React declarations. Neither
failure establishes a Yoga or WASM limitation: the observed first blockers
are package imports. No CSV or OG-image demo handler was added.

Reading a MiniSearch custom `storeFields` property from typed application code
also exposes an inferred-shape restriction:

```text
error SC1090: reading 'title' from a value of type '{ id: any; score: number; terms: string[]; queryTerms: any; match: any; }' is not supported yet
```

A five-line repro is [repros/minisearch-stored-fields.ts](./repros/minisearch-stored-fields.ts).
Node prints the title; the native build refuses its read at line 5, column 37.
The demo uses a normal alternative: search ranks IDs, and a typed catalog map
supplies product metadata. That formulation compiles and matches Node across
the full 3,000-product dataset. These are compile refusals/runtime fences;
no unexplained native crash or successful-program byte mismatch was found.
All new refusal diagnostics were appended to
[research/scriptc-refusals.md](../../research/scriptc-refusals.md).

### Five demo handlers

Every route starts with `"use scriptc"` and uses Web `Request`/`Response`.
The catalog is generated deterministically; the authored post fixture and
catalog source together occupy about 16 KB. There is no database or public
upstream in these workloads.

| Request | Work performed | Why it is representative |
| --- | --- | --- |
| `POST /api/login` | Verify a stored cost-10 bcrypt hash and sign an HS256 JWT | Password login with synchronous CPU work on Node's event loop |
| `GET /api/verify` | Verify signature, algorithm, issuer, audience, required claims and expiry | Authenticated API middleware-style work and low per-request overhead |
| `GET /api/search?q=desk%20lamp&limit=20` | Search a 3,000-SKU in-memory index built once per process | Small-store catalog search with ranking, prefix and fuzzy matching |
| `GET /api/posts/reliable-webhooks` | Parse an authored long Markdown guide into 11,074 bytes of HTML | An uncached blog/docs rendering request, including tables, code and Unicode |
| `GET /api/feed.xml` | Render both posts and XML-escape their HTML into an RSS feed | Full-content RSS with summary descriptions, stable links and publication dates |

The login request body is:

```json
{"email":"ada@example.com","password":"correct horse battery staple"}
```

Its JSON response contains `accessToken`, `tokenType` and `expiresIn`.
Pass that access token as `Authorization: Bearer <accessToken>` to `/api/verify`.
The committed account/hash/signing-key defaults are public demo fixtures.
`DEMO_JWT_SECRET` overrides the signing key; `DEMO_JWT_NOW=1793318400` pins the
clock for repeatable issuance and verification. Without the clock override,
these handlers use the real clock. Tests supply both overrides to both servers.
JWT fields are compared in full, including signatures, `iat` and `exp`.

Content is trusted authored Markdown. Rendering and feed generation deliberately
happen on each request with `cache-control: no-store`; this measures uncached
application work. A production site may cache either response. Search setup is
retained at startup rather than repeated inside the handler. No speed, memory
or latency numbers were collected here.

### Verification completed and integration still pending

[entries/demo-routes.ts](./entries/demo-routes.ts) imports all five final handlers
and exercises ten complete response cases: successful login; successful and bad
JWT verification; malformed login shape; exact and fuzzy catalog searches;
invalid search limit; the full long article; missing article; and RSS. It
builds and runs a native executable entirely under this probe's `.artifacts/`,
without touching `examples/demo/.next`.

```text
Node v24.22.0; scriptc 0.4.6
route | compiles? | output matches Node? | refusal / runtime diagnostic (first line)
[demo-routes] coverage, then build (sequential)
demo-routes | yes | yes |
```

Build, Node and native execution all exit **0**, with empty stderr and an empty
`parity.diff`. The comparison includes full status/header/body output, including
article HTML, RSS XML and the signed JWT. The RSS also passed an independent
XML parser check for two items, newest first, with the full HTML recovered from
XML escaping. The reduced MiniSearch repro was confirmed separately as the
expected refusal. The new HTTP test and the updated probe runner pass
`node --check`.

**The full `next dev` versus `next-scriptc start` HTTP parity run remains
pending.** It was intentionally not run because the adapter and benchmark
agents were using the shared `.next`; the integrating agent will run it after
their work is combined. No demo server or demo build was started for this work.

[../demo/test/routes.mjs](../demo/test/routes.mjs) defines 31 HTTP cases, including
invalid credentials/JSON/types, UTF-8 password length, search errors, missing
posts, malformed/wrong-key/expired/future/incorrect-issuer/incorrect-audience
JWTs and missing claims. It compares status, content type, cache/security/auth
headers and exact body bytes, verifies `x-next-scriptc: native`, and checks
owned native PIDs and ports after shutdown. Both servers are stopped in
`finally`, including on test failure or SIGINT/SIGTERM. Date and HTTP transport
framing headers are not application parity fields.

From the workspace root, after integration:

```sh
pnpm --filter demo test:routes
```

This command first builds the demo. To reuse an already-current stable build:

```sh
pnpm --filter demo test:routes --skip-build
```

Standalone reproducibility, requiring no demo build:

```sh
PROBE_NODE=/Users/noah/.local/share/fnm/node-versions/v24.22.0/installation/bin/node \
PROBE_RUN_TIMEOUT_MS=180000 \
  node examples/probe/run.mjs --only=bcryptjs,jose,marked,minisearch,papaparse,satori,demo-routes,minisearch-stored-fields
```

The reduced refusal is expected data, not a successful native workload.
Artifacts retain commands, exit codes, signals, full streams and diffs.
All probe processes and their loopback servers exited. No probe process or
listener remained at the end; unrelated agents' processes were left alone.
All source/dependency changes remain uncommitted; no commits, staging or branch
changes were made.
