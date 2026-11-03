# Astro quick start

[Pack the packages and configure pnpm](quick-start.md) first. From the repository
root, create the minimal app:

```sh
python3 scripts/install-docs-check.py --prepare astro /tmp/my-astro
cd /tmp/my-astro
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
import {defineConfig} from 'astro/config';
import node from '@astrojs/node';
import scriptcAstro from 'scriptc-promote/astro';
export default defineConfig({output:'server',adapter:node({mode:'standalone'}),integrations:[scriptcAstro()]});
```

Start production output:

```sh
PORT=3197 HOST=127.0.0.1 node dist/server/entry.mjs
```

In another terminal, run `curl http://localhost:3197/compute`. The compute result
contains `328350`. Stop the server before deleting `/tmp/my-astro`.

Use server output and @astrojs/node. Put compute helpers in `.ts` modules. Inline `.astro` bodies are outside discovery.

The fixture lists dependency versions in package.json; some examples use caret ranges. See [how it works](how-it-works.md) before interpreting build summaries as performance results.
