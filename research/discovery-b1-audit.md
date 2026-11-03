# B1c discovery audit

B1 fixed real proof gaps and also replaced several narrower discovery screens
with a complete construction proof. A failed construction proof does not establish
mutation. This audit restores only patterns with a bounded argument for safety.
Unresolved cases stay refused. Dispatcher policy is unchanged.

The pre-B1 revision is `b9c7f56`, the first parent of merge
`0ddc9de9511ded2f76d5b29c58c6ad9e07bc7b17`. The B1 snapshot is the worktree's
starting HEAD, `6cfeb847000084a35683bb813483e4608e59560a`. The [reproducer runner](eval-corpus/dev-census-b1c/reproducers.mjs)
contains original, self-contained examples. It records discovery output and emitted
closures for [pre-B1](eval-corpus/dev-census-b1c/reproducers-pre-b1.json),
[B1](eval-corpus/dev-census-b1c/reproducers-b1.json), and
[B1c](eval-corpus/dev-census-b1c/reproducers-after.json).
These are discovery experiments, not claims that the old compiler accepted every
emitted closure. All 29 examples are accepted before B1 and refused by B1. Native ABI tests cover restored reversal, arithmetic, scalar object snapshots, private scalar-array reads, and borrowed-array iteration.

## Verdicts depend on the pattern

The 211 first refusals comprise 64 nonlocal mutations, 61 variable initializations,
20 argument mutations, 58 constant-graph audits, four default expressions, and four
other construction or fallback checks. Counts describe initial diagnostics, not
211 independent soundness bugs.

| First-refusal category | Minimal reproducer | Verdict and action |
|---|---|---|
| Nonlocal mutation (64) | `reverse`, `callbackPush`, `aliaspush` | Mix. Restore fresh-array reversal and proven array callbacks. Keep borrowed aliases refused. Other failed construction proofs remain unresolved. |
| Variable initialization (61) | `arithmetic`, `init` | Mix. Restore finite numeric literal arithmetic. UNSOUND-BEFORE when pruned setup changes a captured initializer. Other calls remain unproved. |
| Argument mutation (20) | `alias`, `freshIndex` | UNSOUND-BEFORE for borrowed aliases. Keep refusal. Local mutations outside the construction language remain unresolved. |
| Exported graph (18) | `exported` | UNSOUND-BEFORE. Keep refusal. |
| Unresolved member (16) | `unresolved` | Restore private scalar-array `some`/`includes` reads after the full original reference audit. Other member reads remain unproved. |
| Requires literals (11) | `literals` | Restore finite numeric literal arithmetic inside private graphs. UNSOUND-BEFORE for stateful values such as the `statefulLiteral` regex. Keep these refused. Other initializers remain unresolved. |
| Mutation or escape (7) | `escape` | UNSOUND-BEFORE when a helper mutates a captured graph. Keep refusal. |
| Literal member read (4) | `dynamic` | Keep unresolved. No general dynamic-key lowering is introduced. |
| Property (2) | `property` | Mix. Restore snapshots of private scalar literal objects. Getters, object-valued spreads, and other property forms remain unproved. |
| Default expression (4) | `default`, `defaultclass`, `defaultcall`, `defaultEffect` | Mix. Restore inert declaration reads. UNSOUND-BEFORE when a default call mutates captured state. Calls and possible TDZ reads stay refused. |
| Other checks (4) | `caught`, `constructor`, `unsupportedCall`, `uninitialized` | Keep unresolved under the existing construction and replay contracts. No exemption. |

The names in the table identify code in the linked runner. Its `arithmetic`
example is `const n=2*3; export function rows(x:number[]){return x.map(v=>v+n);}`.
The `reverse` example maps into a fresh array, reverses that array, and returns it.
Both were accepted before B1 and refused by B1.

### Borrowed writes cannot be represented by a copied argument

