# How promotion works

The product keeps TypeScript as the source of truth and tries native execution
for compute that can repay the boundary cost. It is experimental. Real-app
automatic wins are not yet proven. The held-out Papermark evaluation is even.

## Automatic and explicit modes

Node production adapters discover synchronous, pure functions with supported JSON
boundaries. They compile closed dependency slices with scriptc and wrap calls in
a dispatcher. Development keeps JS. Client Vite builds keep JS too.

The dispatcher compares native results with JS, measures paired calls in input
size buckets, and keeps the faster eligible lane. The current decision uses
24 paired samples, with 19 votes required for a native ratio below 0.90.
Small calls can stay in JS while large calls use native. Mismatches and native
failures fall back to JS. Periodic shadow checks continue after promotion.
Verification is sampled evidence, not a proof that all inputs are equivalent.

Use `"use native"` as the first statement of a known hot helper. Synchronous
explicit candidates share the core compiler and dispatcher. Next also supports
async explicit functions through a separate sidecar path:

```ts
export async function total(values: number[]): Promise<number> {
	"use native";
	return values.reduce((sum, value) => sum + value, 0);
}
```

Explicit code refusals fail the build. Infrastructure failures in automatic mode
keep JS. Next async sidecars also fail when their toolchain cannot start. They are
outside synchronous runtime snapshots and the fuzz CLI.
Use `"use js"` to exclude a function from automatic discovery.
Cloudflare has a separate static verified wasm lane and defaults to JS.

## What qualifies

Good candidates are closed synchronous calculations over supported scalars,
records, and arrays. Discovery checks mutation, module initialization, dependencies,
types, and estimated work. Ordinary async request handlers, arbitrary Node APIs,
shared mutable state, unsupported imports, and unproven boundaries can block it.
Classes and library compatibility depend on compiler and discovery coverage.
The report gives the concrete reason for each refusal.

Next sidecar boundaries require strict JSON. Classes, functions, cycles, sparse
arrays, nonfinite numbers, and optional undefined slots do not cross that boundary.
Use required nullable fields. Sidecars do not preserve Next request context.
Core encoders have separate supported specializations; do not assume that an
arbitrary JavaScript value is supported because its TypeScript type checks.

## Compute must repay transport

Native execution pays for encoding, transport, decoding, and result conversion.
Input bytes alone do not predict a win. The calculation must do enough work per
byte to cover that cost. The roadmap records roughly 1.5 microseconds per event
for the measured boundary, not a universal constant.

Repository synthetic numeric measurements show 3–4 times native speedups.
Stock scriptc is roughly five times slower than V8 on measured object and string
workloads. The guarded 60k decode experiment reduced native wall time from
75.874 to 57.864 ms, while JS took 21.870 ms. All dispatcher buckets stayed in JS.
These local figures describe specific workloads, not expected application gains.
See the [roadmap evidence](../ROADMAP.md),
[boundary measurements](../research/boundary-decode-path.md), and
[coverage measurement method](../research/coverage-report.md).

`report --measure --inputs inputs.json` measures boundary-inclusive calls for your
argument tuples. Synthetic defaults do not represent production traffic.
Compilation, a passing HTTP response, and static acceptance each prove less
than observed native execution. Runtime snapshots provide that separate evidence.

## Inspect and verify

Run `doctor` before building to check installation, helpers, toolchain, config,
TypeScript, and writable cache space. Failed checks return status 1 and repair
instructions. It never repairs files automatically.

Run `report` to see accepted, explicit, blocked, and excluded functions with source
positions. Add `--runtime snapshot.json` for observed dispatcher activity.
Run `fuzz` to compile and compare bounded seeded cases with the JS reference.
A failed or unavailable comparison returns nonzero. Fuzzing does not cover async
sidecars or native routes. Build fuzzing is opt-in and runtime shadows remain on.
See the [CLI and runtime reference](../packages/scriptc-promote/README.md).

## Why TypeScript instead of SQL or Rust

One source can run as JS in the browser, native on Node, and wasm or JS on Workers.
JS remains the differential-testing reference, reducing drift between separately
maintained implementations. Missing automatic artifacts retain the JS path.
Generated encoders use TypeScript boundaries instead of hand-written bindings.
Input size buckets let the Node dispatcher keep small calls in JS.

Keeping compute in ordinary functions also makes unit testing and debugging
familiar. `"use js"` returns automatic candidates to ordinary JS.
These benefits do not mean TypeScript is always the fastest choice. SQL wins when
large data already lives in the database. Rust offers raw speed, especially for
object and string workloads today. Existing native libraries may already solve
the expensive part. Do not move work out of SQL or rewrite Rust merely to adopt
this experiment. The [roadmap](../ROADMAP.md) records the product rationale and
current limits.
