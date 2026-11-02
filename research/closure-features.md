# Bounded closure features (M2)

2026-11-02. Adapter implementation and pinned source censuses. No native timing.

M2 links imported data types, lowers literal TypeScript enum reads, folds private
literal tables, and replaces throw-only application constructors with a mandatory
per-call fallback. Exported object graphs remain excluded. Acceptance counts and
first-rejection histograms appear below; passing an earlier check is not accepted
coverage.

## Type linking

The resolver uses the application's TypeScript and options. Type references can
resolve declaration files; runtime references still require implementation files.
Named source re-exports follow their defining module, including aliases. Namespace,
star, and default re-exports remain excluded. Reachable interfaces and type aliases
are copied transitively, renamed with the same per-file prefix as value bindings,
and checked in the standalone strict closure. Value imports used only in type
positions take the type-resolution path too. All visited file and manifest hashes
remain build dependencies.

The bounded subset excludes any, unknown, undefined, void, never, function and
constructor types, methods, mapped and conditional types, infer, type queries,
import types, and named non-JSON builtins. Unresolved names and invalid declarations
fail the final strict TypeScript check. Recursive or otherwise unbounded data fails
the construction proof. This does not evaluate Zod types or copy schema initializers.
Type parameters that shadow module bindings reject because Babel does not model
that separate type scope. This prevents a renamed alias from silently capturing
the module type instead of its parameter. Type declarations have no runtime effect; the emitted strict program remains the
final authority for reference resolution and data construction.

## Literal enums and tables

At the pinned Formbricks revision, `TSurveyElementTypeEnum` is an ordinary string
TypeScript enum in `packages/types/surveys/constants.ts`. `elements.ts` re-exports
it with a source specifier. Supporting that named re-export removes the original
unresolved-export failure. No Zod evaluation is needed to read the enum.

String and finite numeric literal members, signed numeric literals, and numeric
auto-increment members are supported for both ordinary and const enums. Member
reads become literals. Enum annotations become literal unions, and qualified
member annotations become literal types. Computed members, duplicate and reserved
names, reverse lookups, dynamic keys, object escape, and writes reject. The owning
module's original enum references are audited, including unused helper bodies.
As with M1, this assumes the running application honors TypeScript's enum member
readonly contract and does not alter module values through unchecked external code.
No application-wide proof against casts or reflective module mutation is claimed.

Private `const` object and array graphs with `as const` initializers may contain
only literals and ordinary explicit properties. Every reference in the owning
module must end in a scalar read with literal keys. Arrays also support length.
Noncanonical indices, holes, computed properties, spreads, methods, mutation,
aliases, escaping subgraphs, and lexical eval reject. Reads become literal values,
so the native copy creates no shared object identity. Shadowed bindings retain
their own meaning. Call initializers, including Object.freeze and Zod, reject.

An exported `as const` object is deliberately rejected. The assertion is erased
and does not freeze its runtime object. Another importer could retain and mutate
it without appearing in this dependency graph. Admitting that case requires a
whole-application reference proof or a separately specified runtime immutability
contract. The implemented subset supports an imported helper that reads a private
table, rather than importing an externally mutable object directly. Dynamic table
keys also remain excluded; this patch does not add indexed access to the general
construction proof.

## Throw fallback and replay

A reachable application class may disappear from the native copy only when every
reachable use of that class binding is the direct constructor in `throw new C(...)`.
Imports and aliases resolve to the defining binding. Stored or returned instances,
instanceof, constructor aliases, and other value uses reject. Unreachable uses in
the original module remain ordinary JS and need no rewriting. Class bodies and
constructor arguments do not execute in native code at that throw site.

The native throw becomes a fixed string sentinel. The construction proofs admit
that exact throw statement. Any try statement in the retained closure rejects,
because a catch or finally could observe or replace the sentinel. The complete
remaining closure must still pass the existing effect and construction proofs.
This limits pre-throw native work to unobservable local computation and allocation.

