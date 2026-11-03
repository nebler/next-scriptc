# SvelteKit quick start

[Pack the packages and configure pnpm](quick-start.md) first. From the repository
root, create the minimal app:

```sh
python3 scripts/install-docs-check.py --prepare sveltekit /tmp/my-sveltekit
cd /tmp/my-sveltekit
```

Add the pnpm-workspace.yaml from the shared guide. Replace any `workspace:*`
core dependency with the packed tarball path. Then run:

```sh
pnpm install
pnpm rebuild scriptc
pnpm exec svelte-kit sync
pnpm exec scriptc-promote doctor .
pnpm build
```

The adapter configuration is:

```js
import {sveltekit} from '@sveltejs/kit/vite';
import {scriptcPromote} from 'scriptc-promote/vite';
export default {plugins:[scriptcPromote(),sveltekit()]};
```

Start production output:

```sh
PORT=3197 node build
```

In another terminal, run `curl http://localhost:3197/?n=100`. The compute result
contains `328350`. Stop the server before deleting `/tmp/my-sveltekit`.

Also configure `svelte.config.js` to copy the native artifacts:

```js
import adapter from '@sveltejs/adapter-node';
import {scriptcAdapter} from 'scriptc-promote/sveltekit';
export default {kit:{adapter:scriptcAdapter(adapter())}};
```

The fixture lists dependency versions in package.json; some examples use caret ranges. See [how it works](how-it-works.md) before interpreting build summaries as performance results.
