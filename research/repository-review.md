# Repository cleanup and review

Reviewed on 2026-10-31 from local branch `hillclimb/int8-vectors`, in
`hillclimb/cleanup-readme`. No deployment, push, merge, Docker operation or
subagent delegation was performed. The excluded vector and launch paths are
unchanged.

## Inventory and disposition

The starting tree had 855 tracked files totaling **29,945,220 bytes** (Git blob
sizes, excluding dependencies/build output). `research/` accounted for 460 files
and **27,487,569 bytes**, including **25,752,601 bytes** in `research/benchmarks/`.
The adapter package was 36 files / 202,343 bytes; the Vercel harness directory
was 31 files / 188,642 bytes. Nine evidence files exceeded one million bytes:

| Kept raw artifact in `research/benchmarks/` | Bytes |
| --- | ---: |
| `realistic-io-hosted-pair-3.json` | 2,883,978 |
| `realistic-io-hosted-pair-3.worker.json` | 2,883,556 |
| `realistic-io-local.json` | 2,156,453 |
| `sandbox-2026-10-31T01-16-13.905Z.json` | 2,102,015 |
| `sandbox-2026-10-31T02-02-44.605Z.json` | 2,101,888 |
| `sandbox-2026-10-31T02-46-44.954Z.json` | 1,739,571 |
| `vercel-tail.json` | 1,268,737 |
| `vercel-tail-native-repeat.json` | 1,246,736 |
| `sandbox-2026-10-31T00-39-05.856Z.json` | 1,034,309 |

These nine files total **17,417,243 bytes**. They preserve per-request samples,
failed attempts and independent worker downloads behind linked reports/audits.
All raw research evidence remains byte-for-byte unchanged. No raw evidence was
deleted, minified, reserialized or replaced with selected successful rows. Moving
or compressing these files would require coordinated readers and provenance
changes; retaining them is intentional.

Ten one-time files moved from `examples/demo/bench/vercel/` into
[`archive/`](../examples/demo/bench/vercel/archive/README.md), **39,381 original
bytes** total:

| Archived file | Original bytes |
| --- | ---: |
| `final-run.mjs` | 6,980 |
| `final-recover.mjs` | 6,228 |
| `final-cpu-recover.mjs` | 4,404 |
| `startup-build.mjs` | 3,485 |
| `startup-deploy.mjs` | 3,650 |
| `startup-proxy.py` | 1,483 |
| `startup-request.mjs` | 3,511 |
| `startup-sandbox.mjs` | 5,984 |
| `startup-scaleout.mjs` | 3,092 |
| `cold-file.c` | 564 |

Relative imports/root discovery were adjusted where necessary (39,391 bytes
after relocation). Archive documentation explains the historical shim/artifact
requirements and source-commit guards. Live prose links and the final report
generator point to the archive; immutable JSON provenance still retains its
original path/hash and can be resolved at its recorded source commit.

Kept `function-sizes.py` (3,055 bytes): it is shared by the final and I/O
controllers. Build/deploy helpers, report generators, clients, CPU/RSS checks and
tests also remain active. Probe/scout fixtures and the legacy serializer remain
because reports, reproduction scripts or parity tests use them.

Removed three unreferenced Create Next App SVGs: `public/file.svg` (391 bytes),
`public/globe.svg` (1,035), `public/window.svg` (385), **1,811 bytes** total. Kept
`next.svg` and `vercel.svg`, which the demo homepage imports.

## Adapter review

Read all ten top-level source modules, eight function modules and three runtime
shim modules, with their tests. No safely removable dead runtime module or debug
execution branch was identified. The `next-scriptc start` alias, runtime marker,
listener line, compiler override and Vercel branch all have current consumers.

Fixed:

- Function manifests now reject malformed process arrays, null entries, invalid
  binary names, non-integer/out-of-range ports and invalid display-label arrays
  before calling the shared supervisor. JSON/read failures include a rebuild
  instruction and retain their cause. Existing build-ID/executable checks remain.
