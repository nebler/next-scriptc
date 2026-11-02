# Astro and React Router native promotion

2026-11-02. V3 adds framework entrypoints without changing discovery proofs, compilation, dispatcher policy, or the shared Vite plugin. The production examples pass byte parity and verified native shadow checks. This work makes no timing claim.

## Astro 5 with the Node adapter

`scriptc-promote/astro` exports `scriptcAstro(options)` and a default export. The integration reads Astro's resolved source directory and installs a fresh Vite promotion plugin during `astro:build:setup`, only for the server target with `output: 'server'`. It requires `@astrojs/node`. Development and client builds do not install the plugin.

```js
import {defineConfig} from 'astro/config';
import node from '@astrojs/node';
import scriptcAstro from 'scriptc-promote/astro';
export default defineConfig({
 output: 'server',
 adapter: node({mode: 'standalone'}),
 integrations: [scriptcAstro()],
});
```

The source census includes JS and TS endpoints and modules imported by Astro pages. Inline `.astro` frontmatter is unsupported. Move compute functions into imported JS or TS modules. The census is static and can include unused functions; only modules visited by the SSR graph receive wrappers. Existing purity, initialization, type, and closure checks still apply.

Astro 5.16.6 with `@astrojs/node` 9.5.1 preserves Vite's emitted `scriptc-promotion/{promotion.node,ids.json,encodings.json}` under `dist/server`. No adapter copy hook is needed. The test moves `dist` to another directory before starting `server/entry.mjs`, proving resolution through the emitted URL and ancestor lookup. Custom output paths use Vite's actual server output directory rather than a hardcoded publication path. Middleware mode, static output, other adapters, and Astro 6 or newer have no end-to-end evidence here.

[Astro's integration API](https://v5.docs.astro.build/en/reference/integrations-reference/#astrobuildsetup) documents the server/client build target and Vite configuration hook.

## React Router v7 framework Node builds

`scriptc-promote/react-router` exports `scriptcReactRouter(options)` and a default export. It supplies `sourceDir: 'app'` to the production Vite plugin. Add it before React Router's plugin:

```ts
import {defineConfig} from 'vite';
import {reactRouter} from '@react-router/dev/vite';
import {scriptcReactRouter} from 'scriptc-promote/react-router';
export default defineConfig({plugins: [scriptcReactRouter(), reactRouter()]});
```

Discovery scans loaders, actions, resource routes, and their source modules under `app`. HTTP functions accepting Request or returning Response remain JS; eligible pure compute functions they call receive dispatcher wrappers. Client graph transforms remain disabled even for shared modules used by page components. Set `sourceDir` explicitly when configuring a different `appDirectory` or placing helpers outside `app`. The same option selects Astro's scan root when needed.

React Router 7.9.6 with Vite 7.3.7 preserves all three artifacts under `build/server/scriptc-promotion`. Its Node server consumes that output directly, so a preset or build-end copy hook adds no required behavior. The test relocates `build` before invoking `@react-router/serve`. This supports classic SSR builds. Experimental Vite environment builds, server bundle splitting, edge targets, and arbitrary repackaging require separate validation. Framework config options are documented in [React Router's config reference](https://reactrouter.com/7.9.6/api/framework-conventions/react-router.config.ts).

## Production correctness evidence

`examples/astro-demo` and `examples/react-router-demo` each contain a pure scalar checksum endpoint. Astro also imports the helper from page frontmatter and a browser script. React Router imports it from a resource loader/action and from both the loader and component of a page route. These examples exercise shared server/client modules.

`packages/scriptc-promote/test/frameworks-astro-react-router.mjs` copies one example at a time outside the checkout, installs its pinned framework dependencies, builds production output, and moves the output directory. It checks all three server artifacts and scans client JavaScript for native runtime code. It then starts local Node servers sequentially with `SCRIPTC_PROMOTE=0` and `1`. Each server handles 120 compute requests over six scalar inputs. React Router alternates GET loaders and POST actions. Both framework pages also return HTTP 200.

All 120 response bodies per framework are byte-identical across modes. Disabled servers create no dispatchers. Enabled servers reach `shadow` with six verified samples and zero function or bucket fallbacks. No native foreground serving is claimed. Test-only IPC reads the existing dispatcher registry; the examples expose no inspection HTTP endpoint. [Astro evidence](framework-astro-parity.json) and [React Router evidence](framework-react-router-parity.json) retain counts and transitions without timing samples.

## External source censuses

The pinned MIT applications stay outside the repository. No external compute probe is added and no third-party source is committed. These are source censuses, not production build or native parity claims about the upstream applications.

React Router's [cjfff/realworld-remix at 59cf71947386f4ffac13f95b5f0ef47237e36c4a](https://github.com/cjfff/realworld-remix/tree/59cf71947386f4ffac13f95b5f0ef47237e36c4a) scans 52 JS/TS source files under `app` and accepts zero functions. Most loaders/actions perform asynchronous network work. React components and hooks fail JSX, opaque dependency, or initialization checks. [Full diagnostics](framework-react-router-census.json) preserve the negative result.

Astro's [satnaing/astro-paper at 25d25437cf85b5df77c26b094ccc7035c6adddad](https://github.com/satnaing/astro-paper/tree/25d25437cf85b5df77c26b094ccc7035c6adddad), tag `v5.5.1`, scans 19 JS/TS source files and accepts zero functions. Content-dependent helpers, imported renderers, and module initialization fail existing checks. This upstream blog uses static output; its census tests source discovery only. It does not establish real-app Node SSR promotion. [Full diagnostics](framework-astro-census.json) retain the refusals. The Node SSR evidence comes from the separate example above.

Both census runs install each application's dependencies with lifecycle scripts disabled and use its original tsconfig. TypeScript resolves from that app. Dependencies and generated output are removed after each census. An initial attempt to install AstroPaper's newer main branch failed during disk exhaustion; it produced no retained census. The retained pin matches Astro 5.

## Reproduction and validation

Run the package suites serially with Node 24 or newer:

```sh
cd packages/next-scriptc
node --test --test-concurrency=1 test/*.mjs
cd ../scriptc-promote
SCRIPTC_FRAMEWORK_EVIDENCE=1 ASTRO_TELEMETRY_DISABLED=1 node --test --test-concurrency=1 test/*.mjs
```

The framework tests require npm registry access and the installed scriptc toolchain and Node headers. They install only one framework fixture at a time and remove it in `finally`. Example framework and Vite versions are pinned in each package manifest. Initial validation found missing executable bits on installed scriptc TypeScript executables; repairing those dependency files allowed compilation without compiler source changes. The React Router example declares `isbot` to avoid a framework-triggered install during its build.

To repeat a census, shallow-clone the linked commit outside this repository, install that application's dependencies, and run from this checkout:

```sh
node scripts/framework-astro-react-router-census.mjs astro /external/astro-paper
node scripts/framework-astro-react-router-census.mjs react-router /external/realworld-remix
```

The runner checks each exact commit before discovery and writes the corresponding research JSON. Remove external `node_modules` and generated output before installing the next framework. No deployment, hosting-provider request, Docker operation, Papermark use, or scriptc fork change is part of this validation.

Final validation passes all 95 `packages/next-scriptc` tests and all five `packages/scriptc-promote` tests, with no skips. The promotion suite includes both production framework checks and the existing Vite 6.4.5 and 7.3.7 checks. Shared dependency files were reused through a temporary local symlink after disk exhaustion; that symlink is removed before commit. No dependency installation or native build output is committed.
