# Non-strict applications and the next dependency project

2026-11-01. Stock scriptc 0.4.6, pinned K1 app checkouts. No compiler changes, deployment, Docker operation, or Papermark native timing.

The adapter can now consider a closure from an application with `strictNullChecks:false`. It checks the extracted source in an independent strict program and derives its boundary from that program. This removes the configuration veto without treating a non-strict caller's annotations as a runtime guarantee.

## The runtime argument proof

`strictClosureProgram` is shared with the construction proof: strict TypeScript, `noUncheckedIndexedAccess`, ESNext, and no implicit ambient types. Every diagnostic rejects the candidate. Missing imports, erased `any`, nullable inferred returns, and unchecked indexed reads cannot silently inherit the application checker's weaker interpretation. The checker sees the whole extracted closure, including reachable local helpers. Boundary metadata is copied back while original application offsets stay intact for the loader.

The generated build has its own strict tsconfig. Without that file stock scriptc finds Umami's enclosing configuration and rejects the build with SC0002. This configuration describes generated self-contained sources; it does not modify the application.

The two guards cover different inputs:

* Direct number, boolean, string, null, and byte arguments go through `encodeArguments` before the addon. `typeof` checks prevent null, undefined, objects, or wrong primitives from reaching C as coerced scalars. Numbers must also be finite; strings must be well formed. An encoding failure calls the original JavaScript with the original arguments.
* JSON arguments first pass descriptor-based strict serialization. Present undefined values, sparse arrays, non-JSON values, accessors, custom object prototypes, and cycles fail before native entry. Serialization preserves null. Scriptc's checked typed `JSON.parse`, inside the generated try/catch, rejects null or wrong primitives where the strict schema requires another type. The catch returns the fallback sentinel, and the dispatcher reruns this call in JavaScript.

A strict check alone does not establish the second point. Existing wrappers only catch exceptions for construction-proof candidates with a suitable result ABI. The new path therefore rejects JSON-input candidates without that proof, and rejects JSON-input functions returning boolean, null, or bytes until those result ABIs have a per-call exception sentinel. JSON, number, and string results have sentinels (empty output or NaN). A legitimate empty string can cause an extra fallback, which preserves its result. Strict-closure wrappers retain catch fallback even if an experimental caller requests `catchFallback:false`. Scalar-only candidates use the existing purity screen and host argument guards; a construction proof is not required to distinguish their input types.

This is deliberately conservative. Merely enabling all 14 strict-check candidates from the first diagnostic census would admit JSON-input functions whose exceptions poison an instance instead of producing the required per-call fallback. The final census uses the additional gate.

For non-strict caller values, the cases are exhaustive at the transport boundary:

| Caller value | Outcome |
| --- | --- |
| Null/undefined in a direct required scalar slot | Host rejects it; original JS sees it unchanged |
| Undefined anywhere in a present JSON field or array element | Serialization rejects it; original JS sees it unchanged |
| Missing required JSON field | Checked parse rejects it; original JS retains the missing field |
| Missing optional field | Strict type includes undefined; native receives absence as undefined, as in P3 |
| Null in a non-null JSON field/array element | Checked parse rejects it; original JS sees null |
| Null in a nullable field or direct null slot | Preserved; it is a value admitted by the strict type |
| Null/undefined in an extra field | Undefined fails serialization; null is preserved as extra JSON data under the existing structural-data contract |
| Wrong primitive | Direct slots fail the host check; schema positions fail checked parse |

There are no partial native effects to undo on the JSON path: it requires the whole-closure construction proof. Compiler correctness, standard unmodified builtins, and the existing JSON-data contract remain assumptions. This change does not newly claim object identity or signed-zero preservation across JSON transport. Default/destructured parameter lowering remains the P3 implementation; a supplied null is not replaced with a default.

