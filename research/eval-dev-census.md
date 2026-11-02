# Dependency-installed DEV census

This census measures static discovery on the frozen DEV split only. It reports first observed blockers per function, not all possible blockers or native speedups. Counts below are measured on the recorded scopes. Unscanned files and failed scopes have unknown coverage.

The diagnosed rows split into 7195 **environment-affected**, 8002 **real**. The real bucket records observed compiler/proof refusals under the checks below; it does not certify that every possible environment issue is eliminated; environment-affected does not prove that installing a package alone would make the function promotable.

Across selected scopes, 10376 files are visited, 15638 functions are considered, and 441 are discovery-accepted. 1318 diagnosed functions use an explicitly labeled compatible TypeScript host override.

## Method and isolation

- The allowlist is exactly the 17 DEV entries in the frozen manifest. Fider and Maybe are recorded non-Node controls. No HELD_OUT repository or Papermark is cloned, inspected, scanned, or measured.
- Each task-owned checkout is fetched with depth 1 at its immutable SHA and verified with git. Installs use the declared package manager and frozen lockfile, with lifecycle scripts disabled. Yarn Berry uses YARN_ENABLE_SCRIPTS=false and --mode=skip-build, its equivalent of --ignore-scripts. No application build, lifecycle script, database, Docker, deployment, login, push, or public write is used.
- The main pass and retries use at most three installed checkouts concurrently. The histogram includes the source-available n8n and NocoDB controls; it is not an OSS opportunity denominator. Before every install, free space is checked against 15,000,000,000 bytes. Every recorded install includes the actual free-byte count. Checkouts are removed after scanning. Task-owned temporary caches and tools are cleaned at the end. Location constraint exceptions: the initial tool npm install used its configured cache rather than an explicit task cache; the first Yarn attempts created a new home cache, which was moved into /tmp and removed; initial regression tests used the default macOS temporary directory and removed their fixtures. These initial writes exceeded the requested worktree-/tmp-only location rule. Existing user npm caches are not erased. The main checkout, its node_modules, /Users/noah/scriptc, and the root README are untouched.
- Server scopes cover API/backend/worker sources and selected shared packages used by servers. Browser applications, tests, fixtures, seeds, vendored bundles, and tooling are excluded from final measurement statistics. Preliminary raw scope records are retained with explicit exclusions. Exact scopes, excluded paths, and omitted direct files are in each JSON. Evidence connector/SQL code is server/build relevant, not evidence of a request CPU hotspot. Shared code and local-server runtimes do not by themselves prove HTTP reachability.
- EV2 runs the report CLI with --source-dir and --json. EV1 runs census.mjs independently on the same scope. The nearest package tsconfig is used as the scan root. Five-minute attempts use a 6 GiB Node heap; the rescoping pass raises the limit to fifteen minutes. GrowthBook shared-file retries use 32-file batches and a 12 GiB heap after a retained 6 GiB failure. Thirty-two validator files still fail at 12 GiB; a final EV1-only retry without environment-graph collection also fails. Their function coverage is unknown, and no zero is inferred. Explicit file selections batch up to 180 files per package while preserving original paths and import resolution. Large trees are partitioned into directories of at most 180 source files where possible. Direct files in split parents are scanned in supplemental file batches at their original paths using file-scope.mjs, a CLI preload that filters source enumeration without changing TypeScript resolution or discovery policy. Remaining omissions, if any, stay unknown.
- A tested parser-isolation fix records unsupported files and continues to healthy files. Imported-dependency parse errors now include their filename. No syntax support, eligibility rule, promotion threshold, or compiler optimization is added. Earlier attempts retain their original diagnostics.
- Only standard prisma-client-js generators without custom configuration are eligible for an offline attempt. sandbox-exec denies network access, --no-engine is supplied, and no database is started. Missing engines or custom generators stay environment limitations.
- Rows are deduplicated by repository, source path, and function name. Each diagnosed function contributes once, using its first diagnostic. The summary retains exact messages, pinned links, and module-resolution evidence. Parser-failed files are counted separately because discovery does not consider their functions. Async functions, class methods, and other early exclusions are outside the diagnostic denominator.
- Syntax/effect/work refusals, module-initialization proofs, namespace proofs, package-export policy, and strict indexed-access/construction refusals are demonstrable real refusals even when another import is missing. Other rows are environment-affected when the file's transitive static ESM import/re-export graph has an unresolved import or its TypeScript configuration has an error. That graph includes unused imports, so this deliberately over-attributes environment risk. Failed installs and incomplete resolver evidence get an explicit uncertain bucket. Dynamic imports, CommonJS require calls, and custom-loader semantics are not fully resolved by this evidence collector. Successfully resolving an installed declaration is not the same as supporting its runtime implementation.

