# A0: async region outlining census

2026-11-02. Research only. No transform, native compilation, native timing, or deployment.

The recommendation is to investigate **observed shapes before async outlining**. The
current gates accept one small Formbricks ID projection and zero regions in Umami
or Dub. Concrete input schemas recover a few small regions in a counterfactual, but none lies on K1's measured paths.
A production outliner has no demonstrated CPU coverage gain from this experiment.

The [complete census](async-region-census/census.json) retains identities, source
line ranges, live values and checker types, control flags, first rejections,
independent boundary probes, construction proofs when reached, and tested concrete
schema witnesses. The [summary](async-region-census/summary.json) includes historical
K1 measurements and the relevant path regions. These are discovery results, not
successful compiler or application build counts.

## Scope and pins

Umami uses `559e3c607c23d2c72d9bd4f6481bda428255323c`, with `src/lib`,
`src/queries`, and `src/app/api`. Dub uses
`6b463b4bdd9ed2fd9aa416f67b5b77d317b1471e`, with `apps/web/lib` and
`apps/web/app/api`. These are the K1 pins and directory scopes. Test and spec
files and client modules are excluded here. Routes, private functions, nested
async callbacks, and methods are included. Consequently these async counts do
not describe the earlier exported-function rejection population.

Formbricks uses `76b05fb98dd870000d820ad8a27527e483dcfbb0`. Its scope is
`apps/web/lib/response` and the survey analysis `summary/lib` directory under
`apps/web/app/(app)/workspaces/[workspaceId]/surveys/[surveyId]/(analysis)`.
The sparse, shallow checkout stays outside this repository. No AGPL source or
generated client is committed. Cal.com was not needed.

TypeScript 5.9.3 resolves from each application. The original tsconfig and
workspace configuration remain in effect. Formbricks workspace paths point to
actual checked-out source instead of absent package build outputs. Zod 4.6.6,
Prisma 7.10.0, and prisma-json-types-generator 4.1.1 match its workspace pins.
Both Prisma generators ran against the original schema without a database or
application build. Other dependencies are intentionally absent. The census
retains TS2307 and other diagnostic counts. Umami and Dub retain K1's minimal
type installation, so unresolved database and SDK types inflate their `any`
counts. This is not evidence that all their original declarations say `any`.

## Region model and real gates

The [finder](async-region-census/regions.mjs) partitions statement lists into
maximal consecutive runs without an await or yield in the executing function.
It retains whole synchronous loops. A loop containing an await is excluded
entirely, including its body. Try, catch, and finally blocks are separate lists.
Branches containing suspension are visited separately. Expression arrows without
suspension become return regions. Expressions surrounding an await, conditions,
and subexpressions inside an awaited statement are not separately outlined.
Nested functions have their own analysis.

Liveness uses checker symbols, including shorthand property values and captured
locals. Module functions, imports, and constants stay dependencies for the real
closure extractor. Reads of external locals become inputs. Written values with
later lexical references become outputs. Assignment, update, and common mutator
calls count as writes. Later-reference scanning is conservative rather than a
control-flow fixed point. It can retain values read only on unreachable or
alternative paths. Types come from the checker at the relevant reference or
write. This is not a proof of alias freedom or an executable outlining design.

Synthetic functions exist only in memory. Inputs receive their checker types.
Local scalar writes use local bindings. Outputs use an object; a terminal return
keeps its original value. `this`, `arguments`, early returns inside control flow,
and jumps to external loops are recorded and conservatively rejected pending a
control protocol. Throws remain for the existing gates to analyze. Supporting
these rejected control cases could change the result of a future census.

The runner calls the real `promotionCandidates`, which performs extraction,
dependency closure, module initialization, purity, and work screening in its
existing order. It then calls `checkFunctionTypes`, the non-strict application's
strict closure check, and `constructionProof`. Only regions passing **all** these
requirements count as accepted. The separate discovery counter records boundary
success before the strict-closure and construction requirements. Construction
proof is not universally mandatory in shipping discovery, so the two counts must
not be conflated. Boundary probes also run independently to expose failures hidden
by earlier import or purity rejections. Static call-site specialization cannot
use nonexistent synthetic callers and is not applied.

