> Historical investigation. For current usage see the [root README](../README.md); for the final Vercel measurements see [vercel-final.md](vercel-final.md). Earlier protocols and failures below are retained as evidence.

> Current packaging: round 3 replaces the separate Go IPC proxy with in-process TypeScript IPC compiled by scriptc 0.4.6. See the appended round-3 record; the round-2 results below remain historical.

# Next 16.4.3 / Vercel integration, review round 2

Tested 2026-10-31. This supersedes the round-1 Hobby Function-limit blocker. The implementation is committed as `fdac32411f3b126611288069a47125e6bff3b12b`, after cleanly merging `28f013e` into main `f6f9a2e` (merge commit `aac42b6`). No main merge, push, hosted project setting change, domain attachment or load benchmark was performed.

## Final preview deployments

Both were built from the same clean implementation commit and independently inspected as `target: preview`, `readyState: READY`:

- Native: https://next-scriptc-pidoydgzs-noahs-projects-8a075d15.vercel.app (`dpl_DFisKMoaNnsaMTvCKiWpHTsZMtTg`).
- Node: https://next-scriptc-q8iy94v29-noahs-projects-8a075d15.vercel.app (`dpl_F412QH9y8gVsRbnNDcuzPPsX7b5Y`).

[Machine-readable provenance and complete Function path lists](vercel-integration-round2.json) retain the deployed Function names, runtimes, region, memory, timeout, architecture/build evidence and configuration hashes. These URLs received verification traffic; they are not untouched cold-start samples. No load measurements were made.

Toolchain: Node 24.22.0, Next 16.4.3, pnpm 11.1.3, Vercel CLI 65.8.0, `@vercel/next` 28.0.0, scriptc 0.4.6, Zig 0.16.0 and Go 1.27.3. Native `user-server` is a stripped, statically linked Linux x86-64 ELF. Its `executable` IPC proxy is built from pinned public Vercel commit `84878e532142f0ac584953695658b324eb9e5b80` with `GOOS=linux GOARCH=amd64 CGO_ENABLED=0`.

## Node topology first, then explicit native grouping

The final Node baseline has **two deployed Functions**. Counting local directories would be misleading: the adapter emits 42 real `.func` directories and six symlink aliases, marks Node bundles `experimentalAllowBundling`, and Vercel bundles those 48 paths into two distinct `lambda.functionName` values at deployment.

The page Function serves 12 paths: `index`, `_global-error`, `_not-found`, their `.rsc` variants, and the three `index.segments` plus three `_global-error.segments` variants. The App Route Function serves all 18 route patterns below, each with its `.rsc` variant (36 paths):

```text
/api/analytics/revenue
/api/export.json.gz
/api/feed.xml
/api/hello
/api/images/histogram
/api/items/[id]
/api/items/new
/api/login
/api/login-scrypt
/api/posts/[slug]
/api/primes
/api/report
/api/search
/api/static-fixture
/api/stores/nearby
/api/uploads/verify
/api/url-echo
/api/verify
```

Consequently, `NEXT_SCRIPTC_DEMO_GROUPS=vercel` in the explicit demo config puts all native route patterns into one group. Next excludes the complete static `/api/static-fixture` prerender from native compilation; `/api/items/new` is an ordinary Node route, also prerendered. The other **16 routes compile together into one binary**, using the existing `planProcesses` / `processEntrySource` / `serveMany` path. The default package behavior still gives ungrouped routes separate Functions.

The native deployment has **three Functions**: the page Function (12 paths), one executable Function for all 16 dynamic native routes and their `.rsc` aliases (32 paths), and one retained Node Function for `/api/items/new`, `/api/static-fixture` and their `.rsc` variants (four paths). Every one of the 32 executable paths has the same deployed `lambda.functionName`; the artifact has one real native `.func` directory and 31 relative `.func` symlinks. This directly verifies that Vercel counts the shared executable Function once. The Hobby deployment succeeds below its 12-Function limit.

