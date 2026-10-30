# next-scriptc demo

From the workspace root:

```sh
pnpm --filter demo dev                 # Same routes on Node / Turbopack
pnpm --filter demo build               # Next build, then serial native compilation
pnpm --filter demo start               # Native binaries behind Next's rewrites
node examples/demo/test/e2e.mjs        # Builds; verifies parity and process cleanup
node examples/demo/bench/threads.mjs   # After building; starts/stops both modes sequentially
```

`node examples/demo/bench/threads.mjs http://localhost:3000` benchmarks an already
running server instead; that server remains owned by its caller. The automatic
comparison uses port 3417 and checks that it and every native route port are free
before and after each run. SIGINT/SIGTERM also stop servers started by the script.

## Shared-graph report

`GET /api/report?threads=1` accepts 1–8 threads (default 1). On first use it creates
one million deterministic `Order` class instances, publishes the graph with
`@scriptc/threads` 0.4.6, and retains it. Eight numbered regions and integer customer
IDs keep the data compact. Each report calculates revenue per region and twelve
five-year monthly pricing projections, with customer/seasonal discounts and
per-invoice rounding. All arithmetic stays in exact integer cents below 2^53;
partitioning and reduction order cannot change the result. Workers read fields,
so Node's removal of class prototypes during structured cloning is harmless.

The fixed maximum is eight persistent workers, created lazily as concurrency
grows, each receiving the entire published graph **once** through `workerData`.
Every worker calls `publish` on receipt: native reads the original immutable graph
by reference, while Node freezes its private structured clone. Subsequent requests
send only start/end indices. The pool never shrinks: after requesting eight threads,
a one-thread report still holds eight workers. Reports queue to avoid overlapping
jobs on this pool. A failed worker makes subsequent reports fail rather than
silently reducing concurrency or hanging a pending request; restart the server to
recover. Editing the route in dev can replace its module; restart dev before a
benchmark so the pool starts empty.

The response includes `result`, requested `threads`, maximum `poolSize`, resident
`workers`, `sharedByReference`, `elapsedMs`, `datasetRss`, and `rss` (bytes).
`elapsedMs` covers job dispatch, worker computation and reduction. Dataset creation,
publication, worker startup/receipt/publication, request queueing and HTTP overhead
are excluded. `datasetRss` samples process RSS after publishing the original graph,
before creating workers; `rss` samples it after the report. RSS includes allocators,
VM/thread overhead and temporary allocation retention, so it is neither exact graph
size nor necessarily monotonic. Node's process includes Next dev and its runtime;
native RSS covers only the report binary, **not** Next or the other route binaries.
Use the growing RSS within each run to inspect additional worker copies; do not
interpret the absolute cross-mode difference as graph savings alone.

The benchmark warms each thread count, takes three samples and prints median
compute time, speedup against one thread, and RSS. It also runs back-to-back
8-thread reports for about five seconds while probing `/` and the light Node route
`/api/items/new` every ~20 ms, printing sample counts and p50/p99 HTTP latency.
Both latency endpoints run in Next in both modes. Probes are warmed before timing.
There is one report in flight, using all eight workers; queued request saturation
and cold-start latency are separate concerns.

Node uses `next dev` because it runs the **same source** without the adapter's
production native rewrites. This preserves the requested development-mode test
and avoids a second config/build variant, but dev overhead and Node JIT versus
native compilation make this an illustrative comparison, not a controlled
production performance study. Both modes use asynchronous worker threads; Node
also leaves its event loop available. The distinctive native feature demonstrated
here is immutable graph sharing, not the existence of parallel workers.

The development machine is heavily loaded. Treat every benchmark output as
indicative only, not publishable performance numbers.

## Worker resolution investigation

The unmodified adapter generates `.next/scriptc/entry-N.ts` with an absolute import
of `app/api/report/route.ts`. The constructor in that route is the ordinary
`new Worker(new URL("./worker.ts", import.meta.url), { workerData })`, without runtime
branches, loaders or copied worker assets.

A minimal probe returned `{"value":"worker resolved"}` both through Turbopack
`next dev` and through the generated native binary, the latter carrying
`x-next-scriptc: native`. Both logged the route's original
`file:///…/app/api/report/route.ts` as `import.meta.url`. Turbopack leaves this server
`node:worker_threads` entry source-relative; Node 26.13.0 runs the TypeScript worker
using built-in type stripping. The worker's runtime imports use package names only;
its extensionless `./orders` import is type-only and erased. scriptc discovers the
worker source at compile time relative to the constructor's source module and
includes it in the binary. The full E2E test verifies the actual published graph
and persistent message loop in both modes. No adapter change is needed.