In `alias`, `const a=x` does not allocate. Incrementing `a`'s children changes the
caller's objects in JS. A native call decodes JSON into a separate object graph.
For input `[{n:1}]`, both lanes can return `[2]`, while the caller's original object
ends at `n=2` only in JS. Equal return values do not prove equivalent behavior.
`aliaspush` has the same problem for the array container. Tests retain both
refusals and assert this observable difference. The [counterexample runner](eval-corpus/dev-census-b1c/counterexamples.mjs) executes the actual old emitted copies and records [the differing caller states and values](eval-corpus/dev-census-b1c/counterexamples.json).

Fresh `reverse()` only permutes the fresh container's edges. It neither adds an
edge nor changes a child. The allocation proof retains the same receiver and all
child provenance. It requires an actual array, a proven local receiver, and zero
arguments. Shallow copies of borrowed objects still cannot mutate those objects.
Branches that join a borrowed array into the receiver reject. Native ABI tests
check return parity and unchanged input arrays, including empty arrays.

### A copied module table can become stale

For `export const table={n:2}`, another importer can set `table.n=9` before calling
`rows([1])`. JS returns `[10]`; a native closure initialized from the original
literal, or folded to `2`, returns `[3]`. TypeScript's `as const` assertion does
not freeze the object. Export rejection is necessary even if references inside
the defining module are all reads. A private table also fails if another helper
can mutate it. The audit includes helper bodies unreachable from the selected closure because
they can remain callable through other exports in the original JS module. No whole-application immutability claim is made.

A global regex is another mutable capture. In `statefulLiteral`, a separate JS
helper advances `lastIndex` before `rows` runs. The original returns `[false]`
and the independently initialized old emitted copy returns `[true]`. The
requires-literals category therefore includes real state-sharing gaps as well
as pure arithmetic.

The `init` example exposes a variable-initialization gap: an unrelated setup
declarator calls a helper that changes a private table before a captured scalar
reads it. Pre-B1 copies the table and scalar initializer but prunes setup,
producing `[3]` where original JS returns `[10]`. Recomputing an initializer is
not equivalent to capturing its original runtime value. This refusal stays.

### Private scalar-array calls cannot expose the original receiver

Private literal arrays can be recreated at a native read site when every element
is scalar. The full original reference audit runs first. Exported graphs, aliases,
mutations, escaping references, object-valued elements, and arbitrary methods still
reject. The only admitted calls are one-argument `includes` and one-argument `some`
with a synchronous inline arrow having at most two identifier parameters.

A `some` callback cannot receive the original receiver through its third or rest
parameter. Its element values have no shared object identity. Other references to
the graph must pass the same audit, including references in other helper bodies.
The retained closure must then pass the complete construction proof. Native tests
cover membership, early stopping with a local accumulator, and a negative-zero
literal whose sign is observable inside the predicate. No string-method effect
proof or general dynamic-key lowering is added.

Array `forEach` and `some` pass receiver and child provenance into inline callbacks.
The child provenance comes from the receiver, rather than from the scalar result
of the call. Writes through borrowed children, callback receiver parameters, and
conditional joins of borrowed and fresh aliases reject. A callback can append
scalar reads into a fresh output array. Native tests check parity and unchanged
caller inputs. This uses M1's existing unmodified-builtins contract.

### Literal arithmetic has no mutable identity

The new evaluator accepts numeric literal operands with unary plus/minus and
`+`, `-`, `*`, `/`, `%`, or `**`. It evaluates with JS number semantics and rejects
non-finite results and negative zero. It never evaluates identifiers, calls,
strings, getters, or coercion. The same check applies to each intermediate result.
A private graph still passes the original reference audit before any scalar read
is folded. Exported graphs, mutations, escapes, and dynamic reads still reject.
Tests cover division by zero, NaN, overflow, negative zero, coercion, calls, and
unknown names. `Math.max(2,3)` is deliberately outside this syntactic subset.

### Scalar object spreads are snapshots, with a bounded source proof

