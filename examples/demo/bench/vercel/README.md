# Vercel preview benchmark

Run from the repository root with Node 24, pnpm 11.1.3 and Vercel CLI 65.8.0. The fixed protocol is pre-registered in `research/benchmarks.md`. No packages/next-scriptc source changes, project setting changes or new measured-route instrumentation are needed.

## Prepare and deploy the Node baseline

```sh
pnpm install --frozen-lockfile
mkdir -p .vercel
cp /Users/noah/code/next-scriptc/.vercel/project.json .vercel/project.json
cp /Users/noah/code/next-scriptc/.env.local .env.local
vercel project inspect --non-interactive
vercel pull --yes --environment=preview
node examples/demo/bench/vercel/deploy-node.mjs
```

Select Node 24 in your shell before running the helper. `deploy-node.mjs` delegates to the same `build.mjs`/`deploy.mjs` pipeline as the native variant. Both enable Vercel's bundled Next adapter (`NEXT_ENABLE_ADAPTER=1`), build from `examples/demo` with outputDirectory=.next, and stage the completed Build Output tree at the repository root so monorepo-relative `filePathMap` entries resolve during upload. The ignored demo project link overrides framework=nextjs and Node=24.x locally. Hosted settings are unchanged. The old root legacy `builds` configuration is removed.

Both variants pin x86_64, iad1, 2048 MiB and 300 seconds in the output. Native Node addons abort cross-architecture packaging. The hosted project defaults do not override the emitted nodejs24.x/executable runtime. Public JWT fixture values from bench/config.mjs are applied at build and runtime.

Build only, producing the repository-root `.vercel/output` for `vercel deploy --prebuilt`:

```sh
NEXT_SCRIPTC_BASELINE=node node examples/demo/bench/vercel/build.mjs
NEXT_SCRIPTC_DEMO_GROUPS=vercel node examples/demo/bench/vercel/build.mjs
```

Build and deploy a native preview:

```sh
NEXT_SCRIPTC_DEMO_GROUPS=vercel node examples/demo/bench/vercel/deploy.mjs
```

`NEXT_SCRIPTC_BASELINE=node node examples/demo/bench/vercel/deploy.mjs` deploys the baseline through that same command. All helpers are preview-only. The package-level `next-scriptc vercel-build [--prod]` remains available for another app's linked working directory; the demo helper supplies its local link and benchmark resource pins.

The current adapter pipeline bundles the baseline into two Functions: pages and all App Routes. The demo's explicit `vercel` group combines the 17 dynamic native routes (including the unmeasured memory diagnostic) into one executable Function with relative `.func` symlinks for every member and `.rsc` alias. Its two retained static App Routes and pages remain Node output. The native deployment therefore has three Functions. Shared native routes share a cold start, initialized module state, resources and failure domain; they have no process isolation. This mirrors Node's shared dynamic-route Function. See [integration evidence](../../../../research/vercel-integration.md) for exact path lists and hosted checks.

**First-ever deployment trap:** on 2026-10-31 CLI `vercel deploy --prebuilt --environment preview` created a production-target deployment because this project had never been deployed. It assigned the default aliases despite the explicit preview argument. That deployment was deleted without benchmark traffic; a second deployment was verified as preview. The helper now refuses a project with no deployment history and rejects a returned production target. No `--prod` command was run. This is a platform default to check before using this procedure on another empty project.

Keep `.vercel/node-deployment.json` for provenance. Each helper invocation creates a new deployment (`--force`), never an alias-only reuse. The helper leaves the preview unrequested for the client-first measurements; do **not** use `--verify`, visit it or curl it before a fresh run. A fresh URL alone cannot prove that Vercel did not prewarm an instance.

## Protected access

Use the existing project automation bypass if present. A benchmark bypass was created with the documented `PATCH /v1/projects/{idOrName}/protection-bypass` API (`generate.note`); the returned secret was parsed in memory and appended only to ignored root `.env.local` as `VERCEL_AUTOMATION_BYPASS_SECRET`. Do not print the API response: protectionBypass object keys are secrets. To create another bypass use the Vercel dashboard's Protection Bypass for Automation settings and save it directly in `.env.local`; never put it in command arguments, URLs, report metadata or chat. This bypass applies to all deployments of the project until revoked. Deployment protection stays enabled.

After the first measurement, quick checks can use authenticated CLI access:

```sh
vercel curl https://next-scriptc-gtoab62jg-noahs-projects-8a075d15.vercel.app/api/hello
```

The client negotiates gzip only for gzip-export (identity elsewhere); Vercel removes the gzip content-encoding when identity is requested. Header and decompressed-body parity remain required on both variants.

The benchmark sends `x-vercel-protection-bypass` on every HTTPS request. Only that secret is forwarded to the Sandbox command environment. The local OIDC token authenticates Sandbox provisioning and is not uploaded. If it expires, preserve the bypass entry, run `vercel env pull .env.local --yes`, restore the bypass entry privately, and remove only duplicate `.gitignore` entries the CLI appended (do not discard unrelated edits).

## Measure

```sh
node --env-file=.env.local examples/demo/bench/vercel/run.mjs \
  --node https://next-scriptc-gtoab62jg-noahs-projects-8a075d15.vercel.app

node --env-file=.env.local examples/demo/bench/vercel/run.mjs \
  --node https://FRESH-NODE-DEPLOYMENT.vercel.app \
  --native https://FRESH-NATIVE-DEPLOYMENT.vercel.app --fresh
```

