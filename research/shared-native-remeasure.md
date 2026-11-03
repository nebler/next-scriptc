# D1b: the forecast against optimized JavaScript

2026-11-03, Apple M4 Pro, macOS arm64, Node 26.13.0, stock scriptc 0.4.6.
The demo now uses Mulberry32 and hoists invariant input reads. Native is
1.36–1.68× faster than this JS in the measured sizes. The advantage is modest.
At 100k paths it saves about 4.0 ms of warmed compute, excluding HTTP and
verification overhead. The former 8× headline is withdrawn.

## Comparison and choice

The integer variant retains the 36-month model, shocks, cost growth, whole-dollar
rounding, bounds, result shape, and automatic discovery. It changes the random
stream and normalizes seeds with `>>> 0`. Mulberry32 advances a 32-bit state,
then mixes bits with `Math.imul`, xor, or, and unsigned shifts. There is no
floating remainder in the generator. Both variants read cash, revenue, and costs
once before the loop. The benefit of field hoisting was not timed separately. The old variant remains a research fixture outside the app,
so discovery compiles only the default forecast.

Medians in milliseconds, 30 warmups per lane and 51 alternating-order samples:

| PRNG | Paths | Node JS | Adapter native | Node wasm | JS/native | Chromium JS | Chromium wasm |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Float modulo | 1,000 | 1.323 | 0.204 | 0.208 | 6.48× | 0.3 | 0.2 |
| Float modulo | 10,000 | 13.860 | 1.883 | 2.054 | 7.36× | 3.3 | 2.1 |
| Float modulo | 100,000 | 139.804 | 18.685 | 20.499 | 7.48× | 33.6 | 20.5 |
| Integer | 1,000 | 0.101 | 0.074 | 0.076 | 1.36× | 0.1 | 0.1 |
| Integer | 10,000 | 1.006 | 0.606 | 0.704 | 1.66× | 1.0 | 0.7 |
| Integer | 100,000 | 9.926 | 5.901 | 6.994 | 1.68× | 9.9 | 7.0 |

Choose the integer variant because ordinary JS deserves an efficient PRNG and
stable input access. No special compiler port or weakened dispatcher policy is
needed. The remaining native gain is useful locally but does not establish a
win for arbitrary numeric functions or real applications.

The float version is a separately labeled Node performance cliff. Its microbench
cost is about 37 ns per step. Chromium runs its JS about 4.2× faster than Node.
Changing PRNG plus hoisting input fields brings Node JS to about 10 ms at 100k,
faster even than the old native version. Native also benefits from the integer
PRNG. These are different random streams, not equivalent outputs across PRNGs.

## Method and V8 state

`examples/shared-native/bench/run.mjs` loads the real Next adapter addon, IDs,
and schemas. Native timing includes checked argument encoding, execution, and
result decoding. Node wasm uses the W1 reactor and compute-only WASI bridge,
including JSON, UTF-8, allocation, copies, parsing, and cleanup. Lanes reverse
order on alternate samples. The browser uses the W1 measurement helper and real
Chromium 152 / Electron 44 preview. It has roughly 0.1 ms clock granularity.
Its 1k integer result proves no speedup; browser calibration now enables only
log2 buckets 13 and 16, with a fresh source key. The 1k bucket 9 stays JS.

Each variant checks four seeds at all three sizes and every timed output for
exact agreement across its lanes. Seeds are 1, 42, 2147483648, and 4294967295.
The integer 10k/42 output is 5,168 solvent paths and 1,924,625,910 total ending
dollars. Pinned example tests cover signed/unsigned seeds, wraparound,
trial bounds, determinism, and immutable inputs.

Small-input prewarming collects type feedback before large OSR loops. Hoisting
input properties avoids generic named access in the hot path. Trace runs still
show finite startup transitions for accumulator overflow, non-Smi results, and
OSR. After warming all three sizes, `deopt.mjs` marks BEGIN, performs 100 cycles
of all sizes, then marks END. There are zero deoptimizations between those markers
and no generic-named-access bailout loop. No V8 flags disable optimizations.
`deopt.log` retains the startup events and final checksum. Benchmark runs used
`--trace-deopt`; checks occur outside timed intervals.

No task build or package suite overlapped the measurement windows. Host activity
was not isolated. These are one-host warmed medians without confidence intervals,
not cold-start, network, download, render, billing, or deployment measurements.
The old and integer windows are sequential. The first old adapter build also
contained a duplicate research fixture, removed from the app before the final
build; the benchmark selects the actual `lib/forecast.ts` ID, not array position.

## Independent dispatcher prediction

`report --measure` uses 24 thread-CPU pairs per tuple and default stability policy.

| Paths | JS ms | Native ms | Verdict |
| ---: | ---: | ---: | --- |
| 1,000 | 0.100 | 0.074 | native |
| 10,000 | 1.001 | 0.596 | native |
| 100,000 | 9.964 | 5.899 | native |

