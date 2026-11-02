# Call-site specialization at promotion boundaries

2026-11-02. K4 adds specialization for private functions with generic, `object`,
or `any` boundaries. The demo fixtures compile and preserve per-call fallback.
The pinned real-app census gains **zero candidates**. This is a conservative
adapter capability with no demonstrated coverage gain or performance claim.

## Closed calls and JSON origins

TypeScript structural types cannot prove JSON provenance. A value typed
`{n:number}` can hide getters, custom prototypes, or extra Date-bearing fields.
Exports can also have unseen callers. `call-site-specialization.mjs` therefore
requires a private binding and fresh JSON construction at every reference.

The application's checker identifies the binding and scans its complete program
for references. Exports, renamed/default exports, non-module bindings, aliases,
callbacks, shorthand escapes, assignments, indirect/optional calls, and local
dynamic evaluation reject. Every reference must be a direct call. An exported
caller may call a private function only with fresh JSON literals.

Arguments must be primitive literals, signed numeric literals, recursively
literal arrays, or objects with ordinary literal-key data properties. Identifiers,
calls, constructors, assertions, shorthand, spreads, accessors, methods, computed
keys and prototype-related keys reject. Even local const aliases need a separate
mutation/escape proof. Database values and server parameters cannot qualify
through type annotations alone.

The checker resolves each call and derives its concrete argument types. Primitive
literals widen to their base types. All calls need exact arity and one identical
printed type vector. Equivalent aliases or different property order can cause
conservative disagreement. There is one specialization, with no union of schemas
and no unbounded lane generation.

Only the extracted native copy changes. Parameter annotations become concrete,
outer generic parameters are removed, and the result is inferred again. Required
identifier parameters are supported. Defaults, destructuring and body annotations
that still reference erased type parameters reject. The original JS binding,
loader offsets, arguments and fallback remain intact. The original source hash
covers the call sites in that module.

The new closure must pass strict diagnostics, the existing boundary checker,
the entire construction proof and a supported fallback result ABI. Purity,
extraction, dependency linking, closure and module-init gates run unchanged.
No compiler or runtime format support was added.

## Runtime fidelity

Specializations retain the strictClosure wrapper requirement, which forces catch
fallback even with catchFallback:false. Existing host serialization rejects Dates,
custom prototypes, getters, cycles, holes, present undefined and other non-JSON
values before native entry. Checked typed JSON parsing inside try/catch rejects
schema mismatches. JSON/string results return the existing empty-string sentinel;
numeric results use NaN. Boolean, null and byte result ABIs reject specialization.

Fallback runs the original JS for that call with the original arguments. It does
not poison the instance or demote the bucket. Missing properties stay missing;
present undefined stays present on fallback. Existing optional and undefined
result restrictions remain. Scalar f64 preserves negative zero. The existing
JSON convention maps negative zero to positive zero; this task adds no new
encoding or fidelity exception.

The demo fixture covers generic arrays, object[], any arrays, numeric output from
JSON input and any scalars specialized to number. Unit integration uses the real
stock addon, checks wrong/missing/null/undefined fields, Dates, getters and custom
prototypes, then checks native success after every call. Scalar checks include
negative zero and invalid-input fallback. Negative discovery fixtures cover
exports, shorthand escape, dynamic evaluation, indirect calls, disagreement and
unproved origins.

## Final census and coverage

The before counts and identities come from the retained K3 census in
research/nonstrict-apps/census.json. After uses the same pins, server scopes,
app options and minimal dependency setup. Papermark received only one final
census, with no execution, profiling, timing or policy adjustment from its source.

| App | Scoped files | Before | After | Newly specialized |
| --- | ---: | ---: | ---: | ---: |
| Umami | 506 | 4 | 4 | 0 |
| Dub | 699 | 32 | 32 | 0 |
| Papermark | 552 | 23 | 23 | 0 |

Accepted identities are identical. The compact
[census](call-site-specialization/census.json) retains counts, accepted boundary
and proof metadata, specialization refusals and measured-path blockers. The
[comparison](call-site-specialization/comparison.json) records identity changes.
These are discovery counts, not successful app compilation counts.

Papermark's countablePlaybackEvents and eventsForView reach specialization and
reject because they are exported. Specializing from visible callers alone would
violate the closed-call-set requirement. Four other Papermark refusals lack
fresh JSON origins; the remaining refusals are exports. No held-out source was
copied into the repo.

Dub convertToCSV still fails dependency module initialization before boundaries.
Its CommonJS-only json-2-csv graph retains the separate K2/K3 blocker; there is
no new CommonJS compilation claim. Specialization alone unlocks **0 Dub functions
and 0 profiled CSV CPU**. Version 5.5.0 is unchanged. No CSV parity or speedup is
claimed. Other refusals include exports, an escape and unproved origins.

