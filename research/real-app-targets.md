# Real app targets for automatic native promotion

2026-11-01. Local feasibility research with stock scriptc 0.4.6. No deployments, upstream writes, Docker, or monorepo dependency installs.

## Recommendation

Choose **Papermark video analytics**, specifically the unchanged exported `documentViewDistribution` function. It has a real server request caller, passes the existing boundary checker, compiles without a dynamic tier, and does enough work on plausible historical playback data to justify an in-process native trial. Choose **Dub CSV export as a conditional backup**, only if promotion later accepts a proven JSON specialization of its broad `object[]` signature. It is not an unchanged-v1 fallback today.

**None is yet a proven final demonstration.** Papermark is a good next experiment, but this research establishes neither native acceleration nor whole-app CPU savings. A faithful extracted endpoint can prove a workload, not the stronger claim that installing the adapter into an unchanged app reduces its Vercel CPU bill. Do not quote a percentage before measuring paired deployments of the full app, equal fixtures, identical response bytes, invocation CPU, and the traffic mix. Shadow verification costs must count in that total.

## Ranked shortlist

Ranking weights unchanged eligibility, work per call, an observed request caller, and reproducibility. Percentages are scenarios, not profiles. `F` is the eligible function's share of **request CPU**, not wall time. The hypothetical saving is `F × (1 − 1/S)` for an effective boundary-inclusive speedup `S` of 1.3–3. Rejected functions save zero with current v1. None of these speedups was measured here.

| Rank | App and target | Boundary and stock compiler evidence | Realistic local Node median | CPU share and hypothetical saving |
| --- | --- | --- | --- | --- |
| 1 | Papermark, document video distribution | Boundary passes; 52/52 coverage, no dynamic tier; library builds | 6k events: 4.84 ms; 60k: 78.67 ms (full event records) | Estimated F 35–65% on this large-history endpoint, 8–43% saving if S holds; whole-app share unknown |
| 2 | Dub, CSV export | `object[]` rejected; 576/576 coverage, 266 dynamic statements; library builds | 1k rows: 2.96 ms; 10k: 28.97 ms | After boundary work only, estimated F 20–60% of export CPU, 5–40% saving; current v1 zero |
| 3 | Cal.com, availability and slots | Dayjs boundary rejected; intersect probe 200/208 (96%), 133 dynamic; static build blocked | 20-user, 22-day intersection: 0.024 ms | Current eligible share zero for examined scheduling cores; after a substantial date/purity refactor, F 40–80% is a hypothesis, 9–53% saving |
| 4 | Umami, event-property flattening | `any` boundary rejected; 34/34 coverage, 1 dynamic; native smoke fails | 20 nested properties: 0.015 ms; 100: 0.038 ms | Estimated flatten share 1–5% of ingest CPU, <0.3–3.3% hypothetical saving; current v1 zero for flattening |
| 5 | Twenty, response shaping | `any` boundary rejected; 32/32 coverage, 13 dynamic; tested parser has no caller found | 100 records: 0.053 ms; 1k: 0.542 ms | No defensible F for this parser; 0–5% is only a search budget for eligible request helpers, not an app measurement |
| 6 | Formbricks, response TTC total | Equivalent extracted boundary passes; 5/5 coverage, 1 dynamic; exe builds | 20 questions: 0.0007 ms | Estimated F <1%, <0.23–0.67% saving even before boundary overhead; likely loses |

## Method and limits

Six shallow, blob-filtered, sparse clones were inspected. Sources are pinned below. Initial free disk was 8.4 GiB. Source checkouts totaled about 105 MiB. The only slice packages installed were TypeScript, Node types, Dayjs 1.11.13, and json-2-csv 5.5.0 with its small dependencies. Dub's lockfile pins 5.5.0. An initial 5.5.10 probe was replaced and Dub coverage, library build, executable, smoke, and reported timings were rerun with 5.5.0.

Measurements use Node v26.13.0, macOS arm64, the CPU model recorded in [raw/node-timings.json](real-app-targets/raw/node-timings.json). Each workload has 10 warmups and 30 samples. Fixtures are deterministic, built before timing. Medians and nearest-rank p95 include GC and other outliers. `process.cpuUsage` measures process-wide CPU; background GC can make CPU exceed elapsed time. Small microsecond measurements approach timer overhead. There are no user traffic traces, production CPU profiles, Vercel measurements, native performance timings, or confidence intervals. These are feasibility signals.

