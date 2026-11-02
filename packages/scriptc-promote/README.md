# scriptc-promote

Framework-independent automatic promotion of synchronous, pure functions with
supported JSON boundaries. Framework adapters discover compute candidates, build
stock scriptc native addons, and shadow-check results before dispatching to native.
Adapters include Vite, SvelteKit, Nitro, Astro, React Router, and TanStack Start.
`next-scriptc` supplies the Next.js wrapper. Requires Node 24 or later.

## Inspect promotion coverage

Run a static report without building or starting your app:

```sh
scriptc-promote report ./my-app --json coverage.json --md coverage.md
next-scriptc report ./my-next-app
```

The report detects the framework from package dependencies or config filenames.
Use `--framework next` to override detection, and `--source-dir src` to restrict
analysis. Supported framework names are `next`, `sveltekit`, `nitro`, `astro`,
`react-router`, `tanstack`, `cloudflare`, `vite`, and `generic`. Config files are
not executed. An app's root `tsconfig.json` supplies type resolution.

Each file lists accepted, rejected, and silently excluded functions. Route entries
list reachable local functions through TypeScript symbol references. The report
includes exact discovery diagnostics, a blocker histogram, and nearest misses
with one emitted diagnostic. Fixing that diagnostic may reveal another blocker.
Total top-level callable bindings and exported bindings provide a denominator that
includes async handlers and other functions silently excluded by discovery.

To compile and measure accepted functions, opt in explicitly:

```sh
scriptc-promote report ./my-app --measure --inputs inputs.json --json measured.json
```

Use IDs from the static report. Each value contains argument tuples:

```json
{
  "src/lib/compute.ts#numeric": [[1000], [10000]],
  "src/lib/totals.ts#total": [[[1, 2, 3]]]
}
```

The core promotion ID is also accepted. Without an input entry, the report tries
to synthesize bounded values from TypeScript types. Those rows say `synthetic`.
Numbers default to 32, strings to `synthetic`, and arrays to 16 elements. Unsupported
or recursive inputs require explicit tuples. Synthetic values do not represent
production traffic and may not exercise meaningful work.

Measurements run in a subprocess and execute extracted application code. The stock
compiler, linker, and Node headers must be available as for an ordinary promotion
build. Build refusals and unavailable measurements remain visible in the report.

Each input tuple gets its own result: JS and boundary-inclusive native ns/call,
N, minimum, p10, median, p90, maximum, JSON input bytes, ns per byte, and compute
intensity expressed as JS ns per input JSON byte. The prediction uses the dispatcher's
24 paired samples and 19-vote threshold for a native ratio below 0.90. A losing
majority predicts JS; other results are unclear. A separate instrumented build
estimates boundary share from wall time. Decision samples use the ordinary addon.

These predictions do not claim application savings or observed promotion. Real
traffic, size buckets, shadow quotas, startup, fallback, and periodic rechecks
still determine runtime behavior. The dispatcher exposes process-local
`snapshot()` state; importing observations from running apps is a follow-up.
See [coverage report design and limits](../../research/coverage-report.md).
