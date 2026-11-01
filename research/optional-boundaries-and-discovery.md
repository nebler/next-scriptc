# Optional boundaries and discovery

2026-11-01. Adapter-only change on `t3/widen-promotion-coverage`, stock scriptc
0.4.6, Darwin arm64. Development used synthetic fixtures and the Dub and Umami
census. Papermark was inspected and executed only at the final coverage and
correctness checkpoint. Construction result optimization remains off by default.
No native performance claim follows from this work.

## Boundary design and equality

Automatic promotion now admits optional input members, optional parameters, and
input unions containing undefined. The wire remains strict JSON. A missing own
property stays missing; a present null stays null. A present undefined value,
bare undefined argument, sparse array, or undefined array element fails the JS
serializer before native entry and executes the original JS function for that
call. This includes extra fields outside the declared structural type. No sentinel
can collide with application data because there is no sentinel representation.

The choice deliberately recovers fewer calls than a tagged encoding would.
Tagging every field would require a checked native reconstruction of presence,
undefined and array holes before typed materialization. Stock library mode can
already read absent optional members correctly, so fallback is the cheaper
sound extension. Missing optional arguments and literal defaults currently use
JS fallback. Supplied JSON-safe arguments can use native computation.

The oracle receives the original JS arguments. It compares returned values by
deep structure, including own-key presence, undefined, null, array length and
holes, and compares canonical bytes wherever strict serialization is defined.
Neither the JS result nor a fallback result is JSON-round-tripped. Exceptions
must have the same constructor name and message. The existing JSON ABI exception
for the sign of zero is unchanged; scalar f64 retains its sign bit. Reference
identity and descriptors remain outside the existing JSON-data contract.

