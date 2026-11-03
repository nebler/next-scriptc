# B1 discovery blockers

This implementation targets the DEV-only EV3 first refusals. Discovery acceptance
is static eligibility, not compiler acceptance or a measured CPU win. Dispatcher
sampling, promotion thresholds, and shadow comparison are unchanged.

The characterization script reads EV3 artifacts through `research/lib/artifact.mjs`.
`dev-census-b1/baseline.json` contains the unique-function baseline histogram and
exact diagnostic patterns with pinned examples. `diagnostic-patterns.json` also
retains raw diagnostic occurrences, including repeated EV1 and EV2 output. Those
raw counts must not be interpreted as function counts.

## Declaration and type visits

Type-only module visits collect export and type metadata without checking runtime
initialization. This includes declarations with `export =`, namespace exports,
and default expressions. Type aliases and interfaces retain their existing
boundary and standalone TypeScript checks. Both explicit type imports and value
imports referenced only in type positions follow this path.

A subsequent runtime visit always runs the initialization check, including when
the module or binding was already visited for types. Runtime resolution still
hides declaration files from its TypeScript host. A declaration cannot stand in
for executable JavaScript. A selected runtime implementation must resolve and
pass the existing effect and construction proofs, otherwise discovery rejects.
The tests cover all three declaration extensions and mixed type/value visits.

## Export conditions

The resolver supplies `node` to the application's TypeScript resolver in import
mode. Node's ordered condition selection chooses the implementation. Inactive
browser, Svelte, and Electron branches no longer invalidate an entire package.
The selected source and its package manifest remain hashed dependencies. Selected
side effects and CommonJS mutable exports still reject. Application custom
conditions require a matching explicit runtime condition integration. Unknown
active conditions and custom resolvers reject. Runtime import graphs also reject
unmodeled Node `--conditions`, `-C`, and `NODE_OPTIONS` condition flags. A real
Node regression shows why: JS selected a custom branch while the old resolver
proved the Node branch. Erased type imports remain independent of these flags.

## Parsing

The parser selects legacy decorators for `experimentalDecorators` projects and
standard decorators otherwise, including extraction of undecorated functions.
Reachable decorated classes and members remain unsupported. Parsing does not
establish decorator purity. Existing M1 rules still apply to original JS setup.

## Module initialization

Unused default expressions consisting only of literal data, ordinary properties,
arrays, or function creation are inert and can disappear. Calls and spreads do
not qualify. Private `Object.freeze` literal tables use M2's existing constant
reference audit and scalar folding. Escapes, exported graphs, mutations, effectful
properties, and shadowed Object bindings reject. Freezing is shallow; the audit
also prevents nested objects from escaping. Literal enums and named reexports
retain their existing M2 support. Arbitrary calls and constructors remain outside
this extension. M1's unmodified-builtins contract still applies.

## Indexed reads and replay

Numeric array reads with a possibly undefined result can lower to a checked
helper. Receiver and index evaluate once in the original order. Before reading,
the helper checks integer bounds, then checks the value for undefined. Negative,
fractional, NaN, infinite, out-of-range, and undefined reads throw the existing
fallback sentinel. The builder's existing mandatory fallback path replays JS.
The complete guarded closure must pass the construction proof. Unsupported
closures retain their original strict refusal. Local catch/finally, indexed
writes, callable element receivers, and non-array indices receive no exemption.
Native differential tests cover valid reads and JS replay of invalid reads with
`catchFallback:false`, including the addon's subsequent usability.

## Local mutation

The allocation analysis seeds exported boundary arguments as borrowed and sends
actual caller provenance into helpers. A helper parameter can therefore refer to
a fresh local allocation. All possible reference edges still accumulate through
branches and calls. A borrowed alias or a borrowed child of a shallow copy makes
mutation reject. Local object and array literals, supported allocating array
operations, and helpers returning proven local graphs can qualify. Unsupported
operations remain conservative refusals. Member writes and mutator calls must
pass this proof, including writes through local aliases.