`--fresh` is an operator assertion that **both** deployment URLs have not received application requests. Omit it for existing deployments; those first-response rows explicitly say cold state unknown. Use immutable URLs, matching deployment resources/region/fixtures and a new preview per variant for fresh repetitions (at most five per variant). No automatic deploy loop or idle-eviction claim is implemented. Run one command per paired experiment; do not combine separate baseline/native datasets into a synthetic paired run. Node's response hashes are the native parity reference in that same invocation. Variant order defaults to Node then native; `--native-first` reverses it. Cold-pair repetitions alternate measurement order explicitly.

The runner uploads six client/registry files (with a combined SHA-256), no archive or dependencies. It creates a 2-vCPU Node 24 Sandbox in iad1, 4-minute lifetime, 3-minute worker deadline, and stops it in finally. Reports are written even on failure. The Node 24 image working directory is `/vercel`; uploads/downloads use relative paths rather than assuming `/vercel/sandbox`. `--output research/benchmarks/vercel-my-run` overrides the timestamped destination. Protocol revision 2 issues at most 12,726 workload requests plus two diagnostic requests per variant including warmup, before failures. The worker writes issued counts and reports all six rows including errors; stopped/failed windows never become successful throughput. Remember previous runs when enforcing the current task budget of 40k invocations, 12 deployments (at most five fresh per variant), and 0.4 vCPU-h. Sandbox provisioned vCPU-h is a conservative wall-time upper bound; platform activeCpuDurationMs is retained separately when supplied.

Regenerate Markdown mechanically:

```sh
node examples/demo/bench/vercel/report.mjs research/benchmarks/vercel-TIMESTAMP.json
```

## Server evidence and memory

[Runtime Logs](https://vercel.com/docs/logs/runtime) documents Function metadata for start type, duration and memory. [Fluid compute](https://vercel.com/docs/fluid-compute) reuses instances and concurrent capacity; no guaranteed idle eviction deadline or cold-start response header is documented. x-vercel-id is region/request correlation and server-timing is retained if present. Neither independently proves a cold process. C=16 may scale additional instances even after warmup.

Query the **exact deployment** after a run, within Hobby log retention:

```sh
vercel logs --deployment https://DEPLOYMENT.vercel.app --since 30m --limit 100 --json
vercel logs requests --deployment https://DEPLOYMENT.vercel.app --since 30m --limit 20 --json
vercel inspect https://DEPLOYMENT.vercel.app --json
```

The CLI and public runtime-log schema may omit memory/start type/duration; the dashboard Logs → selected request → Function metadata or Observability is the honest platform source if available. Correlate with recorded first-response x-vercel-id and timestamps, retain export/provenance and units, and distinguish peak memory from RSS. Function allocation from inspect (2048 MiB here) is **not** used memory. Do not infer cold from latency, fill unavailable memory with the limit, or put process.memoryUsage() in the measured hot path. The `/api/diagnostics/memory` route is excluded from the workload registry. The runner refuses a deployment unless control-plane mappings show this route and hello in the same Function. Responses report process RSS, Linux VmRSS/VmHWM, PID and a module instance token. Samples after first hello and after the full load window may reach different instances. Native RSS excludes the Go proxy; Node RSS excludes platform processes. Neither is whole-instance memory. The Linux artifact check verifies the RSS API against internal and external procfs reads and captures the real IPC handshake.

## Separate cold, tail and idle experiments

```sh
# Both URLs must be untouched; never open/curl them first.
node --env-file=.env.local examples/demo/bench/vercel/run.mjs --node "$NODE_URL" --native "$NATIVE_URL" --fresh --mode cold
# Native first, hello first; Node runs a small verify window before hello.
node --env-file=.env.local examples/demo/bench/vercel/run.mjs --node "$NODE_URL" --native "$NATIVE_URL" --native-first --mode tail
# After a recorded >=5-minute gap without operator traffic; this does not certify eviction.
node --env-file=.env.local examples/demo/bench/vercel/run.mjs --node "$NODE_URL" --native "$NATIVE_URL" --mode idle
# Run immediately after a grouped native build, before another build replaces output.
node --env-file=.env.local examples/demo/bench/vercel/check-memory.mjs
```

Revision 2 replaces the old 32-request C=16 warmup with 2 seconds / 1,000 requests, stopping at the first limit, followed by 3 seconds / 900 measured requests on that pool. The lower measurement cap reserves the invocation budget for diagnosis. All caps, actual durations and warmup statistics are retained; a cap can shorten either window. C=1 remains 20 + 200. All six workloads remain, including the native Markdown loss. See the explicit revision and subsequent failure-retention amendment in `research/benchmarks.md`; earlier reports are not rewritten.

Cold-only mode collects hello first, memory, verify/revenue route-first, then 20 + 40 warm hello requests (64 requests per deployment). Only hello is deployment-first; the diagnostic and other routes may initialize modules in the shared Function. Idle mode collects hello, memory, then the same warm baseline (62 requests per deployment). Tail mode targets original warmup versus longer warmup/windows, retains per-request dispatch offsets/durations/request IDs, and stops on failure. Failed windows preserve available drained partial measurements and invalidate throughput. The first failed diagnostic predates that retention improvement and preserves its issued count/error but lacks partial timings. A native-only repeat is a separately retained experiment, not a replacement or a stitched paired result.

Run `node --test examples/demo/bench/vercel/test.mjs` for budget enforcement, failure draining/retention, parity invalidation and memory-probe failure preservation. Failed memory probes mark the full run failed while preserving its workload rows and request count.
