# Opaque passthrough handles at the native boundary

H1 now preserves borrowed input values in a bounded subset of automatic promotion.
Dates, class instances, functions, symbols, cyclic objects, and undefined can
occupy a borrowed field. The real addon returns the original JavaScript value,
including its identity and prototype. The pinned Formbricks summary remains
excluded. Its element objects are both inspected and returned, which violates
the requested read-and-pass exclusion.

## Classification and proof

`opaque-handles.mjs` tracks parameter paths through property access, constant
aliases, `for…of` bindings, and inline `map` callbacks. Scalar uses retain typed
JSON. An object or unknown value can become a handle when its uses only copy it
into ordinary properties, array literals, local array pushes, or a return.
Unrecognized operations count as reads. Helpers are conservative inspection
boundaries; this implementation does not infer borrowing contracts for helpers.

A read at an ancestor or descendant of a proposed borrowed path rejects the
candidate. This catches identity comparison, mutation, spread, key enumeration,
and reading an object that also escapes. The complete lowered closure receives
a second audit. Its nominal handle types follow local containers and aliases,
so moving a borrowed value into a local object cannot hide a later comparison.
The audit rejects annotations that erase handle provenance and helper calls that
receive containers with handle fields.
The ordinary construction proof still checks allocation, mutations, calls,
resource bounds, and result construction. Discovery and the builder require that
proof for every handle-bearing function. The signature forces per-call fallback.

The native declaration is a generated `number` intersection with a readonly
unique-symbol brand. Application source cannot name the reserved brand. No cast
or constructor manufactures handles. The audit permits copying and forbids
inspection, arithmetic, comparison, keys, conditions, and mutation. Native storage
is numeric, but the adapter's checked language treats it as a distinct type.

The parameter's encoded type contains its read fields and branded handle leaves.
Only unused type declarations disappear after specialization. Read annotations
still pass strict TypeScript and the existing bounded-data construction proof.
Type linking defers simple non-JSON annotations until this step. Mapped,
conditional, inferred, and query-based types still reject. This does not evaluate
Zod schemas or execute application initialization.

The first implementation requires inferred results and simple explicit parameter
annotations. Generic functions, explicit result annotations, optional structures,
and unsupported read shapes retain their previous boundary checks. A root `any`
or `unknown` retains call-site specialization. Nested unknown borrowed fields
are supported. These are conservative coverage limits, not a whole-program
classification claim. Unknown helper calls never establish borrowing eligibility.

## Transport and equality

Argument encoding captures each borrowed value in a fresh per-call table. A map
assigns integer indices using SameValue identity, including distinct signed zero.
Read fields retain typed JSON validation; borrowed leaves require no traversal.
Own data descriptors prevent getters from being evaluated during projection.
Arrays remain plain and dense. A runtime alias between a borrowed value and a
read container also falls back, even when their static paths differ. Unused input fields do not cross the boundary.

The addon continues to carry JSON bytes. It never receives the reference table,
so no new C ABI lane is necessary. The generated signature parses the specialized
numeric representation. Its result layout records exactly which leaves are
handles. Decoding checks integer bounds and replaces those leaves from the same
call's table. Ordinary numeric fields cannot accidentally become references.
Unexpected result fields reject rather than disappearing during reconstruction.
The table is associated with the encoded argument array through a WeakMap and
remains captured by a pending shadow until it finishes. No global handle registry
or reusable handle token escapes to the caller.

Shadow verification decodes first. It maps borrowed result leaves back to their
indices by reference identity, then compares canonical bytes for the surrounding
JSON data. A different Date with the same timestamp fails identity comparison.
A wrong number beside a correct reference still demotes the function. Borrowed
objects can change after the call without becoming a native snapshot: both
answers retain the same original object, as JavaScript does.

The byte-for-byte guarantee still applies to all computed JSON content, with the
existing JSON signed-zero convention. At borrowed leaves, equality now means the
same original value rather than its serialized contents. This strengthens the
contract for those leaves: identical Date text cannot conceal a replacement
string or copied object. Shadow verification remains sampled, under the existing
pure-closure and unmodified-builtins assumptions.

## Formbricks remains blocked by two adapter gates

The external checkout is pinned to
`76b05fb98dd870000d820ad8a27527e483dcfbb0`. TypeScript 5.9.3 resolves from
`apps/web`. The validator checks the source against its pinned Git blob and never
writes source or transpiled AGPL code into this repository.

The exact original `getElementSummary` body, analyzed with simple stand-in
parameter annotations in memory, rejects with
`opaque handle is also read: 1.[]`. Parameter 1 is `elements`. The OpenText branch
reads `element.type` and `element.id`, then stores the whole `element` in the
summary. Other branches inspect more element fields. Supporting the whole summary
therefore needs a changed contract that permits a separate read view alongside a
borrowed original, or a smaller region with JavaScript assembly. The requested
rule explicitly rejects that combination. This body probe is not an outliner or
an end-to-end application run.

An independent closure using the actual response interface now gets past its
Date annotation. Its exact next rejection is
`packages/types/responses.ts: type TResponseData is not bounded JSON data: TSTypeQuery`.
That is the Zod-inferred alias gate. The evidence does not establish a compiler
blocker. No scriptc change, Zod emitter, production async outliner, or native
summary is claimed. A 100/1k/10k summary parity run and thread-CPU measurements
would be premature while these gates remain. No timing was performed.

## Validation and cleanup

The retained logs record 95 passing Next tests and 24 passing promotion tests,
with the two existing opt-in framework skips. The promotion total includes three
new H1 tests beyond the previous 21 passing tests. Classification covers positive
copies, aliases and loops, plus negative comparison, mutation, spread,
`Object.keys`, `Object.is`, read-and-pass, and inspection through a local container.
The unchanged baseline differential fuzzer also passes seed 20935 with 680 inputs
and 1,360 comparisons across 17 candidates.
The addon test uses automatic discovery with an imported Date/unknown interface,
checks exact references, verifies decoded shadows, and demotes a deliberate
mismatch. Its seeded differential corpus has 100 calls and includes class
instances, undefined, null, symbols, functions, bigint, and cyclic objects.

Reproduction uses the existing stock scriptc 0.4.6 installation and temporary
workspace dependency links:

```sh
node research/async-region-census/setup.mjs
node research/opaque-handles/validate.mjs
node --test --test-concurrency=1 packages/next-scriptc/test/*.mjs
node --test --test-concurrency=1 packages/scriptc-promote/test/*.mjs
node scripts/promotion-fuzz.mjs
node research/async-region-census/setup.mjs --cleanup
node scripts/compress-artifacts.mjs
```

Initial suite attempts lacked workspace dependency links. Those links were
restored before the retained passing runs. Setup briefly overlapped one promotion
suite: npm installation took two seconds and Prisma generation about one second.
If the other library probe was active, that briefly exceeded the requested two-job
limit. Subsequent build and validation jobs ran serially. There are no timing
numbers whose interpretation depends on that overlap.

Setup-owned dependencies, generated Prisma output, and temporary workspace links
are removed after validation. Sources remain outside the repository. No Docker,
container, hosting, held-out Papermark, compiler-fork, root README, merge, push,
or publication operation was performed. Results and the source hash are in
[the evidence](opaque-handles/evidence.json); command outcomes are in
[the validation record](opaque-handles/validation.json).