`requiresFallback` travels from the closure to its function signature. The builder
requires an eligible construction proof and a number, JSON, or string result ABI,
and forces catchFallback even if the caller sets it false. The signature catches
the sentinel and returns the existing per-call ABI fallback value. The addon marks
the result as fallback. `createDispatcher.dispatch` records that attempt, leaves
the native-return branch, and calls the original JS function with the original
arguments. It does not count the sentinel as a native answer or poison the addon.
Boolean, null, and bytes result ABIs are excluded from this lowering.

The observable-error argument depends on replay purity. Before the sentinel,
native code neither mutates inputs nor performs external effects. Native results
and allocations are discarded. JS then executes the original call exactly once,
including argument evaluation and the real constructor. Thus the caller receives
the original error class, message, and application fields. The synthetic exception
never reaches application code. A local catch, a class value escape, or observable
pre-throw effects would invalidate this argument and therefore reject. M1's
unmodified-builtins and pure-module assumptions still apply; sampled shadow checks
do not prove those assumptions for arbitrary application code.

The real-addon regression compiles enum and private-table reads with a conditional
app error throw. Forced-native successful calls return matching values. Three
throwing calls each replay JS exactly once and throw the actual source module's
AppError with the same constructor identity, name, and message;
the native and fallback counters confirm the paths. The test requests
catchFallback=false to verify that the required guard cannot be disabled.

## Measurement and validation

The K1/K4 sync census still accepts Umami 4 and Dub 32 functions. The A0
async census still accepts Umami 0, Dub 0, and Formbricks 1 regions. Every
`newlyAccepted` list is empty in [the comparison](closure-features/comparison.json).
No newly accepted function or region is on a K1-profiled path, so no coverage-share
rerun is needed. Additional accepted measured-path coverage is zero. These are
source discovery counts, not compiler acceptance or performance measurements.

K1/K4 sync first rejections use the unchanged census categorizer:

| First rejection | dub before / after | umami before / after |
| --- | ---: | ---: |
| runtime import | 85 / 83 | 32 / 36 |
| unsupported reference/import | 56 / 58 | 66 / 72 |
| other extraction | 92 / 47 | 76 / 48 |
| work screen | 53 / 55 | 80 / 72 |
| default/rest/destructured parameter | 29 / 29 | 39 / 39 |
| time/randomness/I/O | 8 / 6 | 7 / 7 |
| React/framework | 18 / 18 | 6 / 6 |
| mutation | 3 / 3 | 2 / 1 |
| call-site specialization | 5 / 5 | 6 / 6 |
| collection/callable boundary | 1 / 1 | 0 / 0 |
| broad/unresolved boundary | 0 / 45 | 1 / 28 |

A0 async first rejections use the unchanged census categorizer:

| First rejection | umami before / after | dub before / after | formbricks before / after |
| --- | ---: | ---: | ---: |
| control flow | 331 / 331 | 303 / 303 | 10 / 10 |
| work screen | 134 / 128 | 328 / 336 | 5 / 5 |
| closure/import | 703 / 720 | 419 / 574 | 35 / 42 |
| closure/module-init | 94 / 85 | 252 / 91 | 28 / 21 |
| any/unknown boundary | 9 / 8 | 27 / 27 | 0 / 0 |
| purity | 6 / 5 | 14 / 13 | 4 / 4 |
| construction proof | 6 / 6 | 2 / 2 | 0 / 0 |
| framework import | 0 / 0 | 182 / 182 | 0 / 0 |
| other boundary | 0 / 0 | 6 / 5 | 0 / 0 |
| other extraction | 0 / 0 | 1 / 1 | 0 / 0 |

`getElementSummary` still has one region, lines 329–1021. Its exact new first
rejection is `type TSurveySummaryResponse is not bounded JSON data: Identifier Date`
in `surveySummary.ts`. That local interface has `updatedAt: Date` at line 48;
the row extension also has `createdAt: Date`. Linking and validating its reachable
annotation reaches this blocker before the enum read. The enum is independently
covered by the named-re-export and real-addon tests. Zod-inferred survey aliases
remain later possible blockers; no claim is made that removing Dates alone admits
the aggregation.

