# Local construction proof and per-call fallback

2026-11-01. Adapter-only experiment on `t3/widen-construction-proof`, stock
scriptc 0.4.6, Darwin arm64. `constructionResults` remains off by default.
The synchronous demo `revenueCore` and Papermark `documentViewDistribution`
qualify. The async demo `revenue` wrapper remains strict. The complete requested
coverage goal is therefore not achieved. The measured 5k regression also rules
out enabling this experiment by default.

## A fallback is a successful native invocation

A screened JSON wrapper returns the empty string when its value scan fails.
An empty string cannot be a JSON document. Its generated C entry recognizes that
wire value, sets `Job.fallback`, and does not copy an output. The addon returns
`{fallback:true}` outside the value and timing envelopes. Ordinary JSON results
are strings, so they cannot collide with this object. For screened scalar numbers,
the wrapper returns NaN before strict serialization, and C treats a non-finite
f64 result as the same status. Strings and byte results retain their original ABI.

The dispatcher counts a native fallback and executes JS outside the native
exception handler. It leaves the bucket and other functions usable. A shadow
fallback increments the counter without adding a pair, incrementing verification,
or changing state. JS results that fail canonical serialization also skip the
sample. Native exceptions still poison the instance. Argument encoding failures
now fall back per call before native entry instead of poisoning the instance.

The generated result visit uses the checked bounded shape and reads values only.
It checks array identity, null and object guards, primitive kinds, and finite
numbers. It performs no descriptor, prototype, own-key, or symbol reflection.
The construction proof supplies those facts. Its guards precede child reads.
Under that proof it does not invoke getters, encounter cycles, or throw on a
missing field. Arithmetic NaN and Infinity trigger fallback before JSON encoding
can replace them with null.

JSON negative zero retains the existing canonicalization to zero. The optional
negative-zero fidelity extension is not implemented. Arithmetic negative zero
is tested without poisoning. Scalar f64 results retain their existing sign bit.

## The proof retains possible aliases and reference edges

The original immutable CR2 screen remains available. If it rejects, the new screen
checks the complete extracted module with a second strict TypeScript program,
including `noUncheckedIndexedAccess`. Unknown syntax and checker diagnostics fail
closed. Type-only imports may resolve declarations; runtime imports remain excluded.
No application function name or workload constant affects eligibility.

The new analysis associates each allocation site with an abstract container.
Bindings hold sets of possible containers. Field writes, collection insertion,
branches, and repeated loop visits union those sets. They never erase an earlier
edge. The solver revisits every helper and every branch until no binding, field,
or return set changes. It rejects after 64 rounds rather than guessing. Helpers
have an acyclic call graph. Allocation sites conflate loop iterations, which can
reject safe programs but cannot remove an alias.

The following rules provide the closure argument:

- Parameters and parsed containers carry a borrowed marker. Aliases and child
  container reads preserve it. Mutation requires exclusively local allocation
  sites, so aliasing an argument into a local cannot authorize a write. Parameter
  assignment is excluded, which also keeps parse guards tied to their inputs.
- Dense array literals, `push`, `map`, `filter`, and `Array.from` of local Map or
  Set iterators allocate dense arrays. `sort` requires a local array and cannot
  add holes. All index reads and writes, length writes, sparse literals, array
  constructors, and spread remain excluded. Even `a[a.length]=v` is rejected.
- Ordinary object literals allocate data properties. Static property writes
  require local plain objects. Computed property reads and writes are excluded,
  including constant computed keys. `__proto__`, `constructor`, `prototype`, and
  `toJSON` are excluded as literal properties and member accesses. Consequently
  no computed-key provenance exception or prototype setter is needed.
- Local Map and Set allocation and insertion retain references to keys and
  values. `get`, iterators, and `forEach` propagate those references. Map callback
  keys, Set entry keys, array callback receiver arguments, and destructured array
  children are tracked as well as primary callback values. Collection contents
  may refer to other local containers, but those edges remain in the graph.
