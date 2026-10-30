# Route bridge

`serve(module, { pattern, port? })` accepts a typed literal with all seven keys:
GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS. Missing methods are `undefined`.
Generated entries use this contract; handlers, HEAD fallback, and Allow are
resolved at startup. PORT must be an integer from 0 to 65535 unless port is given.

Run from the workspace root:

```sh
pnpm --package=node@24 dlx node packages/next-scriptc/shim/test/parity.mjs
node --test packages/next-scriptc/test/routes.mjs
node examples/demo/test/e2e.mjs
```

Parity compiles one fixture and checks Node 24 against native status, statusText,
headers (except date/runtime marker), and body bytes, with expected-value checks.
It covers methods, URL forwarding, params, cookies, binary uploads/responses,
fetch decompression, response framing, the real Next request/response helpers,
stream delivery/cancellation, connection reuse, errors, port validation, and shutdown
with requests in flight. The E2E runner builds sequentially, curls the demo under
Next dev and plain `next start`, checks static/dynamic precedence, and verifies
server-only SIGTERM/SIGKILL cleanup. Managed binaries monitor stdin EOF so
they exit even when the owning server is killed; standalone binaries do not.

The adapter writes a native-only `tsconfig.json` beside generated entries. It
extends the app's config, preserves its absolute path aliases, and maps exactly
`next/server` to [next-server.ts](./next-server.ts). The app config and Node/dev
module resolution are unchanged. There is no import rewriting or bundle step.

The supported route-handler subset is `NextResponse.json`, `redirect` (default
307), construction, response cookies `set`/`delete`, and `NextRequest.nextUrl`
(Web URL fields, including pathname/searchParams), request cookies
`get`/`getAll`/`has`, headers and the supported Web request body readers. Request
URL/cookie objects are lazy; cookies snapshot the incoming header before handlers
can mutate headers. Cookie output follows Next's encoding, default path,
attribute order, replacement-by-name, and epoch expiry on deletion.
`next` and `rewrite` are omitted: Next itself rejects them in App Router handlers.
NextURL framework metadata, middleware APIs, and extra next/server exports are
not implemented. Web subclass identity is unavailable because scriptc refuses
subclasses of Request/Response. Unavailable Web body parsers are declared
`never` to keep compatibility with the wider Node Request/Response types while
making native calls fail type checking. The Response/NextResponse union uses
scriptc's checked dynamic representation (SC6104 warnings), not a Node fallback.

Limitations:

- Uploads are buffered. Responses forward each ReadableStream chunk immediately;
  a closed single-chunk body uses one `end(bytes)` call.
  HEAD cancels its body, and a disconnected client cancels the response reader.
  scriptc 0.4.6's HTTP `write` returns void and exposes no drain event or write
  completion callback. The bridge retains one chunk at a time, but the native
  transport can queue an unbounded amount for a slow client. This is streaming
  without backpressure, not a bounded-memory guarantee.
- Loopback HTTP/1.1 connections are reusable. The shim advertises a 60-second
  keep-alive timeout (instead of the 5-second default); shutdown still closes idle
  connections. Next's httpxy owns shared keep-alive agents across proxy instances.
- Forwarded host/protocol determine the URL; Host is restored for handlers.
  Proxied queries are reserialized with URLSearchParams to match Node execution.
  Next's proxy does not enable httpxy's xfwd option. It sets x-forwarded-host but
  may omit forwarded proto/port/for that Next's own base-server supplies. An
  original remote IP missing from the proxy request cannot be recovered here.
  httpxy may also force Connection: close for chunked uploads. The bridge leaves
  transport headers intact on requests; it does not invent original client data.
- Response headers are copied like Next 16.4.3 App Router sendResponse, skipping
  only internal x-middleware-set-cookie and preserving separate Set-Cookie values.
  Handlers returning decoded fetch bodies must remove stale encoding/framing
  headers themselves, just as under Next.
- GET supplies HEAD; automatic OPTIONS is 204 with sorted Allow. Unlike Next's
  405, this bridge also includes Allow on 405.
- Pattern matching supports dynamic and catch-all segments, percent decoding,
  trailing slashes, 404 misses and 400 malformed escapes. This is a Web Request/
  Response bridge, without framework caching, full NextURL routing metadata, framework
  error handling, request AbortSignal propagation, or an upload size limit.
- This prototype supports macOS and Linux. Next extensions ts/js/tsx/jsx and
  explicitly configured mts/mjs are discovered; compiler diagnostics fail builds
  instead of falling back. JSX extensions require the project's JSX tsconfig.

Compiler diagnostics and their resolutions: [refusal log](../../../research/scriptc-refusals.md).

Design decisions, source references, measurements and limitations:
[adapter notes](../../../research/adapter-notes.md).