## Counts and first rejections

| App | Async functions | Regions | All gates pass | Boundary success before strict and proof | Any or unknown live boundary | Direct unresolved live boundary |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| umami | 598 | 1283 | 0 | 6 | 719 | 311 |
| dub | 607 | 1534 | 0 | 2 | 1127 | 855 |
| formbricks | 28 | 83 | 1 | 1 | 36 | 20 |

Each first-rejection row is mutually exclusive. Control protocol exclusions precede
the real discovery gates. The other rows follow discovery's actual ordering.

| First rejection | Umami | Dub | Formbricks |
| --- | ---: | ---: | ---: |
| control flow | 331 | 303 | 10 |
| work screen | 134 | 328 | 5 |
| closure/module-init | 309 | 424 | 62 |
| closure/import | 488 | 247 | 1 |
| framework import | 0 | 182 | 0 |
| purity | 6 | 14 | 4 |
| any/unknown boundary | 9 | 27 | 0 |
| other boundary | 0 | 6 | 0 |
| construction proof | 6 | 2 | 0 |
| other extraction | 0 | 1 | 0 |

Concrete Prisma types cause zero **first** rejections. This does not mean Prisma
data is generally eligible. Independent probes reveal the types hidden behind
closure and initialization failures. Formbricks has 36 regions with concrete
Date-bearing live boundary types. Its summary row mapper at lines 1140–1159
fails the boundary probe at `contact.attributes[].attributeKey.createdAt.toString`.
The first rejection remains module initialization. The ID projection is the
counterexample showing a concrete Prisma selection that does pass.

| Independent boundary probe | Umami | Dub | Formbricks |
| --- | ---: | ---: | ---: |
| pass | 29 | 178 | 16 |
| any/unknown | 725 | 1048 | 32 |
| Date/callable | 223 | 5 | 29 |
| Prisma named type | 24 | 2 | 0 |
| other | 282 | 301 | 6 |

"Prisma named type" means the diagnostic mentions Prisma; it is not proof that
the type resolved. Date counts include callable rejection paths under timestamps.
These probe rows report their own first failure and do not replace the gate histogram.
Live-boundary counts use printed types; direct unresolved counts identify the
checker's error type and are a lower bound on dependency-related type loss.

| Concretely typed live-in counterfactual | Verified witness regions | Optimistic maximum additional regions |
| --- | ---: | ---: |
| umami | 2 | 9 |
| dub | 1 | 30 |
| formbricks | 0 | 0 |

Thus the measured gate experiment supports **2–9 additional Umami regions,
1–30 additional Dub regions, and 0 additional Formbricks regions** within this
model. The lower ends have passing concrete witnesses. The upper ends assume
all later type and construction failures can be removed by input typing.
Formbricks retains its one already accepted region. Umami witnesses are team-ID
maps in the 2FA disable and status routes; Dub's witness is a tag-row map at
`apps/web/app/api/tags/route.ts:59`. All three witnesses use an array of concrete
records with string IDs and numeric counts. Their schemas are experiments, not
observations of production values. None is a K1-profiled path.


## CPU coverage and static evidence

The accepted Formbricks region is `deleteResponsesInTransaction` at
`apps/web/lib/response/delete-responses.ts:71`. It projects the selected rows to
`deletedIds` before the next awaited delete. Its checker input is a concrete
Prisma selection with string IDs and JSON data, and its output is JSON. Both
boundary and construction proof pass. This is linear ID projection on a deletion
path, outside the summary aggregation endpoint. Its CPU share is unmeasured.

No accepted region lies on a K1-profiled path. Additional accepted CPU coverage
is therefore **0% of those fixtures** in this dry run. There is no whole-app CPU
estimate, native speedup estimate, or timing of a hypothetical region.

Umami's profiled `saveEventData` relational map still mixes deterministic shaping
with UUID generation, Date-bearing values, and helper closures. K1 assigned
9.8–11.1% of fixture CPU to residual relational query and map work. This is an
optimistic ceiling requiring multiple additional proofs, not an async-only gain.
The separately measured flattening and formatting functions are already sync.
K1 assigned 23.8–27.0% and 34.0–37.1% to those inclusive regions respectively.
Outlining async functions does not remove their closure and data-shape blockers.
UUID work is already native crypto and remains outside the opportunity.