- `Object.keys`, `values`, and `entries` require local plain objects. Values and
  entry values retain their references. Keys are strings. Internal entry tuples
  may feed destructuring callbacks but cannot escape as result containers.
- Initialized `let` bindings, `for`, `for-of` over arrays, comparisons, arithmetic,
  selected pure numeric `Math` calls, and scalar template interpolation are
  allowlisted. Coercing object arithmetic and interpolation are excluded. Math
  calls can produce non-finite results, so the result scan is mandatory. Builtin
  names cannot be shadowed by declarations in the extracted source.
- Callbacks are inline synchronous arrows. Defaults, rest bindings, and nested
  function declarations are excluded. This prevents unexamined initializer effects.
  Callback captures and helper arguments participate in the same alias analysis.
- Result reachability may contain only local arrays and plain objects, with no
  cycle. Map, Set, iterator, tuple, and borrowed-container edges reject the proof.
  This provenance check applies even when structural typing hides a Map behind
  `{}`. Bounded result types supply a scan schema, not an escape certificate.
- Accessors, classes, assertions outside the guarded parse form, non-null
  assertions, Symbol, Reflect, Proxy, property definition, prototype mutation,
  deletion, and opaque calls have no accepted execution path. Unreachable code
  receives the same checks.

The analysis intentionally rejects more than the requested ideal language.
Borrowed containers cannot appear in a v2 result. Callback defaults, indexed
operations, module initialization, async functions, external runtime imports,
and parse assertions in helpers remain strict. The immutable v1 branch retains
its previous borrowed-container policy and finite-input induction.

## JSON.parse requires a guard before typed computation

A focused stock-native probe demonstrated why a result scan alone is insufficient.
Reading `n` from `{}` asserted as `{n:number}` throws SC4013 during native typed
materialization. That happens before the result scan and poisons the instance.
The unsafe probe was removed; no such lane is retained.

The admitted form is `JSON.parse(parameter) as BoundedDataType`, where the input
is an unassigned direct parameter of an exported synchronous boundary. The screen
records its asserted schema. The wrapper parses the input into a dynamic value
and runs a generated dynamic value scan before calling the typed function. Invalid
shapes, including missing fields, nulls, wrong primitive kinds, and non-finite
parsed numbers, return the per-call fallback status. The assertion itself never
certifies the parsed fields. Parsed containers remain borrowed and cannot escape
or be mutated under the local proof.

The encoding metadata also records `parseInputs`. `encodeArguments` checks their
JSON syntax in JS before native entry. A syntax error therefore executes the
original JS lane and preserves its exception without poisoning native state.
Direct addon callers must honor this argument-encoding contract. A raw addon
call with invalid JSON syntax can still panic, like other invalid raw ABI inputs.
The dynamic shape guard also runs for raw addon calls with valid JSON syntax.
Multiple assertions on one parameter each retain their guard.

This costs an extra JS parse and an extra native parse plus dynamic traversal.
The guard deliberately checks before the original function runs, including paths
where that function would not have used the malformed field. Such calls return
through JS. Valid extra JSON properties are permitted because parsed data cannot
contain getters, hidden fields, functions, symbols, or cycles, and whole parsed
containers cannot reach the result.

The proof assumes standard unmodified builtins and the adapter's argument contract.
As in CR2, it does not prove scriptc lowering correctness, bounded allocation,
stack use, or absence of resource exhaustion. An opt-in bypass cannot certify
all observable JS behavior or fix pre-existing transport alias cloning.

## Real-function verdicts and native correctness

`construction-proof-verdicts.mjs` asserts Papermark SHA-256
`9bf4d1fc55df8588be0804d333c2e42e6ade6e4a8404847a2cc380809c60e3e2`.
It now passes filesystem paths rather than URL strings to extraction, so absolute
imported type paths resolve correctly for revenue. No Papermark source or generated
closure is committed.