All shared native routes have one cold-start/failure/resource domain and no process isolation. Their modules initialize together at native startup; Node's bundled launcher loads the selected route. Shared initialization can change cold-start behavior, which is part of the adapter comparison, not a claimed equivalence of runtime internals. This is the closest topology to Node's shared dynamic-route Function. The two retained static routes necessarily occupy a separate Node Function on the native deployment.

For arbitrary user groups, Function settings copied from each member must agree (`memory`, `maxDuration`, `regions`, `environment`, `functionFailoverRegions`, `framework`). Incompatible settings fail explicitly. Optimization conflicts already fail in the shared route planner. No Vercel grouping default or implicit demo grouping is introduced.

## Same build/deploy pipeline and settings

Both variants use `examples/demo/bench/vercel/build.mjs`. It writes only an ignored local demo `.vercel/project.json` override: framework `nextjs`, Node `24.x`, no root directory, output directory `.next`. It invokes the package's `next-scriptc vercel-build`, enabling `NEXT_ENABLE_ADAPTER=1` in both variants. The baseline uses Vercel's bundled adapter directly; the native config selects next-scriptc, which delegates the two build hooks to the builder-supplied `NEXT_ADAPTER_PATH` and replaces the native Functions afterward. This is Next's public adapter API, without a fork or monkeypatch.

After building, the demo helper pins **every Function** to `architecture: x86_64`, `regions: [iad1]`, `memory: 2048`, `maxDuration: 300`, and pins output regions to `iad1`. Deployed inspection confirms both variants use `nodejs24.x` for retained Node Functions and the same 2048 MiB/300 seconds/iad1 configuration; native routes use `executable`. Node bundles containing `.node` addons are refused on this macOS cross-architecture build host.

The round-1 root `vercel.json` used legacy `builds` solely to select `examples/demo/package.json` from a linked monorepo root whose hosted framework is Other. It changed whole-project build behavior and was unnecessary when building the demo explicitly. It is removed. The old Node helper's different `.next-node`/legacy-adapter/`--standalone` pipeline is replaced by a compatibility entrypoint to the shared helper. The new path enables the same Vercel adapter for both variants.

The V3 adapter's `filePathMap` entries are relative to the repository root. Building and uploading from the demo directory failed to find root `node_modules/.pnpm/...`. The helper now builds from the demo, then moves the completed output to repository-root `.vercel/output` and deploys from that root. Both variants follow the same process. Mapped Node dependencies remain in the workspace: upload immediately after building, before another Next build can replace traced files. This is not a portable standalone archive.

The demo helper removes the old root output before starting so a failed build cannot leave the previous variant deployable there. The package CLI also removes its output on a build/compile failure. Runtime packs and the pinned proxy are cached atomically; native binaries are rebuilt. Compilation remains sequential, bounded by existing planner groups: the demo needs only one compilation now, so parallel compilation would provide no benefit here.

Final local wall times, including dependency check, Next, native build and output pinning/staging, excluding upload: **Node 3.67 s**, **native 20.68 s**. Native compilation/replacement took **17.4 s**. An earlier cache-cold native build took 18.76 s (12.5 s compilation), and an intermediate warm build took 13.85 s (11.4 s compilation). These are observed build times on this shared Mac, not controlled performance benchmarks. The fresh worktree needed executable permissions restored on scriptc's bundled TypeScript/compiler helpers after installation; no dependency or generated toolchain file was committed.

## Hosted bugs found and fixed

Direct native routes worked in round 1's packaging, but sharing the Function exposed missing platform routing integration. Vercel retains the public request URL while putting the selected destination in `x-matched-path`; the bundled Node adapter dispatches from that header and strips `.rsc` for route selection. Native originally matched only the public URL, yielding 404 for `/rewrite/hello`, `/rewrite/items/42` and `/api/hello.rsc`.