This predicts a lane, rather than proving service. The production HTTP test also
checks the observed default dispatcher after collecting ordinary sampled shadows.
It observes native service with 24 decision pairs, 26 checks, zero mismatches
and fallbacks, and 13 native calls. The observed ratio is 0.525 under concurrent
package tests; it is not substituted for the isolated benchmark medians.
[Retained runtime result](shared-native-remeasure/server.json). Small JSON tuples all map to
server bucket 0, so this does not demonstrate separate server size decisions.

## Short control list

Independent scalar-return controls, 3.6 million iterations, same 30 warmups and
51 alternating samples. Native uses the normal promotion builder and addon.
Every output agrees exactly; source and raw samples are retained.

| Operation | Node JS ms | Native ms | JS/native |
| --- | ---: | ---: | ---: |
| `floatModulo` | 134.395 | 18.037 | 7.45× |
| `fractionalPower` | 39.930 | 37.776 | 1.06× |
| `limbCarry` | 2.795 | 3.331 | 0.84× |

Floating remainder is the clear cliff here. Fractional `Math.pow` on varying
bases gives only a 1.06× native gain. Unsigned two-limb addition with carry,
a BigInt-free 64-bit-style control, is faster in JS. These controls give no reason
to redesign the demo around expensive arithmetic. They are not general engine
rankings. Constant powers and true BigInt are not measured.

## Reproduce

Install only in this worktree, without shared-store hard links:

```sh
pnpm install --frozen-lockfile --store-dir /tmp/d1b-pnpm-store --package-import-method copy
node research/shared-native-remeasure/build-variant.mjs float
PRNG=float node --trace-deopt examples/shared-native/bench/run.mjs /tmp/float.json /tmp/d1b-float-adapter /tmp/d1b-float-wasm/compute.wasm
node research/shared-native-remeasure/build-variant.mjs integer
node --trace-deopt examples/shared-native/bench/run.mjs /tmp/integer.json /tmp/d1b-integer-adapter /tmp/d1b-integer-wasm/compute.wasm
node --trace-deopt research/shared-native-remeasure/deopt.mjs
node research/shared-native-remeasure/cliffs.mjs
node packages/scriptc-promote/src/cli.mjs report examples/shared-native --measure --inputs examples/shared-native/bench/inputs.json --json /tmp/report.json
pnpm --filter shared-native build
```

The variant helper temporarily changes source/config and restores them in `finally`.
Run it without concurrent dev/build processes. It leaves `.next` for that variant,
so rebuild the final demo before serving. Build outputs stay ignored or in `/tmp`.
The normal install succeeded with executable stock helpers; no repair was needed.

For Chromium, start `node research/shared-native-remeasure/serve.mjs`, open
`http://127.0.0.1:18997`, and run the W1 helper for each variant:

```js
const {instantiate} = await import('/bridge.mjs');
const {measure} = await import('/measure.mjs');
const results = {};
for (const variant of ['float', 'integer']) {
  const {forecast} = await import('/' + variant + '.mjs');
  for (let i = 0; i < 100; i++) forecast({trials:10, seed:42, cash:250000, revenue:40000, costs:50000});
  const bytes = await (await fetch('/' + variant + '.wasm')).arrayBuffer();
  results[variant] = measure(forecast, instantiate(await WebAssembly.compile(bytes)),
    {userAgent:navigator.userAgent, crossOriginIsolated});
}
```

[Node float samples](shared-native-remeasure/node-float.json),
[Node integer samples](shared-native-remeasure/node-integer.json),
[Chromium samples](shared-native-remeasure/browser.json),
[report evidence](shared-native-remeasure/report.json),
[control samples](shared-native-remeasure/cliffs.json), and
[deopt trace](shared-native-remeasure/deopt.log) retain the evidence.

## Validation

- Example unit suite: 3 pass, no failures.
- Production Next/Turbopack build: passes, one native function. Existing generated-runtime tracing warnings remain.
- Production HTTP test: 12 seeded cases before and after promotion, observed native service, 26 checks, zero mismatches or fallbacks. Invalid input returns 400.
- `packages/next-scriptc pnpm test`: 103 pass, no failures or skips on Node 26.13.0.
- `packages/scriptc-promote pnpm test`: 79 pass, two existing skips, no failures on Node 26.13.0.
- Browser W1 harness: both variants pass 12 seeded cases and all measured outputs.
- Deopt audit: zero events in the marked 300-call steady workload.

The first package runs found a stale browser-test calibration key and a fixture
copying installed pnpm links. The key now matches the new forecast; the framework
test excludes `node_modules` before its existing fresh install. This avoids npm
running a missing `isbot` prepare script through copied links. No production
package code changes. Temporary moved worktree links were restored.

The shell's Node was 26, while the initial pnpm script environment selected 23.
Final suites explicitly prepend Node 26.13.0's real binary directory to PATH.
They use `--config.verify-deps-before-run=false` to avoid an incidental automatic
reinstall during the temporary fixture-link move. This does not change the tests.
No measurements were taken during these suite runs.

All work stays in this worktree and `/tmp`. No compiler changes, main-checkout
or main node_modules changes, external services, deployment, Docker, secret,
root README edit, push, PR, issue, or public post.
