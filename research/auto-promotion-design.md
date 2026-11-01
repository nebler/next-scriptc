# Automatic native promotion: design (draft for review)

2026-11-01. Status: design only, nothing implemented.

The goal is to remove the need to write `"use native"`. The build finds functions that *could* run natively and compiles them both ways. At runtime the server measures real calls and checks that native output matches JavaScript byte for byte. Native is used only where it measurably wins. The idea comes from JIT tiering (interpreter, then optimizing compiler). The upper tier here is scriptc instead of V8's optimizer, and promotion is a dispatch decision because compilation happened at build time.

Why now: [A1](use-native-napi.md) and [A2](use-native-napi-vercel.md) moved native code into the Node process. On Vercel the in-process boundary costs about 0.02 ms instead of the sidecar's ~3.6 ms. The first call is 17 ms instead of 91 to 112 ms. Per-call switching is therefore close to free. A2 also shows why a fixed annotation is the wrong unit. The same `revenue` function loses at 1k events (1.72 vs 0.85 ms) and wins from 5k (2.76 vs 3.81 ms) up to 200k (52.7 vs 171.5 ms). The decision depends on the input, not the code.

## Non-goals for v1

- Async functions. Library mode is sync-only and static-only (A1: async exports fail with SC4004). v1 promotes synchronous functions only. Extracting a sync core from async code automatically is later work.
- Cloudflare Workers. WebAssembly does not beat V8 there ([W1](use-native-wasm-workerd.md)).
- Compiling at runtime. scriptc builds take seconds and need LLVM. Everything is compiled at build time; runtime only chooses.
- Cross-deployment learning. This is phase 2, below.

## Pipeline

```
discover ──► compile both ──► dispatch ──► shadow-verify ──► promote / demote
 (build)       (build)        (runtime)      (runtime)         (runtime, per size bucket)
                                                   └── logs ──► phase 2: next build uses them
```

### 1. Discover (build)

The aim is to find exported, synchronous, module-level functions in server code whose parameters and results are JSON data. Most of this already exists:

- The traversal in `extractFunctions` (functions/extract.mjs) already resolves named module-level functions and rejects closures, defaults, rest and destructuring. It also forbids `next`, `react` and `react-dom` imports. Discovery runs the same checks without requiring the directive and with `sync` instead of `async`.
- `checkFunctionTypes` (functions/types.mjs) already proves the boundary types with the application's real type checker. Any `any`, `unknown`, class, function or `undefined` disqualifies a function.
- New: a **purity screen** for v1, deliberately conservative. Reject if the function, or anything it reaches, does any of the following:
  - writes module-level mutable state;
  - performs I/O (`fs`, `fetch`, `net`, `process.env` reads);
  - reads time or randomness (`Date.now`, `new Date()` without arguments, `Math.random`, `crypto.random*`).

  Reading module constants is fine. Anything the screen misses is caught at runtime by shadow verification (step 4).
- New: a **work screen**, so build time isn't spent compiling trivial getters. Require a loop, recursion, a callback to an array method, or `JSON.parse` on an argument. This only limits what gets compiled; it doesn't decide promotion.
- **Compilation is the final filter.** Library mode is static-only, so whatever scriptc refuses is reported as "not a candidate (SCxxxx: reason)" and stays JavaScript. The build never fails because of a candidate.

Configuration: `nativePromotion: "auto" | "off"` in the adapter options. `"use native"` stays as a hint that forces a function into candidacy and fails the build if it can't compile, so errors stay loud. `"use js"` opts a function out.

### 2. Compile both (build)

- All candidates go into **one** scriptc library archive per target, using A1's profile shape: exported `fn_<id>(input, len, &out, &outLen)` plus `init`, with a JSON string boundary.
- The archive is linked into **one** N-API addon using A1's serialized-owner shim, generalized from `rev_run` to an id-indexed table. Targets are `linux-x64-gnu` for Vercel (zig cross-compile, as in A2) and the host for local `next start`. `next dev` stays pure JavaScript.
- The original JavaScript is unchanged. The loader rewrites each candidate's export into a thin wrapper: `export function f(...args) { return __promote(ID, f$js, args); }`.
- The addon is shipped next to the Functions that import a candidate, using the same trace-based targeting as `functionUsesNative` in vercel.mjs.

### 3. Dispatch (runtime)

Each function has a small state machine, kept separately per **size bucket**. A bucket is `floor(log2(estimated input size))`, so 1k and 200k events never share a decision.

