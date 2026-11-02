# Read-and-pass handles and checker-resolved types

H2 adds a linked read projection and original-value handle for plain input
objects. The response-interface probe at pinned Formbricks revision
`76b05fb98dd870000d820ad8a27527e483dcfbb0` now passes the former `TResponseData`
Zod type-query gate. The complete summary remains excluded by adapter checks.
No scriptc change is required by the evidence gathered here.

## Why the projection and handle agree

For an eligible synchronous closure, the construction and purity proofs forbid
writes to inputs and calls with unknown effects. No other JavaScript executes
during the native call. Every projected property therefore has the same value
as the corresponding property of the original input object returned to JS.

The encoder adds `__scriptcOriginal` alongside the selected fields at that
object's input position. It captures the original object in the same per-call
table used by H1. Lowering rewrites passthrough expressions, including shorthand
properties and constant aliases, to copy this generated field. Read expressions
continue to use the typed projection. Application source cannot name the
reserved generated field. Native code cannot manufacture or inspect the branded
handle, and the result decoder restores the exact original reference.

The runtime obtains projected fields with `Object.getOwnPropertyDescriptor` and
requires an own data descriptor. It rejects accessors without evaluating them,
inherited fields, nonplain projected objects, and sparse arrays. Unused fields
are not traversed. Thus an unobserved Date, function, or cycle can remain inside
an original object whose numeric fields are projected.

A runtime alias between a read container and a passed value is now allowed.
The same purity argument applies through aliases. Tests check aliases between
separate parameter paths and repeated occurrences of the same read-and-pass
object. This relies on the existing unmodified-builtins and pure-input boundary
assumptions, including H1's limitations concerning exotic objects.

Whole-object comparison, key enumeration, spread, `in`, mutation, and unknown
helper uses remain excluded. Non-scalar inspection at a descendant is also
excluded, so comparing two projected child objects cannot silently change
identity semantics. The second typed audit still rejects inspection through
local result containers and annotations that erase handle provenance. Helpers
do not yet have inferred reader contracts. Coverage remains intraprocedural,
with constant aliases, for-of, and inline map callbacks. Read-and-pass arrays,
optional structures, and union projections retain conservative boundary gates.

## Type queries resolve without schema execution

Dependency linking uses the application's TypeScript checker to resolve aliases
containing `typeof`, including real `z.infer<typeof schema>` aliases. It emits
plain structural declarations and never includes or executes the schema value.
The checker host sees the caller's in-memory source. Files read by the checker
join dependency hash verification, including transitive schema definitions.

Structural emission handles literals, primitives, unions, arrays, ordinary data
properties, and string or number index signatures. It bounds recursion at depth
12. Functions, symbols, classes, intersections including brands, recursion, and
unresolved types cannot become read shapes. Unsupported nested leaves remain
`unknown` during linking. Path specialization can remove them or replace them
with handles. Every remaining read must pass strict type and construction checks;
`unknown` is never an accepted native read type. This avoids requiring structural
types for a Date or function that is only passed through. A real Zod fixture
covers numeric reads alongside a passed Date, function-containing original,
and original object identity. Other fixtures reject function, symbol, brand,
and recursive read shapes.

## Formbricks reaches a different adapter gate

The full typed synchronous-body probe now rejects with
`computed or prototype member at line 255` in `surveySummary.ts`. That line is
inside `checkForI18n`, which dynamically indexes response data. The existing
closure linker excludes computed members. The probe copies the exact body into
an in-memory synchronous function with the original parameter types. It is not
a production async outliner or an imported application execution.

There is also a contract blocker in this helper: line 252 uses `in` on an element
found in the original `elements` array. The summary passes that array into the
helper and returns those elements. H2 explicitly excludes `in` on read-and-pass
values because the native object contains projected keys. Admitting this helper
would therefore require a new key-presence contract or a smaller region with
JavaScript assembly. Merely classifying the helper as pure would be insufficient.

The stand-in body probe is retained only as a diagnostic. Its `object` annotations
make even the element discriminant unknown, so its rejection is not the typed
summary's next blocker. The independent actual response-interface probe is
accepted. Source hashes and both outcomes are in
[the evidence](read-and-pass-handles/evidence.json).

The full region has not cleared these adapter gates. There is no outlined
summary, real-addon summary run at 100, 1k, or 10k responses, verified summary
shadow, or D2 CPU measurement. No compiler blocker or CPU saving is claimed.

## Validation and reproduction

The real-addon test performs 100 seeded differential calls with read fields,
original row identity, Dates, arbitrary borrowed values, decoded shadow
verification, and deliberate mismatch demotion. Unit tests cover comparison,
keys and entries, spread, `in`, mutation, helpers, getters, and aliases. The
baseline real-addon fuzzer checks 680 inputs and 1,360 comparisons across 17
candidates with seed 20935. Both package suites pass: 95 Next tests and 26
promotion tests, with two existing opt-in promotion skips.

Commands use the app's TypeScript and temporary workspace dependency links:

```sh
node research/async-region-census/setup.mjs
node research/read-and-pass-handles/validate.mjs
node --test --test-concurrency=1 packages/next-scriptc/test/*.mjs
node --test --test-concurrency=1 packages/scriptc-promote/test/*.mjs
node scripts/promotion-fuzz.mjs
node research/async-region-census/setup.mjs --cleanup
node scripts/compress-artifacts.mjs
```

The sparse setup now also includes the i18n and embedded-data helper source
needed by the full closure probe. AGPL source and transpiled code remain outside
this repository. Setup-owned dependencies, generated Prisma output, and temporary
workspace links are removed after validation. An early short probe briefly
ran alongside both suites, exceeding the requested two-job limit. Subsequent
validation ran with at most two heavy jobs; no timing results depend on overlap.
No containers, hosting, publication, Papermark, fork, root README, merge, or push
operation is performed.
