# Next 16.4.3 / Vercel prebuilt integration

Tested 2026-10-31, starting at `efe8c91`. CLI 65.8.0, `@vercel/next` 28.0.0, scriptc 0.4.6, macOS arm64, Zig 0.16.0, Go 1.27.3. Local parity uses Node 24.22.0.

## Result and deployment blocker

`next-scriptc vercel-build --prod` builds the whole demo's Vercel output and replaces its 16 non-prerendered native App Routes with independent Linux executable Functions. Pages, assets, Node Functions, prerender files, and Vercel's routing configuration are produced by the Vercel adapter. No Next.js fork or runtime monkeypatch is involved.

**The full app has not been successfully deployed.** The linked project's Hobby plan rejects this artifact:

```text
No more than 12 Serverless Functions can be added to a Deployment on the Hobby plan. Create a team (Pro plan) to deploy more.
```

The 16 independent native Functions alone exceed this limit. Mapping groups to Functions would violate the requested deployment model. No plan change, grouping workaround, or reduced deployment was made.

Rejected deployment: https://next-scriptc-7mzizdcls-noahs-projects-8a075d15.vercel.app

ID: `dpl_EPAS9GNSWc12iZK3YLGxigg8iNoB`. `vercel inspect --json` independently reports `readyState: "ERROR"`. This is not a working application URL. There is no new READY URL from this integration. The earlier isolated hello invocation remains the hosted-execution evidence in [vercel-deploy-test.md](vercel-deploy-test.md).

Consequently, full hosted Node/native case results, URL/header parity, streaming behavior, and page/asset/rewrite behavior remain unverified. A project permitting at least 16 native Functions plus Next's retained Functions is needed to finish these checks.

## Build path evidence and choice

Packages were fetched with `npm pack --ignore-scripts` into fresh `/tmp/scriptc-vercel-sources.7pFBim/` subdirectories and unpacked without executing their code:

- `vercel@65.8.0`
- `@vercel/next@28.0.0`
- `@next-community/adapter-vercel@0.0.0`

The installed Next package is 16.4.3. Relevant source facts:

