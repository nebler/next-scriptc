# P4 installation and adapter documentation

2026-11-03, macOS arm64, Node 24.22.0. This round adds read-only doctor diagnostics,
new user guides, and packed-consumer checks. It establishes local setup and output
correctness, not application speedups or runtime lane convergence.

## Helper permission finding

The published `@scriptc/cli-darwin-arm64@0.4.6` tarball contains these files with
mode 0644, confirmed with `npm pack --ignore-scripts` and `tar -tvzf`:

```text
-rw-r--r-- package/dist/lib/scriptc-comptime
-rw-r--r-- package/dist/lib/typescript/lib/tsc
-rw-r--r-- package/dist/lib/tsc-ts/lib/tsc-ts
```

The published scriptc installer explains that npm normalizes modes outside bin
entries. Its postinstall chmods these helpers and the LLVM codegen helper, copies
the compiler payload over the 107-byte placeholder, and relocates the toolchain
manifest. Blocking postinstall prevents these repairs. This is both a packaging
mode issue and a build-script approval dependency, not evidence that our adapter
tarballs lose modes.

A fresh external consumer under `/tmp/p4-install-probes` installed stock scriptc
with each available package manager. Separate `/tmp/p4-repairs` consumers tested
repairs. Apps were deleted after each check. Observations:

| Manager | Initial behavior on this machine | Tested working repair |
|---|---|---|
| pnpm 11.1.3 | Blocked postinstall; compiler stayed 107 bytes; no manifest. Plain `pnpm rebuild scriptc` exited 0 and did nothing. | `pnpm approve-builds scriptc`, then `pnpm rebuild scriptc`. Manifest exists, compiler 72,661,080 bytes, checker 0755. |
| npm 11.19.1 | Ran postinstall and installed executable helpers. Warned about allowScripts review. | No repair needed in this run. |
| Yarn 4.18.1 | Inherited settings disabled scripts and used PnP. Bare `node` could not resolve scriptc, so that probe does not establish installed helper modes. | `.yarnrc.yml` with `nodeLinker: node-modules` and `enableScripts: true`, followed by `yarn install` and `yarn rebuild scriptc`. Compiler and checker repaired. |
| Bun 1.2.5 | Blocked one postinstall; compiler stayed 107 bytes; no manifest. | `bun pm trust scriptc`. Compiler and checker repaired. |

These observations depend on versions and local policy. They are not universal
package-manager defaults. An attempted `pnpm --allow-build=scriptc rebuild scriptc`
failed with unknown option; it is not a supported repair command.

No automatic chmod was added. The known helpers resolve into separate
`@scriptc/cli-*` and `@scriptc/llvm-*` packages, outside the scriptc package directory.
Repairing them would violate the requested scope, and package-store links make
permission mutations less isolated than they look. NSC2001 now points to doctor
and retains its exact repair command. Doctor never executes postinstall or chmod.

## Doctor design and limits

Both `scriptc-promote doctor [dir]` and `next-scriptc doctor [dir]` use the shared
core implementation. `--json` prints schema version 1 to stdout. Failed checks
return status 1. Each failure has a stable check ID, explanation, and repair.
The command checks Node >=24, package root, framework dependencies, adapter call
text in config, Svelte artifact copying, scriptc 0.4.6, completed postinstall
manifest, compiler and known helper execute access, macOS/Linux host, Clang and ar
on PATH, application TypeScript and tsconfig resolution, and writable cache/temp
ancestors with at least 256 MiB free. `--cross` additionally checks Zig.

Approval is inferred from postinstall artifacts, not from a package-manager API.
A stale policy can disagree with those artifacts. Config files are never executed;
aliases, commented calls, and indirect config composition can fool the textual
check. PATH presence does not prove that a full SDK, target sysroot, Node headers,
or every cross compiler is usable. Doctor is a preflight, not a native build.
It does not create cache directories. The 256 MiB floor is diagnostic, not a
promise that large builds fit. Windows support is not claimed for these adapters.

Tests simulate old Node, missing compiler package, missing tools, missing adapter,
missing TypeScript, broken cache ancestry, a nonexecutable checker, missing
postinstall manifest, and missing Zig. They check JSON failure status, read-only
behavior, config nonexecution, and Next CLI delegation.

## Packed adapter checks

Both worktree packages were packed to `/tmp/p4-packs`, never published.
`scripts/install-docs-check.py` creates independent minimal apps under
`/tmp/scriptc-p4-docs`, installs the tarballs, runs doctor, builds production
output, tests its result, stops its server, and deletes the app before the next.
No installed dependency links to the main checkout. The consumer pnpm store is
`/tmp/p4-consumer-store`. The worktree install used `/tmp/p4-store`.

The same script's `--prepare NAME /tmp/my-app` mode creates the sources used by
the quick starts. Existing examples supply SvelteKit, Nuxt, Astro, React Router,
and TanStack files. Next, Vite SSR, and Nitro use minimal fixtures. These are
minimal setups, not claims about independently tested official scaffolders.

For each app, the successful sequence is:

