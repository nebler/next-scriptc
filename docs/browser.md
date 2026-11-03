# Browser

The opt-in browser lane compiles a selected, promoted synchronous TypeScript
function to a stock scriptc wasm32-wasi reactor. The original import still works
synchronously. Its first call returns JS while a cached promise fetches and
compiles wasm. Later calls use wasm only in explicitly calibrated size buckets.
A missing asset, failed instantiation, trap, or sampled mismatch permanently
selects JS until page reload. No SharedArrayBuffer, COOP, or COEP is required.

Install `@scriptc/runtime-wasm32-wasi@0.4.6` in the consuming app alongside
`scriptc-promote`. The normal stock scriptc toolchain must work on the build host.

## Next client components

Wrap the existing configuration in `next.config.mjs`:

```js
import {withScriptc} from 'next-scriptc';
import {withBrowserWasm} from 'scriptc-promote/browser/next';
export default await withBrowserWasm(withScriptc({}), {
	root: import.meta.dirname,
	sourceDir: 'lib',
	functions: [{
		source: 'lib/forecast.ts', name: 'forecast',
		sizePath: [0, 'trials'], buckets: [9, 13, 16],
		// Add key: '<reported calibration key>' AFTER measuring this source.
	}],
});
```

The build reports each reactor's raw size and calibration key. Without `key`,
the function stays in JS. Measure JS and wasm on representative target browsers
before pinning that key and enabling buckets. A stale key fails the opt-in build.
The key includes the extracted source closure, boundary schema, stock compiler
version, target, ABI, and policy version. Builds do not benchmark the host.

`sizePath` walks the argument tuple, so `[0, 'trials']` selects the first argument's
`trials` field. A bucket is `floor(log2(max(1, size)))`. The example's 1k, 10k and
100k paths occupy buckets 9, 13 and 16. Unlisted buckets and invalid boundaries
stay in JS. The size field is workload-specific; UTF-8 input length would not
distinguish this scalar-boundary workload.

Keep importing the original shared module in the client and route. The wrapper
adds a browser-only Turbopack rule and a client-only webpack rule. Server imports
remain under the normal Node adapter. Reactors are emitted to content-hashed
`public/scriptc/*.wasm` URLs with Next's `basePath`. Ignore those generated assets
in version control and publish them with the client assets. The wrapper also
runs when Next loads the configuration in development.

## Vite client builds

```js
import {defineConfig} from 'vite';
import {scriptcBrowser} from 'scriptc-promote/browser/vite';
export default defineConfig({
	plugins: [scriptcBrowser({
		sourceDir: 'src',
		functions: [{source: 'src/forecast.ts', name: 'forecast',
			sizePath: [0, 'trials'], buckets: [9, 13, 16], key: '<measured key>'}],
	})],
});
```

The plugin emits a Rollup wasm asset and rewrites selected imports in production
client builds. Vite development and SSR stay in JS. It can be used alongside the
existing `scriptcPromote` server plugin. Vite's normal asset URL handling applies.

## Verification and visibility

`browserSnapshot()` from `scriptc-promote/browser` returns aggregate lane,
readiness, verification, mismatch, fallback, and wasm-call counts by function ID.
It contains no arguments or results. The first three successful wasm calls per
calibrated bucket and every 32nd call compare exact canonical results against JS.
A mismatch returns the JS result and disables that function's reactor. Reloading
resets the browser state. Sampling does not prove equivalence for unchecked inputs.

The [shared-native example](../examples/shared-native) shows browser and server
counters independently, with measured call duration and exact output comparison.
The first verified wasm calls execute both implementations and can be slower.

## Limits

This first version requires discovered pure, synchronous, ordinary parameters
and JSON or primitive boundaries. One selected function per source module is
supported. Opaque handles, byte-array boundaries, default/destructured parameters,
and async functions are excluded. Other framework adapters are follow-up work.
The compute-only WASI shim exposes no filesystem and rejects unknown imports.

Wasm executes on the main thread after readiness, like the original JS function.
The async fetch/compilation avoids blocking initial render; it does not turn
heavy synchronous computation into a worker task. CSP must permit wasm compilation
and fetching the emitted URL. Unsupported browsers use JS. Each reactor carries
a runtime and linear memory; compiling many small functions separately is costly.

Local D1 Chromium measurements show 1.5–1.64× warmed speedup, with a 324,844-byte
reactor and about 17 MiB of warmed linear memory. These results justify an opt-in
experiment, not automatic enablement on every device. See [W1 evidence and
reproduction](../research/browser-wasm.md).
