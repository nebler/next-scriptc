# Shared runway

One ordinary TypeScript function forecasts 36 months of cash runway across seeded
Monte Carlo paths. `lib/forecast.ts` is imported by both the client component and
`POST /api/forecast`. The browser runs JavaScript; the production Node adapter
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
Development (`pnpm --filter shared-native dev`) runs JS without observations.

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

Apple M4 Pro, arm64 macOS, Node 26.13.0, stock scriptc 0.4.6, 2026-11-03.
Adapter artifact, 30 warmups per lane then 51 alternating wall-time samples;
medians include native argument encoding and result decoding:

| Paths | Input bytes (argument tuple) | Node JS ms | Native ms | JS/native |
| --- | ---: | ---: | ---: | ---: |
| 1,000 | 71 | 1.555 | 0.221 | 7.02× |
| 10,000 | 72 | 15.927 | 1.923 | 8.28× |
| 100,000 | 73 | 159.421 | 18.712 | 8.52× |

The independent `report --measure` thread-CPU medians were 1.578/0.213,
15.916/1.929, and 176.002/20.709 ms (JS/native); all three predict native.
These are single-host runs under concurrent tests, without confidence intervals.
The browser's displayed timing is a separate browser measurement. HTTP latency,
cold start, compilation, and training overhead are outside the table.

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
A Park–Miller generator keeps integer products exactly representable; currency
rounds down to whole dollars monthly. The model assumes independent revenue
shocks, growing costs, and no borrowing. It is a demonstration model.

It does not demonstrate browser wasm, universal equivalence, cryptographic
randomness, production financial forecasting, real-app automatic wins, fleet
observability, serverless savings, or superiority over Rust/SQL. The first integer
PRNG variant lost to V8; the dispatcher correctly kept JS. Compute density alone
is necessary here but does not guarantee a win for arbitrary numeric code.
No hand-written C/Rust comparison was added.

Automatic discovery is deliberate: the flagship should show the default mode.
For a build-enforced variant, add `"use native";` as the first statement of
`forecast`. That makes unsupported code fail the build; it does not guarantee a
speedup, bypass runtime verification, or force the native lane.

See [the research record](../../research/shared-native-demo.md) for raw evidence
and limitations.
