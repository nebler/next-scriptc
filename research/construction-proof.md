# Immutable construction proof for native JSON results

2026-11-01. Adapter-only experiment on `t3/closed-result-proof`, stock scriptc
0.4.6, Darwin arm64, Node 24.22.0. Production keeps strict validation.
`buildPromotion(modules, output, {constructionResults:true})` enables the
experimental bypass for eligible JSON results. No Next config option enables it.

The screen proves closure for a small immutable language. It does not prove
arbitrary native execution cannot exhaust resources or that scriptc implements
every accepted expression correctly. Those limits prevent default activation.
Neither the demo revenue aggregation nor Papermark qualifies. This change does
not establish the small-input workload performance goal.

## The screen checks the complete extracted module

`construction-proof.mjs` checks every extracted helper, including unreachable
branches. Discovery records its verdict after the application's boundary check.
The builder recomputes the verdict from the exact extracted source before using
it. `construction-report.json` records version, eligibility, first rejection
reason, function name and ID, and whether the bypass is enabled. It includes
compiler-refused candidates. This file stays in the build directory.

A second TypeScript program checks the self-contained extracted source with
`strict` and `noUncheckedIndexedAccess`. Any checker diagnostic rejects the proof.
Imports, including type imports, currently reject it. This loses valid imported
boundary aliases but avoids assumptions about omitted declarations or app-specific
compiler settings. When TypeScript is unavailable, the screen rejects the proof.

The runtime syntax allowlist admits:

- Named synchronous function declarations with JSON data parameters.
- Local initialized `const` identifiers, blocks, `if`, and `return`.
- Finite numeric literals, well-formed string literals, booleans, and null.
- Dense array literals and object literals containing ordinary data properties.
- Reads of declared properties, conditional expressions, strict equality,
  logical operators, and comparisons between numbers or strings.
- Direct calls to extracted local functions and array `map` or `filter` with an
  inline synchronous arrow callback. Receivers must have checked array types.

Types must be bounded JSON data. Recursive types, dictionaries, optional members,
function values, class instances, tuples, and schemas deeper than 32 levels fail.
Every helper call contributes an edge to a call graph. Calls from inline callbacks
also contribute edges. A cycle rejects the entire module. Identifier reads must refer to an already initialized parameter or local constant.
Inline callbacks inherit only the bindings available before their call. This
excludes self references and later constants read during a map initializer,
including cases where TypeScript accepts the delayed closure. Module-level runtime
initialization is excluded to avoid temporal-dead-zone calls through helpers.

Everything else takes strict validation, regardless of the option. This includes
all reference writes, scalar assignments, updates, loops, `push`, array length
writes, indexed writes and reads, array holes, spread, computed keys, methods,
accessors, classes, constructors, generators, async functions, and recursion.
`Object.*`, `Reflect.*`, Proxy, Symbol, Function, eval, `this`, and `arguments`
have no allowlisted operation. Array constructors and `Array.from` are excluded.
So are Maps, Sets, Dates, regular expressions, and typed arrays, even when used
only as intermediate storage. There is no object escape or alias analysis that
would justify admitting them yet.

The screen rejects `any`, `unknown`, assertions, non-null assertions, and
`satisfies` throughout the closure, plus inferred non-data expression types.
`__proto__`, `constructor`, `prototype`, and `toJSON` are forbidden literal or
read member names. Computed keys are all excluded, including constant computed
`__proto__`. A shorthand property receives the same checks. These rules are
stricter than needed for ordinary `constructor` data fields.

## Why accepted construction stays closed

The proof assumes the adapter's validated argument transport and standard,
unmodified builtins. Successful JSON argument serialization rejects functions,
accessors, symbols, hidden fields, cycles, sparse arrays, and non-finite numbers.
Native parameters are either those JSON.parse trees or validated scalars.
JSON.parse makes own `__proto__` data properties; it does not execute the object
literal prototype setter. Undeclared extra fields in those trees remain closed
JSON data. Structural boundary types therefore need not certify exact keys.

Induct on accepted expressions and the acyclic helper call graph. Parameters and
literals begin closed. Data literals allocate ordinary containers whose children
are already closed. Property reads select existing closed children. Conditionals
and logical expressions select existing closed values. Comparisons produce
booleans without object coercion. Local calls preserve the induction hypothesis.
Map and filter allocate dense ordinary arrays from dense arrays. Callbacks obey
the same rules, and cannot mutate their receiver or any alias.

No operation adds an edge to an existing container. Each literal or mapped
container can point only to values available before its construction completes.
There is no self reference through a mutable binding, recursion, callback escape,
or property write. Shared children and repeated array references remain legal,
but no operation can close a cycle. A repeated child is serialized twice, as in
today's transport.

Boundary types alone do not exclude extra properties or unsafe construction.
Here the expression allowlist provides provenance and the checker rejects bad
reads and mismatched calls. Map, Set, Date, RegExp, or typed-array results cannot
enter the graph because neither arguments nor any accepted constructor or
expression can create them. Relying solely on their declared result type would
be insufficient, even without assertions, because TypeScript is structural.

Finite checks can be omitted for this subset. Every result number comes from a
validated finite input or finite literal. Arithmetic, parsing, numeric conversion,
and numeric API calls are excluded. Allowing multiplication, division, addition,
or aggregation would invalidate this argument: finite inputs can overflow or
produce NaN. JSON.stringify silently maps NaN and Infinity to null, while the JS
lane returns the original invalid numbers and canonical shadow serialization
rejects them. That is not an acceptable optimization. A future extension needs a
nonthrowing per-call fallback protocol or a numeric range proof.

