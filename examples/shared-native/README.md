# Shared runway

One ordinary TypeScript function forecasts 36 months of cash runway across seeded
Monte Carlo paths. `lib/forecast.ts` is imported by both the client component and
`POST /api/forecast`. The browser starts in JavaScript and loads a verified wasm lane; the production Node adapter
compiles the same source and automatically selects native after verification.

From the repository root (Node >=24 and the stock scriptc toolchain):

```sh
pnpm install
pnpm --filter shared-native exec next-scriptc doctor .
pnpm --filter shared-native build && pnpm --filter shared-native start
```

Open http://localhost:3000. Choose the number of paths, then **Run both**.
**Collect verification samples** sends at most 750 sequential requests at 1,000
paths and then runs the selected input. It normally takes a few seconds. It uses
the default dispatcher policy; there are no reduced verification thresholds or
forced native lanes. The 24 paired samples need hundreds of calls because
shadows are sampled. Rechecks and the process quota can delay later collection.
The browser lane also builds when Next loads its development configuration. Server native observations require a production build.

The result includes survival probability and summed ending cash, browser time,
server call time, and exact equality using the dispatcher's `canonicalResult`.
The server panel uses the P2 `runtimeSnapshot()` API and sends only an allowlist
of this function's aggregates: lane, verified count, mismatches, fallbacks,
successful native calls, and per-bucket native/JS ratio and sample count. Empty
observations are labeled as such. This local demo adds its own HTTP endpoint;
the library does not expose one. Counters belong to this Node process, not a
fleet or a single request. A browser reload retains server state; a server restart
resets it. These small object inputs all enter bucket 0, so changing the number
of paths does not demonstrate separate bucket decisions.

## Local measurements

**Against well-written JS, native is 1.36–1.68× faster on this host.**
The default uses a Mulberry32 integer PRNG and reads input fields before the hot
loop. At 100k paths, Node JS takes 9.926 ms and adapter native takes 5.901 ms.
This is a modest local compute win, not the earlier 8× claim.

Apple M4 Pro, arm64 macOS, Node 26.13.0, stock scriptc 0.4.6, 2026-11-03.
Each lane has 30 warmups followed by 51 alternating-order wall samples.
Native includes checked argument encoding and result decoding. Wasm includes
JSON, UTF-8, allocation, copying, and cleanup. Every measured output matches JS.

| Paths | Node JS ms | Native ms | Node wasm ms | JS/native |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 0.101 | 0.074 | 0.076 | 1.36× |
| 10,000 | 1.006 | 0.606 | 0.704 | 1.66× |
| 100,000 | 9.926 | 5.901 | 6.994 | 1.68× |

Real Chromium 152 runs integer JS/wasm in 0.1/0.1, 1.0/0.7, and 9.9/7.0 ms.
The 1k browser result is clock-limited and does not establish a win.
The independent `report --measure` thread-CPU medians are 0.100/0.074,
1.001/0.596, and 9.964/5.899 ms (JS/native); all three predict native.
Single-host samples have no confidence intervals. HTTP, cold start, compilation,
download, dispatcher training, and runtime shadow overhead are outside these tables.

### Separate observation: Node float-modulo cliff

The old Park–Miller `(state * 16807) % 2147483647` version measures Node JS/native
at 1.323/0.204, 13.860/1.883, and 139.804/18.685 ms for the same sizes.
Its Node wasm times are 0.208, 2.054, and 20.499 ms. Chromium JS is 0.3, 3.3,
and 33.6 ms. The apparent 6.5–7.5× Node native speedup mostly reflects that
floating-modulo slow path. Replacing the PRNG and hoisting input reads makes
Node JS about 14× faster at 100k, while native also improves about 3.2×.
The two PRNGs produce different seeded paths; equality holds across lanes within
each variant, not between variants. The model and rounding rules stay the same.

See [D1b results and reproduction](../../research/shared-native-remeasure.md)
for raw samples, deopt checks, browser results, microbench controls, and limitations.

## Reproduce checks and evidence

```sh
pnpm --filter shared-native test
pnpm --filter shared-native start -p 3198
# In another terminal, from the repo root:
pnpm --filter shared-native test:server
pnpm --filter shared-native bench /tmp/shared-native-bench.json
pnpm --filter shared-native exec scriptc-promote report . --measure --inputs bench/inputs.json --json /tmp/shared-native-measured.json
pnpm --filter shared-native exec scriptc-promote fuzz . --seed 42 --budget-ms 2000 --max-cases 64 --json /tmp/shared-native-fuzz.json
```

`test:server` checks 12 seeded inputs against JS before and after promotion,
response shape, validation, zero
mismatches/fallbacks, at least 24 verifications, and actual native service. It is
separate from the fast suites. Use `SHARED_NATIVE_ORIGIN` for another port.
For the runtime CLI view, start with
`SCRIPTC_PROMOTE_SNAPSHOT=/tmp/runway-%p.json pnpm --filter shared-native start`,
then use `scriptc-promote report . --runtime /tmp/runway-PID.json` from this app.

## What this proves

This demonstrates source sharing, automatic discovery, native server execution,
exact sampled verification, and a native win for this compute-dense model.
The Mulberry32 generator mixes unsigned 32-bit state with `Math.imul` and shifts; currency
rounds down to whole dollars monthly. The model assumes independent revenue
shocks, growing costs, and no borrowing. It is a demonstration model.

It does not demonstrate universal equivalence, cryptographic
randomness, production financial forecasting, real-app automatic wins, fleet
observability, serverless savings, or superiority over Rust/SQL. Earlier integer variants lost to V8. The current measured variant wins locally;
compute density does not guarantee a win for arbitrary numeric code.
No hand-written C/Rust comparison was added.

Automatic discovery is deliberate: the flagship should show the default mode.
For a build-enforced variant, add `"use native";` as the first statement of
`forecast`. That makes unsupported code fail the build; it does not guarantee a
speedup, bypass runtime verification, or force the native lane.

See [the research record](../../research/shared-native-demo.md) for raw evidence
and limitations.

## Browser

The opt-in Next wrapper compiles the same discovered forecast closure to a
roughly 324 KB reactor (raw bytes vary with build paths). At 10k or 100k paths, run twice: the first call uses JS
while wasm loads, and later calls in measured buckets use wasm. The 1k bucket stays in JS. Browser checks,
mismatches, fallbacks and the serving lane appear separately from server counters.
Only buckets 13 and 16 (10k and 100k measured sizes) are enabled by the pinned source calibration key.
Changing the function requires fresh calibration. Generated `public/scriptc` assets
are ignored. See [browser setup](../../docs/browser.md) and
[W1 measurements](../../research/browser-wasm.md).