```sh
pnpm install --store-dir /tmp/p4-consumer-store
pnpm rebuild scriptc
# SvelteKit only: pnpm exec svelte-kit sync
pnpm exec scriptc-promote doctor .  # next-scriptc for Next and Cloudflare
pnpm build
```

Before installation the app has `allowBuilds: {scriptc: true, esbuild: true,
sharp: true}` in pnpm-workspace.yaml and an override of scriptc-promote to the
packed tarball. This avoids the unapproved-install failure above. The docs use
`pnpm install` with the reader's normal store; store isolation is the test-only
extra argument. The Next tarball's core dependency resolves through the override.

The first pass caught and corrected four details:

- SvelteKit needs `svelte-kit sync` before doctor reads its generated tsconfig.
- The minimal Nitro app needs `srcDir: 'server'` to discover its HTTP route.
- Nuxt externalized a transitive runtime-snapshot import from the packed core.
  The Nitro adapter now inlines its runtime source directory.
- Turbopack rewrote a dynamic createRequire addon load and served JS fallback.
  The runtime now obtains Node's native loader through `process.getBuiltinModule`.
  Final consumer checks reject a `promotion unavailable` message.

SvelteKit, Nuxt, and TanStack compute endpoints default to 1,000 iterations;
the documented checks use `?n=100` to compare the same expected result, 328350.

One repeated Astro run encountered a preexisting shared crash-guard lease from
an identical native artifact in another local run. The JS result remained correct,
but the strict consumer check rejected the fallback. Final isolated checks put
`NEXT_SCRIPTC_CRASH_DIR` inside each temporary app. This isolates test state and
does not reset or change the production crash policy. A shared default crash
directory can affect identical artifacts across apps; that remains friction.

| Setup | Versions exercised | Production check |
|---|---|---|
| Next | Next 16.4.3, React 19.3.0 | `next start -p 3197`; GET `/api/compute` returns 328350 without addon-load fallback |
| Vite SSR | Vite 7.3.7 | Import `dist/entry.js`; checksum(100) is 328350; one native candidate compiled |
| SvelteKit | Kit 2.70.3, adapter-node 5.5.7, Svelte 5.57.3, Vite 7.3.7 | `PORT=3197 node build`; GET `/?n=100` returns checksum 328350 |
| Nitro | nitropack 2.13.5 | `node .output/server/index.mjs`; GET `/compute` returns 328350 |
| Nuxt | Nuxt 4.6.3 | `node .output/server/index.mjs`; GET `/api/compute?n=100` returns checksum 328350 |
| Astro | Astro 5.16.6, @astrojs/node 9.5.1 | `node dist/server/entry.mjs`; GET `/compute` returns checksum 328350 |
| React Router | React Router 7.9.6, React 19.2.0, Vite 7.3.7 | `react-router-serve build/server/index.js`; GET `/compute` returns checksum 328350 |
| TanStack | Start 1.169.4, Router 1.170.46, Nitro 3.0.261029-rc, Vite 8.3.5 | `node .output/server/index.mjs`; GET `/api/compute?n=100` returns checksum 328350 |
| Cloudflare target | Next 16.4.3, runtime-wasm32-wasi 0.4.6 | Local `next build` emits compute.wasm and worker.mjs; hosted execution and OpenNext packaging untested |

All consumers use TypeScript 5.9.3 and stock scriptc 0.4.6. Example dependencies
with caret ranges resolved as listed here; recipes do not promise those ranges
remain pinned. The fixture generator retains each example's package.json dependency ranges.

Abridged captured doctor output from the successful packed Vite consumer:

```text
PASS node: Node 24.22.0; requires >=24
PASS framework: vite
PASS adapter: vite.config: expected scriptcPromote() (static check only)
PASS scriptc: scriptc 0.4.6
PASS approved-build: Postinstall toolchain manifest exists; approval inferred from installed artifacts
PASS tool-clang: clang on PATH
PASS tool-ar: ar on PATH
```

## Validation and remaining friction

With Node 24.22.0 first on PATH:

```text
pnpm --dir packages/next-scriptc test
102 tests; 102 passed; 0 failed
pnpm --dir packages/scriptc-promote test
70 tests; 68 passed; 0 failed; 2 existing skips
```

The suites cover native compilation, runtime behavior, framework integrations,
and simulated doctor failures. The final consumer runner also rejects an addon
fallback log and checks compiled build summaries for Node adapters. One request
per server is a correctness check, not evidence of native lane selection.

The new docs comprise the shared quick start, eight adapter guides, and the
how-it-works explanation. Package READMEs link to them. Naming options are recorded
separately without renaming packages. This is not zero-step installation: users
still need a host toolchain and package-manager script approval. The recipes use
local tarballs because packages remain unpublished. Other operating systems,
package-manager adapter combinations, official scaffolders, hosted Workers,
OpenNext output, and arbitrary custom configs remain unverified.

No deployment, account call, Docker, publication, push, PR, issue, public post,
secret, main-checkout edit, protected compiler-tree access, discovery edit, or
root README edit is part of this work.