All 95 Next tests pass. The expanded promotion suite passes 21 tests, including
five M2 tests, with the two existing opt-in Nuxt and TanStack cases skipped.
This covers the 16 previously passing promotion tests. Astro and React Router
production parity tests run as part of the suite. The real-addon differential
fuzzer passes seed 20935 with 40 cases, 680 inputs, 1,360 comparisons, 2,266 native
successes, and 534 fallbacks across 17 candidates. Follow-up usability calls are
included in the last two counters. A0 liveness fixtures pass. Tests use the stock
installed compiler, without changing its source. [Validation](closure-features/validation.json)
records the commands and counters.

The single final held-out Papermark census accepts 23 functions at
`ed19717ec02a1ac79aecf5569159aa9d2d869312`, matching M1.
No Papermark execution, profiling, or timing ran. Its first-rejection histogram is:

| First rejection | Count |
| --- | ---: |
| runtime import | 108 |
| unsupported reference/import | 101 |
| default/rest/destructured parameter | 22 |
| work screen | 139 |
| React/framework | 55 |
| other extraction | 21 |
| time/randomness/I/O | 10 |
| mutation | 10 |
| broad/unresolved boundary | 10 |
| collection/callable boundary | 2 |
| undefined/optional | 3 |
| call-site specialization | 4 |



## Reproduction and cleanup

The source pins, scopes, setup dependency locks, and app-local TypeScript 5.9.3
match M1. The before snapshot includes the server-only review follow-up. Run the
before commands on the parent implementation, then the after commands on M2.
The original committed census artifacts are not changed.

```sh
RUN_APPS=umami,dub node research/coverage-baseline/setup.mjs
node research/async-region-census/setup.mjs
mkdir -p research/closure-features/sync-before research/closure-features/sync-after
RUN_APPS=umami,dub COVERAGE_OUTPUT=../closure-features/sync-before node research/coverage-baseline/census.mjs
ASYNC_OUTPUT=../closure-features/async-before.json node research/async-region-census/census.mjs
RUN_APPS=umami,dub COVERAGE_OUTPUT=../closure-features/sync-after node research/coverage-baseline/census.mjs
ASYNC_OUTPUT=../closure-features/async-after.json node research/async-region-census/census.mjs
node research/closure-features/compare.mjs
node --test --test-concurrency=1 packages/next-scriptc/test/*.mjs
node --test --test-concurrency=1 packages/scriptc-promote/test/*.mjs
node research/async-region-census/validate.mjs
RUN_APPS=papermark node research/coverage-baseline/setup.mjs
RUN_APPS=papermark COVERAGE_OUTPUT=../closure-features/papermark node research/coverage-baseline/census.mjs
node research/async-region-census/setup.mjs --cleanup
node research/coverage-baseline/setup.mjs --cleanup
```

Workspace package links and installed stock scriptc 0.4.6 are required for tests.
These runs used temporary links to existing workspace dependencies. Cleanup removes
the task-owned installations, links, and generated Prisma output. Source checkouts,
including both AGPL apps, stay outside the repo. Free disk was about 24 GiB before
cleanup. The suite runners and censuses ran with at most two top-level jobs and
one test file at a time. No Docker or container action, hosting-provider call,
compiler fork change, root README edit, publication, merge, or push was performed.

Async snapshots omit repeated live-input and live-output lists; the original A0
artifacts retain that metadata. Each snapshot keeps region identity, acceptance,
first rejection, boundary probe, and available construction proof. The comparison
records implementation hashes because census runs precede this commit.

The final Papermark setup reused the existing task-owned dependency slice. Setup
created the app-local TypeScript link, then stopped at its existing-dependencies
guard. The subsequent census was the only Papermark scan. Cleanup includes that link.

A repeat promotion-suite run overlapped dependency cleanup and failed after its
imports disappeared. Temporary workspace links were restored, and the complete
suite passed again before those links were removed. Final retained test logs are
[next-tests.log](closure-features/next-tests.log) and
[promote-tests.log](closure-features/promote-tests.log).