Generated Vercel entries now explicitly enable this dispatch contract. They interpolate `nxtP` route parameters for template destinations, preserve the public URL separately, and omit internal `nxtP`/`nxtI` query fields from the Web Request. Self-hosted entries ignore the platform routing header. The generated entry still uses the shared single-route or multi-route runtime, rather than a second HTTP server implementation.

The bundled Node handler runs Next with `minimalMode: true`, which omits the App Route Vary prefix. Native originally added that prefix unconditionally; the initial comparison was stopped after 20 header mismatches. Explicit Vercel mode now omits the prefix while preserving handler-supplied Vary, matching Node. Local/self-hosted Vary behavior remains covered by the shim suite.

The next full run passed 83/85 cases. Cases 56 and 57 (gzip export) failed because the test client requested `Accept-Encoding: identity` while demanding `Content-Encoding: gzip`. Separate probes showed **both variants** correctly return decoded JSON without that header for identity, and gzip with the header when gzip is negotiated. The hosted test now requests gzip for its gzip cases, matching the existing benchmark client. This was a client/platform representation difference, not a native compression defect. The final comparison still checks the gzip header and decoded body; it does not relax that assertion. Only CDN `Accept-Encoding` in Vary is normalized by the two-URL harness.

## Reproduce

From the repository root, with Node 24 and the documented toolchain on PATH:

```sh
pnpm install --frozen-lockfile
mkdir -p .vercel
cp /Users/noah/code/next-scriptc/.vercel/project.json .vercel/project.json
cp /Users/noah/code/next-scriptc/.env.local .env.local
vercel pull --yes --environment=preview

# Each command produces repository-root .vercel/output for deploy --prebuilt.
NEXT_SCRIPTC_BASELINE=node node examples/demo/bench/vercel/build.mjs
NEXT_SCRIPTC_DEMO_GROUPS=vercel node examples/demo/bench/vercel/build.mjs

# Or build and deploy each preview through one command, saving provenance.
NEXT_SCRIPTC_BASELINE=node node examples/demo/bench/vercel/deploy.mjs
NEXT_SCRIPTC_DEMO_GROUPS=vercel node examples/demo/bench/vercel/deploy.mjs
```

Do not run those two builds concurrently: they share the demo's `.next` tree. `deploy-node.mjs` remains a compatibility alias for the baseline command. Deployment helpers check existing project history to avoid the first-deploy implicit-production trap, deploy with explicit preview intent, and inspect the returned target/state. They never set a hosted project setting or assign a domain.

Public deterministic JWT fixture values from `bench/config.mjs` are supplied identically at build/runtime. The copied main-checkout `.env.local` did **not** expose `VERCEL_AUTOMATION_BYPASS_SECRET` in this worktree. Its existing `VERCEL_OIDC_TOKEN` worked with `x-vercel-trusted-oidc-idp-token`; verification used it without changing protection. The runners prefer the automation-bypass header when its secret is present. No secret was printed or committed. The load benchmark still requires its automation bypass in the operator's environment; it deliberately does not forward the local OIDC token into its Sandbox.

```sh
export ROUTES_NODE_URL=https://next-scriptc-q8iy94v29-noahs-projects-8a075d15.vercel.app
export ROUTES_NATIVE_URL=https://next-scriptc-pidoydgzs-noahs-projects-8a075d15.vercel.app
node --env-file=.env.local examples/demo/test/routes.mjs
node --env-file=.env.local examples/demo/test/vercel.mjs
```

The hosted smoke suite additionally checks pages, a referenced Next JavaScript asset, favicon/public SVG, missing-page 404, Node/static routes, static/dynamic rewrites, `.rsc` aliases, RSC-header routing, URL echo, primes and the report worker route. Report result totals must agree; `sharedByReference` intentionally differs between Node and native. Its timing/RSS/version fields are not route-parity assertions.