The native integration test discovers functions through an actual non-strict app config. It checks strict inferred null results, strict-diagnostic rejection, direct scalar null/undefined/wrong-primitive fallback, nested JSON mismatches, nullable inputs, and continued native success. The permanent differential corpus adds a direct boolean and nested null/undefined/wrong-primitive injection. Every fuzz comparison is followed by a native-usability check.

## What the app checkpoint measures

The census uses K1's original source scopes and pinned commits. Dependency types remain a minimal installation, so unresolved types can conservatively suppress candidates. Counts are discovery acceptance, not compiler acceptance or app build success. The Umami profile executes the unchanged K1 persistence fixture; accepted CPU is assigned only to the actual reached functions. No newly accepted function is on that profiled path: `flattenJSON` and `getStoredStringValue` still fail independent closure, boundary, or effect gates. Consequently there is no newly accepted profiled function to compile or byte-check, and no recovered request CPU to report. This establishes a configuration improvement with no measured native speedup.

Final counts, shares, test totals, and reproduction commands follow below. Papermark receives census only in this step. Its code is not changed or used to select policy.

## Dependency evidence and its limits

[import-inventory.json](nonstrict-apps/import-inventory.json) lists runtime import declarations and example paths throughout the K1 server directories. Type-only imports, test/spec files, and modules beginning with `use client` are excluded. These are declaration counts. They are not execution frequencies or a complete Next server graph. shared unmarked hooks and UI modules can still appear. Workspace packages such as `@dub/utils`, `@dub/email`, and `@dub/ui` are not npm runtime dependencies; Node builtins are not npm packages. SWR, React, and Sonner mostly identify that shared-client contamination and are not compute targets here.

The [route supplement](nonstrict-apps/package-survey-route.json) and [initializer samples](nonstrict-apps/init-samples-route.json) cover JWT, Tinybird, QStash, and localhost detection. The survey combines the profiled endpoint closure with the most frequent external server imports. [package-survey.json](nonstrict-apps/package-survey.json) and [package-survey-extra.json](nonstrict-apps/package-survey-extra.json) retain published manifest fields, tarball integrity, versions, and sampled file hashes. [init-samples.json](nonstrict-apps/init-samples.json) , [K1 package samples](nonstrict-apps/init-samples-k1.json), and its [SDK supplement](nonstrict-apps/init-samples-extra.json) retain AST initializer kinds, without source text. `survey-method.mjs` reproduces the syntax inventory on unpacked tarballs. Samples establish a blocker, not whole-package certification. Version differences are explicit: date-fns 4.1.0 and uuid 14.0.2 are K1's executed dependencies; other samples use listed concrete versions from the pinned application manifests and lockfiles, including both Zod majors and both UA-parser generations. Manifest fields named `module` are evidence of an ESM build, not proof the P4 resolver selects it.