- Function extraction rejected JSX elements but missed fragments. Both direct
  dependency closures and imported application graphs now reject fragments with
  the same contextual error. Regression cases cover both paths.
- Added discoverable `pnpm test` scripts for package and demo harness tests, plus
  `test:shim`. Defined a runtime-only npm `files` allowlist and Node >=24 engine.
  npm dry-run packaging contains 24 runtime/documentation files, 107,269 bytes
  unpacked / 32,168 bytes packed; no test fixtures, native build output or research files.
- Added root/npm READMEs, a research index, historical notices for older Vercel
  investigations, archive links and a fresh-install helper-permission note.
  Removed machine-specific credential-copy paths from benchmark setup prose.

Reported, intentionally unchanged:

- **Compatibility scope:** the peer range `next >=16` is broader than tested
  16.4.3. Discovery/config/build rely on Next private module paths and particular
  output schemas. A supported-version policy/matrix needs a separate decision.
- **Deployment contract:** executable IPC and Vercel adapter-output replacement
  remain version-sensitive. No hosted deployment was requested or performed;
  local packaging/unit/IPC checks do not prove current hosted compatibility.
- **Port/process architecture:** deterministic project-derived ports require
  namespaces for replicas and can collide across projects. Grouped routes and all
  native functions share event-loop latency, module state and failure domains.
- **Transport limits:** uploads/results are buffered without a payload ceiling;
  route response streaming lacks backpressure; handler AbortSignal propagation
  and function cancellation are absent. These need explicit protocol/runtime work.
- **Lifecycle/cache design:** startup promises are cached per output directory
  for the owning process lifetime; failed programmatic builds cannot simply
  restart in the same process. CLI lifecycle is covered, broader internal build
  API reuse is not a supported claim. Build/compiler spawn logic is repeated
  across route, function and Vercel paths with different flags; no abstraction
  was introduced just for stylistic deduplication.
- **Function isolation:** closure discovery is not a purity proof. Module
  initialization, property mutation and imported-library behavior can differ
  across Node/native instances. The existing dense-array argument policy also
  accepts custom array prototypes; native results require `Array.prototype`.
- **Release metadata:** the repository has no chosen license or public remote
  URL. A license, repository/homepage metadata and durable npm documentation
  URLs need the owner's release decision; none were invented. The demo homepage
  still uses starter content/metadata, though it is outside the adapter API.
- **Pre-existing historical citations:** the repository-wide Markdown scan found
  32 missing local file links: 25 into the optional, ignored `vendor/scriptc/`
  checkout and seven into ignored `examples/probe/.artifacts/` outputs. They are
  in `examples/probe/RESULTS.md`, `research/perf-levers.md` and
  `research/vercel-native-functions.md`. Added availability notices instead of
  inventing source commits or regenerating dated evidence. The current README's
  linked report data is retained, and its local file links resolve.

## README number verification

Every performance value comes from the requested research docs, not a new run:

- [Vercel](vercel-final.md): 125.542/240.431 ms medians round to 126/240; first
  native RSS 5.598–5.602 MiB versus Node 79.664–80.262; hello CPU 0.570/3.064;
  revenue CPU 2.384/7.029; Markdown CPU 40.209/4.593 and p50 60.620/24.329.
- [Realistic I/O](realistic-io.md): GET p50 24.774/26.455, POST p99
  205.148/51.649, plus Zod SC1016 and Upstash SC1090 integration refusals.
- [Function-level](function-level.md): observed Linux crossover between 5k and
  15k; no universal threshold or function-level Vercel support claimed.
- [Go territory](go-territory.md): self-hosted CSV p50 Go/native/Node
  86.287/377.395/618.074; bcrypt Go/native 70.598/12829.048, three samples.
  [Scouting](scouting-summary.md) supplies the image-resize/popcount losses.

