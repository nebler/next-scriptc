# next-scriptc demo

Use Node 24.x. From the workspace root:

```sh
pnpm --filter demo dev                 # Node / Turbopack, for development and parity
pnpm --filter demo build               # Next build, then serial native compilation
pnpm --filter demo start               # Native binaries behind Next's rewrites
node examples/demo/test/e2e.mjs        # Builds; verifies parity and process cleanup
pnpm --filter demo exec next start    # Plain next start also owns native binaries
DEMO_PROXY_TIMEOUT_MS=180000 pnpm --filter demo test:routes # Route parity
```

`next-scriptc start` is a compatibility alias for Next's CLI in the same process.
The production adapter hook starts native binaries in parallel and waits for
their ports to bind. Each binary then imports its route while Next continues
startup; early requests wait for module initialization. Production binaries use
`--strip`; uncaught errors retain their message, while native debugging needs an
unstripped rebuild. A crashed binary restarts with bounded backoff; five crashes within
30 seconds stop retries for that process. Next returns HTTP 500 while its destination
is down; pages and other processes stay available. Workers detect server SIGKILL
within approximately 1–2 seconds. Native port conflicts fail initial startup with
the route and port in the error. Next keeps prerendered handlers as static output;
only handlers needing request-time execution get native binaries.

`NEXT_SCRIPTC_BASELINE=node` disables the adapter and selects `.next-node`, keeping
it separate from the native `.next` build. Build and start the Node baseline with:

```sh
NEXT_SCRIPTC_BASELINE=node pnpm --filter demo build
NEXT_SCRIPTC_BASELINE=node pnpm --filter demo exec next start
```

`NEXT_SCRIPTC_DEMO_GROUPS=light` puts hello, verify, url-echo, items/[id],
stores/nearby, analytics/revenue, export.json.gz and uploads/verify into one
binary, process, port and HTTP listener. It selects `.next-grouped`, so all three
builds can coexist. Build and test sequentially:

```sh
NEXT_SCRIPTC_DEMO_GROUPS=light pnpm --filter demo build
NEXT_SCRIPTC_DEMO_GROUPS=light node examples/demo/test/e2e.mjs --skip-build
NEXT_SCRIPTC_DEMO_GROUPS=light pnpm --filter demo test:routes --skip-build
NEXT_SCRIPTC_DEMO_GROUPS=light pnpm --filter demo exec next start
```

The adapter accepts explicit policy in its second argument:

```ts
withScriptc(nextConfig, {
  routes: {
    "/api/hello": { group: "light" },
    "/api/verify": { group: "light" },
    "/api/primes": { optimization: "speed" },
  },
});
```

Keys must exactly match discovered, normalized `"use scriptc"` route patterns.
Unknown routes/options and invalid values fail the build. Optimization accepts
`release` (default), `speed` or `dev`; all members of a group must resolve to
the same mode, including members that omit it. Prerendered routes need no native
process. Unconfigured routes retain one process per route; the demo uses release
everywhere. Group members share module state, event-loop latency and crash/restart
behavior. The measured light group saves memory but increases hello's tail during
gzip work; choose groups for your workload. Worker offload remains future work;
see [round 3 measurements](../../research/round3-decisions.md).

See [the benchmark guide](../../research/benchmarks.md) for current commands,
workloads, process-tree memory accounting and measurement limitations. Rebuild
both variants sequentially after source changes. Local timings on this loaded
machine are indicative only.

After a fresh build, pass `--skip-build` to either test runner to reuse it.
Set `E2E_PORT` or `ROUTES_PORT` when another worktree uses the default test port.
For route parity on loaded hosts, set `DEMO_PROXY_TIMEOUT_MS=180000` to give native
cost-10 bcrypt a 180-second proxy timeout through `experimental.proxyTimeout`.
Without this test variable, production keeps Next's 30-second default.
See [adapter notes](../../research/adapter-notes.md) for lifecycle details and
current limitations.

## Shared-graph report

`GET /api/report?threads=1` accepts 1–8 threads (default 1). On first use it creates
one million deterministic `Order` instances and publishes the graph with
`@scriptc/threads` 0.4.6. Each report calculates revenue for eight regions and twelve
five-year monthly pricing projections, rounding each invoice in integer cents.
All totals stay below 2^53, so partitioning cannot change the result. The layout
constants live in `orders.ts`.

The pool grows lazily to eight persistent workers. Each receives the entire graph
once through `workerData` and calls `publish`: native reads the original immutable
graph by reference; Node freezes its private structured clone. Later requests send
only partition indices. Workers read fields, so Node's removal of class prototypes
is harmless. After requesting eight threads, a one-thread request still retains
eight workers. Reports queue to avoid overlapping jobs. A failed worker rejects
its current request and is removed; the next request recreates the missing worker.
Surviving jobs finish before the pool is reused. Restart dev after editing the
route to reset its module and pool.

`elapsedMs` covers dispatch, computation and reduction. Dataset creation,
publication, queueing, HTTP overhead and worker startup/cloning/publication are
excluded. A typed `"ready"` message sent after worker publication keeps setup
outside this timer, including on the first request.

The response includes `result`, `threads`, maximum `poolSize`, resident `workers`,
`sharedByReference`, `elapsedMs`, and `nodeVersion` (null for native). Memory fields
are bytes: `baselineRss` immediately before dataset creation, `datasetRss` after
publication but before workers, and `rss` after the report. `workerRssGrowth` is
`(rss - datasetRss) / workers`, the average growth per resident worker.

Node RSS covers the whole production Next server and its worker threads. Native
RSS covers only the report binary, excluding Next and the other route binaries.
Compare growth within each run, not absolute cross-mode totals. RSS includes
runtime/allocator overhead and retained temporary allocations; it is neither exact
clone size nor necessarily monotonic.

## Worker resolution

The adapter imports the route into `.next/scriptc/entry-N.ts`. The route uses
`new Worker(new URL("./worker.ts", import.meta.url), { workerData })`.
Turbopack preserves this source-relative server worker entry in both development
and production. Node 24 runs the worker with built-in TypeScript stripping;
its runtime import of layout constants uses an explicit `.ts` extension.
scriptc resolves the worker at compile time and includes it in the binary.
E2E checks dev/native parity; the benchmark checks production Node/native parity.
No adapter change is needed.