| Package / published specimen | Format | Actual sampled initialization; P4 consequence | CPU relevance |
| --- | --- | --- | --- |
| json-2-csv 5.5.0 → deeks 3.1.0 → doc-path 4.1.0 | CJS only | P4's hashed converter/util/constants files show exports assignments, getter re-exports, default objects/arrays and regexes. Needs CJS semantics **and** richer initialization/effect proofs | K1 Dub CSV inclusive 59–61%; this is the dominant measured npm compute |
| date-fns 4.1.0; 3.6.0 | Dual, import/require exports | Scalar/function leaves exist (`_lib/addLeadingZeros.mjs` in v3). `_lib/defaultOptions.mjs` holds mutable object state; barrels re-export; Date construction and globals remain separate body gates | Imported by Dub route but interval=all avoids its compute; Umami has 10 imports |
| date-fns-tz 3.2.0 | Dual | ESM utility leaves are functions, but full timezone closure includes Intl/Date and regex/cache machinery; entry re-exports also exceed P4 | Six Umami imports; unmeasured timezone/report work |
| uuid 14.0.2 | ESM only | dist-node entry selects Node crypto; package exports have a node condition P4 rejects. Randomness is an independent effect blocker | K1 Umami ~23% already-native UUID/crypto, not recoverable pure compute |
| punycode 2.3.1 | Dual (`main` CJS, `module` ESM) | `punycode.es6.js` has scalar consts but also regex constants and a default object export; P4 does not select `module` automatically | Imported in Umami formatting; not reached by the stored-value fixture |
| zod 3.25.76 / 4.3.5 / 4.6.2 | Dual | v3 `ZodError.js` has a call-initialized enum and class; `errors.js` has mutable error-map state. v4 builds likewise include classes/calls and re-export graphs. Richer frozen constants alone cannot certify it | Umami 111, Dub 212, Papermark 57 imports; parsing can matter, but K1 mocks it; no measured share |
| zod-openapi 5.4.6 | Dual | ESM `dist/index.mjs` has a mutable namespace object; relies on Zod, re-exports, generated component machinery | Dub 43 imports, mostly schema/OpenAPI generation; no request CPU measurement |
| next-safe-action 8.0.11 | ESM | `dist/errors-*.mjs`: object const, Set, call-initialized status enum; hooks/framework effects elsewhere | Dub action orchestration, seven imports; unprofiled |
| isbot 5.2.2 | Dual | `index.mjs`: pattern array, regex, mutable lazy pattern binding; even const-only relaxation is insufficient | Actual Umami send/record imports; matching may be useful CPU, omitted by K1 persistence profile |
| detect-browser 5.2.0 | Dual (`module`) | `es/index.js`: var bindings, class-like IIFEs, regex tables; no P4 admissibility | Umami detection, unprofiled |
| ua-parser-js 1.0.41 / 2.0.10 | CJS only v1; dual v2 | v1 IIFE/export object; v2 ESM wrapper plus regex tables/classes; bot-detection sample allocates objects with `new` | Browser/device detection in ingest; potential compute, no share measured |
| ipaddr.js 2.5.0 | CJS only | `lib/ipaddr.js` IIFE, prototype methods and range tables | Umami IP normalization/detection; no measured CPU share |
| maxmind 5.0.7 | CJS only | `lib/index.js`: TS import/re-export helpers, require calls, LRU dependency and file I/O | Umami GeoIP; warm lookups may be CPU, DB reading/cache effects need separation |
| bcryptjs 3.0.2 | Dual | ESM `index.js`: mutable random fallback, scheduling selection, large key arrays and call initializers | Password hashing is CPU-heavy on auth paths; not one of K1 endpoints |
| serialize-error 13.0.1 | ESM only | `index.js` creates property array and WeakSet; error-constructors creates Maps and calls globals | Umami error handling, three imports; low normal-path relevance |
| debug 4.4.3 | CJS only | `src/index.js` environment branch; common/browser/node export mutations and process state | Five Umami imports; logging side effects, not a pure target |
| cookie 0.7.2 | CJS only | `index.js`: export assignments, var regex constants, builtin property captures | Papermark six imports; small auth parsing, unprofiled |
| nanoid 5.0.1 | ESM only | `index.js`: mutable pool/offset and crypto dependency | ID generation; randomness and already-native crypto, not pure promotion |
| next-auth 4.24.13 | CJS only runtime (despite `module:index.js`) | Actual `index.js`/core use CommonJS exports/requires; auth/session/I/O effects remain | Papermark 179 / Dub 13 imports; mocked K1 auth, no measured compute attribution |
| jszip 3.10.1 | CJS only | `lib/index.js` export/function/prototype setup; default/support objects and compression dependencies | Dub ZIP export is a separate unprofiled path; CJS support alone cannot certify compression closure |
| @prisma/client 6.5.0 | Generated CJS client; ESM ancillary entry points | `default.js` delegates to generated `.prisma/client`; runtime/generator uses export helpers, classes and engine machinery | Papermark/Dub data access, mocked in K1; mostly outside pure target |
| @vercel/functions 3.5.1 | CJS runtime entry | addcachetag/cache samples contain generated exports, mutable caches and host APIs | Frequent Dub/Papermark orchestration imports; no Vercel service was contacted |
| @trigger.dev/sdk 4.5.10 | Dual | ESM import shims re-export; SDK graph includes classes, instrumentation and service calls | Papermark background jobs, 21 imports; outside measured video endpoint |
| @aws-sdk/client-s3 3.1053.0 | Dual (`module:dist-es`) | `dist-es/S3.js` allocates command/paginator/waiter objects, declares class, installs methods | Papermark file operations, 14 imports; mostly service glue, unprofiled |
| ai 7.0.107 | ESM only (`import` and `default` point to ESM) | ESM `dist/index.js` contains generated export helpers, Symbol/call initialization and provider/service machinery | Dub ten imports; model latency is not local promotable CPU |
| @chronark/zod-bird 0.3.10 | Dual (`module:dist/index.mjs`) | ESM entry creates Zod schemas with calls and a Tinybird class | Papermark video service client, mocked in K1; schema/network glue |
| jsonwebtoken 9.0.3 | CJS only | `index.js` exports a require-loaded object; sign/verify use crypto and option validators | Umami ingest token path, excluded from persistence profile; crypto already native |
| is-localhost-ip 3.0.1 | CJS only | `index.js` requires Node DNS/dgram/net, allocates range arrays and regex, exposes async lookup | Umami detection, omitted by K1; DNS and host effects require separation |
| @upstash/qstash 2.11.0 | Dual | ESM chunks have classes and call-initialized validation/configuration; importing ESM is insufficient | Dub export background branch and shared cron client, not exercised at <=1,000 rows |
| next (installed 16.4.3 specimen) | CJS server distribution | Framework adapter already rejects Next runtime imports; routing/response classes and host state require a different contract | Top server import by count; response work explicitly stays outside kernels |

