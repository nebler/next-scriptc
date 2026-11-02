# Native promotion in Vite server builds

2026-11-02. V1 implements Node SSR promotion in `scriptc-promote`. Next's automatic promotion uses the same core through compatibility exports. Vite 6.4.5 and 7.3.7 pass production build and runtime tests. Dev mode skips promotion.

## Shared machinery and framework integration

`packages/scriptc-promote/src/functions` owns extraction, discovery, dependency closure and module initialization checks, strict closure checking, call-site specialization, construction proofs, boundary schemas, encodings, compilation, the N-API addon, dispatch policy, and crash leases. Fuzz sources and the differential runner live in its `test/support` directory.

The core declares Babel parser, traverse, generator, and types as regular dependencies. It has no Next dependency. Optional TypeScript resolves from the application or caller's working directory. `SCRIPTC_COMPILER` remains an absolute executable override. The compiler source and fork are unchanged.

The old Next module paths re-export the core. Next retains its webpack/Turbopack configuration, cache publication, tracing, server hooks, and explicit native route/sidecar integration. Compatibility copies of `json.ts`, generated `json.mjs`, and the C addon template remain at their old paths for consumers that read those files. Core compilation reads its own assets. Existing log prefixes and dispatch policy remain unchanged.

This avoids rewriting proof internals while another branch changes host build integration. Changes to a moved implementation belong in the core; the old file remains an export shim.

## Configure Vite

Add the plugin before the framework plugin:

```js
import {scriptcPromote} from 'scriptc-promote/vite';
export default {plugins: [scriptcPromote(), frameworkPlugin()]};
```

The plugin defaults to `sourceDir: 'src'` and `tsconfig: 'tsconfig.json'`. JavaScript apps can select `tsconfig: 'jsconfig.json'`. `report` receives census and refusal messages. `build` forwards the core's target, headers, runtime pack, encoding, and construction-result options. Compilation requires the existing scriptc toolchain and Node headers.

The plugin applies only during builds. It requires `build.ssr` and rejects `ssr.target: 'webworker'`. Each transform additionally requires `options.ssr === true` and rejects a client environment. Client builds neither discover nor compile candidates. A shared source file can receive a wrapper in the SSR graph while its client copy remains ordinary JS.

Discovery scans JS/TS source files under the selected directory. This is a static census, not a reachability census: it can compile eligible functions that the server never imports. Svelte and Vue component bodies are not scanned. Wrappers are inserted only into modules visited by the server build. Source hashes and closure hashes reject stale discovery results. Functions from the same file are grouped before rewriting, preserving their original offsets and parameter semantics.

Vite aliases outside its own internal aliases conservatively disable imported dependency closures. Scalar closures without runtime imports can still qualify. This prevents TypeScript resolution from proving a different dependency than Vite will execute. Framework-specific alias equivalence needs a separate proof.

## Publish runtime artifacts

The builder compiles in a temporary directory and removes it after emitting `promotion.node`, `ids.json`, and `encodings.json` as Rollup assets under `scriptc-promotion/`. The plugin enables `ssrEmitAssets`, which Vite disables by default for SSR builds. The runtime uses Rollup's artifact URL and `import.meta.url`; it embeds no checkout path for the addon. It also searches up to eight module ancestors for adapters that rebundle chunks.

Use `SCRIPTC_PROMOTE=0` to bypass promotion at runtime. Otherwise the unchanged dispatcher begins in JS, shadows native output, verifies canonical bytes, and evaluates its existing policy per size bucket. A verified shadow does not imply that policy selected native execution. Missing artifacts retain JS fallback. Crash leases cover addon initialization and owner-thread calls.

For SvelteKit with adapter-node, compose the adapter in `svelte.config.js`:

```js
import adapter from '@sveltejs/adapter-node';
import {scriptcAdapter} from 'scriptc-promote/sveltekit';
export default {kit: {adapter: scriptcAdapter(adapter())}};
```

Adapter-node rebundles JS and drops arbitrary Vite assets. The wrapper copies the three artifacts after adaptation into `build/server/scriptc-promotion`. If adapter-node uses a different `out`, pass the same value to `scriptcAdapter(adapter({out}), {out})`. The wrapper is specifically for this Node output layout. Merely adding the Vite plugin is insufficient for adapters that discard assets.

For inspection, `globalThis[Symbol.for('scriptc-promote.dispatchers')]` maps loaded addon paths to dispatchers. Their `snapshot()` method reports bucket states and verification counts. This registry is server-local and creates no HTTP endpoint.

## Framework coverage and gaps

