# Native result validation

2026-11-01. Adapter-only experiment on `t3/native-result-validation`, stock scriptc 0.4.6,
macOS arm64. No Docker stand-in or Vercel run. The nearly-free validation goal
is **not achieved**. Keep strict production validation. Generated visits remain
an opt-in experiment because their measured gain is small and noisy.

## Why a return type does not certify a result

E1 identified descriptor reflection as the dominant cost. M2 measured about
0.58 ms for result encoding, even though E1's typed JSON encoder costs about
0.01 ms. Returning a different wire format does not establish that the source
value was safe to encode.

The application's checker proves supported boundary types, not exact runtime
objects. A function declared to return `{n:number}` can return an object with
extra enumerable fields, hidden properties, accessors, symbols, or a different
prototype. Assertions and JSON.parse can also fabricate malformed fields.
Arrays can be sparse or cyclic. A correct shape-specific validator still needs
a runtime check of those facts, or a stronger construction proof.

The new checker metadata describes bounded records, arrays, primitives, and
nullable values. Recursive types, tuples, dictionaries, mixed unions, and schemas
larger than 256 visits or 32 levels use the existing generic validator. This is
a code-generation bound, not a runtime data-size limit.

`result-validator.mjs` generates typed visits. `resultContainer` checks each
container's prototype, descriptor dictionary, symbols, density, and expected
keys before any typed field read. Valid extra fields fall back to the full
serializer; they are never silently dropped. The encoder remains the typed
JSON.stringify call at the wrapper. It retains actual key order and escaping.
An active set rejects cycles while allowing shared references as before.

`buildPromotion(...,{specializeResults:true})` enables the experiment. The
normal build leaves it off. Shadowing and its canonical byte comparison remain
unchanged in both modes. No sampled or promoted call skips required validation.

## Alternatives and decision

- **Generated typed validators:** implemented and measured. They remove generic
  primitive dispatch, but strict container reflection remains. Keep the code
  available for experiments, with production use disabled.
- **UTF-8 JSON bytes and generated decoding:** the existing ABI already returns
  length-delimited UTF-8 JSON, constructs a V8 string, and calls JSON.parse.
  A Uint8Array wire value would add a JS UTF-8 decode and still require native
  source validation. JSON.parse already creates ordinary objects with safe own
  `__proto__` properties and the wire's key order. A generated decoder cannot
  recover hidden properties, prototypes, aliases, or a sign bit that the native
  encoder discarded. No byte transport was added.
- **Compact typed layout:** this could bypass generic JSON encoding, which is
  already cheap. Projecting declared fields into a layout silently drops extras
  and bypasses getters, prototype, symbol, and density checks. It requires the
  same source proof before it is sound. No unchecked layout was added.
- **Skipping validation after promotion:** rejected. A bucket groups input
  sizes, not program paths or values. After any number of valid results, the
  next input can select `Object.defineProperty(result,'hidden',{value:1})`.
  Trickle shadows can detect a later problem but cannot prevent the first
  unsampled invalid answer. Even determinism does not imply a constant shape.

The promising fix is a compiler/runtime closed-record certificate, with checked
fallback when dynamic operations invalidate it. The [patch ledger](scriptc-patches.md)
contains a candidate and minimal repro. A future adapter whole-program proof of
construction could also qualify a smaller subset; the TS return type alone
cannot supply that proof. No scriptc source was changed.

## Loaded-host interleaved A/B

Run `node research/native-result-validation-bench.mjs` with stock scriptc 0.4.6
installed. Cached revenue results are computed outside timing. Both input sizes
produce 248 daily rows. Each size has 10 warmup rounds and 120 measured rounds;
strict, generated, and unchecked control rotate their order each round. Every
output is compared byte-for-byte with JS. The control is never a dispatch path.

The instrumented compute stage contains validation and encoding only. Values
below are elapsed milliseconds, not CPU. Host load and all 720 measured rows are
in [the raw artifact](native-result-validation-host.json). Scheduling, instrumented
clocks, Node version, and host load limit transfer to M2. No stand-in prediction
or calibrated performance win is claimed.

| Events | Strict median / p95 ms | Generated median / p95 ms | Typed encoding control median / p95 ms |
| ---: | ---: | ---: | ---: |
| 1,000 | 0.682 / 1.098 | 0.652 / 0.968 | 0.013 / 0.018 |
| 5,000 | 0.597 / 0.888 | 0.574 / 0.913 | 0.012 / 0.018 |

Paired generated-minus-strict differences have median -0.027 ms at 1k and
-0.023 ms at 5k. Their p05–p95 spreads are [-0.362, +0.214] and
[-0.321, +0.256] ms. The central change is about 4%, below C1's 17.37% error.
It does not justify production activation. Boundary gains need hosted confirmation.
The first erased-helper implementation was slower (0.519 to 0.768 ms at 1k);
typed helper signatures corrected that mistake. Only the final typed run is
retained in the raw artifact.

## Correctness changes and limits

Direct number arguments and results now retain the f64 negative-zero sign bit.
Scalar shadow comparison uses distinct bytes for -0 and 0.
Inside JSON arguments and results, -0 is still canonicalized to 0, as in Phase 1.
The branch first made JSON promotion refuse -0. Review found that the refusal
throws inside the native lane, which panics and poisons the instance: one -0 in a
result demoted every promoted function for the process lifetime (reproduced).
That refusal was reverted before merge. A per-call JS fallback signal from native
code would be needed to refuse -0 safely; until then the -0 to 0 change inside
JSON stays a documented fidelity gap (visible only via `Object.is` or `1/x`).

Tests cover hidden symbols and properties, accessors without invocation, polluted
key names, non-plain prototypes, cycles, sparse arrays, NaN, lone
surrogates, 20,000-level nesting, large arrays, byte views, and extra-field fallback.
Native generated-path tests cover sync and async 10,000-row results, and a -0 JSON result
that must not poison the instance. Native integration also exercises ordinary and instrumented addons.

This work does not establish full JS observational equivalence for the existing
promotion system. JSON transport already clones shared identities and loses
property attributes; canonical-byte shadowing alone cannot detect those changes.
E1 also records stock scriptc losing a hidden array symbol before validation.
These limitations predate this experiment. Neither the generated path nor a new
wire encoding can justify removing checks based on those incomplete observations.
The new path preserves the existing strict validation policy and is disabled by
default. Achieving the user's full indistinguishability requirement needs stronger
eligibility proofs and compiler guarantees, beyond this measured optimization.

## Validation

Node 24.22.0 passes all 54 adapter tests, both shim tests, and all 24 demo tests,
with `--test-concurrency=2`. The host benchmark used Node 26.13.0. Dependency setup
used an offline install and the package's native install script. The cached
checker and LLVM helper needed executable permissions in this worktree's
node_modules. An initial run failed on that setup; a new checker test also needed
an explicit source file for TypeScript's getStart. Both were corrected before
the final runs. No root README edit, scriptc checkout edit, or generated addon
is part of the commit.
