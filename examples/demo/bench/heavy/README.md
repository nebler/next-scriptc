# Go-territory comparison

Pre-registration: `research/benchmarks.md`, Go-territory section. Results: `research/go-territory.md`.

Four body-driven routes under `/api/heavy/{csv,json,thumbnail,bcrypt}`. The exact same `.native.ts` file runs in vanilla Node Next and scriptc. Go handlers live in `examples/demo/go`; `go.mod`/`go.sum` pin the toolchain minimum and bcrypt dependency. Thumbnail accepts raw RGBA and averages each 4×4 box, returning raw RGBA; it does not benchmark a codec. Integer cents and explicit tie ordering give byte-identical JSON.

Use Node 24.22.0, pnpm 11.1.3, scriptc 0.4.6, Zig 0.16.0 and Go 1.27.3 on PATH. The scriptc install hook may need to run once after pnpm install to restore compiler-helper permissions. Local checks:

```sh
node --test examples/demo/bench/heavy/test.mjs
CGO_ENABLED=0 go build -C examples/demo/go -o /tmp/heavy-go .
NEXT_SCRIPTC_DEMO_GROUPS=vercel pnpm --filter demo build
NEXT_SCRIPTC_BASELINE=node HEAVY_GO_ORIGIN=http://127.0.0.1:3520 pnpm --filter demo build
node examples/demo/bench/heavy/local-check.mjs
```

`local-check.mjs` owns three local listeners and tests every size plus edge cases. Its 180s proxy setting is correctness-only. The production comparison clears that override. The existing route suite adds 21 cases and retains every prior assertion. Run builds/tests sequentially, since they share `.next` and native-function ports.

After committing all source, build the Linux Go server outside the repository's tracked files:

```sh
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -C examples/demo/go -mod=readonly -buildvcs=false -trimpath -ldflags='-s -w' -o ../../../.vercel/heavy-user-server .
node --env-file=.env.local examples/demo/bench/heavy/sandbox.mjs
```

The self-hosted controller uploads a frozen git archive, installs the exact lockfile, and builds native plus Node in a 4-vCPU Linux Sandbox. Application processes get CPUs 0–1, generator 2–3. All runtimes use Next's HTTP entry: Node handles the route, native is reached through its adapter rewrite, and Go through an opt-in demo rewrite. All three undergo parity before measurement. CPU/RSS sum the owned Next/native or Next/Go process trees, including resident sidecars. Boundary procfs snapshots and 100ms RSS samples remain in JSON. RSS is a sum (shared pages may be double-counted), not PSS. Process CPU is quantized by CLK_TCK. Diagnostics independently compare serving-process CPU counters with procfs before any timing.

Preview packaging uses the ordinary shared build/deploy helper, with `HEAVY_GO_BENCH=1` adding Go only to the native preview's Build Output. `bench/vercel/heavy-go.mjs` builds the public pinned Vercel IPC proxy, writes it as `executable`, builds this server as `user-server`, and maps five public `/api/heavy-go/*` paths to one physical Function using relative `.func` symlinks. It never changes the product package. A separate `deploy.mjs` controller verifies the linked project, records accepted IDs, inspects settings/mappings and writes the ignored job file:

```sh
vercel pull --yes --environment=preview
node examples/demo/bench/heavy/deploy.mjs
node --env-file=.env.local examples/demo/bench/heavy/sandbox.mjs --hosted
```

Each controller refuses to overwrite its existing evidence file, preventing accidental duplicate spending. On failure, inspect retained partials; do not delete evidence or retry measured rows into success. The self-hosted Sandbox has an eight-minute hard lifetime (0.5334 vCPU-h upper reservation, within the 0.6 limit); hosted generator nine minutes (0.3 vCPU-h upper reservation, separately reported). Both stop in finally and try to download partial JSON first. No request retries. Hosted requests are counted before dispatch, including diagnostics and parity; absent artifacts conservatively charge the entire 20,000-attempt reservation.

Warm windows follow the registered smaller caps, retain every latency, pool reuse, cap and generator CPU. Latency stops at body drain, before hashing; throughput includes client validation. Closed-loop C=16 service times are not open-loop tails/capacity estimates. Bcrypt's three C=1 samples and single C=16 batch have their own bounded method. Hosted process CPU windows use one keep-alive pool, retain rejected token-changing windows and permit at most five attempts for three accepted windows. Same endpoint/token boundaries cannot establish affinity for intervening requests. Hosted Go excludes its separate IPC proxy; self-hosted trees include the common Next hop. No claim about billed Vercel CPU, memory or full infrastructure efficiency.
