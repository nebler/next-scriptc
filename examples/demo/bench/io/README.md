# Realistic Redis I/O suite

Read the prospective protocol in `research/benchmarks.md` and results in
`research/realistic-io.md`. These are demo credentials and benchmark routes,
not a production order-management or payment integration.

- GET `/api/app/orders`: HS256 cookie JWT → one LRANGE of 50 JSON orders →
  optional paid/pending filter → item counts/totals and response shaping.
- POST same path: same auth → strict nested Valibot schema (id/email/items) →
  trusted catalog prices → EVAL (LPUSH + LTRIM) → created order (201).
  IDs are correlation IDs, not create-idempotency keys.
- POST `/api/app/webhooks/payment`: timestamped raw-body HMAC-SHA256, accepts
  multiple v1 signatures for rotation, ±300 seconds → explicit event-envelope guard → one EVAL
  atomically checks event ID, updates payment ledger and stores 24-hour marker.
  This is Stripe-style verification; it does not call Stripe or fulfill orders.
- `/api/app/diagnostics/redis` and `/api/app/diagnostics/process` are separate,
  unmeasured diagnostics. No timers/counters in measured handlers.

All calls use the same plain REST fetch in both variants. The SDK compile probe
and exact startup refusal are retained. Zod 4.6.7 works in a standalone probe but refuses the real async route module (SC1016); Valibot 1.5.0 is the same fallback on both sides.
Redis env aliases: `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`, falling
back to `KV_REST_API_URL`/`KV_REST_API_TOKEN`. Missing/unreachable Redis yields
503, never fixture fallback. Public JWT clock/key fixtures match bench/config.
The dedicated Redis namespace defaults to `next-scriptc:io`; never point this
suite at production data. Seed/reset deletes only that explicit namespace.

## Local

Use Node 24, Zig 0.16.0 and a running Docker daemon with Compose. Docker images
are pinned by digest in compose.yaml. The scripts own a disposable SRH + Redis
stack on a free loopback port, stop/remove it in finally, and never use inherited
hosted Redis variables.

```sh
SCRIPTC_CHECKER_SERVER=0 node examples/demo/test/routes.mjs
node --test examples/demo/bench/vercel/io-test.mjs
node examples/demo/bench/io/local.mjs
```

Local compares normal production Next Node with the native `vercel` group.
It writes complete samples, build logs and server logs under research/benchmarks.
Use `IO_OUTPUT=...json` for a separately named experiment. Mac/SRH loopback
latency and process observations must not be presented as Vercel results.

For manual setup (no hosted commands):

```sh
docker compose -f examples/demo/bench/io/compose.yaml -p io-manual up -d --wait
UPSTASH_REDIS_REST_URL=http://127.0.0.1:8079 UPSTASH_REDIS_REST_TOKEN=local-redis-only node examples/demo/bench/io/seed.mjs --reset
docker compose -f examples/demo/bench/io/compose.yaml -p io-manual down --volumes
```

## Hosted

The orchestrator provisions the approved free Upstash database; this suite does
not provision another. Copy ignored project/environment files as documented in
bench/vercel/README.md. `vercel pull --environment=preview` must run after the
integration connects, so both builds receive Redis env vars. Never print tokens.
Compile/build Node and native from a frozen commit through the existing helper,
upload immediately, and save each `.vercel/*-deployment.json` before rebuilding.
Inspect native Function grouping (≤12 deployed Functions, shared diagnostic),
Linux musl/TLS validation and source/artifact hashes before measuring.

```sh
NEXT_SCRIPTC_BASELINE=node node examples/demo/bench/vercel/deploy.mjs
NEXT_SCRIPTC_DEMO_GROUPS=vercel node examples/demo/bench/vercel/deploy.mjs
IO_ALLOW_RESET=1 node --env-file=.env.local examples/demo/bench/vercel/io-run.mjs \
  --node https://FRESH-NODE.vercel.app --native https://FRESH-NATIVE.vercel.app \
  --mode cold --fresh --output research/benchmarks/realistic-io-pair-1
```

Do three new pairs, alternate build/request order (second uses --native-first),
`cold` for pairs 1–2, `full` for pair 3. GET orders is first on untouched previews.
`full` includes warm C=1/C=16, fixed-arrival mixed bursts, memory, separate Redis
RTT and three process-CPU windows per route. No automatic replacement windows.
Seed happens outside the Function before each variant; identical namespaces,
requests and event IDs require sequential variant measurement. A reader and
writer account keep GET data fixed while POST traffic writes a bounded list.
Raw body digests are checked against independent expected JSON, including writes.

The runner reserves pessimistic invocation/Redis/Sandbox budgets in a persistent
ledger before provisioning, retains partial results on error and stops Sandbox
in finally. Do not run concurrent controllers against the same namespace or
ledger. Its `full` four-minute lifetime plus two one-minute `cold` lifetimes
reserve 0.2 vCPU-h; remaining budget is for diagnosed control failures/validation.
Preview counting and exact-ID cleanup remain operator responsibilities: ≤10
previews total, retain accepted IDs even if inspection fails. Do not run this
without the database, even if preview deployment itself would succeed.

After measurement, run hosted parity with both URLs, explicit `IO_ALLOW_RESET=1`,
matching JWT fixtures/Redis namespace and its REST env vars loaded. It resets
between whole stateful sequences. Query logs for listener starts and record
absent Node logs as unavailable, never zero. Report every loss and unavailable
cell; keep local and hosted tables separate.
