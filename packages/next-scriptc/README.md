# next-scriptc

An experimental Next.js adapter that compiles App Router `route.native.ts`
handlers and `"use native"` functions to native executables with scriptc, without
a Next.js fork. Development runs the original TypeScript on Node.

Requires macOS or Linux and Node 24. This workspace uses Next 16.4.3 and pins
scriptc 0.4.6; the package is currently version `0.0.0` and is not on npm.
Use pnpm 11.1.3 in your Next 16.4.3 TypeScript app:

```sh
pnpm add "github:nebler/next-scriptc#path:/packages/next-scriptc"
pnpm approve-builds scriptc
pnpm rebuild scriptc
```

Keep optional dependencies enabled and commit the lockfile to retain the Git
revision. A packed copy was tested outside the workspace: strict TypeScript,
`next.config.ts`, `next build`, `next start`, a native hello response and function
prerendering. The public entry ships JavaScript and TypeScript declarations; no consumer-side
transpilation setup is required. `withScriptc` enables Next dependency transpilation
for the function client automatically. A native linker is required, plus
scriptc's bundled checker/LLVM/runtime helpers. See the
[compiler installation notes](https://github.com/nebler/next-scriptc/blob/main/examples/demo/README.md#compiler-installation)
if helper permissions need repair.

```ts
// next.config.ts
import { withScriptc } from "next-scriptc";
export default withScriptc({});
```

```ts
// app/api/hello/route.native.ts
export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name") ?? "world";
  return Response.json({ message: `Hello, ${name}` });
}
```

```ts
// lib/totals.ts
export async function total(values: number[]): Promise<number> {
  "use native";
  return values.reduce((sum, value) => sum + value, 0);
}
```

Call marked functions from server code with their original TypeScript signatures.
Production arguments and results must be strict JSON data. Optional/undefined
slots, classes, functions, cycles, sparse arrays and non-finite numbers are
unsupported. Use required nullable fields. The process boundary does not carry
Next request context, caches or shared Node state, and small calls can lose to
transport/serialization overhead.

```sh
pnpm exec next dev
pnpm exec next build
pnpm exec next start
```

`next start` starts and supervises native processes. `next-scriptc start` is an
alias. The local Next server proxies native routes over loopback HTTP. Routes
default to one process each; configure explicit sharing with the second argument:

```ts
withScriptc({}, {
  routes: {
    "/api/hello": { group: "light" },
    "/api/other": { group: "light" },
  },
});
```

Keys must match discovered native route patterns. Group members share state,
resources and failures, and must use the same optimization mode (`release` by
default, or `speed` / `dev`). Ordinary `route.ts` and prerendered output stay with
Next. Self-hosted native code requires a local Next server; standalone/static-export
output with configured native routes/functions is unsupported. The route bridge implements a subset of `next/server`,
buffers uploads and currently lacks response backpressure and full framework
caching semantics. Library compatibility depends on scriptc; compiler diagnostics
fail builds.

For Vercel, install/authenticate its CLI and link/pull the app's project first:

```sh
pnpm exec next-scriptc vercel-build
vercel deploy --prebuilt
```

The build wraps `vercel build` and Vercel's Next adapter, producing Linux x86-64
executable Functions. Both commands accept `--prod` for production. Function-level
`"use native"` calls run in a bundled Linux sidecar inside the Node Function,
reached over loopback HTTP. Native routes deploy as executable Functions.

See the [repository README](https://github.com/nebler/next-scriptc#readme) for benchmark results with caveats,
library refusals, the Go comparison and development commands, and the
[shim contract](shim/README.md) for supported request/response APIs. This is
experimental and depends on scriptc and evolving adapter/runtime contracts.

## Automatic promotion and local testing

Automatic promotion is enabled by default for Node production builds. To disable it:

```ts
// next.config.ts
import { withScriptc } from "next-scriptc";
export default withScriptc({}, { nativePromotion: "off" });
```

Omit the option or set `nativePromotion: "auto"` to discover unmarked helpers.
Cloudflare retains static verified dispatch and defaults to `"off"`. `"use js"` excludes a function from
automatic discovery. Explicit `"use native"` functions use the async form shown
above and fail the build on code refusals. Missing build tools leave the app in JS
and print a repair command.

Development runs the original TypeScript, including functions marked `"use native"`.
To test native execution locally, run `pnpm exec next build`, then
`pnpm exec next start`, and call the same endpoint. Rebuild production output
after edits. Development requests do not verify native compatibility.

A coverage report describes static eligibility, not an observed runtime decision.
Build summaries print native function and module counts separately from native routes. Automatic
promotion compiles candidates and shadow-checks them before deciding whether to
use native for a workload. An accepted report row alone does not show that a
request ran native. Compiler failures in automatic promotion retain the JS path;
toolchain failures name the unavailable tool and preserve JS execution. Functions
marked `"use native"` are compile-or-fail: a missing toolchain stops the build.
For helper permission or SC3004 failures, run `pnpm approve-builds` and
`pnpm rebuild scriptc`. For missing `ar` or Clang on macOS, run
`xcode-select --install`; on Debian/Ubuntu, run `sudo apt-get install build-essential`.
Code diagnostics retain compiler codes, point to original source positions, and
include repair hints. Extractor/discovery diagnostics use stable `NSC1000`–`NSC1005`
codes; infrastructure failures use `NSC2001`.

## Coverage report

Run `pnpm exec next-scriptc report . --json coverage.json --md coverage.md` to inspect
accepted functions, explicit `"use native"` functions including async ones,
exact discovery blockers, silent exclusions, and route reachability. Explicit rows
show extraction status. Async explicit rows check the default `.next` manifest
build ID, source hash, function name, and artifact presence for build status.
Custom output directories and automatic explicit functions have uninspected build
status. A present artifact does not verify native execution.
The command delegates to the framework-independent `scriptc-promote report`.
Add `--measure --inputs inputs.json` for opt-in stock native compilation and paired
JS/native measurements. See the [coverage report reference](../scriptc-promote/README.md#inspect-promotion-coverage)
for input format, synthetic inputs, and prediction limits.

## License

Apache-2.0, copyright next-scriptc contributors. See the
[license](https://github.com/nebler/next-scriptc/blob/main/LICENSE).

## Build-time differential fuzzing

Run the local check:

~~~sh
pnpm exec next-scriptc fuzz . --seed 1 --budget-ms 100 --json fuzz.json
~~~

Enable the build gate with:

~~~js
withScriptc(config, { fuzz: { budgetMs: 100, seed: 1, maxCases: 256 } })
~~~

Automatic mismatches demote to JS; explicit synchronous "use native" mismatches
fail the build. Fuzzing defaults to off and leaves runtime shadow verification
enabled. Async native functions, routes, and Cloudflare builds use separate paths.
See the [core fuzzing reference](../scriptc-promote/README.md#check-native-results-before-deployment)
and [semantics and findings](../../research/build-time-fuzzing.md).