## Measurement and remaining work

The rerun uses the frozen DEV manifest, server scopes, disabled install scripts,
12 GB install floor, and at most three installed task-owned clones. No HELD_OUT
repository or Papermark is opened. Failed attempts and unknown coverage are
retained separately. Final measurements and validation are appended after the run.

## Exact EV3 diagnostic coverage

The unique real declaration refusals are 195 `TSExportAssignment`, 132 default
expressions, 36 `TSNamespaceExportDeclaration`, and 24 side-effect imports. These
are initialization checks on metadata, removed by type-only visits.

The package-condition refusals are 257 `electron-renderer`, 70 `browser`, 44
`svelte`, 15 `node`, 14 `module`, eight `types@<5.7`, seven `@zod/source`, five
`react-native`, and three `dev-source`. Inactive branches no longer reject.
Unknown active conditions remain a separate rejection.

The 2,023 executable initialization refusals include 810 variable declarations,
569 source expression statements, 342 dependency expression statements, 105
default expressions, 89 dependency if statements, and 28 source if statements.
Other explicit loops, try statements, and side-effect imports account for the
remainder. A diagnostic naming VariableDeclaration does not identify the exact
initializer. This patch supports private frozen literal tables within that
category; it does not claim that all 810 initializers are pure. Default expression
admission is similarly limited to inert syntax. Literal enums and named
reexports were already covered by M2 and are retained without widening their
mutation contract.

The indexed-read extension targets the nine real TS2532 first refusals and the
array-derived subset of TS18048 and TS2345. It does not suppress those diagnostic
codes wholesale. Optional object fields, missing generic names, and undefined
map keys still reject. The mutation baseline includes 103 argument mutations,
77 nonlocal mutations, 27 module-state mutations, and 11 constant graph escapes.
Only mutations with proven local allocation provenance qualify.

Fixed-bound typed-array loops receive a narrower proof: a const fresh typed
array, a zero-based index, an identical literal upper bound, a single increment,
and no body writes to the index. Those reads erase a proven non-null assertion
and keep direct native access. General array reads use the runtime guard. Native
ArrayLike is unsupported by stock scriptc, so typed-array guards use explicit
builtin array types rather than that standard-library interface.

The mutation proof admits captured scalar constants and supports `Math.clz32`.
It still requires the construction language, so unsupported syntax can reject a
fresh allocation before provenance analysis completes. This is a conservative
limit, not evidence that the function mutates its inputs.

## Integration and verification

The stalled branch was merged into current main and its conflicts were resolved.
The resulting changes were committed as a squash, so the untested WIP commit and
its redundant logs are absent from this branch's history. NSC diagnostic codes,
original-source maps, build fuzzing, runtime snapshots, profile reporting, the
TypeScript plugin, typed decode-once, and browser build hooks remain in place.
A parser source-filename regression found during verification was corrected.

The final pass runs the EV3 runner and independent EV1/EV2 scans against the frozen
DEV pins and server scopes. Installs disable lifecycle scripts and require at
least 12,000,000,000 free bytes. At most three installed clones are allowed.
Missing scans, failed installations, and disk skips are unknown coverage.
Acceptance is static discovery, not compilation, HTTP reachability, or a CPU win.

GrowthBook retains a 32-file validator resource gap in both runs, with 12 files
in common and 20 different files per run because batch enumeration changed.
Equal file totals do not imply identical coverage. The comparison includes a
matched cohort and separates uncovered prior acceptances from covered refusals.
[Exact coverage gap](eval-corpus/dev-census-b1/coverage-gap.json).

## Fresh DEV results

EV3 accepted 441 functions; this run accepts 251 in the recorded coverage. There are 21 newly accepted functions, 211 previously accepted functions now rejected in covered files, and 0 prior acceptances without current coverage. Missing coverage is unknown. First-refusal histograms are not causal estimates.

The matched cohort contains 24292 function rows, with 441 accepted before and 251 after. Observed parser failures change from 1957 to 15; missing scopes are outside that after total.