JSON `-0` still becomes `0`, matching existing strict transport and canonical
shadow bytes. The JS result can retain the sign bit, a pre-existing transport
fidelity limit. Refusing `-0` by throwing in native code would reintroduce V1's
instance-poisoning regression. This implementation adds no such refusal.

The screen excludes literals that create lone surrogates, and admits no string
slicing or other string-producing APIs. Direct string arguments already reject
lone surrogates before native invocation. JSON strings can contain escaped lone
surrogates: native sync and async tests preserve their escaped result bytes.
The native JSON wire is well formed even when the original string is not.

## Safety limits keep the option disabled

The induction establishes container closure under JavaScript semantics. It does
not establish an unconditional no-panic theorem for scriptc. Resource exhaustion,
native stack limits, compiler bugs, and externally modified intrinsics remain
outside the proof. An immutable graph can also have exponentially large JSON
output through repeated aliases. The screen has no output-size budget. Deep
incoming data is first traversed by the existing recursive argument serializer,
which can reject before native entry, but that is not a native stack bound.

The tests show no native throw for the retained adversarial cases, and verify a
subsequent call succeeds. They are evidence for those cases, not proof for all
possible sizes. Keep `constructionResults` false by default. The bypass is an
explicit build experiment, not a supported production certification. There is
no new throwing validator inside the screened wrapper. Failed screens retain
today's strict native serializer, including its existing panic behavior.

## Workload verdicts

The reproducible verdict runner reads Papermark only at its external slice path
and asserts the pinned SHA-256. The committed artifact contains names, hashes,
and verdicts, with no Papermark source or generated closure.

| Function | Verdict | First reason |
| --- | --- | --- |
| `documentViewDistribution` | Strict | A reachable helper has a non-data/default/rest parameter, extracted line 7 |
| `revenueCore` | Strict | Unsafe type escape, extracted line 4 |
| async `revenue` | Strict | Unsafe type escape, extracted line 8 |

Papermark also uses mutable Map/Set storage, loops, and arithmetic. Revenue uses
an asserted JSON.parse value, Map storage, and arithmetic. Removing their first
rejection alone would not qualify either function. No workload-specific exception
or tuning was added. The held-out source hash matches the earlier local gate.

## Loaded-host alternating experiment

`construction-proof-bench.mjs` computes revenue outputs for 1k and 5k events
outside timing, then emits literal-returning functions which pass the screen.
A native timing helper alternates strict and screened encoding expressions.
Both arms allocate the same literal result on every invocation. The proof applies
to those literal-returning closures, not to the measurement helper or the original
revenue function. Every output is checked against JS bytes.

Each size has 10 warmup rounds and 120 measured rounds. Each round reverses the
arm order. Values below are elapsed milliseconds for native compute, including
result allocation and validation/encoding. They are not CPU times. The retained
raw artifact records all 480 measured calls, host load, platform, and Node version.
The existing `scriptc-int8-validation` container was treated as external host load;
no container was inspected, stopped, or changed.

| Events used for cached result | Arm | p05 ms | Median ms | p95 ms |
| ---: | --- | ---: | ---: | ---: |
| 1,000 | Strict | 0.305 | 0.331 | 0.404 |
| 1,000 | Screened expression | 0.007 | 0.008 | 0.010 |
| 5,000 | Strict | 0.308 | 0.324 | 0.358 |
| 5,000 | Screened expression | 0.007 | 0.008 | 0.009 |

The result explains the cost of reflection for a closed literal result. It does
not improve the two target aggregations, which retain strict validation. No
calibrated workload win or hosted CPU reduction follows. Boundary performance
still needs hosted confirmation after the safety and coverage gaps are resolved.

## Verification and reproduction

Run with Node 24.22.0 and stock scriptc 0.4.6 dependencies installed:

```sh
node --test --test-concurrency=2 packages/next-scriptc/test/*.mjs
node --test --test-concurrency=2 packages/next-scriptc/shim/test/parity.mjs packages/next-scriptc/shim/test/vercel-ipc.mjs
node research/construction-proof-verdicts.mjs
node research/construction-proof-bench.mjs
```

Adversarial tests assert strict wrapper generation for every excluded family.
They include inferred errors, premature callback captures, coercing comparisons, mutual recursion, hidden
mutation helpers, and unreachable unsafe helpers. Native tests exercise sync and
async byte parity for 20,000 rows, finite extremes, negative zero, Unicode,
embedded NUL, lone surrogates in JSON strings, and shared aliases. A real dispatcher
shadow verifies canonical-byte parity. Non-finite numbers, cycles, and extreme
nesting are refused at the argument boundary before native entry. A later native
call proves the instance remains usable for these cases.

The first full run found one reporting-order regression. Keeping verdicts in the
JSON build report restored the existing compiler-refusal callback contract.
The final run passes all 59 adapter tests, 2 shim tests, and 24 demo tests, with
at most two test jobs. A final review also added definite-initialization checks
for callback captures, followed by another full adapter run. No Docker stand-in,
Vercel call, scriptc source change, push, PR, or root README edit occurred. Generated
native artifacts are removed by the test and benchmark cleanup paths.
