# Cloudflare target quick start

This recipe builds a Next app and a wasm reactor locally. It requires no account,
login, Wrangler command, or deployment. It does not verify OpenNext packaging or
execution on a hosted Worker.

[Pack the packages and configure pnpm](quick-start.md) first. From the repository root:

```sh
python3 scripts/install-docs-check.py --prepare cloudflare /tmp/my-cloudflare
cd /tmp/my-cloudflare
```

Add the shared guide's pnpm-workspace.yaml, then run:

```sh
pnpm install
pnpm rebuild scriptc
pnpm exec next-scriptc doctor .
pnpm build
```

The fixture installs `@scriptc/runtime-wasm32-wasi@0.4.6` directly. Its Next config is:

```js
import {withScriptc} from 'next-scriptc';
export default withScriptc({}, {
	target: 'cloudflare',
	cloudflare: {entry: 'compute.ts'},
});
```

`compute.ts` exports a synchronous `run(input: string): string` JSON facade.
The fixture parses a numeric loop count and returns the JSON checksum.
Expect `.scriptc/cloudflare/compute.wasm` and `worker.mjs`. The generated worker
expects `.open-next/worker.js`; `next build` alone does not produce that file.

Cloudflare uses static verified wasm dispatch, defaults to JS, and rejects
`nativePromotion: 'auto'`. The Node adapters' adaptive CPU policy does not apply.
The runtime requires explicit `wasm` lane selection and retains JS fallback.
The repository's local wasm semantics tests exercise the bridge; this recipe
only establishes local artifact generation. See [how it works](how-it-works.md).