`const base={n:2}; const table={...base,m:3}` copies scalar values rather than
sharing mutable children. The new path requires a private const identifier with
explicit literal scalar properties. The complete reference audit rejects exported
bases, aliases, writes, escapes, getters, methods, computed properties, and
object-valued elements. Duplicate keys use ordinary object spread overwrite order.
Native tests cover the scalar snapshot together with arithmetic and reversal.
A spread is not a general immutability proof.

### Default reads and copied captures also require initialization timing

Reading a hoisted function declaration or an already initialized class binding is
inert. Yet removing its default export can expose unrelated construction gaps.
The narrow default extension requires creation-only module setup and a complete
retained construction proof. Runtime imports, executable initializers, class
static calls, decorators, unresolved bindings, ambient declarations, and possible
TDZ reads remain refused. Instance fields are deferred until construction.

The same timing concern applies to new arithmetic, graph, and array operations.
`tdzArithmetic`, `tdzTable`, and `tdzReverse` call the exported function before its
captured const is initialized. JS throws ReferenceError; a copied closure with a
newly initialized capture returns a value. New construction paths require
creation-only setup when they capture initialized bindings. A parameter/local-only
function such as `earlyLocal` can run early safely and remains eligible. A lexical
`eval` can replace a hoisted helper without a syntactic assignment to its binding;
`lexicalHelper` demonstrates differing results. Extended construction refuses it.
These are semantic gaps, not just conservative diagnostics.

`functionMetadata` changes a helper's writable `name` property through another
export. A plain function declaration read is inert, but using mutable function
metadata in the selected function is not a closed construction. The complete
proof keeps it refused. `defaultEffect` likewise mutates captured data during
initialization. Concrete values and ReferenceError differences are recorded in
[the counterexamples](eval-corpus/dev-census-b1c/counterexamples.json).

A separate audit test fixes a B1 graph-binding error outside the lost-211 cohort:
a destructuring declarator was treated as though its binding denoted the complete
object initializer. For `const {n}:any={n:"a"}`, `n.n + v` evaluates to `"undefinedb"` for `v="b"` in JS;
folding the initializer's `n` property incorrectly yields `"ab"`. Graph lowering now
requires an initialized identifier binding. The [native reproducer](eval-corpus/dev-census-b1c/destructuring-gap.json) records one forced-native call with the differing value. No dispatcher change is involved.

### Remaining refusals are not all soundness fixes

A bounded dynamic-key lookup can be sound. Admitting its full diagnostic
category would also admit missing keys and reference-valued reads. These cases
remain unproved and refused. Object-valued spreads and dynamic property forms still need a stronger
source-graph proof. Unsupported construction syntax is a
proof limit, not evidence that a real function mutates its input.

M1 preserves unrelated declaration setup in original JS and prunes it from the
native closure. M2 requires scalar reads and a reference audit for private graphs.
This patch preserves both contracts. It does not restore pre-B1's unproved alias
heuristic or bypass the construction proof when checked reads require JS replay.

## Census and validation

Results and exact coverage are recorded in
[the comparison](eval-corpus/dev-census-b1c/comparison.json).
The [reproduction procedure](eval-corpus/dev-census-b1c/reproduce.md) uses only the
11 affected frozen DEV repositories and their existing server scopes. Failed
installs and absent scans are unknown, never zero acceptances. No HELD_OUT
repository or Papermark is scanned. An exploratory pass prompted the scalar-array proof refinement; its discovery
counts are excluded. The final census starts fresh at implementation commit
`61af963`, using full report discovery plus fresh resolver evidence. Every batch
records this mode; no independent EV1/EV2 agreement claim is made.

The final comparison observes **0 accepted again, 211 still refused, and 0
unknown** in the lost-211 cohort. Narrowly restoring nine minimized examples does
not discharge every proof obligation in the corresponding application functions.
Fourteen cohort functions reach a different first blocker: twelve move past an
unresolved-member screen, and the two PostHog scalar spreads reach the separate
literal-member-read requirement. These are partial proof gains, not restored
application acceptances.