Coverage analyzes reachable entry probes, not entire apps, and the reports include dependency statements where emitted by this compiler. A report saying "fully static" can still list dynamic-tier statements. Library success proves emission, not ABI integration or speed. The smoke checks compare entire stdout bytes for one tiny fixture per executable; this does not replace runtime shadow verification. See [raw/smoke.json](real-app-targets/raw/smoke.json). Papermark, Dub, Twenty and Formbricks match on those fixtures. Umami fails at runtime.

The current repo's `checkFunctionTypes` is run on extracted declarations in [check-boundaries.mjs](real-app-targets/check-boundaries.mjs), with results in [raw/boundaries.json](real-app-targets/raw/boundaries.json). Full original application type-checker integration was not run. Papermark's source is copied verbatim; other extraction edits are listed in [manifest.json](real-app-targets/manifest.json). Boundary acceptance alone does not prove purity or discovery. Function expressions, default parameters, generic helpers, and transitive import handling still need the planned discovery implementation.

## Pinned sources and licenses

| App | Commit | License scope inspected |
| --- | --- | --- |
| papermark | `ed19717ec02a1ac79aecf5569159aa9d2d869312` | [AGPLv3 outside commercial ee directories](https://github.com/mfts/papermark/blob/ed19717ec02a1ac79aecf5569159aa9d2d869312/LICENSE#L1) |
| dub | `6b463b4bdd9ed2fd9aa416f67b5b77d317b1471e` | [AGPLv3 outside listed commercial ee directories](https://github.com/dubinc/dub/blob/6b463b4bdd9ed2fd9aa416f67b5b77d317b1471e/LICENSE.md#L1) |
| cal | `f972feefa1376cf47631177231c671da9a9dd09f` | [MIT at this commit, rather than an assumed historic license](https://github.com/calcom/cal.com/blob/f972feefa1376cf47631177231c671da9a9dd09f/LICENSE#L1) |
| umami | `559e3c607c23d2c72d9bd4f6481bda428255323c` | [MIT](https://github.com/umami-software/umami/blob/559e3c607c23d2c72d9bd4f6481bda428255323c/LICENSE#L1) |
| twenty | `6a1f828c9f0a202216b398709c79b2228e679921` | [AGPLv3 server; Enterprise-marked files commercial; some shared packages MIT](https://github.com/twentyhq/twenty/blob/6a1f828c9f0a202216b398709c79b2228e679921/LICENSE#L1) |
| formbricks | `fa289168d43699043e8e4016c3aa38bc3109f865` | [AGPLv3 community server; modules/ee commercial; specified SDK packages MIT](https://github.com/formbricks/formbricks/blob/fa289168d43699043e8e4016c3aa38bc3109f865/LICENSE#L1) |

These community licenses permit local execution and benchmarking. AGPL copies are retained with the extracts; preserve notices and meet source obligations for any modified network-served version or redistribution. This is a reading of repository license scope, not a legal opinion. No enterprise-only code is included in the benchmark extracts. Formbricks' enterprise analytics is referenced only to rule it out.

## 1. Papermark has a directly usable arithmetic workload

The GET document video-analytics route authenticates at [pages/api/teams/[teamId]/documents/[id]/video-analytics.ts:102](https://github.com/mfts/papermark/blob/ed19717ec02a1ac79aecf5569159aa9d2d869312/pages/api/teams/%5BteamId%5D/documents/%5Bid%5D/video-analytics.ts#L102), reads Prisma at line 127, fetches Tinybird at line 159, and calls its local `calculateAnalytics` at line 178. That calculation calls exported playback helpers at lines 60 and 80. The module is [lib/video-analytics/playback.ts:89](https://github.com/mfts/papermark/blob/ed19717ec02a1ac79aecf5569159aa9d2d869312/lib/video-analytics/playback.ts#L89).

`documentViewDistribution` allocates per-second buckets, expands each playback interval through `playbackSeconds`, and tracks unique view IDs plus counts in nested Maps and Sets. Cost scales with total interval-seconds and distinct viewer-second pairs, not just event count. A ten-minute video with ten-second heartbeat intervals means 60 events per complete view. Our 600, 6,000, and 60,000 event fixtures represent 10, 100, and 1,000 complete historical views. They are plausible accumulated histories, not observed production distributions. Repeated viewing and long sessions can cost more.

The selected function is synchronous, exported, and module-level. Its boundary is `Array<VideoPlaybackEvent & { view_id: string }>, number` returning numeric records. The required `view_id` intersection removes the optional field for this boundary, and the real checker accepts it. It calls only `playbackSeconds`, which uses Math and a local array. Maps and Sets stay internal. Neither function reads time, environment, random values, or I/O, nor mutates input data. This is the best unchanged candidate.

Do not promote all of `playback.ts` by assumption. `watchTimeSeconds`, `playbackSeconds`, and `viewPlaybackTimeline` have an optional `view_id` in their public boundary and fail the checker. The generic filters also fail. They can be reachable native helpers inside an accepted function without themselves being dispatch boundaries. `completionRate` passes but is too small. The enclosing `calculateAnalytics` is not exported and logs on its error path.

Coverage of distribution, watch time and timeline together is 52/52, with zero dynamic statements. The JSON library wrapper compiles to a host archive, and the executable's tiny output matches Node byte for byte. This wrapper is experiment code, not an upstream change. No addon was linked or benchmarked.

| Events | Unchanged distribution with full records, ms | Full calculateAnalytics, ms | Distribution share of calculation, estimate | Parse + distribution + stringify, ms |
| ---: | ---: | ---: | ---: | ---: |
| 600 | 0.516 | 0.847 | 61% | 0.719 |
| 6,000 | 4.843 | 8.452 | 57% | 6.679 |
| 60,000 | 78.674 | 112.377 | 70% | 91.813 |

The shares are ratios of separate medians, not an instrumented request profile. `calculateAnalytics` includes filtering, watch-time counting, Date-based timestamp sorting and output assembly. Full-record fixtures include timestamp, volume, playback rate and flags; the first simpler fixture series in the raw data has only four properties. The JSON column starts with pre-encoded input and excludes input encoding, strict validation, native transport, and output parsing, so it is not the full N-API cost. Substantial serialization and allocation could erase a native win.

The [Tinybird query](https://github.com/mfts/papermark/blob/ed19717ec02a1ac79aecf5569159aa9d2d869312/lib/tinybird/endpoints/get_video_events_by_document.pipe#L1) selects all matching document events, ordered by timestamp, with no SQL LIMIT in this file. Service response limits and retention can still cap the real data and must be checked before selecting a hosted fixture.

Reproduction is DB-free for the extracted unchanged functions and the extracted calculation. A full app needs auth, PostgreSQL, document membership and Tinybird data. A small Vercel Node endpoint importing the original module is straightforward but is only slice evidence. The strongest proof seeds a community app with a ten-minute video and 100–1,000 historical viewers, installs the adapter, and benchmarks this existing route with no source changes. On a large-history request, F = 35–65% is a plausible conservative scenario after decoding, serialization, auth and database-client CPU. It is unmeasured. If this route is only 1% of fleet CPU, even a 40% route saving cuts fleet CPU by only 0.4%.

## 2. Dub is a useful backup after boundary work

The existing export request at [apps/web/app/api/links/export/route.ts:19](https://github.com/dubinc/dub/blob/6b463b4bdd9ed2fd9aa416f67b5b77d317b1471e/apps/web/app/api/links/export/route.ts#L19) limits foreground export to 1,000 links and sends larger exports to QStash at line 49. It fetches and formats links before `convertToCSV` at line 84. The [conversion function](https://github.com/dubinc/dub/blob/6b463b4bdd9ed2fd9aa416f67b5b77d317b1471e/apps/web/lib/analytics/utils/convert-to-csv.ts#L10) calls synchronous json-2-csv, supplying a formula-neutralization callback and a Date-to-ISO branch. Analytics ZIP export also calls it at [apps/web/lib/analytics/export-analytics-to-zip.ts:80](https://github.com/dubinc/dub/blob/6b463b4bdd9ed2fd9aa416f67b5b77d317b1471e/apps/web/lib/analytics/export-analytics-to-zip.ts#L80).

Conversion has real per-row and per-field JS work: key discovery through deeks/doc-path, traversal, escaping, formatting, and string assembly. At ten columns the measured 100/1,000/10,000 row medians are 0.339/2.959/28.971 ms. The 10k case belongs to background or other export flows, not the foreground links route. Do not present it as a normal links GET.

The function is synchronous and does not itself use I/O, wall-clock time or randomness. It depends on the module-level formula-prefix Set and reachable json-2-csv helpers. Date instances can enter under the broad `object[]` signature, so the signature cannot prove JSON-only data. The current checker rejects `object`, and the adapter would leave this function in JavaScript. Call-site specializing it to a closed JSON record schema would be a feature change in the promotion system, not evidence for today's v1. No such change is made here.

Coverage is 576/576 at the app's pinned json-2-csv 5.5.0, including 266 dynamic-tier statements; doc-path and deeks are also reported static packages. A string-boundary JSON wrapper builds as a library. Its executable matches the Node CSV for the smoke fixture. Dynamic package compilation can easily be slower than V8, and one trivial fixture does not test every callback or option path.

A standalone slice runs without services. The full app needs auth, database, Redis and, for analytics, Tinybird; large link exports additionally use queue infrastructure. Vercel is a natural deployment target for this Next app but full reproduction is more work than a CSV endpoint. If CSV were 20–60% of export request CPU and achieved 1.3–3× including boundaries, request saving would be 5–40%. Traffic-weighted app saving will be much lower if exports are rare. Current unchanged-v1 saving for this function is zero.

## 3. Cal.com has expensive date work behind incompatible boundaries

The server availability path calls `buildDateRanges` and `subtract` at [packages/features/availability/lib/getUserAvailability.ts:511](https://github.com/calcom/cal.com/blob/f972feefa1376cf47631177231c671da9a9dd09f/packages/features/availability/lib/getUserAvailability.ts#L511) and line 648. The actual work includes [processWorkingHours](https://github.com/calcom/cal.com/blob/f972feefa1376cf47631177231c671da9a9dd09f/packages/features/schedules/lib/date-ranges.ts#L32), which iterates days, travel schedules, timezone conversions and DST corrections; `intersect` at line 354 and `subtract` at line 423 sort and scan ranges. The slot loop is [packages/features/schedules/lib/slots.ts:71](https://github.com/calcom/cal.com/blob/f972feefa1376cf47631177231c671da9a9dd09f/packages/features/schedules/lib/slots.ts#L71), with environment access at line 113, implicit current time via `dayjs.utc()` at line 123, and a reporting-wrapped default export at line 264.

A realistic team-month case might have 20 users × 22 working days × 32 quarter-hour starts, about 14,080 potential starts before filtering busy periods. That is an operation-count scenario, not a measured slot runtime. Timezone and calendar construction are likely more costly than the interval intersection itself. Our exact extracted `intersect`, on 22 ranges per user, takes 0.022/0.024/0.112 ms for 5/20/100 users. Accelerating only this helper would have little effect.

Dayjs and Date instances are not JSON boundary data. `processWorkingHours` also mutates the accumulator; `mergeOverlappingRanges` mutates its array and an element. The main slot builder uses current time and environment settings. Full date processing reaches @calcom/dayjs, its many plugins including timezone/UTC/minmax and a custom business-days plugin, plus availability and reporting helpers. An automatic JSON adapter cannot preserve these class boundaries without conversion and semantic work.

For a bounded compiler signal the extract contains exact `intersect` plus its DateRange type, using plain pinned Dayjs, not the entire slot engine. Its coverage is 200/208, 133 dynamic, and reports SC1090 for the probe's module namespace use, with package runtime fences SC1043, SC2001, SC1090, SC2003 and SC2020. Default exe build uses a Node island (SC8001). With `--node-islands=off`, the build fails with SC1090 on that module namespace call. The coverage report separately identifies Dayjs's constructor/prototype object model as an island reason. This is not a native-only library success. Full timezone plugins were not ported or compiled.

The intersection slice is DB-free. Full availability needs schedules, bookings, authentication and calendar integrations. Fixed busy-time fixtures could reproduce date calculation, but that is a manually isolated slice. Even if date processing represents 40–80% of a heavy scheduling request's CPU and could get 1.3–3×, the 9–53% scenario first requires changes to purity and date boundaries. Current v1 cannot claim it.

## 4. Umami's aggregate workload lives in SQL

[Pageview statistics](https://github.com/umami-software/umami/blob/559e3c607c23d2c72d9bd4f6481bda428255323c/src/queries/sql/pageviews/getPageviewStats.ts#L87) sums in SQL. The concrete JS ingestion core is [flattenJSON](https://github.com/umami-software/umami/blob/559e3c607c23d2c72d9bd4f6481bda428255323c/src/lib/data.ts#L11), reached at [src/queries/sql/events/saveEventData.ts:31](https://github.com/umami-software/umami/blob/559e3c607c23d2c72d9bd4f6481bda428255323c/src/queries/sql/events/saveEventData.ts#L31) before database insertion at line 46, and in ClickHouse ingestion at line 57. It recursively enumerates nested properties, classifies scalar types with DATETIME_REGEX, and serializes arrays.

The reachable closure is flattenJSON, its nested flatten, createKeyValue, getDataType, isValidDateValue, and two constants. It is synchronous and locally pure for ordinary JSON objects. Its `any` boundary and nested helper values do not satisfy the promotion contract. No date-fns is reached by this extract; the app's larger date module imports date-fns and date-fns-tz. `getStringValue` constructs Dates from inputs elsewhere in ingest, not in the flattened closure.

Measured flatten medians for 20/100/1,000 nested properties, each with two leaves, are 0.015/0.038/0.342 ms. The largest is a stress fixture, not assumed normal event metadata. Stock coverage says 34/34, one dynamic statement, and exe emission succeeds. The native smoke then throws `Uncaught TypeError: expected string at $, got object`. `isValidDateValue(value: string)` is called with an object through `any`; Node's typeof guard accepts that pattern while the compiled typed call checks its argument. This is direct evidence that coverage success cannot establish equivalent execution. Shadow verification would have to demote or fall back on that error.

A DB-free extraction is trivial. Full Umami is a comparatively approachable Next deployment with a seeded PostgreSQL database, but its analytics scale does not imply large per-request TS aggregation. Plausible flatten CPU share is only 1–5% of ingest, unmeasured, and accepted tiny string helpers are even less. This is a bad final proof even if its broad types were repaired.

## 5. Twenty has a large service graph and no verified hot eligible export

The real find-many request runner is [packages/twenty-server/src/engine/api/common/common-query-runners/common-find-many-query-runner.service.ts:63](https://github.com/twentyhq/twenty/blob/6a1f828c9f0a202216b398709c79b2228e679921/packages/twenty-server/src/engine/api/common/common-query-runners/common-find-many-query-runner.service.ts#L63). It builds ORM queries, fetches with `getRawAndEntities` at line 201, and processes records through a service at line 301. These methods are async and depend on Nest injection, TypeORM, metadata, permissions, relations and cursor state. Database aggregation is not a native TS opportunity.

The extracted [parseResult](https://github.com/twentyhq/twenty/blob/6a1f828c9f0a202216b398709c79b2228e679921/packages/twenty-server/src/engine/api/graphql/workspace-query-runner/utils/parse-result.util.ts#L27) recursively copies records, strips typename prefixes and reconstructs composite keys. Only recursion and tests referred to it in the sparse API tree inspected. A live request caller was **not established**. Its timing is a utility microbenchmark, not measured request work.

It reaches only the copied composite-prefix helpers and is synchronous and locally pure for plain JSON input, but uses any for both arguments and result. Existing checker rejection is decisive. Coverage is 32/32 with 13 dynamic statements and SC6101 warns about the hot any loop. The executable smoke matches Node. At 100/1,000 six-field records it takes 0.053/0.542 ms. Large exports could be worth future profiling, but this probe provides no such evidence.

The slice runs DB-free. Twenty itself is a Nest Node server rather than a Next request app, with PostgreSQL, Redis and service configuration. A faithful full Vercel deployment is a larger adaptation, and importing one utility into a Node Function proves little about Twenty. There is no defensible Amdahl share for this inactive-or-unverified helper. Rank below the apps with confirmed request call sites.

## 6. Formbricks' community helper is eligible but too small

The server's [response update](https://github.com/formbricks/formbricks/blob/fa289168d43699043e8e4016c3aa38bc3109f865/apps/web/lib/response/service.ts#L623) uses [calculateTtcTotal](https://github.com/formbricks/formbricks/blob/fa289168d43699043e8e4016c3aa38bc3109f865/apps/web/lib/response/utils.ts#L130) to total question timing buckets when finished. `TResponseTtc` is a Zod-inferred string-to-number record at packages/types/responses.ts:52–54. The extract substitutes that exact structural type and retains the function unchanged. It copies a record, reduces Object.values and writes `_total` in the copy. It has no runtime dependency, I/O, clock, randomness or caller mutation.

It passes the boundary checker and coverage is 5/5 with one dynamic statement from record operations. Exe builds and matches Node. Twenty and 100 questions cost 0.0007 and 0.0015 ms. This is below a useful native crossover even though it contains a loop and passes the work screen. Service ingestion and validation remain the meaningful surrounding CPU costs.

The tempting modern dashboard analytics path, [runChartQuery](https://github.com/formbricks/formbricks/blob/fa289168d43699043e8e4016c3aa38bc3109f865/apps/web/modules/ee/analysis/lib/run-chart-query.ts#L48), delegates queries to Cube and lives in the commercial enterprise directory. That is not an open-source TS aggregation target for this proof.

The TTC slice is DB-free; a full community deployment needs auth and PostgreSQL, with additional infrastructure for other product features. Estimated request CPU share is <1%, not profiled. Even 3× on TTC would save <0.67% before boundary costs, and actual effective speedup is likely below one. This is a useful decoy for automatic non-promotion, not a final performance demonstration.

## Reproduce and decide

Retained code and raw evidence are in [real-app-targets](real-app-targets/). `manifest.json` identifies upstream paths and modifications. Each candidate directory includes its upstream root license. Generated native archives, executables, compiler caches, clones, and node_modules are removed after research.

From the repository root, install only the small pinned slice dependency set with `npm ci --prefix research/real-app-targets --ignore-scripts --no-audit --no-fund`. Use the repo's stock scriptc 0.4.6 binary, or set `SCRIPTC` to its path. `python3 research/real-app-targets/run.py` runs coverage and static-only executable probes, top-two library builds, smoke comparisons, boundary checks, and Node measurements. It writes fresh evidence under `reproduced/` without overwriting these results. `bench.mjs` prints fixtures' hashes and timings. It does not deploy. Delete slice node_modules and generated .scriptc directories after use.

For the final proof, first run Papermark's unchanged `documentViewDistribution` on a shadow-verified N-API path with realistic full event records and measure crossover. Then instrument the existing authenticated endpoint's CPU, including request decoding, native input/output serialization, shadow samples, retries and queue fallbacks. Compare byte-identical whole HTTP response bodies. Keep realistic small requests in the mix and count retained JS fallbacks. Deploy the actual seeded app only after that local gate succeeds.

If Papermark loses, do not switch to a hand-written aggregate under a recognizable app name. A better target class is an app whose existing server endpoint exports a synchronous, typed JSON-to-JSON transform over thousands of records, with a high arithmetic-to-serialized-byte ratio, few dependencies, no date objects, and no database-side aggregation. Video interval statistics fit that shape better than CRUD dashboards, but native Map/Set allocation and full-record copying still decide the result.

Final cleanup left **8.3 GiB free**. Retained artifacts total less than **600 KiB**. All six clones, both temporary node_modules trees, native outputs and per-slice compiler caches were removed. The minimum observed free space was 8.2 GiB, above the 6 GiB floor. Compiler diagnostic text has trailing whitespace normalized. A second scripted validation run is retained under [raw/validation](real-app-targets/raw/validation/).