| Function | Verdict | Reason |
| --- | --- | --- |
| `revenueCore` | Screened | Local Map aggregation, guarded parse, fresh dense result |
| `documentViewDistribution` | Screened | Local Map and Set graph, dense result projection |
| async `revenue` | Strict | Non-null assertion, async body, runtime fixture and clock imports |

`CONSTRUCTION_RESULTS=1 node research/papermark-local-gate/run.mjs` compiles with
the bypass enabled. All 12 real dispatcher shadows verify canonical-byte parity,
including 6k and 60k event fixtures. The deliberate mismatch still demotes.
The retained artifact contains hashes and outcomes, with no timings. Papermark
was used only for correctness; no held-out timing was measured or tuned.

The real revenueCore dispatcher also verifies screened shadows at 1k and 5k.
The revenue correctness artifact records their output hashes.

Native tests cover finite overflow, NaN, negative zero, sync and async calls,
timing envelopes, malformed parsed shapes, JS syntax errors, and a later successful
call on the same instance. Adversarial screen tests cover argument aliases,
argument-child mutation, holes, structural Map escape, Set entry escape, secondary
callback arguments, nested array destructuring, computed dangerous keys, getters,
cycles, and callback initializer effects. Existing Unicode and transport tests
remain in the full suite.

## Loaded-host real revenueCore A/B

`construction-proof-v2-bench.mjs` compiles the original extracted `revenueCore`
twice, with strict and screened result handling. It passes real events as a JSON
string and executes parsing and aggregation on every invocation. Each size has
10 warmup rounds and 120 measured rounds. The arm order reverses each round.
All 480 measured outputs and all warmup outputs match JS byte for byte.

The following values are elapsed milliseconds on the loaded Darwin arm64 host
with Node 26.13.0. Wall time includes JS argument preparation, the syntax guard,
native handoff, native parsing and shape preflight, aggregation, encoding, and
copying. It excludes the final assertion and a JS result decode. These are local
measurements, with no calibrated Vercel prediction.

| Events | Arm | Wall p05 | Wall median | Wall p95 | CPU median | Result encode median |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 1,000 | Strict | 0.413 | 0.434 | 0.529 | 0.435 | 0.323 |
| 1,000 | Screened | 0.327 | 0.341 | 0.432 | 0.343 | 0.009 |
| 5,000 | Strict | 0.737 | 0.776 | 0.891 | 0.777 | 0.326 |
| 5,000 | Screened | 1.484 | 1.540 | 1.808 | 1.541 | 0.010 |

The typed result scan removes most reflection cost. The guarded parse makes 5k
wall and CPU time worse. Retain the code as an opt-in experiment, not a performance
improvement for the hill. Async revenue still needs a separate sound treatment of
its runtime imports and native extraction boundary.

## Reproduction

Use the existing installation through temporary node_modules symlinks. Run:

```sh
node --test --test-concurrency=2 packages/next-scriptc/test/*.mjs
node --test --test-concurrency=2 packages/next-scriptc/shim/test/parity.mjs packages/next-scriptc/shim/test/vercel-ipc.mjs
node research/construction-proof-verdicts.mjs
node research/construction-proof-v2-correctness.mjs
CONSTRUCTION_RESULTS=1 node research/papermark-local-gate/run.mjs
node research/construction-proof-v2-bench.mjs
```

The shim parity test requires Node 24. The first attempt under Node 26 refused
that version before native execution. Final validation uses the existing Node 24
binary. No full dependency installation, scriptc change, Docker operation, Vercel
operation, root README edit, push, or PR is part of this experiment.

Final validation passes 65 adapter tests and both shim tests on Node 24.22.0.
The final focused rerun passes all six local-construction and fallback tests,
including preservation of an automatically promoted native bucket after fallback.
Temporary dependency links and task-created native build output were removed.