| B1 first-refusal category | Accepted again | Still refused | Unknown |
|---|---:|---:|---:|
| nonlocal mutation | 0 | 64 | 0 |
| unproved module initialization VariableDeclaration | 0 | 61 | 0 |
| constant graph unresolved member | 0 | 16 | 0 |
| argument mutation | 0 | 20 | 0 |
| constant graph requires literal member read | 0 | 4 | 0 |
| constant graph requires literals | 0 | 11 | 0 |
| constant graph exported reference can escape | 0 | 18 | 0 |
| throw fallback excludes local catch/finally | 0 | 1 | 0 |
| unsupported NewExpression | 0 | 1 | 0 |
| call outside local allocation allowlist at 3 | 0 | 1 | 0 |
| initialized bindings required at 11 | 0 | 1 | 0 |
| constant graph mutation or escaping reference | 0 | 7 | 0 |
| constant graph property | 0 | 2 | 0 |
| unproved module initialization default expression | 0 | 4 | 0 |
| Total | 0 | 211 | 0 |

The 11 affected repositories retain the same 10,145 observed files. Accepted
functions increase from **250 to 257**, with seven new covered acceptances, no
newly covered acceptances, and no covered acceptance losses. GrowthBook rises
from 98 to 103; OpenPanel rises from 18 to 20. The seven gains were
refused in B1 and sit outside the lost-211 cohort. Their prior first blocker
was the local allocation call allowlist. They are listed individually in the
comparison. All other affected repository acceptance counts are unchanged.

| Repository | B1 accepted | B1c accepted |
|---|---:|---:|
| toeverything/AFFiNE | 7 | 7 |
| actualbudget/actual | 2 | 2 |
| evidence-dev/evidence | 5 | 5 |
| gristlabs/grist-core | 11 | 11 |
| growthbook/growthbook | 98 | 103 |
| n8n-io/n8n | 53 | 53 |
| nocodb/nocodb | 8 | 8 |
| openpanel-dev/openpanel | 18 | 20 |
| PostHog/posthog | 38 | 38 |
| umami-software/umami | 3 | 3 |
| Unleash/unleash | 7 | 7 |

Carrying forward the six unaffected DEV entries gives **251 to 258** overall.
That is a carried-forward total, not a fresh scan of all DEV repositories. No
HELD_OUT repository or Papermark was scanned. Static acceptance does not establish
compiler support, runtime reachability, or speed.

All 11 application installs succeeded. Ten repositories cover every requested
file. GrowthBook retains one aborted 32-file report batch from the verified final
run. Those files remain unknown; none contains a lost-211 cohort function. Thus
zero cohort unknowns does not mean complete census coverage. The final run has
86 successful report batches and one failed report batch; all 87 resolver batches
succeed. The [provenance record](eval-corpus/dev-census-b1c/provenance.json) verifies
that each recorded adapter commit has discovery source identical to `61af963`.
The five existing results were verified before reuse. All six remaining
repositories were freshly installed and scanned, with n8n's interrupted attempt
retained separately. No failed install required retry. Every install recorded at
least 12 GB free; the minimum is GrowthBook's 14,336,303,104 bytes. Application
clones were installed and cleaned serially. The
[validation record](eval-corpus/dev-census-b1c/validation.json) records source
hashes, mode, install status, and the comparison denominator.

## Relationship to the pinned examples

The [source-model metadata](eval-corpus/dev-census-b1c/source-models.json) identifies
pinned examples for each first-refusal category. No third-party source is retained.
The minimized programs isolate the proof boundary rather than reproducing an
application's complete behavior.

AFFiNE's `generateErrorArgs` accumulates locally through a callback; Actual's
`extractTagsForFilter` allocates local arrays and sets while using regex iterators.
These motivate the fresh accumulator examples. The regex/iterator language still
needs its own proof. A mutation diagnostic alone does not establish borrowed writes.
PostHog's `buildPrefixLengths` writes a fresh array; its indexed-write, fill, and
string-index behavior remains outside the construction language. `freshIndex`
is therefore explicitly unresolved, rather than labeled UNSOUND-BEFORE.

