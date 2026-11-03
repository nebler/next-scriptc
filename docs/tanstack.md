# TanStack Start quick start

[Pack the packages and configure pnpm](quick-start.md) first. From the repository
root, create the minimal app:

```sh
python3 scripts/install-docs-check.py --prepare tanstack /tmp/my-tanstack
cd /tmp/my-tanstack
```

Add the pnpm-workspace.yaml from the shared guide. Replace any `workspace:*`
core dependency with the packed tarball path. Then run:

```sh
pnpm install
pnpm rebuild scriptc
pnpm exec scriptc-promote doctor .
pnpm build
```

The adapter configuration is:

```js
import {defineConfig} from 'vite';
import {tanstackStart} from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import {nitro} from 'nitro/vite';
import {scriptcTanstack} from 'scriptc-promote/tanstack';
export default defineConfig({plugins:[scriptcTanstack(),tanstackStart(),react(),nitro({preset:'node-server'})]});
```

Start production output:

```sh
PORT=3197 node .output/server/index.mjs
```

In another terminal, run `curl http://localhost:3197/api/compute?n=100`. The compute result
contains `328350`. Stop the server before deleting `/tmp/my-tanstack`.

This recipe uses Nitro 3's Node builder. The adapter copies artifacts after Nitro bundles the server.

The fixture lists dependency versions in package.json; some examples use caret ranges. See [how it works](how-it-works.md) before interpreting build summaries as performance results.
