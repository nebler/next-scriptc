# next-scriptc

An experimental Next.js adapter that compiles App Router `route.native.ts`
handlers and `"use native"` functions to native executables with scriptc, without
a Next.js fork. Development runs the original TypeScript on Node.

Requires macOS or Linux and Node 24. This workspace uses Next 16.4.3 and pins
scriptc 0.4.6; the package is currently version `0.0.0`.

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
next dev
next build
next start
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
next-scriptc vercel-build
vercel deploy --prebuilt
```

The build wraps `vercel build` and Vercel's Next adapter, producing Linux x86-64
executable Functions. Both commands accept `--prod` for production. Function-level
`"use native"` currently runs on Node on Vercel; only native routes are deployed
as executable Functions.

See the [repository README](../../README.md) for benchmark results with caveats,
library refusals, the Go comparison and development commands, and the
[shim contract](shim/README.md) for supported request/response APIs. This is
experimental and depends on scriptc and evolving adapter/runtime contracts.