AFFiNE's private MIME prefix list motivates the scalar-array read example, but
its string predicate requires additional method proofs. PostHog's escape maps
motivate scalar object snapshots; their dynamic character lookup remains a
separate blocker. GrowthBook's `redactUrl` motivates the nonliteral regex example;
the counterexample demonstrates why a blanket nonliteral exemption is unsafe,
not that this particular application helper has the same stateful behavior.

Unleash's four default-expression losses share a class with a runtime-imported
base. Reading the initialized class is inert in isolation, but this module's
initialization graph and formatter string operations remain unproved. The narrow
standalone default-read restoration does not claim to discharge those obligations.

## Individual reproducer decisions

All rows below have a recorded pre-B1 acceptance and B1 refusal. “Unproved” means
keep refusing under the soundness-first constraint, without claiming the pattern
is inherently impure. OVER-CONSERVATIVE applies to the narrowly restored pattern,
not every function sharing its first diagnostic.

| Reproducers | Verdict | Result and argument |
|---|---|---|
| `reverse` | OVER-CONSERVATIVE | Restored. Reorders a fresh container and retains child provenance. |
| `callbackPush`, `earlyLocal` | OVER-CONSERVATIVE | Restored. Borrowed elements are read into a fresh output; no initialized module capture is needed. |
| `arithmetic`, `literals` | OVER-CONSERVATIVE | Restored. Finite syntactic numeric evaluation has no identity or effect. |
| `unresolved` | OVER-CONSERVATIVE | Restored. A fully audited private scalar array is recreated for a bounded predicate. |
| `property` | OVER-CONSERVATIVE | Restored. Scalar literal object spread is a value snapshot; the original source graph is audited. |
| `default`, `defaultclass` | OVER-CONSERVATIVE | Restored only with creation-only setup and the retained construction proof. |
| `alias`, `aliaspush` | UNSOUND-BEFORE | Keep refusal. Caller-visible writes disappear across the copied ABI. |
| `exported`, `escape`, `statefulLiteral` | UNSOUND-BEFORE | Keep refusal. A copied or folded capture differs from original shared mutable state. |
| `init`, `defaultEffect` | UNSOUND-BEFORE | Keep refusal. Pruned setup changes an initializer's value. |
| `tdzArithmetic`, `tdzTable`, `tdzReverse`, `tdzDefault` | UNSOUND-BEFORE | Keep refusal. Native copying initializes a binding that JS cannot yet read. |
| `functionMetadata`, `lexicalHelper` | UNSOUND-BEFORE | Keep refusal. Another export changes helper metadata or a binding through lexical evaluation. |
| `dynamic` | Unproved | Keep refusal. Needs a bounded key-domain and missing-key proof, including output boundary behavior. |
| `freshIndex` | Unproved | Keep refusal. Freshness alone does not prove indexed-write, hole, bounds, and compiler behavior. No claim of borrowed mutation. |
| `defaultcall` | Unproved | Keep refusal. An arbitrary call is outside the bounded creation-only setup proof. This example does not establish unsoundness. |
| `caught` | Unproved | Keep refusal. Native replay sentinels must not be consumed by local catch/finally. |
| `constructor` | Unproved | Keep refusal. New allocation type and constructor effects need an explicit model. |
| `unsupportedCall` | Unproved | Keep refusal. No general method-call purity exemption. |
| `uninitialized` | Unproved | Keep refusal. The existing construction language requires initialized local bindings. |

The final full suites use `TMPDIR=/tmp` and an explicit npm cache under `/tmp`.
They pass with Next 103/103 and core 124 passes, zero failures, and two existing
skips. The targeted audit has 14 passes. Exact commands and compressed logs are
in [the test record](eval-corpus/dev-census-b1c/validation/tests.json).
An earlier suite invocation used macOS's default temporary directory for test
fixtures, which the suite cleaned. Census application installs use `/tmp`, disable
scripts, check the 12 GB floor, and remove each application clone before the next.
No protected checkout, root README, report implementation, or dispatcher policy
is changed. No hosting, deploy, Docker, push, PR, or public-post operation is used.
