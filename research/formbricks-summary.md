# Formbricks summary promotion is blocked by observable input references

2026-11-02. F1 investigation. No adapter feature or native summary build lands in
this change. F1 remains incomplete.

The pinned `getElementSummary` cannot pass the requested field-projection escape
condition. Its OpenText branch returns `response.updatedAt`, which is a Date, and
returns the original `element`, `contact`, and `contactAttributes` objects. Removing
the timestamp changes summary bytes. Serializing the Date as a string changes the
JavaScript result. Even a field never read by the aggregation is observable when
the whole element is returned.

This is a boundary-contract blocker established before compiler work. No scriptc
change has been shown necessary. The fork remains untouched. Resolving Zod aliases
or adding async outlining would not make this boundary satisfy the stated rule.

The external checkout is pinned to
`76b05fb98dd870000d820ad8a27527e483dcfbb0`. TypeScript 5.9.3 resolves from
`apps/web`. The source stays outside this repository. The source hash and exact
line evidence are in [evidence.json](formbricks-summary/evidence.json).

The relevant source is
`apps/web/app/(app)/workspaces/[workspaceId]/surveys/[surveyId]/(analysis)/summary/lib/surveySummary.ts`.
The region starts at line 329, its element loop ends at line 992, and it returns
at line 1021. The OpenText sample reads `updatedAt` at line 341 and stores the
whole element at line 351. Five more timestamp reads appear at lines 721, 746,
871, 896, and 1002. There are 16 element escape sites in the region. The hidden
field epilogue also returns the timestamp, so omitting OpenText alone is
insufficient.

`createdAt` belongs to `TSurveySummaryResponseRow`, rather than the base response
interface. That field is absent from the summary region's reads. Removing it
from the counterexample does preserve summary bytes, but does not remove the
observed `updatedAt` or the escaping sub-objects.

The reproduction makes these assertions:

- An original OpenText sample retains the exact Date, contact, and attributes
  references, and the summary retains the exact input element reference.
- Dropping `createdAt` preserves bytes. Dropping `updatedAt` changes bytes.
- Dropping an extra element field changes bytes even though the loop never reads
  that field explicitly.
- The production argument encoder rejects the Date after `createdAt` is removed.
  The production result canonicalizer rejects the original Date-bearing summary.
- JSON conversion produces the same serialized output for this ordinary Date,
  but returns a string and loses the original references. Byte comparison alone
  would miss that semantic change.
- Malformed `data: null` throws the original loop's TypeError.
- The existing closure checker rejects the actual local response interface with
  `type TSurveySummaryResponse is not bounded JSON data: Identifier Date`.

The executable check reads the pinned source in memory and executes the original
statement prefix through the element loop. It obtains the enum from the real
pinned constants declaration. It does not write source or transpiled code. This
is a counterexample to projection, not an import of the complete application
module, a general projection proof, or an end-to-end promotion test. The closure
probe is a synthetic function using the original response interface. It records
that interface's rejection, not a new census of the entire region.

Reproduce after restoring the app-local TypeScript link and workspace package
links used by the existing suites:

```sh
node research/formbricks-summary/validate.mjs --write
node --test --test-concurrency=1 packages/next-scriptc/test/*.mjs
node --test --test-concurrency=1 packages/scriptc-promote/test/*.mjs
node scripts/promotion-fuzz.mjs
```

No projection implementation, Zod structural emitter, outliner, realistic
100/1k/10k module harness, or verified summary shadows are claimed. None has
passed the first required escape condition. The next implementation needs a
boundary decision: keep summary assembly and borrowed values in JavaScript while
promoting a smaller scalar-count region, or specify transport and reconstruction
that preserves Dates and original object references. The latter is a broader
contract than JSON field projection. Both require additional analysis and tests.

No CPU comparison was run because there is no eligible native summary. There
are no local indicative CPU numbers at 100, 1k, or 10k responses. This task's
summary timing therefore cannot overlap the other agent's library timing probe.
Validation work may overlap that probe, so its owner must account for contention.

Both package suites pass. Next passes 95 tests. Promotion passes 21 tests with
the two existing opt-in skips. The real-addon differential fuzzer passes seed
20935 with 40 cases, 680 inputs, 1,360 comparisons, 2,266 native successes, and
534 fallbacks across 17 candidates. These are the existing adapter corpus, not
the blocked summary. The retained [validation](formbricks-summary/validation.json),
[Next log](formbricks-summary/next-tests.log),
[promotion log](formbricks-summary/promote-tests.log), and
[fuzz log](formbricks-summary/fuzz.log) record the checks. An initial Next run
failed because this worktree lacked its Next dependency link. The complete
suite passed after that link was restored.

No setup installation or Prisma generation was needed for this counterexample.
Only task-owned temporary workspace and app TypeScript links were created, and
all were removed after validation. Existing external setup installations were
left alone. Artifacts are below 256 KiB, and the compression check passes.
Nothing was published, merged, or pushed.