Dub's measured export uses existing sync `formatLinksForExport` and `convertToCSV`.
K1 attributed 30.1–31.5% and 58.9–61.4% to those regions. Outlining the surrounding
route does not prove those helpers or their initialization graphs. No witness
schema region is on the measured export path. These historical percentages use
mocked services and optimistic denominators, as documented in
[the K1 baseline](coverage-baseline.md).

Formbricks has real server compute. `getSurveySummary` fetches cursor batches,
constructs response IDs, obtains metadata, and calls `getElementSummary`.
`getElementSummary` is declared async but contains a large synchronous aggregation
loop with element-specific response scans, choice counts, matrix percentages,
and summary construction. `getResponsesForSummary` maps selected Prisma rows
into response objects after `findMany`, retaining `createdAt` and `updatedAt`
Dates, contact attributes, and JSON data. Its Date-bearing boundary requires more
than replacing `any` with concrete JSON types. These paths are static evidence of
CPU work. No new-app percentage is assigned: executing this endpoint faithfully
would require substantial service and workspace setup.

## Counterfactual and decision

A count obtained by deleting the `any` rejection would overstate recovery. The
runner first identifies regions whose unchanged code passes work, effect, import,
and control screens but has broad boundary data. That count is an **optimistic
upper bound within this region model**, not a count passing the remaining gates.
It then replaces only explicit `any` and `unknown` nodes in synthetic parameter
types with six concrete witness schemas and reruns strict diagnostics, boundary
checking, and construction proof. Original application code and local body
annotations remain unchanged. The verified witness count is a lower bound for
existence of a type assignment, not production schema agreement. Multiple inputs
receive the same trial schema. Aliased broad types and other schemas can be
missed. Later failures remain possible throughout the upper bound.

Observed shapes should start as a small profile collection experiment on existing
sync compute, with guards and per-call fallback. The census does not justify a
production async transform yet. Expected newly accepted measured-path coverage
from outlining alone is 0% under today's gates. Even the optimistic Umami
9.8–11.1% residual ceiling needs effect separation, closure support, and faithful
boundary types. It must not be quoted as a likely gain from an outliner.

Confidence is high in the negative result for the represented regions and gates,
moderate in the ordering of the next research steps, and low in any extrapolation
to whole apps. Missing external types, conservative control handling, and lexical
liveness limit recall. Witness schemas establish possibility, not request CPU
weight. A positive result still needs compiler acceptance, JS parity, and actual
profile attribution before an implementation decision.

## Reproduction and cleanup

Run these steps sequentially:

```sh
RUN_APPS=umami,dub node research/coverage-baseline/setup.mjs
node research/async-region-census/setup.mjs
node research/async-region-census/validate.mjs
node research/async-region-census/census.mjs
node research/async-region-census/summarize.mjs
node research/async-region-census/setup.mjs --cleanup
node research/coverage-baseline/setup.mjs --cleanup
```

`COVERAGE_APPS`, `ASYNC_APPS`, and `REUSE_NODE_MODULES` override external paths.
The [dependency lock](async-region-census/deps-lock.json) pins the research type
and parser dependencies. The setup scripts preserve external source checkouts.
Use fresh dependency directories or remove only installations owned by this task.
Disk had about 20 GiB free initially, and about 18 GiB before cleanup. Shared
work changes free space independently of this task. The liveness fixtures check shorthand reads, mutable live-outs, write-only
assignments, return boundaries, expression arrows, and await-containing loops.
A fresh setup test caught and fixed the JSON generator PATH before both generators
and the fixtures passed. Syntax checks pass for the research scripts. No unrelated native suite ran.

Task-created dependencies and generated Prisma files were removed after the
final run. The source checkouts remain outside the repo. No containers, compiler
fork, `/Users/noah/scriptc`, hosting providers, Papermark source, or root README
were touched. Nothing was published, merged, or pushed.