[Reproduction](eval-corpus/dev-census/reproduce.md), [runner](eval-corpus/dev-census/run.py) and [file-batch scanner](eval-corpus/dev-census/scan-batches.py), [aggregation](eval-corpus/dev-census/summarize.mjs), [tool versions and analyzer hashes](eval-corpus/dev-census/versions.json), and [tool lock](eval-corpus/dev-census/tool-lock.json) retain reproduction details. Run from this worktree with isolated tools installed as in the original reproduce.md, then run DEV_CENSUS_BATCH_MODE=1 python3 research/eval-corpus/dev-census/run.py and node research/eval-corpus/dev-census/summarize.mjs. Existing results are skipped; archive a result before an intentional retry. All outputs over 256 KiB use deterministic level-9 gzip with MTIME zero. No third-party source is committed.

[Histogram chart](eval-corpus/dev-census/blockers.html).

## Per-repository measurements

Considered/diagnosed/accepted refer to discovery only. Zero on a control or missing scope is not measured zero coverage. Counts exclude historical attempts. Exact scope lists are linked in the result column.

| DEV repository | Scope (compact; exact list in result) | Status | Considered | Diagnosed | Accepted | Parser files | Result |
|---|---|---|---:|---:|---:|---:|---|
| toeverything/AFFiNE | `packages/backend/server/src`, `packages/common/env/src`, `packages/common/error/src` (+1 scopes) | installed; scans complete; 292 parser failures | 441 | 429 | 12 | 292 | [JSON](eval-corpus/dev-census/AFFiNE.json.gz) |
| actualbudget/actual | `packages/sync-server/src`, `packages/loot-core/src/server`, `packages/loot-core/src/shared` | installed; scans complete | 799 | 794 | 5 | 0 | [JSON](eval-corpus/dev-census/actual.json.gz) |
| boardgameio/boardgame.io | `src/server`, `src/core`, `src/plugins` (+1 scopes) | installed; scans complete | 82 | 82 | 0 | 0 | [JSON](eval-corpus/dev-census/boardgame.io.json.gz) |
| lissy93/dashy | `services` | installed; scans complete | 64 | 64 | 0 | 0 | [JSON](eval-corpus/dev-census/dashy.json) |
| evidence-dev/evidence | `core/src/connection`, `core/src/connectors`, `core/src/metrics` (+1 scopes) | installed; scans complete | 108 | 100 | 8 | 0 | [JSON](eval-corpus/dev-census/evidence.json.gz) |
| excalidraw/excalidraw-room | `src` | installed; scans complete | 0 | 0 | 0 | 0 | [JSON](eval-corpus/dev-census/excalidraw-room.json) |
| getfider/fider | — | non-Node control | — | — | — | 0 | [JSON](eval-corpus/dev-census/fider.json) |
| gristlabs/grist-core | `app/server`, `app/common` | installed; scans complete; 3 parser failures | 1038 | 1011 | 27 | 3 | [JSON](eval-corpus/dev-census/grist-core.json.gz) |
| growthbook/growthbook | `packages/back-end/src`, `packages/shared/src`, `packages/stats-ts/src` | installed; scans partial; 32 files remain unknown | 3911 | 3737 | 174 | 0 | [JSON](eval-corpus/dev-census/growthbook.json.gz) / [file batches](eval-corpus/dev-census/supplements/growthbook.json.gz) |
| linkwarden/linkwarden | `apps/web/pages/api`, `apps/web/lib/api`, `apps/worker` (+2 scopes) | installed; scans complete | 75 | 74 | 1 | 0 | [JSON](eval-corpus/dev-census/linkwarden.json.gz) |
| maybe-finance/maybe | — | non-Node control | — | — | — | 0 | [JSON](eval-corpus/dev-census/maybe.json) |
| n8n-io/n8n | `packages/cli/src`, `packages/core/src`, `packages/workflow/src` | installed; requested files covered; compatible TS host fallback; 1350 parser failures | 3273 | 3201 | 72 | 1350 | [JSON](eval-corpus/dev-census/n8n.json.gz) |
| nocodb/nocodb | `packages/nocodb/src`, `packages/nocodb-sdk/src` | installed; requested files covered; 294 parser failures | 1410 | 1401 | 9 | 294 | [JSON](eval-corpus/dev-census/nocodb.json.gz) |
| openpanel-dev/openpanel | `apps/api/src`, `packages/core`, `packages/db/src` (+2 scopes) | installed; requested files covered | 1304 | 1266 | 38 | 0 | [JSON](eval-corpus/dev-census/openpanel.json.gz) |
| PostHog/posthog | `nodejs/src`, `common` | installed; requested server files covered (tooling/native-binding exclusions recorded); 18 parser failures | 2326 | 2250 | 76 | 18 | [JSON](eval-corpus/dev-census/posthog.json.gz) |
| umami-software/umami | `src/app/api`, `src/lib`, `src/queries` | installed; requested files covered | 308 | 304 | 4 | 0 | [JSON](eval-corpus/dev-census/umami.json.gz) |
| Unleash/unleash | `src/lib` | installed; requested files covered; compatible TS host fallback | 499 | 484 | 15 | 0 | [JSON](eval-corpus/dev-census/unleash.json.gz) |