| State | Behavior | Exits |
|---|---|---|
| `js` (initial) | JavaScript only. Records JS time per bucket. | Enough JS samples in a bucket → `shadow` for that bucket |
| `shadow` | JavaScript answers the caller. A sampled fraction also runs natively in the background on a copy of the arguments, then compares output and records native time. | After N verified matches: `native` if native median < 0.9 × JS median, else `js-final`. On mismatch: `demoted` |
| `native` | Native answers. A small trickle keeps shadow-checking (e.g. 0.1%). | Mismatch or panic → `demoted`. Native queue too deep → fall back to JS for that call |
| `js-final` / `demoted` | JavaScript only. Demotion is logged with the input hash. | None for the life of the process |

Points that need care:
- **Overhead on the JavaScript path must be close to zero.** The wrapper costs a closure call, a bucket lookup and a `performance.now()` pair. Budget: ≤ 0.005 ms per call. Measure it, because this is the kill criterion for "always on".
- **Estimating input size.** Serializing the arguments just to bucket them would cost almost as much as the boundary. Use a cheap shallow estimate instead: string lengths plus top-level array lengths. Exact JSON size is only computed on calls that go native, where serialization happens anyway.
- **Shadow runs never delay the caller.** They run on the native owner thread after JavaScript has already returned. They're capped by rate (e.g. at most 1 in 20 calls, at most 50 per minute per function) and skipped while the queue is non-empty. Shadow CPU is an explicit, bounded cost.
- **Output comparison** uses the existing strict serializer (json.ts `serialize`) on both outputs and compares bytes. JavaScript output passes through the same validator, so a value native can't represent counts as a mismatch, not an error.
- **Backpressure.** A1's runtime serializes all native work on one thread. When the queue is deeper than k (e.g. 2 in flight), the dispatcher answers that call with JavaScript. Under concurrency the system therefore degrades to Node speed instead of queueing behind native work. This turns the serialization weakness into graceful load shedding.

### 4. Safety

- **Panic:** A1 poisons the instance permanently. The dispatcher marks every function `demoted` and the process keeps serving with JavaScript. No restart is needed, which is better than the sidecar's behavior.
- **Segfault:** this still kills the process. That's the residual risk of running in-process. Two mitigations: only shadow-verified functions are ever promoted, and a crash counter in `/tmp` per instance disables promotion after a native crash on the next start. Be explicit about this in docs.
- **Determinism:** functions that are nondeterministic but slip past the purity screen mismatch during shadowing and are demoted before they ever answer a caller.

### 5. Observability

The dispatcher emits one log line per transition, e.g. `next-scriptc promote fn=revenue bucket=13 js=3.81 native=2.76 n=60`. It also emits periodic per-function counters (calls, share native, CPU saved estimate) and a `Server-Timing` entry when timing is enabled. These logs feed phase 2 and make the demo graph.

## Phase 2: platform loop (Vercel only, later)

The build reads the previous deployment's promotion log, from log drains or a JSON artifact in the local prototype. Then:
- functions that never won are not compiled, which saves build time;
- winning thresholds per bucket are shipped as priors, so new instances start in `native` for known-good buckets. Shadowing continues at the trickle rate.

Combined with Active CPU billing, this is the pitch: *the platform makes your hot code native automatically, verifies it on your real traffic, and your CPU bill goes down.* Only Vercel has the cross-deployment telemetry to run this for real. The prototype proves the mechanism.

## Prototype scope and success criteria

**Demo:**
- The `revenue` core written as a plain sync function, with no directive.
- Two decoys: one that reads `Date.now()` (rejected statically) and one tiny getter (rejected by the work screen).
- One function that passes the screens but differs subtly. A candidate is float formatting in an edge case; if none can be found, inject one. It must be demoted by shadowing.

**Measure on Vercel (preview, iad1), same harness as A2.** Use a mixed workload, e.g. 70% 1k, 20% 5k, 10% 200k requests, with three configurations: always-JS, always-native and auto.

**GO if all of these hold:**
1. auto is at least as fast as the better of always-JS and always-native in *every* bucket (within noise), and beats both on the mixed total;
2. the dispatcher adds ≤ 0.005 ms per JavaScript-routed call;
3. outputs are 100% identical;
4. the injected mismatch is demoted without ever answering a caller natively.

**Kill criteria:**
- the dispatcher overhead makes the 1k bucket measurably slower than plain Node;
- shadow CPU cancels the savings on the mixed workload.

## Open questions

1. **Size estimate quality.** Is a shallow estimate good enough to separate 1k from 5k reliably for real argument shapes?
2. **Where discovery runs.** It starts in the existing Next loader. For the Vite plugin the same logic would move into a Vite `transform` for the server environment only.
3. **Multiple libraries.** Symbol prefixes per archive, so one addon can hold every candidate in an app (A1 lists this as a blocker).
4. **Fluid concurrency.** Is a single owner thread plus JavaScript fallback enough, or is a small pool of TLS instances worth A1's 5k penalty under real concurrency?
5. **Is the 0.9× promotion margin right,** or should it depend on the bucket's variance?
