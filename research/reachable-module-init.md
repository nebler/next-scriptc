# Reachable module initialization (M1)

2026-11-02. Discovery research and adapter implementation. No native timing.

`dependencyClosure` now checks the declarations reachable from a candidate,
instead of checking every declaration in each visited file. Unrelated cache
wrappers, classes, clocks, and allocations no longer veto a closed computation.
Reachable declarations retain the scalar-or-function initialization restriction,
the banned-node and identifier traversal, and the transitive construction proof.

## Binding graph and emission

The source candidate seeds a graph of top-level bindings. Each referenced local
binding adds its declaration. A referenced import requests only that imported
export from the resolved module. The resolver uses the application's TypeScript
and compiler options, and still rejects declaration-only runtime resolution,
unsupported framework imports, custom resolvers, and unsupported package conditions.

Each parsed file has a set of requested local bindings. Traversal accumulates a
union before emission. Thus two branches of a diamond can request different
exports of one dependency without losing the second request or emitting duplicate
bindings. Local recursion terminates through that set. Reachable cross-module
cycles conservatively reject; unused cyclic imports disappear. Export aliases
resolve to their local bindings. Re-exports with a source, default exports, and
namespace imports remain unsupported when requested.

Emission drops unused declarations and individual unused variable declarators.
Automatic extraction also traverses individual declarators, so an unrelated sibling
initializer cannot veto the candidate before dependency analysis. Generated names
remain collision protected. Dependency records retain the hashes of entire visited
files and package manifests, so edits outside the retained closure still invalidate
a build. Unvisited modules need no hash because no native code depends on them.

## Soundness boundary

The application still imports and initializes its original JavaScript modules.
Only the native copy omits unreachable declarations. This preserves ordinary
application setup; the native closure does not substitute for module execution.

Unreachable `const x = call(...)` initializers are accepted. The call runs in the
application and does not run in the native copy. This decision assumes that the
call does not change globals or shared objects observed by the native closure.
Lexical reachability cannot establish that assumption. Prototype patching,
`globalThis` writes inside an excluded initializer, and mutation of a reachable
function object are residual risks. The prior whole-file check partly guarded
these cases in visited files, but any other application module could already
perform the same mutation.

This is a conditional soundness argument under the existing unmodified-builtins
and pure-closure contract, not a proof for arbitrary JavaScript programs. Shadow
verification compares original JavaScript results with native results before
promotion and demotes mismatches. Finite samples cannot prove agreement for every
input or for later changes to shared state. Forced-native mode bypasses that
protection and continues to require the caller to honor the purity contract.
No broader module-object or mutable-initializer proof is claimed here.

Explicit top-level non-declaration statements still reject every visited file.
Bare calls, assignments, and `if` blocks cannot disappear merely because their
results are unused. Side-effect-only imports also reject conservatively. An
export-default expression that executes a call rejects as an explicit expression.
A reachable call initializer, allocation, class, mutable binding, or prohibited
identifier still rejects. This preserves the conservative variant for observable
initialization constructs inside the reachable graph.

The regression tests cover dropped versus retained effects in both source and
dependency files, explicit side effects, imported aliases, diamonds, cycles, and
sibling declarators. A residual-risk fixture executes a prototype patch in an isolated JavaScript
context, demonstrates divergence from the extracted closure, and verifies that
shadow comparison demotes it before any foreground native answer. Existing
dispatcher tests also check mismatch demotion;
the real-addon differential fuzzer checks parity and subsequent addon usability.

## Reproduction

Use the unchanged K1 and A0 pins, scopes, and setup scripts. Formbricks and
Papermark remain outside this repository. The setup generates Formbricks' real
Prisma client and JSON types without a database. TypeScript 5.9.3 resolves from
each app. Missing external types retain the limitations documented in A0.

```sh
RUN_APPS=umami,dub node research/coverage-baseline/setup.mjs
node research/async-region-census/setup.mjs
RUN_APPS=umami,dub node research/coverage-baseline/census.mjs
node research/async-region-census/census.mjs
# Capture before on the parent revision and after on this implementation.
# At the end, set up Papermark and run its census exactly once.
RUN_APPS=papermark node research/coverage-baseline/census.mjs
node research/async-region-census/setup.mjs --cleanup
node research/coverage-baseline/setup.mjs --cleanup
```

The retained before and after JSON artifacts contain candidate identities and
first-rejection evidence. Census acceptance does not establish compiler acceptance
or production CPU coverage. No application build, endpoint execution, or timing is
performed for Formbricks or held-out Papermark.

## Discovery results and measured paths

The sync K1/K4 census still accepts Umami's four functions and Dub's 32 functions.
There are zero newly accepted sync functions. A0 still accepts zero Umami regions,
zero Dub regions, and one Formbricks region. There are zero newly accepted regions.
The accepted Formbricks region remains `deleteResponsesInTransaction` at line 71.
It is outside the summary endpoint. No new acceptance lies on a K1-profiled path,
so additional accepted coverage is zero and the conditional K1 profile rerun is
not needed. No native timing was run.

