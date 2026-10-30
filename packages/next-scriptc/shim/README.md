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
fetch decompression, response framing, errors, port validation, and shutdown
with requests in flight. The E2E runner builds sequentially, curls the demo under
Next dev and native start, checks static/dynamic precedence, and verifies cleanup.

Limitations:

- Uploads and responses are buffered. scriptc 0.4.6 lacks the HTTP write callbacks
  and backpressure APIs needed for bounded streaming. HEAD cancels its body.
- Forwarded host/protocol determine the URL; Host is restored for handlers.
  Proxied queries are reserialized with URLSearchParams to match Node execution.
  Next's proxy does not enable httpxy's xfwd option. It sets x-forwarded-host but
  may omit forwarded proto/port/for that Next's own base-server supplies. An
  original remote IP missing from the proxy request cannot be recovered here.
  httpxy may also force Connection: close for chunked uploads. The bridge leaves
  transport headers intact on requests; it does not invent original client data.
- Response framing and hop-by-hop headers are stripped. Encoding is stripped
  from fetch responses decoded by the runtime; constructed encoded Responses
  retain it. This deliberately fixes stale upstream framing, whereas Next 16.4.3
  App Router sendResponse copies these headers directly (its IPC/action paths
  have separate filters). A reconstructed Response loses fetch's URL metadata;
  handlers reconstructing a decoded fetch response must remove stale encoding.
- GET supplies HEAD; automatic OPTIONS is 204 with sorted Allow. Unlike Next's
  405, this bridge also includes Allow on 405.
- Pattern matching supports dynamic and catch-all segments, percent decoding,
  trailing slashes, 404 misses and 400 malformed escapes. This is a Web Request/
  Response bridge, without NextRequest/NextResponse helpers, caching, framework
  error handling, request AbortSignal propagation, or an upload size limit.
- This prototype supports macOS and Linux. Next extensions ts/js/tsx/jsx and
  explicitly configured mts/mjs are discovered; compiler diagnostics fail builds
  instead of falling back. JSX extensions require the project's JSX tsconfig.

Compiler diagnostics and their resolutions: [refusal log](../../../research/scriptc-refusals.md).