## Before and after EV1

These are **not matched denominators**: EV1 all-repository and DEV columns count messages from broad source-only scans (including client/tooling and partial failures). This pass counts unique functions from dependency-install-attempted server scopes. Scope, parser survival, TypeScript configuration, and dependencies all changed. Differences do not estimate the causal benefit of installation. No HELD_OUT artifact is reopened to produce this table; the all-repository column is copied from the required EV1 report.

| Original EV1 category | EV1 all repos, messages | EV1 DEV, messages | New DEV, functions (all classifications) |
|---|---:|---:|---:|
| unsupported reference/type | 4269 | 1714 | 4269 |
| runtime import | 1586 | 891 | 2664 |
| work screen | 977 | 404 | 2404 |
| other | 682 | 251 | 4771 |
| strict closure | 164 | 69 | 216 |
| mutation | 110 | 22 | 231 |
| effects | 96 | 30 | 233 |
| broad/unresolved boundary | 19 | 9 | 409 |

## Real blocker histogram

The finer categories below separate resolver policy, declaration metadata, parser syntax, and proof requirements. Paths and function-name prefixes are stripped before reason matching; declaration-file extensions are used explicitly to distinguish type metadata from executable initialization. Counts are unique diagnosed functions. The work screen is an intentional eligibility/economics gate, not a missing compiler feature.

| Category | Real | Environment-affected | Uncertain |
|---|---:|---:|---:|
| work screen | 2404 | 0 | 0 |
| module initialization/effect proof | 2023 | 0 | 0 |
| unsupported reference/type | 1095 | 2014 | 0 |
| package exports/resolver policy | 423 | 0 | 0 |
| declaration/type-only graph handling | 387 | 0 | 0 |
| parser syntax | 303 | 0 | 0 |
| runtime dependency boundary | 250 | 2414 | 0 |
| effects | 233 | 0 | 0 |
| mutation proof | 218 | 0 | 0 |
| strict closure | 139 | 77 | 0 |
| transitive effect proof | 136 | 341 | 0 |
| namespace/module-object proof | 97 | 0 | 0 |
| JSON boundary/type proof | 86 | 323 | 0 |
| call-site specialization | 73 | 102 | 0 |
| computed/prototype member proof | 60 | 131 | 0 |
| export/binding resolution | 47 | 1434 | 0 |
| other closure/extraction | 13 | 339 | 0 |
| class/constructor proof | 9 | 20 | 0 |
| module cycles | 6 | 0 | 0 |