No selected npm root has a certified P4 closure today. A few ESM leaves meet the initialization syntax, but that does not establish checked types, supported imports, or body-effect acceptance for the entry graph. There is no measured ESM-admissible npm CPU share in these K1 endpoints.

Papermark's profiled analytics computation is application-local; no npm compute kernel dominates it. Its session, Prisma, and Tinybird services are mocked in K1. Dub's CSV trio is the only measured npm region large enough to justify a linking project. Umami's measured npm cost is crypto, which is already native and effectful. Import counts cannot turn the remaining packages into measured request coverage.

## Recommendation

Choose **(3), richer ESM module-initialization proofs**, beginning with read-only object/array graphs and non-stateful regex constants, with escape/alias analysis. A const binding alone does not freeze its object. Reject global/sticky regex state, mutable caches, exported mutable aliases, getters, and callbacks that escape. Keep typed closure and compiler parity as separate gates.

This is a prerequisite shared by the ESM opportunities and the CJS CSV target. It also addresses application constants such as Umami's DATA_TYPE/FIELD_LENGTH/regex and Dub's formula-prefix Set (Set requires a further restricted read-only proof). It does **not** by itself recover either endpoint: Umami still has any/dictionary, Date, recursion and imported-type gates; Dub still has CJS, broad object boundaries, callbacks, and formatter effects. The defensible immediate coverage gain is therefore **zero demonstrated percentage points**; the optimistic remaining Umami flatten/store ceiling is roughly 60–61% of the mocked persistence CPU, shared with several unsolved gates. This is prioritization evidence, not a forecast of recovered CPU.

Option (1), upstream scriptc CommonJS library support, is the next linking project after those proofs if Dub remains the target. It reaches the measured 59–61% CSV region, but CJS support alone has zero proven recovery. P4's stock SC1010/SC0001 failures remain evidence of genuine compiler work. Correct export-object identity, getter re-exports, require ordering/cycles, caching, and monkey-patching behavior belong in a module semantics implementation.