| DEV repository | Before accepted | After accepted | Current coverage |
|---|---:|---:|---|
| toeverything/AFFiNE | 12 | 7 | installed; requested files covered |
| actualbudget/actual | 5 | 2 | installed; requested files covered |
| boardgameio/boardgame.io | 0 | 0 | installed; requested files covered |
| lissy93/dashy | 0 | 0 | installed; requested files covered |
| evidence-dev/evidence | 8 | 5 | installed; requested files covered |
| excalidraw/excalidraw-room | 0 | 0 | installed; requested files covered |
| getfider/fider | — | — | non-Node control |
| gristlabs/grist-core | 27 | 11 | installed; requested files covered |
| growthbook/growthbook | 174 | 98 | installed; scans partial |
| linkwarden/linkwarden | 1 | 1 | installed; requested files covered |
| maybe-finance/maybe | — | — | non-Node control |
| n8n-io/n8n | 72 | 53 | installed; requested files covered |
| nocodb/nocodb | 9 | 8 | installed; requested files covered |
| openpanel-dev/openpanel | 38 | 18 | installed; requested files covered |
| PostHog/posthog | 76 | 38 | installed; requested files covered |
| umami-software/umami | 4 | 3 | installed; requested files covered |
| Unleash/unleash | 15 | 7 | installed; requested files covered |

## First-refusal histogram

Counts below include all observed functions. The comparison artifact also contains a matched-function histogram to separate changed coverage.

| Classification and first refusal | Before | After |
|---|---:|---:|
| environment-affected: runtime dependency boundary | 2414 | 3199 |
| environment-affected: unsupported reference/type | 2014 | 2329 |
| environment-affected: export/binding resolution | 1434 | 1964 |
| environment-affected: transitive effect proof | 341 | 493 |
| environment-affected: other closure/extraction | 339 | 460 |
| environment-affected: JSON boundary/type proof | 323 | 265 |
| environment-affected: computed/prototype member proof | 131 | 2 |
| environment-affected: call-site specialization | 102 | 59 |
| environment-affected: strict closure | 77 | 50 |
| environment-affected: class/constructor proof | 20 | 23 |
| environment-affected: module cycles | 0 | 3 |
| real: work screen | 2404 | 2262 |
| real: module initialization/effect proof | 2023 | 2255 |
| real: unsupported reference/type | 1095 | 1218 |
| real: package exports/resolver policy | 423 | 0 |
| real: declaration/type-only graph handling | 387 | 0 |
| real: parser syntax | 303 | 226 |
| real: runtime dependency boundary | 250 | 280 |
| real: effects | 233 | 201 |
| real: mutation proof | 218 | 510 |
| real: strict closure | 139 | 75 |
| real: transitive effect proof | 136 | 211 |
| real: namespace/module-object proof | 97 | 265 |
| real: JSON boundary/type proof | 86 | 67 |
| real: call-site specialization | 73 | 36 |
| real: computed/prototype member proof | 60 | 2 |
| real: export/binding resolution | 47 | 139 |
| real: other closure/extraction | 13 | 113 |
| real: class/constructor proof | 9 | 10 |
| real: module cycles | 6 | 6 |

Source-only module initialization and constant-graph checks, as well as stricter mutation provenance, account for acceptance losses. These conservative failures do not establish that every affected function mutates application inputs.

## Compute-relevant leads

These newly accepted names are static review leads. No timing or HTTP reachability is established.

