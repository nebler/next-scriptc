# scriptc-promote

Use [Find what to promote](../../docs/find-what-to-promote.md) to rank server CPU hotspots with `report --profile file.cpuprofile --suggest`.

Start with the [tested adapter quick starts](../../docs/quick-start.md) and
[how promotion works](../../docs/how-it-works.md). Diagnose installs with
`pnpm exec scriptc-promote doctor .` (`--json` for structured output).

Framework-independent automatic promotion of synchronous, pure functions with
supported JSON boundaries. Framework adapters discover compute candidates, build
stock scriptc native addons, and shadow-check results before dispatching to native.
Adapters include Vite, SvelteKit, Nitro, Astro, React Router, and TanStack Start.
`next-scriptc` supplies the Next.js wrapper. Requires Node 24 or later.

## Install and enable Nitro

The package is version `0.0.0` and is not published on npm. In a Nitro 2 app,
install the repository package with pnpm 11.1.3:

```sh
pnpm add "github:nebler/next-scriptc#path:/packages/scriptc-promote"
pnpm add -D typescript
pnpm approve-builds scriptc
pnpm rebuild scriptc
```

Keep optional dependencies enabled. Native compilation requires a linker, such
as Xcode Command Line Tools on macOS or Clang and development libraries on Linux.
If compilation reports `SC3004: TypeScript server startup: Permission denied`,
run `pnpm rebuild scriptc` in the app and rebuild.

```ts
// nitro.config.ts
import { defineNitroConfig } from "nitropack/config";
import { scriptcNitro } from "scriptc-promote/nitro";

export default defineNitroConfig({
	preset: "node-server",
	modules: [scriptcNitro()],
});
```

Keep compute helpers in ordinary TypeScript modules and import them from server
handlers. Automatic discovery selects supported synchronous functions. `"use js"`
opts a function out. The Nitro adapter requires the `node-server` preset and
skips promotion in development. Explicit native directives documented by the
Next wrapper are not a Nitro setup recipe.

```sh
pnpm exec nitro dev
pnpm exec nitro build
node .output/server/index.mjs
pnpm exec scriptc-promote report .
```

A production build prints a census of eligible and compiled functions. Compilation
failure leaves automatic candidates in JS and prints the compiler diagnostic.
Compiled candidates still need runtime shadow verification and measurements;
compilation alone does not establish faster requests. Development runs JS.
Rebuild and start production output to exercise native candidates locally.

## Inspect promotion coverage

Run a static report without building or starting your app:

```sh
pnpm exec scriptc-promote report ./my-app --json coverage.json --md coverage.md
pnpm exec next-scriptc report ./my-next-app
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
pnpm exec scriptc-promote report ./my-app --measure --inputs inputs.json --json measured.json
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
`snapshot()` state. Use `--runtime` with the capture API below to import observations.
See [coverage report design and limits](../../research/coverage-report.md).

## Defaults and diagnostics

Vite, SvelteKit, Astro, React Router, Nitro, and TanStack adapters already enable
automatic discovery for supported production Node server builds when installed.
Their defaults are unchanged. Next now also enables it by default; set
`nativePromotion: "off"` in `withScriptc` to disable discovery. `"use js"` opts a
function out. Development serves JS. Test native locally with a production build
and start command. Dispatcher thresholds, acceptance rules, and shadow policy
are unchanged.

Extractor and discovery diagnostics include source positions, stable `NSC1000`
through `NSC1005` codes, and repair hints. Compiler SC codes remain intact.
`NSC2001` means a toolchain failure and names the unavailable tool. Automatic
promotion continues in JS; functions marked `"use native"` stop the build. For helper permission failures or SC3004, run
`pnpm approve-builds` followed by `pnpm rebuild scriptc`. Missing `ar` or Clang
requires `xcode-select --install` on macOS or
`sudo apt-get install build-essential` on Debian/Ubuntu.

Report rows marked `explicit` include async `"use native"` functions and show
extraction status. For Next async explicit functions using the default `.next`
directory, build status checks the manifest build ID, source hash, function name,
and artifact presence. Changed source or a missing artifact is reported as not
built. Other paths are explicitly uninspected. This command does not compile
explicit functions or verify execution.

## Check native results before deployment

Build and fuzz promoted synchronous functions without starting the app:

~~~sh
pnpm exec scriptc-promote fuzz ./my-app --seed 1 --budget-ms 100 --max-cases 256 --json fuzz.json
pnpm exec next-scriptc fuzz ./my-next-app --seed 1
~~~

The command discovers automatic and explicit synchronous "use native" candidates,
compiles a host addon, and compares its results with the extracted JS closure.
A nonzero exit means a mismatch, compilation refusal, unavailable check, or no
comparable calls. Discovery refusals remain visible in diagnostics. Async native
functions and routes use a separate build path and are outside this command.

Enable the same check in adapters:

~~~js
scriptcPromote({ build: { fuzz: { budgetMs: 100, seed: 1, maxCases: 256 } } })
// Next:
withScriptc(config, { fuzz: { budgetMs: 100, seed: 1 } })
~~~

The framework adapters accept the same build option.
A mismatch demotes automatic candidates to JS and rebuilds the addon index.
An explicit synchronous "use native" mismatch fails the build. An unavailable
check also demotes or fails; zero comparable calls never pass the build gate.
The build retains fuzz-results.json with seed, counts, and minimized diagnostics.

Defaults are seed 1, 100 ms of execution per function, and 256 cases. Automatic
build fuzzing is off: each function also needs a fresh process and TypeScript
analysis, which cost more than the execution budget on the repository examples.
The outer watchdog allows 10 seconds for process startup/type analysis plus the
execution budget. A JS call has a 50 ms maximum; native hangs terminate the
subprocess. Compilation has the existing compiler lifetime. Run on the target
host; a cross-compiled addon cannot be verified on the build machine.

The corpus includes finite numeric edges and boundary refusals, UTF-16 edges,
JSON strings, arrays, objects, optional fields, and key ordering. Seeded case
order is deterministic; a time budget determines how much of that sequence runs.
Shrinking is bounded and preserves a mismatch, but does not prove global
minimality. Runtime shadow verification remains necessary.
See [design, semantics, overhead, and findings](../../research/build-time-fuzzing.md).

## Observe runtime decisions

Static acceptance means a function qualifies for compilation. Capture the running
Node process to establish whether calls actually used native execution. This works
with the Next wrapper and all Node Vite adapters that use the shared dispatcher.
Dev modes that leave functions unwrapped have no dispatcher observations.

```sh
SCRIPTC_PROMOTE_SNAPSHOT='/tmp/promote-%p.json' \
SCRIPTC_PROMOTE_SNAPSHOT_INTERVAL_MS=1000 pnpm start
scriptc-promote report . --runtime /tmp/promote-12345.json
```

`%p` expands to the process ID. Use it with multiple workers. The parent directory
must exist. The default interval is 10 seconds, with a minimum of 100 ms. The timer
is unref'ed. Atomic file replacement also runs on normal Node exit. Abrupt exits,
signals, and native crashes can leave only the most recent periodic snapshot.
Write failures log a fixed warning and keep the app running. Keep files in a
private directory. Each file contains one process, and each dispatcher starts at
zero after restart. Do not add repeated snapshots of the same process together.

For a live in-process read or explicit flush:

```js
import {runtimeSnapshot, writeRuntimeSnapshot} from 'scriptc-promote/runtime';
const snapshot = runtimeSnapshot();
writeRuntimeSnapshot('/tmp/promote.json');
```

The version 1 schema contains `dispatchers[].functions[id]`, with `calls`,
`native`, `fallback`, and `buckets`. Each bucket includes its internal `state`,
public `lane` (`learning`, `js`, `native`, or `settled`), reason, shadows, verified
and mismatch counts, fallback reasons, ratio, votes, thresholds, and scheduling
limits. `settled` covers JS-final and demoted states. Bucket numbers are log2 input
size estimates, not byte lengths. A scalar-only signature has bucket zero.
`decision` describes the last complete voting epoch, or the partial first epoch.
Copies are detached from dispatcher state. Inputs, results, input hashes, and
error messages are excluded. IDs, counters, and timing aggregates remain.

No timer, file writes, per-call snapshot allocation, or extra clocks run when the
environment option is off. Registration costs one weak reference per dispatcher.
Native successes and exceptional paths maintain additional aggregate counters.
Boundary share is currently `null`; capture does not enable boundary timing.
CPU savings use the last paired thread-CPU medians times native call counts.
Wall-clock-only dispatchers report CPU savings as unavailable. This estimate
excludes shadow cost, may apply one epoch to older calls, and is not billing.
Route rows show observed reachable functions through the static reference graph.
They do not measure requests or attribute shared helpers to a specific route.
Unmatched IDs are printed, for example after source paths or builds change.

Run `node scripts/runtime-visibility-demo.mjs` from this repository for a small
native build and 1,200 localhost requests. One captured run printed:

```text
1 functions ran native for 49.9% of calls; estimated CPU saved is a dispatcher-measured estimate, not billing (479.998 ms).
Runtime compute.ts#numeric: promoted & running native; 599/1200 native calls; 0 fallbacks; native
```

This is a synthetic compute fixture, not evidence of an application speedup.
See [runtime visibility evidence](../../research/runtime-visibility.md).

## Produce a CI report

```sh
scriptc-promote report . --ci --baseline previous.json \
  --fail-on regressed-explicit --json current.json --md current.md