The async first-rejection histogram changes as follows. Each cell is before → after.

| First rejection | Umami | Dub | Formbricks |
| --- | ---: | ---: | ---: |
| control flow | 331 → 331 | 303 → 303 | 10 → 10 |
| work screen | 134 → 134 | 328 → 328 | 5 → 5 |
| closure/module-init | 309 → 94 | 424 → 271 | 62 → 62 |
| closure/import | 488 → 703 | 247 → 400 | 1 → 1 |
| framework import | 0 → 0 | 182 → 182 | 0 → 0 |
| purity | 6 → 6 | 14 → 14 | 4 → 4 |
| any/unknown boundary | 9 → 9 | 27 → 27 | 0 → 0 |
| other boundary | 0 → 0 | 6 → 6 | 0 → 0 |
| construction proof | 6 → 6 | 2 → 2 | 0 → 0 |
| other extraction | 0 → 0 | 1 → 1 | 0 → 0 |

The sync runner uses its original, coarser categories. Its final histogram is:

| First rejection | Umami | Dub |
| --- | ---: | ---: |
| runtime import | 32 | 84 |
| unsupported reference/import | 66 | 56 |
| other extraction | 76 | 93 |
| work screen | 80 | 53 |
| default/rest/destructured parameter | 39 | 29 |
| time/randomness/I/O | 7 | 8 |
| React/framework | 6 | 18 |
| mutation | 2 | 3 |
| call-site specialization | 6 | 5 |
| broad/unresolved boundary | 1 | 0 |
| collection/callable boundary | 0 | 1 |

These are the existing scripts' categories, not a new normalized classification.
In particular, async `closure/import` includes other dependency-closure failures.
The [comparison artifact](reachable-module-init/comparison.json) retains both
histograms and empty lists of newly accepted functions and regions.

### Formbricks getElementSummary

The region at `surveySummary.ts:329–1021` now first rejects on
`unproved module initialization side-effect import`. The file starts with
`import "server-only"`. This conservative rule applies to every visited file,
so traversal stops before checking any binding initializer. The unrelated
`getSurveySummary = reactCache(...)` declaration is no longer the reported blocker.
The region remains in `closure/module-init`, which explains the unchanged
Formbricks histogram. Supporting a known framework marker would be a separate,
explicit integration decision. This experiment does not silently whitelist it.

### Integration evidence

The React Router demo gains an eligible page loader beside its JSX component.
That is an integration fixture outside the K1 app population. The existing test
requested its page once and incorrectly required that new function to have
verified shadow samples. The test now requests the page 120 times and offsets the compute calls by one
to prevent nested helpers from always taking the shared shadow slot first.
Both functions verify and have zero fallbacks.


## Validation and cleanup

All 95 `packages/next-scriptc` tests pass with test concurrency one. This includes
the differential fuzzer at seed 20935 with 40 cases, 680 inputs, 1,360 comparisons,
2,266 native successes, and 534 fallbacks across 17 candidates. Counts include
follow-up usability calls. The full `packages/scriptc-promote` suite passes 15
tests with two opt-in framework cases skipped. Eight reachability regressions
are included. Astro and React Router production HTTP tests each issue 241
requests per mode and verify shadow operation. A0 liveness fixtures also pass.

The suites use installed stock scriptc 0.4.6 through `SCRIPTC_COMPILER`. No compiler
source or fork is changed. Test-created build directories clean themselves up.
The setup cleanup modes remove task-created app dependencies and generated
Prisma output. Temporary workspace dependency links are also removed. At most
two jobs run together. Docker stays down; no containers, hosting providers,
root README, merges, pushes, or publications are involved.

## Held-out Papermark

The single completed final census accepts 23 functions at the unchanged pin
`ed19717ec02a1ac79aecf5569159aa9d2d869312`. This agrees with the previously published
K4 count; no new before measurement is taken on the held-out app. The retained
[Papermark census](reachable-module-init/papermark.json.gz) lists every identity.
Papermark source is neither executed nor committed, and no profile or timing is run.
Two startup attempts failed before scanning because cleanup removed temporary
workspace dependency links. Restoring those links allowed the one completed scan.

| First rejection | Papermark |
| --- | ---: |
| runtime import | 97 |
| unsupported reference/import | 100 |
| default/rest/destructured parameter | 22 |
| work screen | 143 |
| React/framework | 55 |
| other extraction | 35 |
| time/randomness/I/O | 10 |
| mutation | 10 |
| collection/callable boundary | 2 |
| undefined/optional | 3 |
| broad/unresolved boundary | 4 |
| call-site specialization | 4 |

This run uses Node 26.13.0. Async snapshots omit repeated liveness/type details
already retained by A0, but keep every region identity, acceptance, first rejection,
independent boundary probe, and available construction proof. Regenerate the
comparison with `node research/reachable-module-init/compare.mjs`. The existing
K1 and A0 census files are preserved; task snapshots live in the new directory.
