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

Select Node 24 in your shell before running the helper. It uses the demo's ignored local `.vercel/project.json` to override framework=nextjs, Node=24.x and outputDirectory=.next-node without changing hosted settings (the hosted project stays framework=Other, root=.). It builds with NEXT_SCRIPTC_BASELINE=node using Vercel's Next builder and `--standalone`: otherwise the native CLI's monorepo filePathMap upload looks for root node_modules relative to the demo and fails. The helper checks the effective Next config has no adapterPath. It pins Build Output regions=iad1 and all Node function architectures=x86_64 to match the later scriptc executable. The JS functions contain no `.node` addons; their presence aborts this cross-architecture packaging. Hosted function config, not the project's default Node=26, determines the deployed Node=24 runtime. Public JWT fixture environment values come from bench/config.mjs and are attached at runtime. Keep them identical on the native deployment.

**First-ever deployment trap:** on 2026-10-31 CLI `vercel deploy --prebuilt --environment preview` created a production-target deployment because this project had never been deployed. It assigned the default aliases despite the explicit preview argument. That deployment was deleted without benchmark traffic; a second deployment was verified as preview. The helper now refuses a project with no deployment history and rejects a returned production target. No `--prod` command was run. This is a platform default to check before using this procedure on another empty project.

Keep `.vercel/node-deployment.json` for provenance. Each helper invocation creates a new deployment (`--force`), never an alias-only reuse. The helper leaves the preview unrequested for the client-first measurements; do **not** use `--verify`, visit it or curl it before a fresh run. A fresh URL alone cannot prove that Vercel did not prewarm an instance.

## Protected access

Use the existing project automation bypass if present. A benchmark bypass was created with the documented `PATCH /v1/projects/{idOrName}/protection-bypass` API (`generate.note`); the returned secret was parsed in memory and appended only to ignored root `.env.local` as `VERCEL_AUTOMATION_BYPASS_SECRET`. Do not print the API response: protectionBypass object keys are secrets. To create another bypass use the Vercel dashboard's Protection Bypass for Automation settings and save it directly in `.env.local`; never put it in command arguments, URLs, report metadata or chat. This bypass applies to all deployments of the project until revoked. Deployment protection stays enabled.

After the first measurement, quick checks can use authenticated CLI access:

```sh
vercel curl https://next-scriptc-4nuyh23eg-noahs-projects-8a075d15.vercel.app/api/hello
```

The benchmark sends `x-vercel-protection-bypass` on every HTTPS request. Only that secret is forwarded to the Sandbox command environment. The local OIDC token authenticates Sandbox provisioning and is not uploaded. If it expires, preserve the bypass entry, run `vercel env pull .env.local --yes`, restore the bypass entry privately, and remove only duplicate `.gitignore` entries the CLI appended (do not discard unrelated edits).

## Measure

```sh
node --env-file=.env.local examples/demo/bench/vercel/run.mjs \
  --node https://next-scriptc-4nuyh23eg-noahs-projects-8a075d15.vercel.app

node --env-file=.env.local examples/demo/bench/vercel/run.mjs \
  --node https://FRESH-NODE-DEPLOYMENT.vercel.app \
  --native https://FRESH-NATIVE-DEPLOYMENT.vercel.app --fresh
```

`--fresh` is an operator assertion that **both** deployment URLs have not received application requests. Omit it for existing deployments; those first-response rows explicitly say cold state unknown. Use immutable URLs, matching deployment resources/region/fixtures and a new preview per variant for fresh repetitions (at most five per variant). No automatic deploy loop or idle-eviction claim is implemented. Run one command per paired experiment; do not combine separate baseline/native datasets into a synthetic paired run. Node's response hashes are the native parity reference in that same invocation. Variant order is fixed Node then native and is a potential time/order bias.

The runner uploads just five client/registry files (with a combined SHA-256), no archive or dependencies. It creates a 2-vCPU Node 24 Sandbox in iad1, 4-minute lifetime, 3-minute worker deadline, and stops it in finally. Reports are written even on failure. `--output research/benchmarks/vercel-my-run` overrides the timestamped destination. Each variant issues at most 13,518 requests including warmup, before failures. The worker writes issued counts and reports all six rows including errors; stopped/failed windows never become successful throughput. Remember previous runs when enforcing the overall ~50k invocation and 0.5 vCPU-h task budget. Sandbox provisioned vCPU-h is a conservative wall-time upper bound; platform activeCpuDurationMs is retained separately when supplied.

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

The CLI and public runtime-log schema may omit memory/start type/duration; the dashboard Logs → selected request → Function metadata or Observability is the honest platform source if available. Correlate with recorded first-response x-vercel-id and timestamps, retain export/provenance and units, and distinguish peak memory from RSS. Function allocation from inspect (2048 MiB here) is **not** used memory. Do not infer cold from latency, fill unavailable memory with the limit, or put process.memoryUsage() in the measured hot path. Reports deliberately show unavailable when no usable evidence was exported. A separate diagnostic function would only measure itself and cannot claim to represent the existing bundled functions or native subprocess tree.
