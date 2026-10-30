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
