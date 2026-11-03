# Vite SSR quick start

[Pack the packages and configure pnpm](quick-start.md) first. From the repository
root, create the minimal app:

```sh
python3 scripts/install-docs-check.py --prepare vite /tmp/my-vite
cd /tmp/my-vite
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
import {scriptcPromote} from 'scriptc-promote/vite';
export default {plugins:[scriptcPromote()]};
```

Call the production module:

```sh
node --input-type=module -e "const m=await import('./dist/entry.js'); console.log(m.checksum(100))"
```

The result is `328350`. Vite client builds and dev do not promote code.
Use `vite build --ssr src/entry.ts` for this Node SSR fixture.

The fixture lists dependency versions in package.json; some examples use caret ranges. See [how it works](how-it-works.md) before interpreting build summaries as performance results.
