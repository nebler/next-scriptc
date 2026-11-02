# Local Worker binding proxy

2026-11-02. A plain Node process can call a Worker's local KV binding through a small authenticated HTTP shim. The final run measured median complete round trips of **0.57 ms for 64-byte gets and 0.95 ms for puts**, rounded below from the raw results. This is a local feasibility result, not a hosted latency or cost result. Prefer per-binding operations and keep I/O outside the promoted synchronous core.

## Supported hosted transport already exists

Containers do not acquire JavaScript `env` objects directly. Current Cloudflare documentation nevertheless supports binding access through `outboundByHost` handlers: container HTTP requests to a virtual hostname run Worker code with its bindings. The supported transport can replace a public callback endpoint. The [Workers connections guide](https://developers.cloudflare.com/containers/configuration/workers-connections/) and [outbound traffic guide](https://developers.cloudflare.com/containers/configuration/outbound-traffic/) describe this arrangement. The [March 26, 2026 changelog](https://developers.cloudflare.com/changelog/post/2026-03-26-outbound-workers/) introduced it for containers package 0.2.0 or later. This is documentation research only; no Cloudflare account API was called.

The local experiment uses Miniflare's Node API, which the task explicitly permits. Wrangler was not invoked. It does not emulate container placement or Cloudflare outbound interception. The Node child is a stand-in for container code, without Docker.

## Prototype and reproduction

The [prototype](prototypes/binding-proxy/run.mjs) starts one Miniflare/workerd instance bound to an ephemeral loopback port, with ephemeral local KV and a random per-run bearer token. It launches a separate plain Node child and waits for completion. `finally` disposes Miniflare. No token is written into the result files. The [Worker](prototypes/binding-proxy/worker.mjs) allows only `get`, `put`, and a benchmark-only `ping`. KV keys must start with `bench:`. [The client](prototypes/binding-proxy/client.mjs) exposes `env.KV.get(key)` and `env.KV.put(key, string)` as promises and sends JSON to `/rpc`.

From `research/prototypes/binding-proxy`, run `npm install --no-audit --no-fund`, then `npm run bench`. The private package pins Miniflare 4.20260730.0. This experiment installed dependencies in `/tmp/nsc-co2-tools`, used temporary node_modules symlinks, and removed those afterward. No dependencies are vendored. `OUTPUT=results-repeat.json npm run bench` chooses another output file; `SAMPLES` changes the sample count. The default output is overwritten on a rerun.

Only text values are supported, up to 65,536 JavaScript code units. The benchmark uses ASCII, so payload bytes equal code units. This is not a complete KV API: no options, TTL, metadata, list, delete, binary, or stream values. Successful put maps to the local binding's completed promise; the proxy adds no retry. Non-2xx responses throw on the client, with a ten-second timeout. Error payloads are intentionally coarse.

## Measured round trips

Apple M4 Pro, macOS arm64, Node v26.13.0, Miniflare 4.20260730.0, workerd 1.20260730.1. Each cell has 30 untimed warmups followed by 300 sequential samples at concurrency one. Timing includes fetch, JSON serialization, HTTP, workerd dispatch, local KV operation, response parsing and client receipt. Bodies are consumed completely and connections can be reused. Storage is local and ephemeral. Repeated writes use the same key and value; this does not reproduce hosted per-key write limits.

Three fresh-instance runs are retained. The first two used the initial envelope validation. The final run adds rejection of null and array envelopes, checks null explicitly, and sets `cf: false` to disable Miniflare metadata prefetch. Functional checks cover bad authentication, unsupported operations, key scope, oversize value rejection, missing-key null, Unicode and exact readback at all payload sizes. All passed. No benchmark or census process overlapped the final run.

| Operation | Payload | Final p50, ms | Final p95, ms | Final mean, ms | First p50, ms | Second p50, ms |
|---|---:|---:|---:|---:|---:|---:|
| ping | 0 | 0.438 | 0.743 | 0.486 | 0.465 | 0.467 |
| get | 64 | 0.570 | 0.891 | 0.627 | 0.583 | 0.611 |
| put | 64 | 0.949 | 1.383 | 1.020 | 0.992 | 0.985 |
| get | 4,096 | 0.545 | 0.643 | 0.583 | 0.569 | 0.621 |
| put | 4,096 | 0.851 | 1.061 | 0.934 | 0.897 | 0.980 |
| get | 65,536 | 0.815 | 0.966 | 0.870 | 0.815 | 0.881 |
| put | 65,536 | 1.315 | 1.785 | 1.446 | 1.350 | 1.363 |

Raw sample arrays and environment metadata are in [first run](prototypes/binding-proxy/results.json), [repeat](prototypes/binding-proxy/results-repeat.json), and [final code](prototypes/binding-proxy/results-final.json). These are elapsed wall times, not CPU. The ping measures the authenticated transport/envelope path without KV. Get and put numbers are complete per-call costs including local KV, not an isolated transport surcharge. There is no direct-binding baseline subtraction, confidence interval, hosted measurement, cold-start test, network impairment test, or concurrent-load test. Do not subtract independent medians to claim a causal proxy penalty.

## Semantics that an HTTP proxy does not preserve automatically

| Binding or behavior | Required shim and remaining gap |
|---|---|
| KV consistency | Forward operations to the owning binding and retain its eventual consistency. Local immediate readback does not prove production read-after-write. [KV documentation](https://developers.cloudflare.com/kv/concepts/how-kv-works/) says changes elsewhere can take 60 seconds or more. A proxy cannot make increment-by-get-put atomic. Preserve missing null versus empty text. |
| KV options and errors | Encode cacheTtl, expiration, metadata and requested result type explicitly. Preserve error categories and enforce binding limits in the Worker. Retries after an ambiguous put timeout need an application policy; reads and writes are not interchangeable. |
| Streaming bodies | JSON buffers the whole request and response and cannot convey a live stream or backpressure. Use dedicated binary HTTP endpoints, stream bodies, propagate cancellation and deadlines, and define partial failure. The prototype caps after `request.text()` has buffered the body, so it is not a hardened ingress memory limit. |
| R2 objects | [R2 get](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) returns metadata plus a body stream, or a metadata-only result on some failed conditions. Define headers/envelopes for etag, version, range, HTTP/custom metadata and conditional outcomes. Stream bytes separately; methods, Dates, prototypes and multipart upload state cannot be JSON-copied. Preserve conditional writes instead of implementing read/check/write on the client. |
| D1 | Forward a statement descriptor and bound parameters, then reconstruct on the Worker. D1 prepared statements are binding objects, not transferable JSON. Submit an entire [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/) in one RPC so its rollback behavior remains in D1. A sequence of separate HTTP calls is not a transaction. Sessions need bookmarks and explicit causal sequencing. Arbitrary SQL access is a much broader permission than a route-specific operation. |
| Durable Objects | Pass an allowlisted object identity and application method descriptor. Keep real stubs inside the Worker. [DO stubs](https://developers.cloudflare.com/durable-objects/api/stub/) provide E-order on a stub and special failure semantics. Independent concurrent HTTP callbacks do not inherit that ordering. Generic stub leases introduce state, eviction and invalidation problems. Prefer one application operation on the DO. |
| Worker context | Request metadata, service bindings, caches, waitUntil, WebSockets and cancellation need separate contracts. Callback work runs in its callback's context; it is not the original route request context. A sync promoted function cannot await binding calls; obtain inputs first and compute afterward. |

These gaps are assessed from the APIs and architecture. Only the text-KV subset was implemented or measured. R2, D1, DO, streaming, and replay behavior have no local test result here.

## Authentication and isolation

The local token is generated in the parent and passed through process environment, never committed or printed. Loopback binding limits exposure, but the bearer protocol lacks replay prevention and uses a plain string comparison. It is adequate for this controlled experiment, not a public production gateway.

For the supported outbound transport, trust the configured container-to-Worker association and expose only required virtual-host operations. Cloudflare documents that outbound handlers run on the same machine as the container and that the platform networking stack protects the channel. This removes the need for a public callback listener; it does not remove authorization between tenants or methods.

If using a public callback fallback, use TLS and a short-lived capability bound to the container, tenant, operation, key prefix, body digest, deadline and request ID. Apply replay protection or idempotency for state-changing calls. Bound request bytes before buffering, rate-limit callbacks, rotate capabilities, and avoid user-controlled callback URLs. Do not send account credentials into the container. A container compromised by user code must not gain every binding the Worker owns. RPC method allowlists and scoped credentials remain necessary even on a private transport.

## Verdict and estimates

Per-binding shims are realistic. A universal transparent `env` clone is a large compatibility project, especially for streams, live objects and transactions. Start with KV text, R2 object transfer, or an application-specific D1 operation only when a route needs it. Prefer the Worker to fetch input once, pass it to compute, then store the result once. That avoids a callback per record.

For planning only, if a warm-container native core takes one third of a 100 ms JS core, its compute saving is about 67 ms. Ten sequential callbacks at an assumed 1 ms each consume about 10 ms of that saving before forwarding and encoding. These are illustrative assumptions, not hosted estimates. Thousands of callbacks or a cheap object transform are a poor fit. Actual container placement, waking, billing, network latency and binding-service latency remain unmeasured.

Combine this result with the [candidate census](container-offload-candidates.md): the binding problem has a supported transport and tractable narrow shims. The scarce evidence is a real Workers app with a heavy, promotable JS numerical core. Continue a small route-level proof; defer a general binding proxy and automatic framework offload.

An initial documentation URL under `containers/platform-details/bindings/` returned an internal access error. The supported `containers/configuration/workers-connections/` page above loaded successfully. There were no prototype startup or measurement failures. Earlier runs used Miniflare's default public `https://workers.cloudflare.com/cf.json` startup fetch for Request.cf metadata. This was discovered through its generated cache and disabled for the final run with `cf: false`. The cache was removed and was not recreated. This was a public metadata request, not an account API call; no account token or login was used. Benchmark RPC and KV traffic stayed local in every run.
