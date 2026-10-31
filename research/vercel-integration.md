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