## Top real blockers and pinned examples

### work screen: 2404 functions

No support change is indicated by this count; these functions fail the unchanged work screen and need compute evidence before promotion.

- [toeverything/AFFiNE: isValidCacheTtl](https://github.com/toeverything/AFFiNE/blob/91ac3ca384b791ffd1a87de352a82e766f11ae08/packages/backend/server/src/base/cache/provider.ts#L26): [next-scriptc] not a candidate isValidCacheTtl: work: no loop, recursion, array callback or JSON parse
- [actualbudget/actual: isValidPassword](https://github.com/actualbudget/actual/blob/741d1615b7a818784f7859269430a003753a40dd/packages/sync-server/src/accounts/password.js#L17): [next-scriptc] not a candidate isValidPassword: work: no loop, recursion, array callback or JSON parse
- [boardgameio/boardgame.io: unwrapQuery](https://github.com/boardgameio/boardgame.io/blob/47adef2b46e375999931209ba7b41e9654c506e1/src/server/api.ts#L85): [next-scriptc] not a candidate unwrapQuery: work: no loop, recursion, array callback or JSON parse

### module initialization/effect proof: 2023 functions

Prove that module initialization and the requested dependency closure preserve effects and binding state; dropping unrelated effects is not automatically sound.

- [toeverything/AFFiNE: override](https://github.com/toeverything/AFFiNE/blob/91ac3ca384b791ffd1a87de352a82e766f11ae08/packages/backend/server/src/base/config/register.ts#L290): [next-scriptc] not a candidate override: dependency closure: <tmp>/AFFiNE/packages/backend/server/src/base/config/register.ts: unproved module initialization VariableDeclaration
- [actualbudget/actual: convertToCents](https://github.com/actualbudget/actual/blob/741d1615b7a818784f7859269430a003753a40dd/packages/sync-server/src/app-akahu/app-akahu.ts#L319): [next-scriptc] not a candidate convertToCents: [next-scriptc] <tmp>/actual/packages/sync-server/src/app-akahu/app-akahu.ts: function convertToCents: unsupported module initialization ExpressionStatement; move setup into a declaration initializer
- [boardgameio/boardgame.io: SetActivePlayers](https://github.com/boardgameio/boardgame.io/blob/47adef2b46e375999931209ba7b41e9654c506e1/src/core/turn-order.ts#L129): [next-scriptc] not a candidate SetActivePlayers: dependency closure: <tmp>/boardgame.io/src/core/turn-order.ts: unproved module initialization VariableDeclaration

### unsupported reference/type: 1095 functions

Support the exact referenced builtin/type and its semantics, or prove a structural closed representation; arbitrary class/stateful references remain outside the contract.

- [toeverything/AFFiNE: OnEvent](https://github.com/toeverything/AFFiNE/blob/91ac3ca384b791ffd1a87de352a82e766f11ae08/packages/backend/server/src/base/event/def.ts#L37): [next-scriptc] not a candidate OnEvent: [next-scriptc] <tmp>/AFFiNE/packages/backend/server/src/base/event/def.ts: function OnEvent: unsupported reference Symbol
- [actualbudget/actual: handleEnableBankingError](https://github.com/actualbudget/actual/blob/741d1615b7a818784f7859269430a003753a40dd/packages/sync-server/src/app-enablebanking/utils/errors.ts#L19): [next-scriptc] not a candidate handleEnableBankingError: [next-scriptc] <tmp>/actual/packages/sync-server/src/app-enablebanking/utils/errors.ts: function handleEnableBankingError: unsupported reference this
- [boardgameio/boardgame.io: errorfn](https://github.com/boardgameio/boardgame.io/blob/47adef2b46e375999931209ba7b41e9654c506e1/src/core/logger.ts#L11): [next-scriptc] not a candidate errorfn: [next-scriptc] <tmp>/boardgame.io/src/core/logger.ts: function errorfn: parameters must be identifiers or JSON destructuring with literal defaults (rest unsupported)

### package exports/resolver policy: 423 functions

Resolve the application’s active package-export conditions and prove the selected runtime module graph, rather than rejecting every extra condition.

- [toeverything/AFFiNE: registerObjectType](https://github.com/toeverything/AFFiNE/blob/91ac3ca384b791ffd1a87de352a82e766f11ae08/packages/backend/server/src/base/graphql/register.ts#L5): [next-scriptc] not a candidate registerObjectType: dependency closure: <tmp>/AFFiNE/node_modules/@nestjs/graphql/dist/index.d.ts: unsupported package export condition browser
- [actualbudget/actual: makeSplitTransaction](https://github.com/actualbudget/actual/blob/741d1615b7a818784f7859269430a003753a40dd/packages/loot-core/src/server/accounts/sync.ts#L45): [next-scriptc] not a candidate makeSplitTransaction: dependency closure: <tmp>/actual/packages/loot-core/src/server/accounts/sync.ts: unsupported package export condition electron-renderer
- [evidence-dev/evidence: connectionForData](https://github.com/evidence-dev/evidence/blob/590143b9ecd2993b0907d4ba85ec5920c097776f/core/src/connection/connection-for-data.ts#L13): [next-scriptc] not a candidate connectionForData: dependency closure: <tmp>/evidence/core/src/connection/connection-for-data.ts: unsupported package export condition svelte

### declaration/type-only graph handling: 387 functions

Distinguish declaration metadata from executable module initialization, and close actual value dependencies against runtime source.

- [toeverything/AFFiNE: typeFromShape](https://github.com/toeverything/AFFiNE/blob/91ac3ca384b791ffd1a87de352a82e766f11ae08/packages/backend/server/src/base/config/register.ts#L60): [next-scriptc] not a candidate typeFromShape: dependency closure: <tmp>/AFFiNE/node_modules/zod/index.d.cts: unproved module initialization default expression
- [actualbudget/actual: validateSession](https://github.com/actualbudget/actual/blob/741d1615b7a818784f7859269430a003753a40dd/packages/sync-server/src/util/validate-user.ts#L10): [next-scriptc] not a candidate validateSession: dependency closure: <tmp>/actual/node_modules/@types/express/index.d.ts: unproved module initialization TSExportAssignment
- [boardgameio/boardgame.io: isOriginAllowed](https://github.com/boardgameio/boardgame.io/blob/47adef2b46e375999931209ba7b41e9654c506e1/src/server/api.ts#L665): [next-scriptc] not a candidate isOriginAllowed: dependency closure: <tmp>/boardgame.io/node_modules/.pnpm/@types+cors@2.8.19/node_modules/@types/cors/index.d.ts: unproved module initialization TSExportAssignment


## Request-relevant compute candidates

No new CPU benchmark, native compilation, request trace, or endpoint comparison is run. Existing EV1 intensity results remain historical; installation alone proves no speedup. The following DEV numerical candidates remain useful for later work. GrowthBook’s observed contextual-bandit server caller is enterprise-licensed; these are not an OSS deployment positive. Actual’s loot-core server also runs locally, and HTTP reachability is unproven.

| Candidate | Current diagnostic | Request relevance / limit |
|---|---|---|
| [bestExhaustiveBinarySplit](https://github.com/growthbook/growthbook/blob/b73ffdb3e8189fd918d721155ce69742fdc6fbfd/packages/stats-ts/src/contextualBanditWeights.ts#L373) | [next-scriptc] not a candidate bestExhaustiveBinarySplit: purity: argument mutation | Numerical split/SSE/BIC family; only exhaustive split passed the prior dense-work screen near its 15-category cap; enterprise server caller. |
| [approximateBinaryKMeans](https://github.com/growthbook/growthbook/blob/b73ffdb3e8189fd918d721155ce69742fdc6fbfd/packages/stats-ts/src/contextualBanditWeights.ts#L477) | [next-scriptc] not a candidate approximateBinaryKMeans: purity: argument mutation | Numerical split/SSE/BIC family; only exhaustive split passed the prior dense-work screen near its 15-category cap; enterprise server caller. |
| [compactGroupSse](https://github.com/growthbook/growthbook/blob/b73ffdb3e8189fd918d721155ce69742fdc6fbfd/packages/stats-ts/src/contextualBanditWeights.ts#L347) | [next-scriptc] not a candidate: [next-scriptc] /tmp/nsc-dev-census/growthbook/packages/stats-ts/src/contextualBanditWeights.ts: function compactGroupSse: parameter cats[].buffer.slice: functions and constructors are not JSON data (type (begin?: number \| undefined, end?: number \| undefined) => ArrayBuffer) | Numerical split/SSE/BIC family; only exhaustive split passed the prior dense-work screen near its 15-category cap; enterprise server caller. |
| [compactGroupSsePerVariation](https://github.com/growthbook/growthbook/blob/b73ffdb3e8189fd918d721155ce69742fdc6fbfd/packages/stats-ts/src/contextualBanditWeights.ts#L326) | [next-scriptc] not a candidate: [next-scriptc] /tmp/nsc-dev-census/growthbook/packages/stats-ts/src/contextualBanditWeights.ts: function compactGroupSsePerVariation: parameter cats[].buffer.slice: functions and constructors are not JSON data (type (begin?: number \| undefined, end?: number \| undefined) => ArrayBuffer) | Numerical split/SSE/BIC family; only exhaustive split passed the prior dense-work screen near its 15-category cap; enterprise server caller. |
| [bicDeltaForSplit](https://github.com/growthbook/growthbook/blob/b73ffdb3e8189fd918d721155ce69742fdc6fbfd/packages/stats-ts/src/contextualBanditWeights.ts#L1120) | Discovery-accepted; no emitted blocker; native build and CPU unmeasured | Numerical split/SSE/BIC family; only exhaustive split passed the prior dense-work screen near its 15-category cap; enterprise server caller. |
| [contextViews](https://github.com/growthbook/growthbook/blob/b73ffdb3e8189fd918d721155ce69742fdc6fbfd/packages/stats-ts/src/contextualBanditWeights.ts#L222) | Discovery-accepted; no emitted blocker; native build and CPU unmeasured | Newly discovery-accepted context helper; compute density unmeasured; enterprise server path. |
| [partitionByContext](https://github.com/growthbook/growthbook/blob/b73ffdb3e8189fd918d721155ce69742fdc6fbfd/packages/stats-ts/src/contextualBanditWeights.ts#L240) | Discovery-accepted; no emitted blocker; native build and CPU unmeasured | Newly discovery-accepted context helper; compute density unmeasured; enterprise server path. |
| [contextAttrMap](https://github.com/growthbook/growthbook/blob/b73ffdb3e8189fd918d721155ce69742fdc6fbfd/packages/stats-ts/src/contextualBanditWeights.ts#L632) | Discovery-accepted; no emitted blocker; native build and CPU unmeasured | Newly discovery-accepted context helper; compute density unmeasured; enterprise server path. |
| [solveForecast](https://github.com/actualbudget/actual/blob/741d1615b7a818784f7859269430a003753a40dd/packages/loot-core/src/server/budget/schedule-template.ts#L684) | [next-scriptc] not a candidate: strict closure: TS2532: Object is possibly 'undefined'. | Pure numeric solver; cheap at prior 12–120 month sizes; HTTP use unproven. |
| [solveMonthlyContribution](https://github.com/actualbudget/actual/blob/741d1615b7a818784f7859269430a003753a40dd/packages/loot-core/src/server/budget/schedule-template.ts#L735) | [next-scriptc] not a candidate: strict closure: TS2532: Object is possibly 'undefined'. | Pure numeric solver; cheap at prior 12–120 month sizes; HTTP use unproven. |
| [PostHog HogVM execSync](https://github.com/PostHog/posthog/blob/375571050c2c96a38ee89828ff52a94ca3f02c45/common/hogvm/typescript/src/execute.ts#L135) | [next-scriptc] not a candidate execSync: dependency closure: unresolved runtime import ./types | Conditional server-compute lead: Node CDP code imports HogVM, but no pure JSON VM boundary, density, or request trace is established. Mutable interpreter state and callable standard-library context remain outside a proven closed kernel. |

GrowthBook’s [enterprise server caller](https://github.com/growthbook/growthbook/blob/b73ffdb3e8189fd918d721155ce69742fdc6fbfd/packages/back-end/src/enterprise/services/contextualBanditStats.ts#L140) calls computeContextualBanditWeights. The exhaustive/approximate split search needs a transitive mutation/ownership proof; BIC and three context helpers are now discovery-accepted, while native compilation and CPU remain unmeasured; the mutable quadrature cache noted in EV1 remains a secondary closure issue, not an additional count when the first diagnostic stops discovery. Actual’s forecast solvers retain strict indexed-access refusals, and their HTTP use remains unproven. The [PostHog import evidence](eval-corpus/dev-census/posthog-hogvm-callers.json) is a source-level lead, not a traced endpoint.

Accepted permission, parsing, formatting, and import helpers in the per-function results are additional server-relevant leads, not demonstrated dense request kernels. Async handlers, class-based services, native library calls, browser geometry, and database orchestration do not become promotable numeric kernels from this scan.

## Failures and honest limits

- **toeverything/AFFiNE generator packages/backend/server/schema.prisma:** offline generation failed. Error: request to https://binaries.prisma.sh/all_commits/2060c79ba17c6bb9f5823312b6f6b7f4a845738e/darwin-arm64/libquery_engine.dylib.node.gz.sha256 failed, reason: getaddrinfo ENOTFOUND binaries.prisma.sh
- **toeverything/AFFiNE file parser error packages/backend/server/src/app.controller.ts:** This experimental syntax requires enabling one of the following parser plugin(s): "decorators", "decorators-legacy". (8:0)
- **toeverything/AFFiNE file parser error packages/backend/server/src/base/cache/index.ts:** This experimental syntax requires enabling one of the following parser plugin(s): "decorators", "decorators-legacy". (6:0)
- **gristlabs/grist-core file parser error app/server/lib/ActiveDoc.ts:** This experimental syntax requires enabling one of the following parser plugin(s): "decorators", "decorators-legacy". (797:2)
- **gristlabs/grist-core file parser error app/server/lib/DocManager.ts:** This experimental syntax requires enabling one of the following parser plugin(s): "decorators", "decorators-legacy". (270:2)
- **growthbook/growthbook scope packages/shared:** FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
- **growthbook/growthbook scope packages/shared:** FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
- **growthbook/growthbook scope packages/shared:** Earlier EV2 memory failures retained; this is an explicit EV1-only resource-limited retry
- **growthbook/growthbook EV1 scope packages/shared:** exit -6; Early artifact lacks stderr because the initial JSON parser removed output before parsing; this retention bug is fixed in the harness.
- **growthbook/growthbook EV1 scope packages/shared:** exit -6; Early artifact lacks stderr because the initial JSON parser removed output before parsing; this retention bug is fixed in the harness.
- **growthbook/growthbook EV1 scope packages/shared:** exit -6; FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
- **linkwarden/linkwarden generator packages/prisma/schema.prisma:** offline generation failed. Error: request to https://binaries.prisma.sh/all_commits/9b628578b3b7cae625e8c927178f15a170e74a9c/darwin-arm64/schema-engine.gz.sha256 failed, reason: getaddrinfo ENOTFOUND binaries.prisma.sh
- **n8n-io/n8n analyzer host:** Installed root TypeScript Node API; package TypeScript 7 host lacks sys.readFile (canonical failures retained). Compatible-host measurements retain the original canonical failures. Application dependencies and promotion policy are unchanged. The chosen compiler version is recorded in EV1 environment evidence; these results do not establish TypeScript 7 JS-host integration readiness.
- **n8n-io/n8n scope packages/core:** scriptc-promote report: Cannot read properties of undefined (reading 'readFile')
- **n8n-io/n8n scope packages/workflow:** scriptc-promote report: Cannot read properties of undefined (reading 'readFile')
- **n8n-io/n8n file parser error packages/cli/src/evaluation.ee/evaluation-collection.service.ts:** This experimental syntax requires enabling one of the following parser plugin(s): "decorators", "decorators-legacy". (68:0)
- **n8n-io/n8n file parser error packages/cli/src/evaluation.ee/evaluation-collections.controller.ee.ts:** This experimental syntax requires enabling one of the following parser plugin(s): "decorators", "decorators-legacy". (29:0)
- **nocodb/nocodb file parser error packages/nocodb/src/app.module.ts:** This experimental syntax requires enabling one of the following parser plugin(s): "decorators", "decorators-legacy". (59:0)
- **nocodb/nocodb file parser error packages/nocodb/src/mcp/mcp.controller.ts:** This experimental syntax requires enabling one of the following parser plugin(s): "decorators", "decorators-legacy". (18:0)
- **openpanel-dev/openpanel generator packages/db/prisma/schema.prisma:** not run: custom generator/config requires an application execution review.
- **PostHog/posthog EV1 scope .:** exit -6; Early artifact lacks stderr because the initial JSON parser removed output before parsing; this retention bug is fixed in the harness.
- **PostHog/posthog file parser error nodejs/src/logs/logs-ingestion-consumer.ts:** This experimental syntax requires enabling one of the following parser plugin(s): "decorators", "decorators-legacy". (1511:4)
- **PostHog/posthog file parser error nodejs/src/logs/sampling/logs-sampling.service.ts:** This experimental syntax requires enabling one of the following parser plugin(s): "decorators", "decorators-legacy". (75:4)
- **PostHog/posthog scope exclusions:** common/storybook, common/esbuilder, common/tailwind, common/hogql_parser, nodejs/src/logs/transformations/benchmarks. The initial out-of-scope tooling/native-binding batch hit the heap limit; its failure is retained, and it contributes no function counts.
- **umami-software/umami generator prisma/schema.prisma:** not run: custom generator/config requires an application execution review.
- **Unleash/unleash analyzer host:** Protocol TypeScript 5.9.3 Node API; installed application TypeScript 7 package lacks sys.readFile; canonical failures retained. Compatible-host measurements retain the original canonical failures. Application dependencies and promotion policy are unchanged. The chosen compiler version is recorded in EV1 environment evidence; these results do not establish TypeScript 7 JS-host integration readiness.
- **Unleash/unleash scope .:** scriptc-promote report: Cannot read properties of undefined (reading 'readFile')
- **Unleash/unleash scope .:** scriptc-promote report: Cannot read properties of undefined (reading 'readFile')
- **Unleash/unleash scope .:** scriptc-promote report: Cannot read properties of undefined (reading 'readFile')
- **Unleash/unleash scope .:** scriptc-promote report: Cannot read properties of undefined (reading 'readFile')
- **Unleash/unleash scope .:** scriptc-promote report: Cannot read properties of undefined (reading 'readFile')
- **Unleash/unleash scope .:** scriptc-promote report: Cannot read properties of undefined (reading 'readFile')

- Partition-parent direct files and absent planned source paths remain outside the measured scope. Failed scopes are unknown, not zero. The remaining GrowthBook 32-file validator list is explicit in its JSON; neither EV2 inventory nor EV1 discovery completes for that subset. The per-repo JSON retains every exact omission and failure. GrowthBook’s initial whole-backend EV2 attempt timed out at 300 seconds; it is archived under attempts/.
- Import-graph contamination is conservative and can attribute unrelated missing imports to a function. The real bucket is evidence of an observed non-environment refusal, not proof that no later environment blocker exists. First-diagnostic reporting cannot predict how many changes make a function eligible.
- Runtime imports resolved to installed declarations, skipped generated outputs, package aliases/export conditions, custom loaders, and syntax gaps remain distinct causes. No complete prevalence estimate or claim of fully installed app readiness follows.
- Function inventories exclude methods and nested callbacks, and parser-failed files contribute no considered functions. Shared source location does not establish a live request path or request frequency. Endpoint CPU, compiler acceptance, native parity, and native savings are all unmeasured.
- The only production changes are parser-error isolation, visible unknown-coverage warnings, and filename provenance, covered by a regression test. File-selection and compatible compiler-host preloads are measurement-only harness code, with separate regression tests. Existing Next/Nitro/SvelteKit report counts and CLI checks pass. Initial missing workspace-link test setup was corrected and rerun. Seven report/parser/harness checks, nine existing dependency-closure checks, two normalization checks, and one scope-exclusion check pass. Early EV1 fatal stderr was lost by parse-on-pop; later runs preserve it, and the missing early output is labeled rather than reconstructed. No promotion policy is changed.