| Framework | Current evidence and remaining integration |
| --- | --- |
| SvelteKit | Real production build and `node build` tested with adapter-node and the adapter wrapper. Inline `.svelte` functions, non-Node adapters, and custom adapter layouts remain unsupported. |
| Nuxt / Nitro | A Node Vite SSR graph can use the plugin. Nitro separately builds API handlers and packages its output; those handlers need a Nitro discovery/transform and artifact-copy hook. Full Nuxt server promotion is unvalidated. |
| Astro | `scriptc-promote/astro` installs promotion in Astro 5 server builds with `@astrojs/node`. Production standalone server, endpoint and page-imported helper, client isolation, relocated artifacts, and verified shadows pass. Inline `.astro` frontmatter, static builds, non-Node adapters, and Astro 6+ remain unsupported or unvalidated. |
| React Router | `scriptc-promote/react-router` scans `app` in v7 classic framework Node builds. Production resource loader/action and page-loader helper pass with relocated server artifacts and isolated client output. Custom `appDirectory` needs `sourceDir`; experimental environment builds and non-Node targets remain unvalidated. |
| TanStack Start | Builds that use only the new multi-environment builder without `build.ssr` are skipped. Per-environment state, server-function graph selection, and final output publication need integration. |

V1 uses the classic Vite SSR build contract. Concurrent builds across multiple environments in one plugin instance are outside its supported contract. Native addons require a Node host and a matching OS/architecture; wasm and edge hosts are separate work.

The Vite SSR transform signal is documented in [Vite's SSR guide](https://vite.dev/guide/ssr), and the broader environment distinction is documented in [Vite's per-environment API changes](https://vite.dev/changes/per-environment-apis).

## Real application evidence

The external MIT application is [sveltejs/realworld at df796708040f5200ec572b28ab7f88ecee5794dd](https://github.com/sveltejs/realworld/tree/df796708040f5200ec572b28ab7f88ecee5794dd). Its source stays outside this repository at `/Users/noah/code/scriptc-vite-realworld`. No third-party source is committed.

The upstream census scans 16 JS/TS files and accepts **zero** functions. Most server work forwards API requests asynchronously. The sync wrappers close over fetch; other functions fail work or module initialization checks. This is a negative result for existing application coverage.

A clearly identified local integration probe adds our own scalar checksum helper and endpoint. Discovery accepts one function, and the production build compiles one function. Adapter-node publishes all three artifacts. Two local `node build` processes, with promotion enabled and disabled, return byte-identical bodies for 120 requests over six input sizes. The enabled process reaches `shadow` with six verified samples and zero fallbacks. It does not reach the native serving lane during this check. No timing conclusion is drawn.

Installed application versions are Vite 7.3.7, SvelteKit 2.70.3, Svelte 5.57.3, adapter-node 5.5.7, and TypeScript 5.9.3. [Census diagnostics](vite-plugin-census.json) and [HTTP parity and state results](vite-plugin-parity.json) retain the evidence. This proves adapter integration in a real application with an added workload; it does not prove promotion of an existing upstream compute endpoint.

## Reproduce validation

Install workspace dependencies with pnpm. Allow scriptc's installation script so its native compiler and toolchain metadata are present. Run these commands serially:

```sh
cd packages/next-scriptc
node --test --test-concurrency=1 test/*.mjs
cd ../scriptc-promote
node --test --test-concurrency=1 test/*.mjs
cd ../next-scriptc
PROMOTION_FUZZ_CASES=5000 PROMOTION_FUZZ_SEED=20935 node ../../scripts/promotion-fuzz.mjs
```

All 91 existing Next tests pass. The three plugin tests pass on both installed Vite majors. Seed 20935 passes 85,000 inputs and 170,000 differential comparisons across 17 candidates; [fuzz counters](vite-plugin-fuzz.json) retain the result. The example also completes a production adapter-node build. Both packages pack successfully with the workspace dependency converted to version `0.0.0`. The packed-install runner now packs and installs both packages; its full multi-build check was not rerun.

The plugin tests perform actual client and SSR builds with both installed Vite majors. They exercise multiple rewrites in one module, artifact relocation, native loading, byte parity, verified shadows, and disabled dev/webworker hooks.

To repeat the application probe, shallow-clone the pinned RealWorld commit outside this repository. Replace its Vercel adapter with adapter-node; add the Vite plugin and adapter wrapper using this checkout's core entrypoints. Install dependencies with Node 24 or newer, then run:

```sh
node scripts/vite-real-app-check.mjs /absolute/path/to/realworld
```

The runner checks the commit, records the upstream census before adding the probe, builds production output, starts two local Node servers, compares bytes, and records verification state. It leaves the external probe and build available for inspection. Remove the external app's `node_modules` after validation to reclaim disk space. `examples/vite-demo` provides the same small checksum workload without third-party source.

Astro and React Router configuration, pinned external censuses, production parity evidence, and reproduction are in [framework integrations](framework-integrations-astro-react-router.md).
