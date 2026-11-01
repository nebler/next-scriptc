# Request CPU coverage before further promotion work

2026-11-01. Baseline only, on `t3/real-app-cpu-baseline`. No adapter or scriptc changes, native performance experiment, deployment, or full app install.

**Papermark already exposes a useful candidate: 44.4% of the mocked 6k-event video-analytics request CPU, and 60.9% at 60k events.** Dub and Umami expose no currently promotable CPU in the paths measured. Their compute is blocked by dependency and boundary checks. These are endpoint coverage shares, not whole-app CPU savings or a Vercel prediction.

The next development target is Dub's CSV dependency closure and a sound boundary specialization. It covers 59–61% of this export's mocked CPU before formatter work. Optional boundary support is a smaller, more isolated adapter project. No traffic-weighted app-level X can be established without production request frequencies and the CPU of the omitted services.

## Scope and pinned sources

All checkouts are shallow, sparse, detached, and outside this repository at `/Users/noah/code/coverage-apps/`. No upstream app source, extracted closure, generated app JavaScript, native binary, or source-bearing profile is added here.

| App | Commit | Server source scanned | Why selected |
| --- | --- | --- | --- |
| [Papermark](https://github.com/mfts/papermark/tree/ed19717ec02a1ac79aecf5569159aa9d2d869312) | `ed19717ec02a1ac79aecf5569159aa9d2d869312` | `lib`, `pages/api` | Required held-out benchmark; unchanged video analytics has a previously compiled JSON kernel |
| [Dub](https://github.com/dubinc/dub/tree/6b463b4bdd9ed2fd9aa416f67b5b77d317b1471e) | `6b463b4bdd9ed2fd9aa416f67b5b77d317b1471e` | `apps/web/lib`, `apps/web/app/api` | Foreground CSV export runs with fixture database rows; real npm dependency work dominates |
| [Umami](https://github.com/umami-software/umami/tree/559e3c607c23d2c72d9bd4f6481bda428255323c) | `559e3c607c23d2c72d9bd4f6481bda428255323c` | `src/lib`, `src/queries`, `src/app/api` | Ingest persistence has a compact flatten-and-map path, reproducible without PostgreSQL or ClickHouse |

Papermark and Dub community code is AGPLv3; Umami is MIT at these commits. License files remain in their external checkouts. No enterprise-only modules are executed. Cal.com has a much wider date/plugin closure. Twenty's R1 parser lacked a proven request caller, and Formbricks' R1 helper was too small. Dub and Umami give better fixture-driven request coverage than those alternatives.

This is a census of the listed directories, not each complete repository or a server import graph. Some shared browser utilities live in these directories. Client directives are excluded by discovery, but unmarked shared code is counted even if no server actually calls it. Conversely, code outside these directories is absent.

## Measurement method and limits

The [runner](coverage-baseline/profile.mjs) transpiles the upstream files in memory with TypeScript 5.9.3, then executes the original handler or persistence function. Imports are explicitly supplied; an unexpected runtime import throws. There is no app bundler, Next server, network, database, container, or React render. Fixtures and module initialization happen before profiling.

V8's inspector CPU profiler samples every 500 microseconds. Each workload has 10 warmups and three rounds of at least 500 ms of process CPU, in batches of 10 calls. A large request can overshoot the budget. `process.cpuUsage()` includes user and system CPU, profiler work, and background GC. Only one profiling workload runs at a time. A census ran concurrently during the first part of the run; there were at most two task jobs. The host also had the user's unrelated long test run.

Shares use unweighted active sample counts, excluding `(idle)`, rather than wall-clock gaps, which inflate when a process is descheduled. Nearest marked ancestor assigns each sample exactly once. Thus `playbackSeconds` inside distribution belongs to distribution, while the same helper inside watch-time counting belongs to that blocked boundary. Named wrappers identify inclusive closures; their overhead is retained. GC cannot reliably be charged to a particular allocator, so it stays in other. Small runtime internals without a recognized stack also stay in other. These are approximate sampled CPU shares, not exact scheduler accounting. Host load, V8 inlining, sampling, and wrapper overhead can bias them.

Tables use the unweighted mean of the three round shares. Ranges are observed round minima and maxima, **not confidence intervals**. The [summarized profiles](coverage-baseline/profiles.json) retain sample counts, top frames, top stacks, process CPU totals, request counts, response sizes, and hashes. [summary.json](coverage-baseline/summary.json) retains category aggregates. No raw source or heap data is retained.

Papermark was profiled only for coverage. An initial instrumentation failure gave every marker the V8 name `wrap`; those shares were discarded. Named wrappers corrected the attribution, and the coverage measurement was repeated. No native timings, parameter search, policy change, or compiler optimization used Papermark. Later Papermark calls only checked response correctness.

A separate setup issue made construction proofs see ambient React and Node declarations and fail TS2792 on `csstype` and `undici-types`. A minimal TypeScript-only dependency link removed those unrelated declarations. This changed the census environment, not the app or screen. The final census reproduces the existing Papermark proof acceptance.

## Per-endpoint CPU split

- **a:** current discovery and boundary acceptance; Papermark's target also has prior compilation and parity evidence in the [local gate](papermark-local-gate.md).
- **b:** blocked application or npm compute, an upper bound requiring the specific gates below to be lifted. Acceptance and a native speedup are not established for these regions.
- **c:** serialization and Response/runtime work outside the promoted function. Actual I/O wait is absent and is not CPU.
- **d:** other, GC, profiling and mock overhead, and already-native crypto.

| Executed path and fixture | a current | b blocked compute | c serialization/runtime | d other |
| --- | ---: | ---: | ---: | ---: |
| Papermark GET video analytics, 6,000 events / 100 viewers | 44.4% | 33.8% | 17.8% | 4.0% |
| Papermark GET video analytics, 60,000 events / 1,000 viewers | 60.9% | 19.3% | 9.5% | 10.3% |
| Dub GET links export, 100 rows / 9 columns | 0% | 89.0% | 3.6% | 7.3% |
| Dub GET links export, 1,000 rows / 9 columns | 0% | 92.9% | 1.8% | 5.3% |
| Umami `saveEventData`, 20 nested properties / 100 leaves | 0% | 70.8% | 0% | 29.2% |
| Umami `saveEventData`, 100 nested properties / 500 leaves | 0% | 72.0% | 0% | 28.0% |

Rounding can make rows differ from 100%. In Umami, zero c means those services were excluded, not that the real HTTP endpoint has no runtime or database-client CPU.

The following totals satisfy request CPU accounting and are diagnostics only. They include instrumentation. Do not compare their absolute values across workloads, infer a speedup, or tune against Papermark.

| Path | Total profiled CPU, ms | Calls | Median round CPU/call, ms | Active samples |
| --- | ---: | ---: | ---: | ---: |
| Papermark 6k | 1,570.687 | 210 | 7.270 | 2,352 |
| Papermark 60k | 4,640.488 | 30 | 154.529 | 5,689 |
| Dub 100 | 1,504.302 | 3,860 | 0.407 | 1,780 |
| Dub 1k | 1,538.816 | 480 | 3.194 | 2,353 |
| Umami 20 | 1,500.583 | 39,210 | 0.037 | 2,222 |
| Umami 100 | 1,501.574 | 7,930 | 0.185 | 2,199 |

### Papermark preserves the real handler calculation

The original [video-analytics handler](https://github.com/mfts/papermark/blob/ed19717ec02a1ac79aecf5569159aa9d2d869312/pages/api/teams/%5BteamId%5D/documents/%5Bid%5D/video-analytics.ts) runs with authorized session, membership, Prisma document, and Tinybird mocks. Tinybird returns a fresh JSON-decoded event fixture each call. The response mock serializes the full analytics object. This retains upstream HTTP decode and response encode costs, but omits auth, Prisma-client, Tinybird-client, and actual Next response CPU. It is an optimistic denominator for the real endpoint.

Events have all ten selected fields, ten-second intervals, sorted timestamps, and 60 heartbeats per complete ten-minute view. The [Tinybird query](https://github.com/mfts/papermark/blob/ed19717ec02a1ac79aecf5569159aa9d2d869312/lib/tinybird/endpoints/get_video_events_by_document.pipe) has no SQL LIMIT. The fixtures represent accumulated historical views, not production traces; service-side limits and retention remain unknown.

| Region | 6k CPU share, mean [round range] | 60k CPU share, mean [round range] | Current gate |
| --- | ---: | ---: | --- |
| `documentViewDistribution`, including `playbackSeconds` and local Map/Set work | 44.4 [43.5–46.0]% | 60.9 [60.5–61.6]% | Accepted; construction proof v2 passes; prior stock compiler and parity pass |
| `watchTimeSeconds` + `resolveVideoLength`, inclusive local helpers | 12.9 [12.4–13.2]% | 7.7 [7.2–8.1]% | Optional `view_id` or `stored` undefined boundary; construction proof passes for both |
| `countablePlaybackEvents` | 0.9 [0.5–1.2]% | 0.4 [0.4–0.5]% | First boundary failure is undefined; generic T remains; construction proof rejects extracted closure |
| `calculateAnalytics` exclusive of marked callees | 20.0 [18.5–21.0]% | 11.2 [11.1–11.4]% | Non-exported sync core inside handler module, runtime imports, input-driven Date sort, error logging |
| Mock HTTP decode + response serialization | 17.8 [16.9–18.3]% | 9.5 [8.8–10.0]% | Outside promoted function |

`calculateAnalytics` is synchronous already. Export discovery and closure extraction are its first problems, rather than async support. The Date constructor is used with explicit timestamp inputs, but the current purity screen rejects Date references wholesale. The console error path remains observable and must not be ignored. Its exclusive share is therefore a multi-gate ceiling, not recovery from one change.

Internal Map and Set values do not cross `documentViewDistribution`'s boundary. Removing a Map/Set boundary restriction would add none of its already accepted share. Watch-time support must preserve missing versus undefined fields and input alias behavior; replacing undefined with null in application code would violate the install-only goal.

Correctness checks assert the viewer count, total watch time, 601 output buckets, and the first bucket's viewer count. Full output hashes and byte lengths are retained. No new native performance measurement was made.

### Dub executes its foreground export route

The unchanged [links export route](https://github.com/dubinc/dub/blob/6b463b4bdd9ed2fd9aa416f67b5b77d317b1471e/apps/web/app/api/links/export/route.ts) executes with fixture database rows, identity auth wrapping, pre-parsed query filters, and mocked count/filter/date-range services. Original `formatLinksForExport`, `exportLinksColumns` declaration, `convertToCSV`, and json-2-csv 5.5.0 execute. Native `Response` construction and `text()` consumption remain in the measured path. Auth, Zod validation, database-client decoding, and optional date-range work are omitted, so this also has an optimistic denominator.

Nine actual export columns include Date-to-ISO transforms, numbers, URL strings with comma and quote escaping, tags with a formula-trigger prefix, and archived status. The `link` and money columns are excluded; their dependencies throw if accidentally reached. The column declaration is selected from the upstream AST, not rewritten. No app source is written to disk by the runner.

| Region | 100 rows | 1,000 rows | Gates to recover the region |
| --- | ---: | ---: | --- |
| `convertToCSV` and json-2-csv closure | 58.9% | 61.4% | Runtime npm import; broad `object[]`; callbacks and module Set; Date handling; compiler/static-tier parity |
| `formatLinksForExport` and column transforms | 30.1% | 31.5% | Cross-module helpers/constants; argument reassignment; `Record<string, any>` output and indexed access; callback-valued column configuration |
| Response/runtime | 3.6% | 1.8% | Outside kernel |

The first actual CSV rejection is opaque runtime import, not its signature. A focused boundary-only check independently rejects `object`. The dependency closure is json-2-csv → deeks and doc-path. Its hottest stacks include field lookup, escaping, key discovery, and CSV row assembly. The formatter spends substantial work in its actual Date transforms. These are real CPU paths, not time waiting on the database.

The route sends exports above 1,000 links to QStash. Neither 10k foreground rows nor ZIP compression are represented here. Code reading also identifies `exportAnalyticsToZip` as a separate async, cross-module, JSZip-dependent compute path; it was not profiled. Date-fns 4.1.0 is loaded for the original route but its interval=`all` branches do no work. Zod is mocked, and lodash is absent from this measured closure. No CPU share is assigned to either dependency without measurement.

Validation checks CSV row count, the real destination-URL header, and formula-tag content. Response hashes include the full CSV bytes. No native CSV speedup is claimed.

### Umami measures the real relational persistence function, not the full POST

Code reading follows [POST /api/send](https://github.com/umami-software/umami/blob/559e3c607c23d2c72d9bd4f6481bda428255323c/src/app/api/send/route.ts) → `saveEvent` → [saveEventData](https://github.com/umami-software/umami/blob/559e3c607c23d2c72d9bd4f6481bda428255323c/src/queries/sql/events/saveEventData.ts). The runner calls the unchanged exported `saveEventData` and selects its original relational query through a mocked `runQuery`. Prisma `createMany` captures rows without serializing or sending them. `flattenJSON`, `getStoredStringValue`, and `truncateString` execute from original modules. The no-argument UUID path uses the pinned uuid 14.0.2 `v4`, equivalent to the app's default `USE_UUIDV7`-unset branch; the app's tiny environment-dispatch wrapper is omitted.

Each nested property contains a number, string, boolean, explicit ISO date, and array. Twenty properties yield 100 stored rows; 100 yield 500 rows. These are structured custom-event stress fixtures, not observed normal request sizes. All are accepted by the route's unconstrained `Record<string, any>` event-data schema. Validation checks the actual captured row count. UUID randomness makes full row hashes unsuitable, so they are omitted.

| Region | 20 properties | 100 properties | Gates to recover the region |
| --- | ---: | ---: | --- |
| `flattenJSON`, recursive inner closure, `createKeyValue` | 27.0% | 23.8% | App strict-null config, runtime imported constants, any/dictionary boundary, captured recursive closure, construction proof |
| `getStoredStringValue` and reached formatting | 34.0% | 37.1% | App strict-null config, cross-module `truncateString`, Date reference, opaque calls; its own declared boundary passes a focused strict check |
| Remaining relational query/map work | 9.8% | 11.1% | Async/non-exported core, destructuring, Date/optional fields, UUID side effect inside map |
| UUID library/native crypto | 23.6% | 23.3% | Already uses Node's native randomUUID; counted in d, not a native-promotion opportunity |

The stored-string path's imported `truncateString` is generic with optional types, but that helper is not itself a promoted boundary here. Removing generics alone would not recover this region. Date parsing and `toISOString` also already use engine internals; the whole inclusive region is an optimistic recoverable ceiling, not guaranteed compilable scalar work.

The 70.8–72.0% b total cannot be recovered by simply admitting async functions. UUID generation is impure and must stay in its original order. A sync-core extractor would need to split deterministic shaping from that side effect. The full POST adds Zod parsing, URL handling, bot detection, GeoIP, hashing, JWT, session logic, database-client CPU, and response work. None was measured or assigned zero CPU. Thus these percentages cannot stand in for an ingest-request or whole-Umami percentage.

The pinned tsconfig explicitly sets `strictNullChecks: false`. Actual auto discovery disables promotion. The strict-null counterfactual below is diagnostic only and makes no source/config edit.

## Actual discovery census

[census.mjs](coverage-baseline/census.mjs) invokes the adapter's actual `promotionCandidates` and `discoverPromotions` functions. No screen is reimplemented. Original compiler options are retained, with absolute base paths and narrowed server-file includes. Dub's external shared tsconfig is linked. The source checkouts have no full dependency installation, so missing external types can appear as any and cause conservative rejections. These are source-level census results, not successful full app builds.

The inventory separately records top-level syntax the discovery API silently skips. `route.*` files are skipped by actual auto discovery, even if they contain a sync helper. Papermark Pages API defaults are not named-export candidates. Expression-bodied arrows are silently skipped. Inventory counts are approximate AST syntax counts, whereas the rejection census uses Babel's actual extraction and includes reachable local declarations. They are not guaranteed identical populations.

| Count | Papermark | Dub | Umami |
| --- | ---: | ---: | ---: |
| Files in server directory scope | 552 | 699 | 506 |
| `route.*` files skipped | 0 | 133 | 156 |
| Client modules in inventory | 2 | 11 | 0 |
| Named exported sync block functions in inventory | 316 | 232 | 195 |
| Exported async functions outside skipped route files | 200 | 203 | 211 |
| Exported expression-bodied functions | 13 | 18 | 0 |
| Non-exported top-level functions | 514 | 167 | 286 |
| Purity/work/extraction candidates | 20 | 12 | 13 |
| Discovery + boundary accepted with app options | 5 | 9 | 0 |
| Accepted in strict-null counterfactual | n/a | n/a | 3 |
| Construction proof passes among accepted | 1 | 0 | 0 |

First rejection reasons from the actual discovery run are below. Rows are mutually exclusive first failures, not an exhaustive limitation count per function. Umami strict-null failures are shown separately because its actual config disables the boundary stage. There were no module parse failures in this scan.

| First rejection category | Papermark | Dub | Umami before config gate | Umami strict counterfactual |
| --- | ---: | ---: | ---: | ---: |
| Runtime imports / opaque dependency | 76 | 83 | 54 | 54 |
| Default, rest, or destructured parameters | 71 | 68 | 42 | 42 |
| Work screen | 60 | 22 | 38 | 38 |
| Unsupported references/imports, including closure dependencies | 50 | 35 | 33 | 33 |
| React/JSX/framework imports | 27 | 7 | 6 | 6 |
| Mutation / reassignment | 6 | 2 | 0 | 0 |
| Time, randomness, or I/O | 6 | 0 | 7 | 7 |
| Other extraction/module initialization | 0 | 2 | 2 | 2 |
| Undefined / optional boundary | 9 | 1 | not reached | 7 |
| Broad any/unknown/object boundary | 3 | 2 | not reached | 3 |
| Map/Set or callable boundary | 2 | 0 | not reached | 0 |
| Unresolved generic boundary | 1 | 0 | not reached | 0 |
| App-wide strict-null gate messages | 0 | 0 | 1 | 0 |

Collection failures are `collectDescendantIds` returning Set and `buildFolderNameMap` accepting Map. Their rejection is reported through callable collection methods by the current checker. Neither is in a profiled endpoint. Class boundaries have zero first failures here; this does not mean all classes were accepted, since most such closures fail earlier. Closed-over constants and helpers are supported locally by extraction; opaque imported helpers and recursive nested captures are distinct limitations.

Papermark's accepted names are `routeTemplate`, `parseStoredAgreementResponse`, `mergeGroupDomains`, `sanitizeWatermarkText`, and `documentViewDistribution`. Only the last passes construction proof. Dub's are `analyzeDubAnalyticsScript`, `isPrivateIp`, `findDuplicateMappingEventNames`, `getGoogleAdsEventMappingsError`, `isIpInRange`, `isSupportedCustomURIScheme`, `isTopLevelSettingsRedirect`, `urlPathHasRelativeSegments`, and `isUserUploadKey`. Umami's strict counterfactual accepts `isApiKeyBlockedPath`, `hex6`, and `stringToColor`.

Construction failures are metadata used to choose strict result handling, **not discovery rejections**. Papermark has four proof failures: two module statements, one mutation provenance, one binding form. Dub has seven module-statement failures, one opaque-call failure, and one unsafe-type/reflective-syntax failure. Umami's three counterfactual candidates have one module-statement and two opaque-call failures. Disabling the construction optimization does not by itself remove a function from the strict promotion path.

[focused-screens.json](coverage-baseline/focused-screens.json) also runs the real boundary checker and proof independently on selected unchanged function closures, exposing later failures masked by runtime-import rejection. It verifies `convertToCSV` rejects `object`, Umami flattening rejects `any`, and Papermark watch-time/length helpers pass construction but fail optional boundaries.

No new native compile was attempted in this baseline. Accordingly there are **zero observed new SCxxxx failures, not zero compiler limitations**. Only Papermark distribution inherits the earlier local gate's successful stock-0.4.6 compile/parity evidence. R1's Dub combined probe built with dynamic statements and is not proof of a static adapter library; R1's Umami executable failed its native smoke. No SC code is invented for that failure or attributed a measured CPU share. Final compilation and parity remain explicit gates for every newly recovered region.

## Rank limitations by potentially recoverable CPU

There is no justified cross-app pooled percentage: neither request frequency nor production CPU weighting is available. The ranking compares measured endpoint regions, and keeps overlapping prerequisites together. Adding the rows would double-count work.

| Rank | Project or limitation cluster | CPU share exposed in measured paths | What one isolated relaxation recovers today |
| --- | --- | --- | --- |
| 1 | Resolve and prove runtime dependency closures, plus sound broad-boundary specialization | Dub CSV 58.9–61.4%, formatter another 30.1–31.5%; Umami imported formatting 34.0–37.1% | Import permission alone recovers 0% of CSV because `object[]` still rejects; formatter has additional reassignment/any gates |
| 2 | Non-exported/local sync closure extraction with input-driven Date support | Papermark exclusive analytics 11.2–20.0%; Umami formatting overlaps rank 1 | Discovery alone recovers 0% of the analytics closure because imports/Date/logging remain |
| 3 | Optional/undefined JSON boundaries with faithful missing-value semantics | Papermark watch-time/length 7.7–12.9% | This is the clearest isolated adapter gate; final compiler/transport parity still required |
| 4 | Strict analysis for apps without strict-null checking, JSON specialization and recursive closures | Umami flattening 23.8–27.0%, after app-config and import gates | Enabling strict-null analysis alone yields no eligible CPU in the profiled path |
| 5 | Extract deterministic sync work from async maps | Umami residual mapping 9.8–11.1% | Upper bound includes side-effect-adjacent overhead; UUID calls cannot be promoted |
| 6 | Generic boundary specialization | Papermark filtering 0.4–0.9%; Umami generic helper has no independent measured boundary | Not a reason to prioritize generic support alone |
| Unranked | Map/Set boundaries, classes, construction-proof expansion, SC compiler failures | No exclusive recoverable CPU demonstrated in these profiles | Internal Map/Set already works for Papermark; construction proof is not an eligibility gate; compiler coverage unmeasured |

Rank 2 is a broad research cluster. Rank 3 is a better small implementation project even though its ceiling is lower. Neither ranking is tuned on Papermark execution times.

### Recommended next projects and conditional X

1. **Adapter dependency closure analysis and guarded JSON specialization, using Dub CSV as the development workload.** Preserve the unchanged function and dependency versions. Prove or conservatively reject transitive effects; preserve Date values rather than quietly JSON-coercing them. Add a call-site or runtime specialization for supported row shapes, including safe rejection/fallback for Date-bearing broad object inputs. The compiler acceptance test is a static library with exact CSV bytes, formula neutralization, and dependency callbacks intact. At a hypothetical effective boundary-inclusive 2× speedup, CSV alone gives **29–31% less CPU on the mocked export**, before training/shadow costs. At 1.3–3×, the scenario is about 14–41%. Until all gates pass, expected realized saving remains zero. Do not include the formatter's extra 30–32 points in that estimate.
2. **Adapter transport and checking for optional/undefined data**, with missing-property and undefined fidelity, fallback, and parity tests on independent development fixtures. Papermark stays held out for milestone coverage/parity. Its observed watch-time/length region bounds an additional **4–6% mocked-request CPU saving at an effective 2×**, or about 2–9% at 1.3–3×. This is incremental to existing distribution coverage and excludes generic filtering. Compiler support remains to be established through the actual transport. This project also addresses a frequent census failure without starting with arbitrary async execution.

Current Papermark distribution itself has a theoretical zero-cost upper bound of 44–61% on these mocked requests. At a hypothetical effective 2×, that becomes 22–30% before training/shadows. No new speedup was measured here, so these are conditional arithmetic, not an expected Vercel result. The real denominator includes omitted service CPU. If these video requests account for q of app CPU, the app saving is `q × F × (1 − 1/S) − adapter overhead`, with F remeasured on the complete app. Unknown q prevents a whole-app X, and serialization/native boundaries can erase the gain.

## Reproduce and validate

The scripts use only built-in Node APIs, the existing adapter dependencies, TypeScript, and five small npm packages. [deps-lock.json](coverage-baseline/deps-lock.json) pins json-2-csv 5.5.0, deeks, doc-path, date-fns 4.1.0, and uuid 14.0.2. The CSV version matches Dub's lock, and UUID matches Umami's lock. Date-fns is only reached as a loaded route dependency in the measured Dub branch. No Umami date-fns functions are substituted.

From this worktree, with an existing dependency directory available:

```sh
node research/coverage-baseline/setup.mjs
node research/coverage-baseline/census.mjs
node research/coverage-baseline/focused-screens.mjs
node research/coverage-baseline/profile.mjs
node research/coverage-baseline/summarize.mjs
node research/coverage-baseline/validate.mjs
CHECK_ONLY=1 node research/coverage-baseline/profile.mjs
node research/coverage-baseline/setup.mjs --cleanup
```

`COVERAGE_APPS` changes the external root; `REUSE_NODE_MODULES` changes the existing dependency directory used by setup. Use a fresh root if its dedicated `deps/node_modules` already exists. Setup preserves checkouts and records task-owned links/directories for cleanup. The minimal repository link includes only TypeScript so ambient React/Node declarations do not contaminate the proof. `RUN_APPS=umami` supports correcting a non-held-out dependency setup without remeasuring Papermark. Summarization is offline and does not invoke app code.

Validation executes all six cases and asserts their response or inserted-row properties. Node syntax checks pass for every added script. Actual discovery runs on 1,757 scoped files, with all candidate records and first rejection messages retained. No implementation changed, so unrelated native/compiler test suites were not rerun on the already-loaded host. A version correction reran only Umami profiling, changing its initial UUID 11 probe to the actual pinned UUID 14.0.2. Initial invalid shares and the UUID 11 run are excluded from final artifacts.

Disk started at approximately **18 GiB available** from `df -h`. Sparse checkouts total about 21 MiB. The temporary dependency install used about 39 MiB. All task-created `node_modules` and links are removed after validation. Final available disk is approximately **19 GiB**. Disk and cleanup evidence are in [environment.json](coverage-baseline/environment.json). Concurrent unrelated work changes free space, so the disk difference is not a task allocation measurement. No Docker container, Vercel resource, root README, or unrelated checkout was modified.
