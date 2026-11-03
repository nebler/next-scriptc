# Next.js quick start

[Pack the packages and configure pnpm](quick-start.md) first. From the repository
root, create the minimal app:

```sh
python3 scripts/install-docs-check.py --prepare next /tmp/my-next
cd /tmp/my-next
```

Add the pnpm-workspace.yaml from the shared guide. Replace any `workspace:*`
core dependency with the packed tarball path. Then run:

```sh
pnpm install
pnpm rebuild scriptc
pnpm exec next-scriptc doctor .
pnpm build
```

The adapter configuration is:

```js
import {withScriptc} from 'next-scriptc';
export default withScriptc({});
```

Start production output:

```sh
pnpm exec next start -p 3197
```

In another terminal, run `curl http://localhost:3197/api/compute`. The compute result
contains `328350`. Stop the server before deleting `/tmp/my-next`.

The fixture lists dependency versions in package.json; some examples use caret ranges. See [how it works](how-it-works.md) before interpreting build summaries as performance results.
