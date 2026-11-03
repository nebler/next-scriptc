# Runtime visibility (P2)

2026-11-03. This work adds observation without changing discovery, dispatch
thresholds, scheduling, or lane selection. Static acceptance still does not prove
compilation or native execution.

## Design choice

The supported `scriptc-promote/runtime` API reads all live dispatchers in the
current Node process. A global symbol joins bundled core copies. Weak references
avoid retaining unused dispatchers. `runtimeSnapshot()` returns detached version 1
JSON data. `writeRuntimeSnapshot(path)` writes it with atomic replacement.

An optional `SCRIPTC_PROMOTE_SNAPSHOT=path` starts an unref'ed periodic writer when
a dispatcher is constructed. `%p` separates worker files. The default interval
is 10 seconds; `SCRIPTC_PROMOTE_SNAPSHOT_INTERVAL_MS` can lower it to 100 ms.
Normal Node exit writes once more. No HTTP endpoint is added. A production endpoint
would require exposure controls, authentication, and host integration for every
adapter. The programmatic API lets an application implement its own access policy.
Files let existing CLI reports consume a running process without host-specific
HTTP machinery.

The writer never records arguments, results, hashes of arguments, schemas, raw
errors, or stack traces. Reasons use a fixed vocabulary. Timing pairs retained for
snapshot compatibility contain only durations. Bucket keys are the existing log2
size estimate. Per-function counters distinguish successful native calls from
shadow attempts. Bucket data includes votes, ratio, thresholds, verification,
mismatches, fallback reasons, and pending work. Legacy snapshot fields remain
available, but callers can no longer mutate dispatcher state through the snapshot.

Next and Vite runtimes share dispatcher registration. Failed addon loads now
construct a JS-only dispatcher, so those wrapped calls can also be observed.
Next dev mode and Vite dev mode leave ordinary functions unwrapped. They produce
no native observations. Explicit async Next sidecars are outside this synchronous
dispatcher. Their build status is available separately, not as dispatch counters.

## Off-path cost

With the environment option off, there are no timers, file writes, extra clocks,
or snapshot allocations per call. Registration creates a weak reference once.
Settled JS code remains unchanged. Successful native calls increment one extra
bucket counter. Existing fallback paths also increment a reason counter. Shadows
increment attempt and mismatch counters. Vote explanations are computed on read.

An initial local Node 26.13.0 microbenchmark compared the HEAD dispatcher before
this change with the new dispatcher. Both used `mode: 'js'`, a no-op logger, one
scalar argument, and `x => x + 1`. Each of nine alternating pairs warmed 100,000
calls and timed 3,000,000 calls. Medians were 55.53 ns/call before and 57.45 ns/call
after, a 1.92 ns difference. This is a recorded measurement, not a CI timing gate.
The test verifies that off-mode construction installs no exit listener. Shared
machine load and JIT variability limit the microbenchmark. A Node 24.22.0 repeat measured 44.81 ns/call before and 41.67 ns/call after.
The opposite signs do not establish a speedup or a consistent slowdown.
Native-call overhead was not independently isolated. File writes are synchronous and can pause the
event loop when enabled; choose an appropriate interval and filesystem.

## Runtime evidence

Run from this worktree, with an installed stock scriptc 0.4.6 and Node 24:

```sh
node scripts/runtime-visibility-demo.mjs
```

The script creates a small TypeScript application in `/tmp`, discovers and builds
one compute-dense function, loads the actual native addon, serves a localhost HTTP
endpoint, and makes 1,200 serial requests. It checks each response against JS,
waits for shadows, captures JSON, and merges the snapshot into the static report.
No dispatch thresholds or quotas are overridden. One run wrote artifacts to
`/tmp/scriptc-runtime-demo-0kuWl7` and printed:

```text
1 functions ran native for 49.9% of calls; estimated CPU saved is a dispatcher-measured estimate, not billing (479.998 ms).
Runtime compute.ts#numeric: promoted & running native; 599/1200 native calls; 0 fallbacks; native
```

This demonstrates compilation, observed promotion, and reporting for a synthetic
function. It does not establish an application speedup. The CLI was also run on
that same snapshot:

```sh
node packages/scriptc-promote/src/cli.mjs report /tmp/scriptc-runtime-demo-0kuWl7 \
  --runtime /tmp/scriptc-runtime-demo-0kuWl7/snapshot.json --ci \
  --json /tmp/p2-current.json --md /tmp/p2-current.md
```

CPU savings multiply the last measured paired thread-CPU median difference by
native call count. Earlier calls may have different costs. Shadow cost is excluded.
Wall-only measurements produce no CPU estimate. Boundary share is `null`, because
this observer does not add timing to boundary stages. Route observations follow
static reachability and may count a shared helper under several routes. They are
not request-level attribution. Unmatched runtime IDs remain visible.

## CI and build evidence

`report --ci` writes a full versioned JSON coverage report with a sorted `ci`
summary and a Markdown file. It compares stable relative function IDs, with
accepted, explicit, blocked, newly accepted, newly blocked, regressed accepted,
and regressed explicit lists. Removed functions count as regressions. Baselines
are previous full reports, not just their `ci` sections.

`--fail-on regressed-explicit`, `regressed-accepted`, or `newly-blocked` requires a
baseline and returns exit 2 on a match. Invalid inputs return 1. Reports are written
before a regression exit. No failure rule means informational output. The CLI
never posts comments. Package README documentation includes Actions steps only.

`--build-results` imports compilation evidence. Shared native builds write
`build-results.json` beside the addon. Explicit synchronous build failures write
blocked rows before throwing. Next async sidecar builds write the same contract
to `.next/cache/scriptc-functions/build-results.json`. Evidence IDs are relative
to the build working directory, so build from the app root. Match source revisions
and retain a failed build's evidence before cleaning its output. The CLI does not
check artifact hashes in supplied evidence and never compiles just to report.
Without evidence it labels compilation as not supplied. A build failure must still
fail the build step independently.

`--fuzz-results` copies supplied fuzz evidence into the CI report. This option does
not start fuzzing. Fuzz and build evidence may contain diagnostic data from their
own schemas; the runtime snapshot privacy contract applies to runtime capture.
Build output caps lists at 20 names, with source file and line. These are compiled
functions, not proof of native requests.

## Validation and limits

Tests cover detached aggregate snapshots, sensitive input exclusion after mismatch
and panic, native fallback reasons, file capture and exit hooks, fixture runtime
merge, route context, CI baseline differences, compiler-only regression logic,
removed functions, Markdown output, and CLI exit codes. Existing dispatcher tests
exercise the unchanged policy and compatibility fields. Existing adapter tests
exercise shared runtime registration through actual bundled Node servers.

Each snapshot is one process at one instant. Do not sum repeated captures from the
same process. Workers need distinct paths. Restarts reset counters. A dispatcher
with no calls has no per-function rows. Abrupt exits and native crashes may lose
the final interval. There is no cross-process aggregator or public endpoint.
Root README, discovery files, main checkout, compiler sources, workflows, external
accounts, and deployments were not modified.

The fixture CI Markdown included:

```text
1 accepted; 0 explicit; 0 blocked.
newlyAccepted: compute.ts#numeric
newlyBlocked: none
regressedAccepted: none
regressedExplicit: none
Compile evidence: not supplied; extraction only.
Fuzz: not supplied.
```

Node 24 full-suite validation: `pnpm --dir packages/next-scriptc test` passes
102 tests. `pnpm --dir packages/scriptc-promote test` passes 59 tests with two
existing skips. `git diff --check` also passes.