- Next `dist/server/config-shared.js:189` defaults `adapterPath` to `NEXT_ADAPTER_PATH`. Explicit user config overrides the default. `dist/server/config.js:1158` imports the selected adapter and calls its `modifyConfig`.
- `@vercel/next/dist/index.js:18048` enables the new adapter only when `NEXT_ENABLE_ADAPTER === "1"` (and the minimum Next version is met, without `NEXT_BUILDER_INTEGRATION`). It sets `NEXT_ADAPTER_PATH` to its bundled `dist/adapter/index.js` and `NEXT_ADAPTER_VERCEL_CONFIG` to its build config. Otherwise it runs the legacy manifest builder.
- After Next builds, `dist/index.js:18127` checks `<outputDirectory>/output/config.json`. If present, it returns that Build Output API directory. Otherwise it reads the legacy `.next` manifests. The builder defaults `outputDirectory` to `.next` at line 17844.
- The bundled adapter comes from `@next-community/adapter-vercel` (the builder's package metadata names development version `0.0.1-beta.34`). The separately inspected 0.0.0 package is not an added dependency.

The first implementation tried the simpler legacy builder plus post-processing. Next built successfully, but the builder then failed:

```text
ENOENT: no such file or directory, open '<demo>/.next/server/app/_global-error.html'
```

With `NEXT_ENABLE_ADAPTER=1`, our explicit `adapterPath` still selects next-scriptc, so merely setting the flag does not compose the adapters. The implementation delegates both production build hooks to the adapter at the builder-supplied `NEXT_ADAPTER_PATH`, then replaces native Functions in that adapter’s completed `<distDir>/output`. Vercel consumes the resulting Build Output API tree to produce `.vercel/output`. This completed successfully. It adds no direct Vercel package dependency or hardcoded path into its package tree.

This chooses the composite adapter (option a), rather than a standalone post-processor (option b). The trade-off is dependence on the opt-in Vercel adapter environment contract and its NextAdapter hooks. A legacy-only post-processor would have fewer dependencies, but does not build this pinned demo cleanly. Direct standalone use of our build-mode flag without Vercel's supplied adapter fails explicitly.

`NEXT_SCRIPTC_VERCEL` is an absolute native build directory set only by the CLI command. It is deliberately not inferred from `VERCEL` or `NOW_BUILDER`: those identify a platform, not this packaging workflow, and should not silently change ordinary self-hosted builds. In this mode, no loopback rewrites are generated and no self-hosting binaries are built. The original discovered route options are retained. Vercel’s adapter receives the normal Node representation of native routes before their Function directories are replaced. Native compilation happens inside the build-complete hook, so Vercel only reports build success after it finishes.

The root `vercel.json` selects `examples/demo/package.json` with the pinned `@vercel/next@28.0.0` public builder. This avoids changing the linked project's existing Other-framework/root-directory settings. This is the demo's monorepo configuration, not package-level framework detection. The command currently supports one native Next app per build; a second native app fails exclusive build-directory creation rather than overwriting the first app’s entries.

## Output and replacement

Observed native build output:

```text
.vercel/output/
  config.json
  static/...
  functions/api/hello.func/
    .vc-config.json
    executable
    user-server
  functions/api/hello.rsc.func -> hello.func
  functions/api/items/[id].func/...
  functions/api/items/[id].rsc.func -> [id].func
  functions/api/static-fixture.func/...          # retained Next output
  functions/api/static-fixture.rsc.func/...      # retained Next output
  functions/api/static-fixture.prerender-config.json
  functions/api/static-fixture.prerender-fallback.body
```

The Vercel adapter emits `.rsc` variants even for App Routes. Next's `outputs.appRoutes` identifies them by the same `filePath` as the main route; the native build uses those actual output pathnames instead of guessing a fixed set of suffixes. These variants become relative symlinks to one native Function per route. Page prefetch/segment variants are not touched.

App Route parameters remain in Function filenames (`[id]`, catch-all patterns), while `config.json` contains the matching regexes and destinations. For example the demo's dynamic rule targets `/api/items/[id]$2?nxtPid=$nxtPid`. The replacement does not regenerate or edit these rules. Hosted original-path/internal-query handling is still a required verification, not established by preserving the file names alone.

Before removal, every Function's symlink target is inspected. If an original Node Function is physically stored at a replaced route's path but also serves unrelated Node aliases, its directory moves to a retained alias and the other retained aliases are retargeted. Replacement never follows a symlink to delete its target. A regression test covers this sharing case and the `.rsc` alias, permissions, retained configuration, and prerender metadata.

Node `.vc-config.json` files contain `filePathMap` and `fileHashes` pointing at traced Next/project dependencies, plus Node launcher fields. Native Functions replace that entire directory/config rather than retaining Node trace metadata. Replacement happens after Vercel’s adapter emits its output and before the builder consumes it. The retained Node Functions keep Vercel’s normal `filePathMap` references into the repository. In the inspected V3 adapter output, even `vercel build --standalone` did not inline these mapped files (for example the static fixture Function still referenced `examples/demo/.next/routes-manifest-deterministic.json` and Next package files outside its directory). The command therefore uses normal `vercel build`. Deploy from the same workspace immediately after building; rebuilding Next or removing dependencies before upload can invalidate those references. This output is not a portable standalone archive.

Routes classified by Next as complete static prerenders are excluded using the same criterion as self-hosting. The demo's `/api/static-fixture` retains its Node revalidation Function, `.rsc` output, prerender config, and fallback body. No native marker is expected on its static response. A separate local Next/Vercel-adapter fixture also built `[id]`, `[...parts]`, and `[[...parts]]` native routes plus a user rewrite, a force-static route and a `generateStaticParams` force-static dynamic route. The build selection included only the three non-prerendered patterns and their actual `.rsc` variants. Both static handlers, including `/api/prerender/one` and its parent pattern Function/prerender files, stayed entirely with Next. The generated rewrite and catch-all regex/destination rules were preserved. These are build-shape checks; their hosted request semantics remain unverified.

Native configuration is:

```json
{
  "runtime": "executable",
  "handler": "executable",
  "architecture": "x86_64",
  "supportsResponseStreaming": true
}
```

Where present, `memory`, `maxDuration`, `regions`, `environment`, `functionFailoverRegions`, and `framework` are copied from the original Node Function config. Node launcher, tracing, file maps/hashes, multi-payload, and Node bundling settings are omitted. Project defaults continue to apply when an original field is absent.

`withScriptc({ ... }, { routes: { ... } })` optimization applies per route. `group` remains a self-hosting process setting; Vercel always gets independent Functions. There is no Vercel group mapping.

## Cross-compilation and cache

The old isolated `scripts/vercel-native-smoke.mjs` is replaced by `packages/next-scriptc/src/vercel.mjs`; the Sandbox check can still consume `functions/api/hello.func/{executable,user-server}` after this command.

Each route uses the existing `entrySource`, shim and `writeNativeConfig`, and is compiled serially with its configured optimization, `--strip --no-keep-llvm`, `SCRIPTC_TARGET=x86_64-linux-musl`, and the version-matched runtime pack. No Node worker is included in a native Function.

Cache under `.vercel/cache/scriptc/`:

- `runtime-linux-x64-musl-0.4.6/package`: `npm pack @scriptc/runtime-linux-x64-musl@0.4.6 --ignore-scripts`, unpacked once.
- `ipc-proxy-84878e532142f0ac584953695658b324eb9e5b80/executable`: built from the exact public Git commit with `GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags='-s -w'`.

Cache entries are built in temporary directories and renamed into place after success; failed builds do not leave completed entries. Concurrent cache creators can reuse the winner. Downloaded proxy source is removed after compilation. The second complete native build reused both entries without another npm pack or Git fetch. Native route binaries themselves are rebuilt each time.

A failed Next build, compilation or replacement removes `.vercel/output`, so a failed command cannot leave an apparently deployable partial artifact. Generated entries, credentials, runtime packs, source downloads and binaries are ignored and uncommitted.

## Request URL and platform assumptions

The pinned [Go proxy](https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/internals/ipc-proxy/bootstrap/proxy.go) strips `x-vercel-internal-*` after reading invocation identifiers and forwards the request through `httputil.ReverseProxy`; its Director explicitly copies `X-Forwarded-Host` into the outgoing Host, and it retains ordinary forwarded host/protocol headers. The shim currently prefers `x-forwarded-host` over `host`, derives HTTPS from `x-forwarded-proto`, and reserializes the query when a forwarded host is present. It uses this URL to construct `NextRequest`, whose `nextUrl` derives from it.

This source evidence does not establish the exact header values supplied by hosted Functions. The full deployment was rejected before invocation; `/api/url-echo` still needs a hosted comparison, including spaces, plus signs, repeated parameters, rewrites and dynamic parameters. No shim URL change was made without that evidence.

Only local prebuilt compilation has been validated. The [documented build image](https://vercel.com/docs/builds/build-image) is Amazon Linux 2023 and its package list includes gcc/git/tar but does not list clang, Zig, or scriptc. It permits additional package installation, and scriptc distributes Linux compiler packages. Thus “remote builds are impossible because clang/scriptc are absent” is **not established**. Provisioned remote compilation is untested; this command requires a host with the documented toolchain available.

The executable IPC bridge is pinned public Vercel source, not a promise of a stable supported third-party executable ABI. See [platform research](vercel-native-functions.md).

## Reproduction and verification

From the repository root, after supplying the existing ignored project link and credentials:

```sh
pnpm install --frozen-lockfile
vercel project inspect --non-interactive
vercel pull --yes --environment=production
PATH=/Users/noah/.local/share/zig-0.16.0:$PATH node packages/next-scriptc/src/cli.mjs vercel-build --prod
vercel deploy --prebuilt --prod --yes \
  --env DEMO_JWT_NOW=1793318400 \
  --env DEMO_JWT_SECRET=next-scriptc-parity-test-signing-secret-32-bytes
```

Use your own Zig path. Node, Vercel CLI, Git, npm, tar, and Go must be on PATH. The JWT values above are public test fixture values, not application credentials. They keep comparisons deterministic. Deployment remains blocked by the linked account's Function limit.

For a Node-only baseline, build and deploy **before** rebuilding the native artifact, retaining its returned URL:

```sh
NEXT_SCRIPTC_BASELINE=node node packages/next-scriptc/src/cli.mjs vercel-build --prod
# Run the same prebuilt deploy command and test fixture env values above.
```

The demo uses `.next` for Vercel builds so the builder finds its output, including when grouping options are present; local baselines still use `.next-node` and local grouped builds still use `.next-grouped`.

Once both deployments exist:

```sh
ROUTES_NODE_URL=https://<node-deployment> \
ROUTES_NATIVE_URL=https://<native-deployment> \
node --env-file=.env.local examples/demo/test/routes.mjs
vercel curl '/api/url-echo?q=a%20b&plus=a+b&dup=1&dup=2' --deployment https://<native-deployment>
```

The runner reuses all 85 test cases and prints PASS/FAIL per case and a final count. It uses a private environment bypass secret if supplied, otherwise `vercel curl` for automatic authenticated access; protection is not disabled. It compares status, decoded body, and selected application/security/cache/auth headers. It verifies the runtime marker separately. Only the CDN compression `Accept-Encoding` Vary token is normalized; platform headers such as date/server/request IDs are outside the existing selected header set. No hosted parity result is claimed yet. Platform differences in checked headers will surface as failures.

Also check `/`, `/favicon.ico`, a referenced `/_next/static/` asset, `/api/items/new`, `/api/static-fixture`, a missing page, `/api/report?threads=1`, and App Route RSC/rewritten URLs on both deployments. Report `sharedByReference` according to runtime for `/api/report`; it intentionally differs between Node and native. No load benchmark belongs to this check.

Local results:

- `node --test packages/next-scriptc/test/*.mjs`: **8/8 passed**.
- Node 24 `packages/next-scriptc/shim/test/parity.mjs`: **98 HTTP comparisons passed**.
- `node examples/demo/test/e2e.mjs`: **passed** (12 responses, report thread cases, precedence, ownership, crash/recovery, ports, SIGTERM/SIGKILL cleanup and CLI alias).
- `NEXT_SCRIPTC_DEMO_GROUPS=light node examples/demo/test/e2e.mjs`: **passed**, grouped crash affects the expected eight member routes.
- Node 24 `examples/demo/test/routes.mjs --skip-build`: **85/85 passed**, 16 processes cleaned up.
- Node 24 `NEXT_SCRIPTC_DEMO_GROUPS=light ... routes.mjs --skip-build`: **85/85 passed**, nine processes cleaned up.
- Native Vercel builds: **passed**, 16 route binaries each time; cache reuse observed.
- Node baseline Vercel build: **passed**.
- Two-URL comparison entrypoint against local Node/native production servers: **85/85 passed**; this exercises the comparison runner, not hosted Vercel behavior.
- Full native deploy: **ERROR, Hobby Function-count limit**; hosted tests **blocked**, not passed or skipped as successful.

Test execution notes: the first shim invocation used Node 26 and correctly failed the suite's explicit Node-24 prerequisite; it passed under Node 24. Node 26's route runner hit `ECONNRESET` during early-response image validation, while both complete suites passed under Node 24. An overlapping grouped/default run initially contended for their shared native port range; the final successful runs were isolated. A first prebuilt upload after a concurrent self-host rebuild lost a traced `.next` file. Rebuilding and uploading without an intervening Next build reached the independent account-limit rejection. The attempt with Vercel’s `--standalone` flag still retained V3 `filePathMap` references, as noted above.