Caveats sit beside the headline values. The CPU-heavy route section retains
exactly `TODO(vector-vercel)` for the other agent's results.

## Validation

Commands ran from the workspace root unless specified. Every Node/pnpm test and
build command used this PATH prefix to select Node **24.22.0**:

```sh
PATH=/Users/noah/.local/share/fnm/node-versions/v24.22.0/installation/bin:$PATH
```

| Command (test/build PATH prefix omitted) | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed; lockfile unchanged |
| `SCRIPTC_CHECKER_SERVER=0 pnpm --filter next-scriptc test` | 21/21 tests passed, including compiled fixtures and new boundary regressions |
| `pnpm --filter demo test` | 21/21 tests passed, including heavy/vector fixtures, CPU sampling and I/O harness checks |
| `SCRIPTC_CHECKER_SERVER=0 pnpm --filter next-scriptc test:shim` | 2/2 tests passed: 113 HTTP parity comparisons and executable IPC lifecycle/concurrency/stream/abort checks |
| `SCRIPTC_CHECKER_SERVER=0 pnpm --filter demo build` | Passed; plain self-hosted Next build, 28 dynamic native routes in 28 processes plus native functions; static output retained |
| `SCRIPTC_CHECKER_SERVER=0 E2E_PORT=5417 node examples/demo/test/e2e.mjs --skip-build` | Passed; 12 response cases and 1/4/1-worker report parity, routing precedence, SIGTERM/SIGKILL cleanup, restart/cutoff, occupied ports and CLI alias |
| `SCRIPTC_CHECKER_SERVER=0 FUNCTION_TEST_PORT=5461 node examples/demo/test/functions.mjs` | Passed; native/Node production builds and dev, four dataset sizes, errors, route calls, Server Actions, in-flight crash rejection and restart |
| `SCRIPTC_CHECKER_SERVER=0 node examples/demo/test/function-build.mjs` | Passed; native prerender output, worker cleanup after successful/type-failed builds, both legacy-directive failures before startup |
| `SCRIPTC_CHECKER_SERVER=0 DEMO_PROXY_TIMEOUT_MS=180000 ROUTES_PORT=5427 node examples/demo/test/routes.mjs` | Passed; rebuild, 181 Node-dev cases / 181 native matches; all 29 native processes and ports cleaned up |
| `npm pack --dry-run --ignore-scripts --json` (in `packages/next-scriptc`) | Passed; 24-file runtime allowlist and executable CLI verified |
| `node examples/demo/bench/vercel/final-report.mjs` | Passed; regenerated report matches committed document, including the archive link; no measurement values changed |
| `git diff --check` | Passed |

The first two package-test attempts failed in compiler fixtures with
`SC3004: TypeScript server startup: Permission denied`. The initially invoked
symlink path made scriptc's install hook exit without running its guarded entry
point. Restored executable modes on the installed checker/comptime helpers and
then successfully ran the hook by its resolved real path:

```sh
node "$(realpath packages/next-scriptc/node_modules/scriptc/scripts/install-native.mjs)"
```

This affected only ignored installed dependencies. The subsequent package run and
all native compilation/integration checks passed. Existing SC6104 checked-dynamic
warnings remain in successful builds; this cleanup did not suppress them.

Additional checks passed: archive JavaScript/Python syntax; README source-value
assertions against all five requested research docs; new README/report local
file links; byte-for-byte preservation of tracked raw benchmark evidence;
excluded-path diff check; `.env.local` and `examples/demo/.env.local` remain
gitignored. Test logs are local `/tmp/next-scriptc-cleanup-*.log`, not new research
benchmark data. No alternate webpack or hosted deployment run was made.

## Implementation commits

- `1236cb3`: archive historical controllers, remove unused SVGs, update live paths.
- `37ca14d`: function manifest/JSX fixes, regression cases, test scripts and npm metadata.
- `faf51c8`: root/npm README, research index and installation note.
- This report and the final historical-citation notices form a separate documentation commit.
