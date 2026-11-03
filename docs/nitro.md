# Nitro and Nuxt quick start

[Pack the packages and configure pnpm](quick-start.md) first. From the repository root:

```sh
python3 scripts/install-docs-check.py --prepare nitro /tmp/my-nitro
cd /tmp/my-nitro
```

Add the shared guide's pnpm-workspace.yaml, then run:

```sh
pnpm install
pnpm rebuild scriptc
pnpm exec scriptc-promote doctor .
pnpm build
PORT=3197 node .output/server/index.mjs
```

Run `curl http://localhost:3197/compute` in another terminal. Expect `328350`.
The Nitro 2 configuration is:

```ts
import {defineNitroConfig} from 'nitropack/config';
import {scriptcNitro} from 'scriptc-promote/nitro';
export default defineNitroConfig({
	srcDir: 'server',
	preset: 'node-server',
	modules: [scriptcNitro({sourceDir: 'server'})],
});
```

For Nuxt, create the separate fixture with
`python3 scripts/install-docs-check.py --prepare nuxt /tmp/my-nuxt` from the
repository root. Replace its workspace dependency and add pnpm-workspace.yaml
as described in the shared guide. Use the same install, doctor, build, and start
commands. Call `/api/compute?n=100` instead. Its configuration is:

```ts
import {scriptcNitro} from 'scriptc-promote/nitro';
export default defineNuxtConfig({
	nitro: {preset: 'node-server', modules: [scriptcNitro({sourceDir: 'server'})]},
});
```

The adapter supports the node-server preset and skips dev. Keep pure compute in
ordinary modules imported by handlers. Stop each server and delete its temporary
app before moving on. Compilation does not prove a runtime speedup.
