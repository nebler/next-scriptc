# Get a working local setup

These packages are experimental, version 0.0.0, and unpublished. Use a local
repository snapshot and packed tarballs. These instructions do not publish anything.
Use Node 24 or later, pnpm 11, macOS or Linux, and keep optional dependencies enabled.
On macOS install Xcode Command Line Tools with `xcode-select --install`.
On Debian or Ubuntu run `sudo apt-get install clang build-essential`.

From the repository root, pack both packages:

```sh
mkdir -p /tmp/p4-packs
pnpm --dir packages/scriptc-promote pack --pack-destination /tmp/p4-packs
pnpm --dir packages/next-scriptc pack --pack-destination /tmp/p4-packs
```

Choose a recipe. Each creates a minimal app under `/tmp`, independently installs
its dependencies, builds production output, and calls a compute helper:

- [Next.js](next.md)
- [Vite SSR](vite.md)
- [SvelteKit](sveltekit.md)
- [Nitro and Nuxt](nitro.md)
- [Astro](astro.md)
- [React Router](react-router.md)
- [TanStack Start](tanstack.md)
- [Cloudflare target, local wasm build](cloudflare.md)

The local fixture generator `python3 scripts/install-docs-check.py --prepare NAME
/tmp/my-app` runs from the repository root and only writes the app sources.
It uses the repository examples for established framework setups and small new
fixtures for Next, Vite SSR, and Nitro. Python 3 is needed for this fixture generator,
not for the adapter itself. For an existing app, install the packed core with
`pnpm add /tmp/p4-packs/scriptc-promote-0.0.0.tgz`, then apply the recipe's config.

In each new app, create `pnpm-workspace.yaml` before installing:

```yaml
overrides:
  scriptc-promote: file:/tmp/p4-packs/scriptc-promote-0.0.0.tgz
allowBuilds:
  scriptc: true
  esbuild: true
  sharp: true
```

Approve only dependencies you trust. `allowBuilds` is pnpm 11 syntax. For an
existing install, run `pnpm approve-builds scriptc` and `pnpm rebuild scriptc`.
A rebuild without approval can exit successfully without running postinstall.
The override resolves the Next wrapper's unpublished core dependency to your tarball.
Replace `workspace:*` for `scriptc-promote` in a copied example's package.json
with `file:/tmp/p4-packs/scriptc-promote-0.0.0.tgz` before installation.

Run `pnpm exec scriptc-promote doctor .` or `pnpm exec next-scriptc doctor .`.
Every failed check prints a repair. `--json` prints structured results to stdout
and returns status 1 on failures. `--cross` also checks for Zig. Doctor does not
modify permissions, run install scripts, or execute framework config files.
Its config check is textual, so aliased imports and indirect configs may need
manual inspection. It infers completed postinstall from the installed manifest;
it cannot prove the package manager's current approval policy.

Development serves JS. Build and start production output to test native code.
A successful build proves compilation, not that native wins. Use
[report, fuzz, and runtime capture](../packages/scriptc-promote/README.md).
[How it works](how-it-works.md) explains the limits and evidence.

For other package managers, the local install probes observed:
npm 11.19.1 ran postinstall; Bun 1.2.5 required `bun pm trust scriptc`.
Yarn 4.18.1 worked with `nodeLinker: node-modules` and `enableScripts: true`
in `.yarnrc.yml`, followed by `yarn install` and `yarn rebuild scriptc`.
These are machine-specific observations. Full adapter recipes were tested with
pnpm only. See [install evidence and limits](../research/install-and-docs.md).