Umami flattenJSON and getStoredStringValue still fail unsupported NewExpression
in dependency-closure analysis. Replay helpers and chunkArray reject exports;
combineSequentialDuplicates lacks fresh JSON origins. Specialization alone
unlocks **0 Umami functions**.

No newly accepted function lies on a K1 profiled path. The conditional coverage
rerun requirement therefore does not apply. No profiles or coverage shares were
rederived. Earlier K1/K3 shares remain historical measurements.

## Validation and reproduction

All **89 adapter tests pass**, including two new tests. The full suite exercises
existing timing-ABI correctness hooks; no native benchmark was run. Seed 20935
passes **85,000 inputs and 170,000 differential comparisons across 17 candidates**
with strict and construction-result configurations. The specialized generic
candidate explicitly asserts shape-mismatch fallback; every comparison receives
a native-usability follow-up. Counts include 281,546 native successes and 68,454
fallbacks, including follow-ups. [Fuzz counters](call-site-specialization/fuzz-20935.json)
include harness elapsed time, which is not native performance evidence.

The initial full suite exposed a fixture-only TypeScript resolution path and a
literal 1 parameter incompatible with the numeric ABI. The fixture now resolves
TypeScript from cwd; specialization widens primitive literals. The final full
suite passes after both fixes. Implementation dependencies use the app checker.

Reproduce with Node 26.13.0 and stock scriptc 0.4.6. Setup tracks dependency links
for cleanup. Supply SCRIPTC_COMPILER or a temporary package-local scriptc link.

```sh
node research/coverage-baseline/setup.mjs
node --test --test-concurrency=1 packages/next-scriptc/test/*.mjs
PROMOTION_FUZZ_CASES=5000 PROMOTION_FUZZ_SEED=20935 node scripts/promotion-fuzz.mjs
COVERAGE_OUTPUT=../call-site-specialization node research/coverage-baseline/census.mjs
node research/call-site-specialization/summarize.mjs
node research/coverage-baseline/setup.mjs --cleanup
```

RUN_APPS=umami,dub limits development census runs. The runner now records the
specialization category and accepted metadata. At most two jobs ran together.
No Docker, Vercel calls, network posting, third-party source, root README change,
merge or push. Task-created dependencies, links and boundary outputs were cleaned
up after validation.

## Review follow-up: runtime guards, imported callers, and why it still unlocks nothing

2026-11-02, in review before merge. The closed-call-set and literal-provenance rules were stricter than soundness requires. A probe on main confirmed that extra input fields survive the native path, so a specialized type that is narrower than the caller's value does not drop data. The same runtime checks already cover every caller, seen or unseen:
- host serialization rejects Dates, getters, custom prototypes, class instances, Maps, `toJSON` objects, cycles, holes and present undefined;
- the checked typed parse rejects shape mismatches;
- each rejection falls back to JS for that call.

Visible call sites therefore only *choose* the type. They no longer prove where values come from.

Changes:
- Exported functions and non-literal callers can now specialize. The rule still rejects spreads, arity mismatches, disagreeing instantiations and functions with no visible direct calls.
- Imported call sites in other modules were missed: they resolve to an alias symbol. They are now followed to the declaration. This bug made almost every exported function report "no visible direct calls".
- Disagreement messages now print both type vectors.
- New tests cover exported specializations with unseen callers of ten other shapes (canonical JSON equality, then native still usable) and imported callers.

All 91 adapter tests pass. Fuzz seed 4242: 34,000 inputs and 68,000 comparisons pass.

The census is still unchanged (Umami 4, Dub 32, Papermark 23). The refusals now show the real reason:

| App | No visible direct calls | Instantiations disagree | Arity / parameter form |
| --- | ---: | ---: | ---: |
| Papermark | 2 | 2 | 0 |
| Dub | 3 | 0 | 2 |
| Umami | 0 | 5 | 1 |

The disagreements are almost all *concrete vs `any`*. For example Umami `chunkArray` sees `number[]` at one call and `any[]` at another, and the replay helpers see union literals at some calls but `any` or `null` at others. The concrete instantiations come mostly from test fixtures with literal data. Production callers pass `any`, because their values come from the database, ClickHouse or `JSON.parse`. **For real request data, static types at call sites do not carry the shape.**

Choosing the type from the concrete subset would stay sound because of the runtime fallback. But it would compile the lane for test-fixture shapes, and production values would mostly fall back. That is not a coverage gain.

**Implication:** shapes for real request data must come from observed values, not declarations. That means shape profiles recorded by the dispatcher in JS or shadow state and fed into the next build: profile-guided specialization. This is recorded as a future hill and not started. The current priority is framework reach (a Vite plugin) and provider integration (Cloudflare).
