# E2: source text with checked runtime provenance

2026-11-03. This experiment implements an opt-in source-text path. It does not
establish a native win. The final measurements below use an own-code DEV fixture.
Papermark and every HELD_OUT repository remain unexecuted and uninspected.

## Why this implementation checks the whole tree

A WeakMap associates an adapter-parsed root with its original text and a snapshot
of every reachable object. The snapshot contains own keys in order, own data
property descriptors, child identities, prototypes, and extensibility. Before
encoding, the adapter compares every node against that snapshot. No getter runs.
A replaced child, an accessor, a symbol, a descriptor change, a changed prototype,
or a change to an unread extra field invalidates provenance permanently. An
unchanged escaped alias remains valid. An escaped alias that changes the tree
invalidates it on the next call. Reassignment to a different root has no entry.
Repeated calls can reuse an unchanged root. Mutation followed by complete
restoration before any check is safe because the current tree equals the source.

The proof assumes ordinary untampered JavaScript intrinsics, as the existing
boundary validators do. Only the captured JSON parser can create provenance.
Application replacements still run with their original receiver and argument,
but their results get no entry. The parser completes synchronously and produces
fresh ordinary objects with data properties. Snapshot and source validation run
before application code receives those objects. At call time, comparison of the
complete tree proves equality to that parse, including properties outside the
projection. The schema check then proves the projected input has the required
shape. JavaScript cannot interleave another task during these synchronous checks.
Parsed trees contain no shared-memory buffers or proxies.

`encodeArguments` chooses the original text only after these checks. Other
arguments and the result use the existing encoders. JS receives the original
parsed object. The dispatcher source, thresholds, clocks, shadow protocol, and
fallback policy are unchanged. Encoding captures an immutable string before a
shadow is deferred. Later caller mutation cannot change that job's bytes.

The loader enables rewriting with `SCRIPTC_SOURCE_TEXT=1` at build time. The
rewrite applies within modules that already have promotion wrappers. It changes
unshadowed, nonoptional, one-argument `JSON.parse(t)` calls to
`sourceTextParser(JSON)(t)`. The helper reads the method before evaluating `t`,
retains its receiver, and invokes it once. Revivers, spread arguments, computed
method access, and shadowed JSON bindings retain their original calls. Parsing
inside `try` preserves the same exception boundary. There is no global patch.
Callers outside transformed modules are not captured. `Response.json()` is not
rewritten because an arbitrary response receiver does not prove native Fetch
semantics, and replacing its body consumption and promise behavior needs a
separate contract. The exported helper can also be used explicitly.

## The accepted text subset is deliberately narrow

The source scanner accepts JSON whitespace, arrays, objects with unique keys,
booleans, null, printable unescaped ASCII strings, and signed integers whose
absolute value is at most 2,147,483,647. It rejects negative zero and nesting over
32 levels. It also rejects numeric object keys, reserved boundary keys, and all
string escapes. Numeric keys can change iteration order between text and JS
objects. These restrictions apply even to fields outside the projection.

Duplicate keys retain JS last-wins semantics through the encoder path.
`__proto__` remains a JS own property and is never assigned through a prototype
setter by this feature. Reserved keys use the existing fallback rules. Fractional
numbers, exponents, large integers, negative zero, Unicode escapes, literal
non-ASCII text, and lone surrogates also use the encoder. The existing boundary
still decides whether the resulting value can enter native. In particular,
nonfinite read numbers fall back to JS, and JSON negative zero follows the
existing boundary's zero canonicalization. The feature makes no claim that the
native parser handles arbitrary JS JSON number or string syntax identically.

Handle-bearing values use the encoder because the original text does not contain
call-specific handle indices or `__scriptcOriginal` tokens. Empty containers can
qualify when they need no tokens. Result decoding and handle tables remain intact.
For unshaped JSON parameters, the unchanged full parsed tree satisfies the strict
JSON boundary. For bounded opaque layouts, the feature also checks the projected
shape and refuses any actual handle value. It never infers permission to omit
fields from a TypeScript type alone.

Native uses the existing generated, checked typed `JSON.parse` entry. No compiler
or unchecked parser change is required for this subset. Differential native tests
exercise nested extra fields and verify that the typed parser skips them. The
full text, including extras, crosses the addon and is parsed. That cost appears
in the measurements. A broader native implementation would need a generated
schema-aware parser that reproduces JS duplicate-key, numeric, string, key-order,
and depth behavior, plus an overlay that inserts handle tokens in precisely the
encoder's capture order. E2 does not implement that overlay.

## Alternatives and limits

A WeakMap alone is unsound after mutation. Shallow freezing leaves children
mutable. Deep freezing changes observable application behavior, and proxies
change identities and can be bypassed through aliases. None is used.

Static provenance could remove the runtime comparison for an immediate parse
argument or a binding with a proved lifetime. It would need to exclude mutation,
escape through aliases and closures, getters, unknown calls, reassignment,
revivers, and suspension before dispatch. A const binding alone proves none of
those properties. This version chooses a runtime proof that tolerates aliases
and arbitrary intervening code. The cost is linear in the full input, even if
native reads only three fields. The snapshot also retains substantial metadata
until the root is collected. Capture is opt-in because that cost is unacceptable
as an automatic default based on these measurements.

## DEV measurements