Do not choose (2) as the next large project. The TS-emitted shape subset appears in deeks/doc-path and many service SDKs, but flattening those shapes does not prove stable export properties. A verified adapter linker must model substantially the same module semantics while still solving the object/regex proof and missing JavaScript types. It offers no demonstrated incremental endpoint coverage over (1) and duplicates a broadly useful upstream facility. Neither CJS alternative makes UUID, auth, logging, databases, or network SDKs pure.

## Final checkpoint

The final census accepts **Umami 4, Dub 32, Papermark 23**. The four Umami functions are `isApiKeyBlockedPath`, `hex6`, `getColor`, and `stringToColor`; all have direct scalar inputs. This is a conservative increase from zero, outside K1's measured path. The strict-null counterfactual is retained only as a diagnostic; it is not the policy used for Umami.

| Umami fixture | Accepted share | Flatten inclusive | Stored-string inclusive | Remaining map/query | UUID/crypto | Other/GC |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 20 properties / 100 leaves | 0% | 26.8% | 27.7% | 12.3% | 25.9% | 7.4% |
| 100 properties / 500 leaves | 0% | 27.4% | 27.8% | 13.4% | 26.4% | 5.1% |

Shares are three-round means of unweighted active V8 samples, using K1's 500 μs interval and >=500 ms process CPU per round. Fixture row counts pass. This run used Node 24.22.0 on the loaded host, with the census or adapter tests as the second job. These shares establish no gain and are not whole-HTTP or whole-app CPU. Only Umami rows are retained in the new profile artifact; the runner's inherited K1 rows were removed. Papermark and Dub were not profiled anew.

Validation passes the full adapter suite, **85 tests**, followed by eight focused discovery/closure tests after the final resolver and string-result cases. The seed 20935 long fuzzer passes **320,000 inputs / 640,000 comparisons** across 16 candidates, with 1,056,502 native successes and 223,498 fallbacks including follow-up usability calls. Both construction-result settings are exercised. [fuzz-20935.json](nonstrict-apps/fuzz-20935.json) retains the counters. Initial local runs exposed the enclosing tsconfig issue and missing temporary scriptc links; those setup/code failures were corrected before the final passes.

Reproduce from the repository with Node 24.22.0 and temporary dependency links from `/Users/noah/code/next-scriptc`. Set `SCRIPTC_COMPILER` to that checkout's installed scriptc 0.4.6 executable.

```sh
node research/coverage-baseline/setup.mjs
node --test --test-concurrency=1 packages/next-scriptc/test/*.mjs
PROMOTION_FUZZ_CASES=20000 PROMOTION_FUZZ_SEED=20935 node scripts/promotion-fuzz.mjs
COVERAGE_OUTPUT=../nonstrict-apps node research/coverage-baseline/census.mjs
RUN_APPS=umami COVERAGE_OUTPUT=../nonstrict-apps node research/coverage-baseline/profile.mjs
node research/coverage-baseline/setup.mjs --cleanup
```

`node research/nonstrict-apps/import-inventory.cjs` regenerates the import counts. The selected-run profiler merges inherited K1 rows. Retain only `umami-*` results for this checkpoint. The committed census omits verbose rejection logs and retains aggregate reasons and accepted candidates. To repeat package inspection, use `npm pack <name>@<version> --ignore-scripts` in a temporary directory, extract each archive into a numbered folder's `package/`, then run `node research/nonstrict-apps/survey-method.mjs <temporary-parent>`. Versions and tarball integrity are in the manifest artifacts. Delete the extracted packages afterward. No full application installation is needed.

The optional Node 24 shim checks also pass: executable IPC and HTTP parity, including 113 parity requests. HTTP parity needed one retry after its existing owner/child stdout-order race at `parity.mjs:475`; the retry passed without code changes. All operations stayed local. At most two task jobs ran together. Temporary package extractions, native test outputs, and dependency links were removed. Free disk was about 10 GiB at cleanup, down from 16 GiB at setup on the shared host. The task-owned package extractions and native builds were removed. No third-party source or root README is part of the commit.
