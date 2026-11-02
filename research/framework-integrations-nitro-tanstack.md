# Nitro and TanStack Start native promotion

2026-11-02. Production Node integration works in the two example applications.
Each enabled server returns the same bytes as its disabled counterpart for 150
requests over inputs 0, 1, 10, 100, 1000, and 10000. Each dispatcher reaches
shadow, verifies seven samples, and records zero fallbacks. No native foreground
calls occur in these runs. These results establish correctness and packaging.
They make no performance claim.

## Integration

Nuxt uses Nitro 2's server Rollup graph. `scriptc-promote/nitro` exports
`scriptcNitro(options)`, a Nitro module that inserts promotion before transpilation.
Discovery defaults to the application root, including `server/` API handlers and
helpers. The Nuxt example narrows discovery to `server`. Rollup emits
`promotion.node`, `ids.json`, and `encodings.json` directly into
`.output/server/scriptc-promotion`. Dev skips the module. Presets other than
`node-server` fail explicitly. No Vite client plugin is needed for this path.

```ts
import {scriptcNitro} from 'scriptc-promote/nitro';
export default defineNuxtConfig({
	nitro: {preset: 'node-server', modules: [scriptcNitro({sourceDir: 'server'})]},
});
```

TanStack Start uses Vite environments and Nitro 3's final Node bundle.
`scriptc-promote/tanstack` exports `scriptcTanstack(options)`, which returns Vite
plugins. Put them before `tanstackStart()`, `react()`, and
`nitro({preset: 'node-server'})`. Promotion runs in the `ssr` environment.
A publication plugin records its artifact directory and copies the artifacts
in Nitro's final `writeBundle` hook. Nitro otherwise drops the SSR assets.
Discovery covers top-level functions in `src`, including helpers used by
routes and server functions. The example endpoint calls a `createServerFn`
handler that imports the pure checksum helper. Its home route references the
server function so TanStack registers it in the client function manifest.

```ts
import {scriptcTanstack} from 'scriptc-promote/tanstack';
// In defineConfig:
plugins: [scriptcTanstack(), tanstackStart(), react(), nitro({preset: 'node-server'})]
```

The shared Vite plugin now keeps a separate plugin instance for each environment.
Each instance owns its discovered modules and Rollup asset references. A server
consumer activates promotion without `build.ssr`. Client consumers always skip
it. `configEnvironment` enables `build.emitAssets` for server environments,
including environments with names other than `ssr`. The builder test builds two
server environments with a client build between them.

Runtime resolution requires a complete artifact directory. Nitro can copy the
addon to a hashed asset path without either manifest. A standalone addon at that
path must not prevent the ancestor search from finding the complete published
bundle. The dispatcher, proofs, guards, and byte comparison policy are unchanged.
Optional framework modules resolve in the example application. Neither
integration imports a framework package through a repository-relative path.

## Validation

Validated versions are Nuxt 4.6.3 with Nitro 2.13.5, and TanStack React Start
1.169.4 with React Router 1.170.46, Nitro 3.0.261029-rc, and Vite 8.3.5.
The classic Vite tests also pass with Vite 6.4.5 and 7.3.7. All 95 Next tests pass. The promotion suite passes five tests and skips the two opt-in production cases; each production case passes when run separately by its framework runner.

The production tests build an installed copy of each example, check all three
artifacts, inspect client JavaScript for promotion machinery, relocate the server
output, start local Node servers, and compare response bytes with promotion
on and `SCRIPTC_PROMOTE=0`. State is inspected through example-only endpoints.
The package tests skip these two integration cases when their application paths
are absent. The runners install and execute them explicitly, one framework at a
time, and remove their temporary dependencies and output in `finally`.

```sh
node scripts/check-framework-node.mjs nuxt
node scripts/check-framework-node.mjs tanstack
cd packages/next-scriptc
node --test --test-concurrency=1 test/*.mjs
cd ../scriptc-promote
node --test --test-concurrency=1 test/*.mjs
```

For retained results, set `SCRIPTC_FRAMEWORK_RESULT` to an absolute JSON path.
[Nuxt counters](framework-integrations-nuxt-parity.json) and
[TanStack counters](framework-integrations-tanstack-parity.json) contain no timing
measurements. Both builds remain in shadow with verified native samples.

## External application census

The Nuxt application is
[k0kishima/nuxt3-realworld-example-app at 88148ef](https://github.com/k0kishima/nuxt3-realworld-example-app/tree/88148ef6339be2ee7b396176a4f2eb50047cd563).
The scan covers 11 JS/TS files and accepts zero functions. API helpers refer to
`$fetch`; the date formatter uses `Date`. Vue component bodies are outside the
scanner's supported syntax.

The TanStack application is
[nikolasburk/livestore-tanstack-cloudflare-auth-example at b262983](https://github.com/nikolasburk/livestore-tanstack-cloudflare-auth-example/tree/b2629833e4f2d5aa0beb204886052d02fff6a48a).
The scan covers 21 source files and accepts zero functions. Refusals include
React/JSX, hooks, fetch, and custom resolver closures. Its upstream Cloudflare
configuration is not built or deployed. This is a source census only.

Both checkouts were shallow, outside this repository. Only application-local
TypeScript was supplied; service dependencies were not installed and no probe
was added. Both censuses conservatively disable imported dependency closures
because framework aliases are not proven equivalent to TypeScript resolution.
All candidates reject before boundary type checking. The result measures the
current conservative scanner, not latent eligibility after resolver integration.
[Raw refusals and full commit pins](framework-integrations-census.json) retain
the evidence. No third-party source is committed.

To repeat, shallow-clone each repository outside this checkout, fetch and check
out the exact commit above, and install TypeScript 5.9.3 in each application.
Then run:

```sh
node scripts/framework-census-nitro-tanstack.mjs /absolute/nuxt-app /absolute/tanstack-app
```

The script rejects different commits. Delete external `node_modules` after the
census. No whole-app build or native coverage is claimed for these applications.

## Limits

These integrations target Node on the build host's OS and architecture.
Nuxt component-inline functions, inline server-function callbacks, edge
presets, Nitro 3's non-Vite builders, and TanStack's separate RSC provider
environments remain unvalidated. Eligible top-level helpers can be called from
callbacks, as the TanStack example demonstrates. A static source census can
include functions that never enter the server graph; wrappers are inserted only
when a server build visits the corresponding source module.

The hooks follow the [Nitro module contract](https://github.com/nitrojs/nitro/tree/v2.13.5/src),
[Vite environment API](https://vite.dev/guide/api-environment-plugins), and
[TanStack Node hosting integration](https://tanstack.com/start/latest/docs/framework/react/guide/hosting).
No deployment or hosting-provider call is part of validation.