- [splitHeaderTokens](https://github.com/toeverything/AFFiNE/blob/91ac3ca384b791ffd1a87de352a82e766f11ae08/packages/backend/server/src/plugins/calendar/providers/caldav.ts#L111) in toeverything/AFFiNE.
- [advisoryLockSubKey](https://github.com/n8n-io/n8n/blob/18c045bfacb12c8163ff770970b330af9730aaab/packages/cli/src/evaluation.ee/evaluation-collection.service.ts#L40) in n8n-io/n8n.
- [countCodePointsUpTo](https://github.com/n8n-io/n8n/blob/18c045bfacb12c8163ff770970b330af9730aaab/packages/cli/src/modules/oauth-server/oauth-server.service.ts#L69) in n8n-io/n8n.
- [tokenizeKnowledgeFilePattern](https://github.com/n8n-io/n8n/blob/18c045bfacb12c8163ff770970b330af9730aaab/packages/cli/src/modules/agents/agent-knowledge-mirror.service.ts#L646) in n8n-io/n8n.
- [tokenizeKnowledgeFileName](https://github.com/n8n-io/n8n/blob/18c045bfacb12c8163ff770970b330af9730aaab/packages/cli/src/modules/agents/agent-knowledge-mirror.service.ts#L650) in n8n-io/n8n.
- [compactKnowledgeFileName](https://github.com/n8n-io/n8n/blob/18c045bfacb12c8163ff770970b330af9730aaab/packages/cli/src/modules/agents/agent-knowledge-mirror.service.ts#L660) in n8n-io/n8n.
- [parseTagNames](https://github.com/n8n-io/n8n/blob/18c045bfacb12c8163ff770970b330af9730aaab/packages/cli/src/public-api/v1/controllers/workflows.public.controller.ts#L107) in n8n-io/n8n.
- [minOf](https://github.com/nocodb/nocodb/blob/23c21f68c4af8bae1a768c71fc9ae1cca1eb8985/packages/nocodb-sdk/src/lib/aggregationCompute.ts#L224) in nocodb/nocodb.
- [maxOf](https://github.com/nocodb/nocodb/blob/23c21f68c4af8bae1a768c71fc9ae1cca1eb8985/packages/nocodb-sdk/src/lib/aggregationCompute.ts#L230) in nocodb/nocodb.

NocoDB `minOf` and `maxOf` are the clear numerical aggregation leads; both previously failed TS2532. The other entries are small string, token, or path helpers. None is an established CPU hotspot or native win.

## Named candidates

- `bestExhaustiveBinarySplit`: rejected; [next-scriptc] not a candidate bestExhaustiveBinarySplit: [next-scriptc] /tmp/b1-growthbook-clones/growthbook/packages/stats-ts/src/contextualBanditWeights.ts:373:1 - NSC1004: purity: argument mutation Hint: Use local fresh values and avoid mutating arguments or module state.
- `approximateBinaryKMeans`: rejected; [next-scriptc] not a candidate approximateBinaryKMeans: [next-scriptc] /tmp/b1-growthbook-clones/growthbook/packages/stats-ts/src/contextualBanditWeights.ts:477:1 - NSC1004: purity: argument mutation Hint: Use local fresh values and avoid mutating arguments or module state.
- `solveForecast`: rejected; [next-scriptc] not a candidate solveForecast: [next-scriptc] /tmp/b1-verified-clones/actual/packages/loot-core/src/server/budget/schedule-template.ts:684:1 - NSC1004: purity: nonlocal mutation Hint: Use local fresh values and avoid mutating arguments or module state.

The isolated GrowthBook construction probes now pass captured scalar constants and stop at unsupported `NewExpression`. Actual still stops at `SpreadElement`; its hole allocation and indexed writes remain outside the construction language. No split-search or solver speedup is claimed.

## Final validation

Next: 103 pass. Core: 110 pass, two existing skips. Targeted B1: 23 pass. Native differential checks cover indexed-read fallback, fresh helper mutation, copied arrays, scalar captures, invalid typed-array writes, and `Math.clz32`. The full suites also exercise NSC locations, T1 fuzzing, runtime snapshots, profile reporting, the editor plugin, typed decode-once, and browser hooks.

[Raw results and aggregation](eval-corpus/dev-census-b1/summary.json.gz), [comparison and accepted leads](eval-corpus/dev-census-b1/comparison.json), [static named probes](eval-corpus/dev-census-b1/candidate-probes.json), and [reproduction](eval-corpus/dev-census-b1/reproduce.md).