```

`--ci` writes `scriptc-report.json` and `scriptc-report.md` by default. JSON retains
the coverage report and adds a sorted `ci` summary. Markdown is suitable for a PR
comment. No comment is posted. Counts distinguish static accepted, explicit, and
blocked functions. Diffs list newly accepted, newly blocked, regressed accepted,
and regressed explicit IDs. Removed functions count as regressions. No baseline
means every current accepted or blocked row is new.

Exit status is 0 for success, 1 for invalid options or report errors, and 2 when
`--fail-on regressed-explicit`, `regressed-accepted`, or `newly-blocked` matches.
A failure rule requires a baseline. Without `--fail-on`, changes are informational.

Static reports cannot establish compiler success. Add
`--build-results path/to/build-results.json` from the same build to include compiler
refusals in regressions. The shared build writes this file beside `promotion.node`,
including on a failed explicit synchronous build. Vite emits build and available
fuzz evidence under the server output's `scriptc-promotion` directory. Its version 1 `functions` array
contains `{id: 'relative/file.ts#name', status: 'compiled' | 'blocked'}` rows.
Build from the application root so IDs match the report. Supplied evidence must
belong to the current source revision. Next async sidecar builds write their evidence to
`.next/cache/scriptc-functions/build-results.json`. Supply that file when checking
async explicit functions. A failed build must also fail your CI build step.

Use `--fuzz-results path/to/fuzz-results.json` to include existing fuzz evidence.
Neither flag compiles code or runs fuzzing. Keep build and fuzz failures fatal in
CI independently. The report labels absent evidence as not supplied.

Example GitHub Actions steps, for documentation only:

```yaml
- run: pnpm install --frozen-lockfile
- run: pnpm build
- run: pnpm exec scriptc-promote report . --ci --json current.json --md current.md
- uses: actions/upload-artifact@v4
  with:
    name: promotion-report
    path: |
      current.json
      current.md
```

Download a trusted previous `current.json` as `previous.json` before adding
`--baseline previous.json --fail-on regressed-accepted`. Keep the baseline from
an earlier revision of this application. Build output lists up to 20 compiled
promotion names with source file and line. Compilation does not prove native use.
