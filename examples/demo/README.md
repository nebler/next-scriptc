# next-scriptc demo

Use Node 24.x. From the workspace root:

```sh
pnpm --filter demo dev                 # Node / Turbopack, for development and parity
pnpm --filter demo build               # Next build, then serial native compilation
pnpm --filter demo start               # Native binaries behind Next's rewrites
node examples/demo/test/e2e.mjs        # Builds; verifies parity and process cleanup
NEXT_SCRIPTC_BASELINE=node pnpm --filter demo exec next build
node examples/demo/bench/threads.mjs   # Requires both builds; runs them sequentially
```

`NEXT_SCRIPTC_BASELINE=node` disables the adapter and selects `.next-node`, keeping
it separate from the native `.next` build. Start it manually with
`NEXT_SCRIPTC_BASELINE=node pnpm --filter demo exec next start`.
Rebuild both variants after source changes. Missing benchmark builds produce the
exact build command to run.

The automatic comparison uses port 3417 and checks that it and every native route
port are free before and after each run. It spawns both servers with the benchmark's
exact Node executable, requires Node 24.x, and prints its path, the baseline's
reported `process.version`, CPU count/model, load averages and platform/architecture.
SIGINT/SIGTERM stop servers started by the script.
`node examples/demo/bench/threads.mjs http://localhost:3000` instead measures an
existing production server, which remains owned by its caller.

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

## Measurement notes

Both benchmark modes use production builds: plain `next start` without the adapter
versus `next-scriptc start`. `next dev` is used only for development/E2E parity.
The benchmark warms each thread count, takes three samples, and prints median
compute time, speedup against one thread, RSS at 1/2/4/8 workers and average RSS
growth per worker. It then runs back-to-back eight-thread reports for about five
seconds while probing `/` and `/api/items/new` every ~20 ms, printing sample counts
and p50/p99 HTTP latency. Both probes run in Next in both modes and are warmed
before timing. Only one report is in flight; queue saturation and cold starts
are separate concerns.

The machine is heavily loaded. Output is indicative only, not publishable
performance data. Both modes use asynchronous workers; the difference under test
is graph sharing versus cloning, alongside their different runtimes.

## Worker resolution

The adapter imports the route into `.next/scriptc/entry-N.ts`. The route uses
`new Worker(new URL("./worker.ts", import.meta.url), { workerData })`.
Turbopack preserves this source-relative server worker entry in both development
and production. Node 24 runs the worker with built-in TypeScript stripping;
its runtime import of layout constants uses an explicit `.ts` extension.
scriptc resolves the worker at compile time and includes it in the binary.
E2E checks dev/native parity; the benchmark checks production Node/native parity.
No adapter change is needed.