The executable IPC proxy remains a pinned implementation of Vercel's public source, not a guarantee of a stable third-party executable ABI. Remote Vercel build-host provisioning remains untested; the working command cross-compiles locally. See [platform research](vercel-native-functions.md) and the [Build Output API's documented Function symlinks](https://vercel.com/docs/build-output-api/primitives).

## Final verification results

- **85/85 hosted route cases PASS**, on the final URLs above. [Every case, method and path](vercel-parity-round2.txt) is recorded individually. Status, selected content/cache/security/auth headers, decoded bodies and native markers agree. No final failures or unexplained exclusions remain.
- **25/25 hosted smoke checks PASS**. [Individual results](vercel-smoke-round2.txt) include every non-workload surface described above. All 16 dynamic native route patterns were invoked successfully across the parity and smoke suites with `x-next-scriptc: native`. The complete static fixture correctly has no native marker.
- URL echo PASS for ordinary and `.rsc` URLs. Each variant returned its own public HTTPS origin/Host and the requested path. The query normalized `q=a%20b` to `q=a+b`, retained `plus=a+b`, repeated `dup` keys, `%2F` and Unicode identically. Exact returned URLs are in the JSON provenance.
- Node report and native report deterministic totals match. `sharedByReference` is respectively false/true as intended.
- Local package tests **9/9 PASS**; compiled Node-24/native shim parity **104 HTTP comparisons PASS**, including both single-route and grouped Vercel dispatch fixtures. Syntax checks and `git diff --check` passed.

Each **final deployment** received exactly **101 HTTP verification requests**: 85 parity requests plus 16 smoke requests. This includes one `threads=1` report request per deployment, which initializes that Function instance's report graph/worker pool. These previews are suitable for the operator's paired benchmark with cold state unknown; omit `--fresh`. Earlier debugging requests used earlier preview URLs, not this final pair. No load benchmark was run, so load request count is zero.

Remaining operational question: the operator must supply the automation-bypass secret expected by `bench/vercel/run.mjs`; it was absent from the copied main-checkout file during this round. Existing OIDC access was enough for all verification and did not require changing project protection. The documented executable ABI and local-build/toolchain limitations remain prototype constraints, not unresolved parity failures.

## Round 3 — in-process executable IPC (2026-10-31)

Implementation commit `171843f` starts from main `308fced`. `shim/vercel-ipc.ts` implements Contract B inside the scriptc binary; `src/vercel.mjs` copies that binary directly to `executable`. There is no `user-server`, Go build/cache, child process, port polling or reverse-proxy hop. The existing Function contract remains `runtime: "executable"`, `handler: "executable"`, `architecture: "x86_64"`, `supportsResponseStreaming: true`, with the same inherited Function settings and alias grouping. No Next.js fork is involved. Function-level native compilation is outside this change and remains Node on Vercel.

### Protocol evidence and implementation

All Vercel source links in this section are pinned to `84878e532142f0ac584953695658b324eb9e5b80`:

- **Transport and readiness:** the Go [IPC client](https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/internals/ipc-proxy/bootstrap/ipc/connection.go) serializes complete JSON frames followed by one NUL byte over a persistent Unix stream. The Rust 2.x [runtime](https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/crates/vercel_runtime/src/lib.rs#L296-L326) connects to `VERCEL_IPC_PATH`, binds `127.0.0.1`, then announces its HTTP port. Its [message writer](https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/crates/vercel_runtime/src/ipc_utils.rs#L33-L49) writes the same NUL framing. The Go [proxy's HTTP listener and startup message](https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/internals/ipc-proxy/bootstrap/proxy.go#L251-L327) explicitly identify the announced port as the traffic destination. HTTP therefore goes directly to the reported loopback `httpPort`; requests are not delivered as IPC messages.
- **Startup message:** `{ "type": "server-started", "payload": { "initDuration": milliseconds, "httpPort": port } }`. The shim connects once and sends once after both socket connection and HTTP `listening`. Default hosted port is 3000; an explicit shim port still works, including ephemeral ports in the harness. Duration covers IPC/server setup from the factory call, not platform activation or all executable/module loading. Unlike the removed Go proxy, announcement follows the bind, eliminating its public bind-after-readiness ordering.
- **Invocation identity and completion:** Go [message types and context extraction](https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/internals/ipc-proxy/bootstrap/ipc/messages.go#L9-L40) read `x-vercel-internal-invocation-id` and the decimal uint64 `x-vercel-internal-request-id`. Completion is `{ "type": "end", "payload": { "context": { "invocationId": string, "requestId": uint64 } } }`, plus NUL. The shim preserves the numeric token without a lossy JS Number conversion, including uint64 maximum; invalid/missing IDs become zero and overflow saturates as Go's ignored ParseUint range error does. A per-response guard sends one end on `finish` or `close`: streamed bodies remain active until completion, while handler errors, failing streams and disconnected uploads/downloads also end. Keep-alive connection lifetime does not delay end. Requests without an invocation ID produce no end.
- **Health and request exposure:** Go [ping, header extraction/removal and dispatch](https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/internals/ipc-proxy/bootstrap/proxy.go#L254-L301) answers `/_vercel/ping` with HTTP 200 `OK` before invocation processing, so ping has no end message. The shim also recognizes percent-encoded ping paths and query strings. All `x-vercel-internal-*` headers are omitted from the handler's Request. Without a proxy hop, the handler otherwise sees the headers Vercel delivers unchanged (no ReverseProxy hop-header removal and no appended loopback `x-forwarded-for` entry, which the orchestrator removed in review because no such hop exists anymore). Public forwarded host/protocol, URL/query normalization, `x-matched-path` dispatch, routed parameter interpolation and `nxtP`/`nxtI` removal retain the prior hosted shim behavior.
- **Concurrency and failure boundaries:** each frame uses one socket write on the JS event loop, keeping concurrent invocation frames ordered and intact. Socket connection/write errors or IPC closure terminate the instance with status 1. There is no child to supervise; executable death is visible directly to the host. Ordinary route exceptions still use the existing HTTP 500 path, with completion independent of that path. Logs continue on stdout/stderr, as the old proxy's inherited child streams did. This change adds no request-scoped logs/metrics, `waitUntil`, WebSocket API or service-prefix routing API.

The Rust runtime confirms the in-process model and message schema; its background-task completion machinery is not copied into a shim without `waitUntil`. The Go [stream/abort tests](https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/internals/ipc-proxy/bootstrap/http_resilience_test.go#L19-L123) explicitly acknowledge missing abort end notifications in its original panic path. This implementation deliberately emits end for those aborts, as required, instead of reproducing that omission.

### Local fake-platform harness

Run with Node 24, scriptc 0.4.6 and Zig 0.16.0 on PATH:

```sh
SCRIPTC_CHECKER_SERVER=0 node --test packages/next-scriptc/shim/test/vercel-ipc.mjs
```

The harness compiles a real fixture, opens a Unix IPC server, waits for startup, and immediately sends HTTP to the announced port without connection retries. For both `serve` and `serveMany` it checks concurrent invocations, escaped JSON IDs, exact uint64 serialization, URL/forwarded-host/matched-path/header parity, delayed chunks with no early end, handler and stream errors, response cancellation, partial-upload disconnect, 404s, invalid IDs, persistent HTTP connections, ping exclusion, one start, no duplicate/truncated frames, IPC closure, and missing-socket failure. A self-hosted fixture ignores an inherited IPC path. The existing parity fixture covers Vercel entries without IPC as well.

Scenarios are based on the proxy's pinned [wire concurrency test](https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/internals/ipc-proxy/bootstrap/ipc_wire_test.go), [request metadata/health tests](https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/internals/ipc-proxy/bootstrap/http_routing_test.go), and [request header tests](https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/internals/ipc-proxy/bootstrap/http_scenarios_test.go#L100-L149). This is a focused shim/protocol harness, not a claim to port all of Go's HTTP transport test suite.

scriptc 0.4.6 successfully compiled and exercised Unix `createConnection`, connect/error/close events, socket writes/closure, HTTP listening/address, response finish/close events, repeated response writes and cancellation. `IncomingMessage.rawHeaders` is a read-only snapshot in scriptc: filtering builds the handler header snapshot instead of mutating the transport object. No compiler/runtime patch or alternate IPC transport was needed. IPC activates only with both explicit `vercel: true` and nonempty `VERCEL_IPC_PATH`; self-hosted startup, transport and lifecycle remain covered by the unchanged local suites.

### Hosted result, sizes and reproduction

All six round-3 deployments use implementation `171843f` and the existing shared demo builder/deployer, rebuilt immediately before every upload. Native's 17 dynamic routes remain one executable Function; Node has two deployed Functions overall, native three. All use iad1, x86_64, 2048 MiB and 300 seconds. Each native Function contains only `.vc-config.json` plus its single 9,925,216-byte stripped static ELF. Uploaded native ZIP is 4,332,912 bytes on every preview, versus 7,526,761 before; total payload falls from 17,139,488 bytes to 9,925,216 (−42.1%). The scriptc ELF itself grows 27,616 bytes; removing the 7,241,888-byte proxy supplies the net reduction.

Three interleaved untouched first-response pairs pass. Node/native milliseconds: **291.472/133.069**, **224.609/136.934**, **224.302/113.689**. Native median is 133.069 ms versus prior proxy median 158.696 ms; Node median 224.609 ms versus 224.314 ms. New warm C=1 native/Node medians are 21.961/25.419 ms. A separate short C=16 run passes 1,466 attempts with zero failures and 14 additional native listeners; native/Node measured p50 is 22.6/25.3 ms and p99 83.6/92.1 ms. Prior native p99 was 78.6 ms, so this does not claim an improvement in every percentile or statistical non-regression. First-response latency is not isolated provisioning time, and the prior unexplained startup 500 remains unattributed.

After fresh measurements, **85/85 hosted route cases and 25/25 smoke checks pass**. Public URL/Host/query, rewrites, matched-path parameters, RSC variants, native markers, gzip and worker results retain parity. All requested local suites also pass: 19 package tests, 113 compiled shim comparisons, the new IPC harness, self-hosted demo E2E, 85 local route cases and function E2E. No self-hosted IPC path activates.

Final verified previews retained for review:

- Native: https://next-scriptc-duyujjeez-noahs-projects-8a075d15.vercel.app
- Node: https://next-scriptc-9nfz6chx8-noahs-projects-8a075d15.vercel.app

Reproduce builds with `NEXT_SCRIPTC_BASELINE=node node examples/demo/bench/vercel/deploy.mjs` and `NEXT_SCRIPTC_DEMO_GROUPS=vercel node examples/demo/bench/vercel/deploy.mjs`, using Node 24 and the documented Zig toolchain. Set the returned URLs as `ROUTES_NODE_URL` / `ROUTES_NATIVE_URL`, then run the existing route and smoke scripts with `--env-file=.env.local`. Run cold-only samples **before** those scripts, as described in [round-3 cold/startup results](vercel-cold-start-memory.md#round-3--one-native-process-in-process-vercel-ipc-2026-10-31).

Round-3 cost: six previews, 2,052 HTTP attempts, 0.018927 provisioned Sandbox vCPU-hours, 10,386 ms reported active Sandbox CPU. All four Sandboxes stopped. Four measurement-only previews were deleted; the final verified pair remains. Full per-pair manifests, binary hashes, Function sizes, raw samples, listener/error logs, local/hosted results and cleanup are linked from the cold/startup record and its [budget ledger](benchmarks/vercel-round3-cost.json). No production deployment, domain attachment, project-setting change, push or main merge occurred. The executable IPC ABI remains a public-source contract rather than a stability guarantee; no scriptc socket blocker remains.