The fixture follows E1's eight-field row shape and reads three fields, with a
scalar scale argument and a two-number result. It uses integer amounts to fit the
proved subset and omits E1's selected original-row result. Thus it measures a
handle-free E1 variant, not the original identity-preserving function. The native
parameter type contains the three read fields. The benchmark's explicit bounded
schema matches those fields and the scalar result. Extra runtime fields remain
in the source text and exercise native skip behavior.

The host is macOS arm64 with Node 26.13.0 and stock scriptc 0.4.6 installed in this
worktree. No Docker or stand-in run occurs under the task's constraint. Each size
has ten warmups and sixty retained calls per path, with alternating arm order.
The native build has stage clocks enabled in both paths. Result assertions run
outside the reported stage intervals. Total wall includes provenance checking or
encoding, synchronous native execution, and result decoding. Process CPU includes
allocation and native work. Stage medians do not sum into a CPU decomposition.
The tiny native compute stage approaches the timer's resolution.

Capture is measured separately with two warmups and ten retained parses per size.
It includes JS parsing, source scanning, and snapshot allocation. A one-parse,
one-call application must include that acquisition cost. Repeated calls amortize
capture but still pay the full mutation check. Lane training uses a fresh
dispatcher per path and size, 700 calls, default policy and quotas, and drains
pending shadows. Independent dispatchers avoid quota pauses without changing
policy. Every bucket verifies 26 shadows and selects `js-final`, with no mismatch
or native fallback. Every timed native result equals JS.

All values are median milliseconds. `Check/write` includes the per-call provenance check on the text path. Serialization itself is eliminated there.

| Rows | Path | Check/write wall | Native parse/skip wall | Total wall | Total process CPU | JS wall |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 600 | encoder | 0.133 | 0.026 | 0.182 | 0.185 | 0.003 |
| 600 | text | 0.388 | 0.204 | 0.667 | 0.696 | 0.003 |
| 6000 | encoder | 1.375 | 0.242 | 1.696 | 1.697 | 0.010 |
| 6000 | text | 3.793 | 2.197 | 6.468 | 6.491 | 0.014 |
| 60000 | encoder | 19.485 | 2.330 | 22.513 | 32.514 | 0.113 |
| 60000 | text | 39.302 | 23.013 | 74.886 | 78.815 | 0.118 |

| Rows | Plain JS parse wall | Capture parse wall | Added acquisition wall |
| ---: | ---: | ---: | ---: |
| 600 | 0.182 | 2.346 | 2.164 |
| 6000 | 1.649 | 18.933 | 17.284 |
| 60000 | 16.713 | 190.696 | 173.983 |

At 60k rows, projected text is 2,473,401 bytes and full source is 8,031,181 bytes. Native parse/skip is 9.9 times as expensive in this session. The final per-call text path loses before adding capture. Plain parse plus encoder call is approximately 39.2 ms; capture plus text call is approximately 265.6 ms. These sums of medians are illustrative, not separately timed end-to-end samples.

The first exploratory session checked values and keys but omitted descriptor
attributes and extensibility. Its raw samples remain in `local-values-only.json`.
Final code also checks those attributes and rejects numeric object keys; only
`local.json` supplies the final table. These are separate sessions, not paired
proof of the cost of that correction. Background desktop services, GC, arm order,
and a single host limit timing conclusions. No confidence interval or hosted
speed prediction is claimed. No task build, test, or analysis overlaps final
measurement.

## PM2 remains an estimate

The supplied E1 projection is approximately 58 ms encoding + 27 ms native decode
+ 36 ms compute + 4 ms other = 125 ms, against 111 ms JS. Ideal zero-cost text
provenance with unchanged decode would give about 67 ms. That is arithmetic, not
an implemented or measured result. This implementation replaces serialization
with a complete mutation check, adds source acquisition cost, and sends more
bytes for native to skip. Its DEV results do not justify projecting a native win
for PM2. Handle-bearing or unsupported lexical inputs retain the approximately
125 ms encoder estimate. Coverage of any held-out call site is unknown. No
Papermark body, fixture, or repository is opened or executed for E2.

## Reproduction and validation

Run `node research/source-text-passthrough/build.mjs`, then
`node research/source-text-passthrough/measure.mjs`. The build writes only
`.checks/e2`. The measurement writes `research/source-text-passthrough/local.json`.
Install dependencies in the worktree and run scriptc's local install-native
script if lifecycle scripts were disabled. Use a Node 24 or newer executable in
the PATH inherited by pnpm. Initial setup attempts failed because pnpm selected
Node 23, the ignored postinstall left a text launcher, and the research driver
could not resolve TypeScript from the repository root. All fixes stay local.
An initial benchmark preflight also exposed a native type requiring unread
fields; the final three-field parameter type matches its projected wire.

The focused tests cover alias mutation, changed unread fields, descriptors,
prototype and extensibility changes, reassignment, repeated calls, parsing inside
try, reviver and shadowed-parser exclusion, receiver and evaluation order,
unsupported lexical semantics, encoder fallback, a native promoted function,
nested extra-field skipping, and shadow isolation after caller mutation. The
native differential corpus includes 100 generated trees and explicit edge cases.
Both package suites pass. Next has 98 passes; core has 38 passes and two existing
skips. The core suite also passes with build-time capture enabled. Logs accompany
the raw evidence. No root README, main checkout, compiler fork, hosting service,
Docker resource, push, PR, issue, or public post is changed or used.
