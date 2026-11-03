# B1 discovery blockers

This implementation targets the DEV-only EV3 first refusals. Discovery acceptance
is static eligibility, not compiler acceptance or a measured CPU win. Dispatcher
sampling, promotion thresholds, and shadow comparison are unchanged.

The characterization script reads EV3 artifacts through `research/lib/artifact.mjs`.
`dev-census-b1/baseline.json` contains the unique-function baseline histogram and
exact diagnostic patterns with pinned examples. `diagnostic-patterns.json` also
retains raw diagnostic occurrences, including repeated EV1 and EV2 output. Those
raw counts must not be interpreted as function counts.

## Declaration and type visits

Type-only module visits collect export and type metadata without checking runtime
initialization. This includes declarations with `export =`, namespace exports,
and default expressions. Type aliases and interfaces retain their existing
boundary and standalone TypeScript checks. Both explicit type imports and value
imports referenced only in type positions follow this path.

A subsequent runtime visit always runs the initialization check, including when
the module or binding was already visited for types. Runtime resolution still
hides declaration files from its TypeScript host. A declaration cannot stand in
for executable JavaScript. A selected runtime implementation must resolve and
pass the existing effect and construction proofs, otherwise discovery rejects.
The tests cover all three declaration extensions and mixed type/value visits.

## Export conditions

The resolver supplies `node` to the application's TypeScript resolver in import
mode. Node's ordered condition selection chooses the implementation. Inactive
browser, Svelte, and Electron branches no longer invalidate an entire package.
The selected source and its package manifest remain hashed dependencies. Selected
side effects and CommonJS mutable exports still reject. Application custom
conditions require a matching explicit runtime condition integration. Unknown
active conditions and custom resolvers reject.

## Parsing

The parser selects legacy decorators for `experimentalDecorators` projects and
standard decorators otherwise, including extraction of undecorated functions.
Reachable decorated classes and members remain unsupported. Parsing does not
establish decorator purity. Existing M1 rules still apply to original JS setup.

## Module initialization

Unused default expressions consisting only of literal data, ordinary properties,
arrays, or function creation are inert and can disappear. Calls and spreads do
not qualify. Private `Object.freeze` literal tables use M2's existing constant
reference audit and scalar folding. Escapes, exported graphs, mutations, effectful
properties, and shadowed Object bindings reject. Freezing is shallow; the audit
also prevents nested objects from escaping. Literal enums and named reexports
retain their existing M2 support. Arbitrary calls and constructors remain outside
this extension. M1's unmodified-builtins contract still applies.

## Indexed reads and replay

Numeric array reads with a possibly undefined result can lower to a checked
helper. Receiver and index evaluate once in the original order. Before reading,
the helper checks integer bounds, then checks the value for undefined. Negative,
fractional, NaN, infinite, out-of-range, and undefined reads throw the existing
fallback sentinel. The builder's existing mandatory fallback path replays JS.
The complete guarded closure must pass the construction proof. Unsupported
closures retain their original strict refusal. Local catch/finally, indexed
writes, callable element receivers, and non-array indices receive no exemption.
Native differential tests cover valid reads and JS replay of invalid reads with
`catchFallback:false`, including the addon's subsequent usability.

## Local mutation

The allocation analysis seeds exported boundary arguments as borrowed and sends
actual caller provenance into helpers. A helper parameter can therefore refer to
a fresh local allocation. All possible reference edges still accumulate through
branches and calls. A borrowed alias or a borrowed child of a shallow copy makes
mutation reject. Local object and array literals, supported allocating array
operations, and helpers returning proven local graphs can qualify. Unsupported
operations remain conservative refusals. Member writes and mutator calls must
pass this proof, including writes through local aliases.

## Measurement and remaining work

The rerun uses the frozen DEV manifest, server scopes, disabled install scripts,
12 GB install floor, and at most three installed task-owned clones. No HELD_OUT
repository or Papermark is opened. Failed attempts and unknown coverage are
retained separately. Final measurements and validation are appended after the run.

## Exact EV3 diagnostic coverage

The unique real declaration refusals are 195 `TSExportAssignment`, 132 default
expressions, 36 `TSNamespaceExportDeclaration`, and 24 side-effect imports. These
are initialization checks on metadata, removed by type-only visits.

The package-condition refusals are 257 `electron-renderer`, 70 `browser`, 44
`svelte`, 15 `node`, 14 `module`, eight `types@<5.7`, seven `@zod/source`, five
`react-native`, and three `dev-source`. Inactive branches no longer reject.
Unknown active conditions remain a separate rejection.

The 2,023 executable initialization refusals include 810 variable declarations,
569 source expression statements, 342 dependency expression statements, 105
default expressions, 89 dependency if statements, and 28 source if statements.
Other explicit loops, try statements, and side-effect imports account for the
remainder. A diagnostic naming VariableDeclaration does not identify the exact
initializer. This patch supports private frozen literal tables within that
category; it does not claim that all 810 initializers are pure. Default expression
admission is similarly limited to inert syntax. Literal enums and named
reexports were already covered by M2 and are retained without widening their
mutation contract.

The indexed-read extension targets the nine real TS2532 first refusals and the
array-derived subset of TS18048 and TS2345. It does not suppress those diagnostic
codes wholesale. Optional object fields, missing generic names, and undefined
map keys still reject. The mutation baseline includes 103 argument mutations,
77 nonlocal mutations, 27 module-state mutations, and 11 constant graph escapes.
Only mutations with proven local allocation provenance qualify.

Fixed-bound typed-array loops receive a narrower proof: a const fresh typed
array, a zero-based index, an identical literal upper bound, a single increment,
and no body writes to the index. Those reads erase a proven non-null assertion
and keep direct native access. General array reads use the runtime guard. Native
ArrayLike is unsupported by stock scriptc, so typed-array guards use explicit
builtin array types rather than that standard-library interface.

The mutation proof admits captured scalar constants and supports `Math.clz32`.
It still requires the construction language, so unsupported syntax can reject a
fresh allocation before provenance analysis completes. This is a conservative
limit, not evidence that the function mutates its inputs.

## Integration and verification

The stalled branch was merged into current main and its conflicts were resolved.
The resulting changes were committed as a squash, so the untested WIP commit and
its redundant logs are absent from this branch's history. NSC diagnostic codes,
original-source maps, build fuzzing, runtime snapshots, profile reporting, the
TypeScript plugin, typed decode-once, and browser build hooks remain in place.
A parser source-filename regression found during verification was corrected.

The final pass runs the EV3 runner and independent EV1/EV2 scans against the frozen
DEV pins and server scopes. Installs disable lifecycle scripts and require at
least 12,000,000,000 free bytes. At most three installed clones are allowed.
Missing scans, failed installations, and disk skips are unknown coverage.
Acceptance is static discovery, not compilation, HTTP reachability, or a CPU win.