`JSON.stringify({v:undefined})` is `{}`, while `[undefined]` is `[null]`, and
bare undefined has no JSON string. None can be substituted for the original JS
answer. Result signatures containing undefined or optional members therefore
remain rejected, as do optional tuple elements. The manual async sidecar's type
policy is unchanged. The [patch ledger](scriptc-patches.md#optional-boundary-follow-up-stock-046-adapter-only)
records the stock SC1090 result-wrapper refusal and a minimal reproduction.

A real stock addon probe and the permanent optional fixture verify `{}`,
`{v:null}`, `{v:'ok'}`, and `{v:undefined}`. Checked typed JSON.parse preserves
empty `Object.keys` for the missing case and distinguishes null. The explicit
undefined case falls back with its original own key intact. The seeded native
fuzzer now adds optional records, required undefined unions and an optional
scalar parameter. Its provenance analysis recognizes unions of scalar values as
scalars; this adds no container allocation or mutation permission.

Argument serialization failures also skip a shadow per call. Previously one
unrepresentable argument permanently demoted its bucket. A permanent regression
checks that the following representable call can still verify a native shadow.

## Discovery and lowering

Object and array parameter patterns are admitted recursively, including literal
string, finite-number syntax, boolean, null and signed numeric defaults. Computed
binding keys, object rest, array rest, rest parameters and effectful defaults
still reject. Rest needs a distinct variadic ABI and typed call lowering, so it
is not treated as one ordinary array argument.

The loader replaces the outer parameters with private argument bindings. It
passes those original values into dispatch and keeps the original parameter
syntax on the JS fallback closure. Destructuring and defaults execute once in
the selected lane. Outer `= undefined` markers preserve function length for
parameters with defaults. Missing and explicitly undefined arguments choose JS,
where the original default expression applies; null does not activate a default.
Native fixtures verify nested array defaults as well as supplied arguments.

Exported expression arrows now enter the same extraction, purity, work, boundary
and compiler filters as block functions. The loader preserves expression return
semantics. A referenced non-exported top-level synchronous function can also be
wrapped safely at its existing binding: declarations remain hoisted, constants
retain their initialization point, and exported async callers still call the
same local name. The native closure exports a private copy only inside its
build artifact. No application export is added. Unreferenced private functions,
nested closures, async functions, generators and reassigned bindings stay out.

Route files are scanned. HTTP method bindings and their direct identifier and
export-specifier aliases are excluded. Other named synchronous helpers receive
all existing screens. Dub gains `dedupeEmails` in a route file. The permanent
fixture checks a private helper called by exported async code and excludes
aliased route handlers. Opaque imports, observable effects, nonlocal mutation,
work thresholds and construction provenance retain their checks. Construction
proof failure still selects strict result handling rather than becoming a new
eligibility rule. Compiler refusal remains the last discovery filter.

## Final census

The pinned external checkouts and tsconfig options are K1's. Missing dependency
types can still cause conservative refusals. These are source-level candidate
counts, not counts of fully compiled application kernels. Only newly accepted
functions reached in the profiled endpoint received final native compilation.
The full artifacts are in [optional-boundaries](optional-boundaries/).

| Census stage | Papermark before → after | Dub before → after | Umami before → after |
| --- | ---: | ---: | ---: |
| Purity/work/extraction candidates | 20 → 38 | 12 → 38 | 13 → 33 |
| Boundary accepted with app options | 5 → 23 | 9 → 32 | 0 → 0 |
| Strict-null counterfactual accepted | n/a | n/a | 3 → 15 |
| Construction proof among actual acceptances | 1 → 5 | 0 → 0 | 0 → 0 |
| Parameter syntax first refusals | 71 → 22 | 68 → 29 | 42 → 39 |

The widened census includes private functions, expression arrows and route
helpers. First-failure populations therefore differ: the last row is not a
paired experiment over identical functions. Server scope remains 552, 699 and
506 files respectively. Route inventory now includes the 133 Dub and 156 Umami
files that K1 skipped. Actual Umami promotion remains disabled by its original
`strictNullChecks:false`; the counterfactual makes no application config edit.

Focused checks now pass Papermark watchTimeSeconds, resolveVideoLength and
playbackSeconds boundaries. Generic countablePlaybackEvents and eventsForView
still reject T. Dub CSV still rejects object[], and Umami flattening still
rejects any. These later gates are not relaxed to inflate coverage.

## Coverage shares and held-out correctness

K1's unchanged JS endpoint workloads were profiled again solely to compute
category a shares. The only newly compiled marked regions are watchTimeSeconds
and resolveVideoLength. Their original dependency closure also compiles
playbackSeconds. There is no native timing on Papermark. Dub CSV and Umami's
measured persistence closure retain their other blockers and contribute no
category a share.

| K1 fixture | Before category a | After category a (range) |
| --- | ---: | ---: |
| papermark-video-6000 | 44.4% | 59.5% (58.4–60.8%) |
| papermark-video-60000 | 60.9% | 60.9% (60.3–61.4%) |
| dub-links-export-100 | 0.0% | 0.0% (0.0–0.0%) |
| dub-links-export-1000 | 0.0% | 0.0% (0.0–0.0%) |
| umami-saveEventData-20 | 0.0% | 0.0% (0.0–0.0%) |
| umami-saveEventData-100 | 0.0% | 0.0% (0.0–0.0%) |

Ranges are the minimum and maximum of three sampling rounds, not confidence
intervals. The loaded host, JIT and GC change the denominator: notably the 60k
fixture's aggregate share is similar to K1 despite admitting another region.
The before/after difference is not a CPU saving estimate. Services omitted by
K1 remain omitted, so these are not whole-application shares.

The final real-addon correctness run uses 6k and 60k event inputs, omitted
optional members, explicit undefined members, null stored length, and undefined
stored length. Both newly accepted marked functions compile with stock 0.4.6.
Forced-native calls and real asynchronous dispatcher shadows match JS canonical
bytes; unrepresentable inputs execute JS and leave native instances usable.
[heldout-correctness.json](optional-boundaries/heldout-correctness.json) retains
native, fallback and verified-shadow counters without native timings. No
third-party source or extracted closure is committed.

## Validation and reproduction

The full Node 24.22.0 adapter suite passes all 77 tests. The extended corpus has 14 candidates.
Seed 20935 at 20,000 cases each checks 280,000 inputs and 560,000 differential
results, plus 560,000 successful follow-up native calls. It records 936,878 native
successes and 183,122 fallbacks, with no mismatch or poisoning. Both strict and
construction builds use the real stock addon. The Node 24 shim tests also pass,
including 113 HTTP parity requests. A final focused rerun checks loader defaults,
route aliases, optional boundaries and continued shadow learning.

Reproduce with dependencies temporarily linked from `/Users/noah/code/next-scriptc`
and `SCRIPTC_COMPILER` pointing to its installed scriptc 0.4.6 executable:

```sh
node --test --test-concurrency=1 packages/next-scriptc/test/*.mjs
PROMOTION_FUZZ_CASES=20000 node scripts/promotion-fuzz.mjs
node --test --test-concurrency=1 packages/next-scriptc/shim/test/*.mjs
node research/coverage-baseline/setup.mjs
COVERAGE_OUTPUT=../optional-boundaries node research/coverage-baseline/census.mjs
COVERAGE_OUTPUT=../optional-boundaries node research/coverage-baseline/focused-screens.mjs
node research/optional-boundaries-final.mjs
COVERAGE_OUTPUT=../optional-boundaries COVERAGE_ACCEPTED=research/optional-boundaries/heldout-correctness.json node research/coverage-baseline/profile.mjs
node research/optional-boundaries-summary.mjs
node research/coverage-baseline/setup.mjs --cleanup
```

At most two jobs ran concurrently. Native builds were sequential within each
job. Temporary dependency links, packages installed by K1 setup, and task-created
native builds were removed. Free disk stayed near 19 GiB. No Docker containers,
Vercel resources, compiler sources, third-party sources, or root README changed.
