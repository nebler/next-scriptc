# React Router quick start

[Pack the packages and configure pnpm](quick-start.md) first. From the repository
root, create the minimal app:

```sh
python3 scripts/install-docs-check.py --prepare react-router /tmp/my-react-router
cd /tmp/my-react-router
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
import {reactRouter} from '@react-router/dev/vite';
import {scriptcReactRouter} from 'scriptc-promote/react-router';
export default defineConfig({plugins:[scriptcReactRouter(),reactRouter()]});
```

Start production output:

```sh
PORT=3197 pnpm exec react-router-serve build/server/index.js
```

In another terminal, run `curl http://localhost:3197/compute`. The compute result
contains `328350`. Stop the server before deleting `/tmp/my-react-router`.

Place scriptcReactRouter() before reactRouter(). This recipe uses the classic Node server build.

The fixture lists dependency versions in package.json; some examples use caret ranges. See [how it works](how-it-works.md) before interpreting build summaries as performance results.
