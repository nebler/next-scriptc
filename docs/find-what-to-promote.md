# Find what to promote

Capture a CPU profile from the server under representative load, then join it
with discovery. Keep the build output, source maps, and source revision that
produced the capture. Run the report from that same checkout.

## Capture the server

For Next, build first, then profile the production server:

```sh
pnpm exec next build
NODE_OPTIONS="--cpu-prof --cpu-prof-dir=/tmp" pnpm exec next start
```

Send realistic requests from a separate process. Stop the server normally so Node
writes its `.cpuprofile` files. `NODE_OPTIONS=--cpu-prof next start` also works
when `next` is already on your PATH. If your Node release rejects profiling flags
in `NODE_OPTIONS`, invoke Node directly:

```sh
node --cpu-prof --cpu-prof-dir=/tmp node_modules/next/dist/bin/next start
```

Package managers, workers, and child processes can each produce a file. Select
the server process captures. Avoid combining overlapping captures of one process.
To exclude startup, warm the server, then use an inspector `Profiler.start` and
`Profiler.stop` session. Save the returned `profile` object as JSON. Chrome
DevTools' Node CPU profiler exports the same format. A browser tab's profile
measures client work and cannot establish a server promotion opportunity.

For Nitro, enable server source maps in your build configuration and profile the
Node output:

```sh
pnpm build
node --cpu-prof --cpu-prof-dir=/tmp .output/server/index.mjs
```

For a Vite SSR adapter, enable `build.sourcemap: true`, build its production
server, then profile the actual Node entry. For example, SvelteKit adapter-node
uses `node --cpu-prof --cpu-prof-dir=/tmp build/index.js`. Other adapters have
different output entry names. Keep `.map` files beside their generated files.
The report reads adjacent `.map` files and `sourceMappingURL` references, including
inline maps and indexed source maps. Next's `.next/server/chunks` and Nitro's
`.output/server/chunks` need no special directory flag. Maps are read locally.

## Read the ranked report

```sh
pnpm exec scriptc-promote report . --profile /tmp/server.cpuprofile --suggest
pnpm exec scriptc-promote report . --profile /tmp/worker1.cpuprofile \
  --profile /tmp/worker2.cpuprofile --json /tmp/promotion-profile.json
```

The profile section ranks source functions by self CPU potential. Each row shows
self and inclusive shares, discovery status, source location, mapping confidence,
and a savings ceiling. Inclusive shares overlap. Inspect **Hot but blocked** for
exact discovery diagnostics and repair hints. Async rows suggest inspecting their
synchronous core. Excluded native route handlers use the separate route compiler.
A hint is a proposed first step. Fixing the first blocker can expose another.
`--suggest` prints up to five actions and never edits your source.

If you have representative argument tuples, add measurement:

```sh
pnpm exec scriptc-promote report . --profile /tmp/server.cpuprofile \
  --measure --inputs inputs.json --runtime /tmp/snapshot.json --suggest
```

The report uses the best boundary-inclusive native/JS thread-CPU ratio for that
function, preferring `--measure` over snapshot buckets. The optimistic estimate is
`self CPU share × max(0, 1 − ratio)`. Without a measured CPU ratio, the number is
only the self CPU share ceiling. Wall-time ratios do not estimate CPU savings.
Use a JS baseline capture and representative inputs before interpreting this as
potential savings. Already-native profiles hide the JS work they replace.
Estimates omit shadow overhead and interactions and must not be added together.

A `source-map` label means the generated frame position resolved into a local
source function. `source-position` means the frame points directly into source.
`heuristic (file + function name)` means an unambiguous name matched within a
source file without position evidence. Minified names without maps commonly stay
unmapped. The report keeps unmapped work in the denominator and lists its largest
frames. Confirm uncertain matches before making changes.

## Sample production carefully

Use short, bounded sampling windows on a representative instance. Compare normal
and profiled request latency and CPU. Do not profile every worker continuously.
Preserve the sampling interval, workload, Node version, build ID, and revision
with the capture. Prefer warmed inspector captures to whole-process startup
profiles when finding request hotspots. Do not expose an unauthenticated inspector
port. Store profiles and maps privately: they contain function names and paths.

Shares approximate sampled non-idle CPU, including GC and native/unmapped work.
V8 sampling is not process CPU accounting. Idle samples are excluded and recorded
separately. Missing deltas use an explicitly labeled uniform-duration estimate.
Inlining, native execution, and async continuations can hide source frames.
Re-measure the complete endpoint after a change; static acceptance alone proves
neither native execution nor a speedup.

See [how promotion works](how-it-works.md), the
[CLI reference](../packages/scriptc-promote/README.md), and
[design and validation evidence](../research/profile-guided-promotion.md).
