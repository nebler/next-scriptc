# E1: generated projected argument encoders

2026-11-02. E1 reduces argument encoding cost but does not make the development aggregation promote. Papermark remains held out. No Papermark code or fixture is executed.

At 60,000 records, median encoding falls from 89.19 to 31.40 ms locally and from 120.66 to 57.77 ms in the stand-in. Boundary-inclusive native process CPU falls from 103.91 to 52.39 ms locally and from 125.63 to 63.09 ms in the stand-in. JS aggregation costs about 0.17 and 0.20 ms respectively. AUTO correctly chooses `js-final` at every size. This fixture establishes a boundary improvement, not an application CPU saving.

## The generated writer retains projection checks

`promotion-input-encoder.mjs` generates functions from bounded opaque input layouts. `encodeArguments` caches them by trusted schema identity. The writer visits only projected fields and emits JSON text without building and revalidating an intermediate object graph. Array elements produce strings, which are joined into the final array text. Object writers emit literal keys and schema-specific scalar checks.

Generation happens once, lazily, through `new Function`. Native promotion already requires a Node native addon. Compiling lazily avoids generating unused encoders and keeps runtime artifact packaging unchanged. A CSP that disables string code generation falls back to the original checked walker. Edge hosts without native addons cannot use this lane. A subprocess test runs the fallback with `--disallow-code-generation-from-strings`. Build-time source artifacts could remove this fallback cost later; this change does not require permissive CSP settings.

Layouts over 256 visits or 32 levels also retain the walker. JSON boundaries that have only a `json` ABI tag and no proved projection layout retain the strict serializer. A TypeScript record type alone cannot authorize dropping extra runtime properties. Scalar and byte ABI lanes remain unchanged. Schemas are trusted, stable compiler metadata, not mutable application data.

Every projected object must have `Object.prototype` or null as its prototype. Every read field must have an own data descriptor. The writer never reads an accessor's value. Arrays must have exactly `Array.prototype`, no own symbols or extra properties, and an own data descriptor at every index. Reserved schema keys still reject. Typed scalars reject wrong types and non-finite numbers. JSON numbers canonicalize negative zero to zero. Direct f64 arguments retain negative zero. Strings use `JSON.stringify` for identical escaping and retain the existing well-formed UTF-16 check, including rejection of lone surrogates.

Projection deliberately ignores unread object properties, including getters and symbols, as the previous walker did. Projected non-enumerable data fields remain accepted because the old walker copied them into ordinary enumerable fields. Missing or present-undefined scalar fields reject. Undefined opaque values remain valid handles. H1 and H2 still capture references in schema traversal order and preserve returned identity. JSON emission orders integer keys first without changing handle capture order. Input text and the call handle table are captured before deferred work.

There is no sound hidden-class cache available through standard JavaScript. Equal prototypes and key lists do not prove equal property descriptors. An accessor can replace a data field on the next value or on the same object. Each read therefore retains `Object.getOwnPropertyDescriptor`. Batch descriptors would inspect all eight source fields where this fixture reads three; that alternative is not benchmarked here. Removing the second reflective validation pass and generic recursion provides the measured gain without weakening checks.

## Fixture and measurement limits

[fixture.ts](boundary-encoders/fixture.ts) creates the same shape class: arrays of 600, 6,000, or 60,000 ordinary records, eight scalar fields, three read scalar fields, a scalar scale argument, and an aggregate result. The result also retains one record to exercise read-and-pass identity. The native projection contains the three read fields and an original-reference handle. The fixture is intentionally cheap JS arithmetic. It does not reproduce PM2's compute workload or its stage ratios.

The host runs Node 26.13.0 on macOS arm64. The stand-in runs Node 24.22.2 on Linux arm64, cached `nsc-standin:node24`, one CPU, CPU affinity 11, 2 GiB memory and swap limit, and no network. Only task-owned `nsc-standin-e1` containers are created and removed. Host process and load snapshots are adjacent to the raw artifacts. No task build, test, or analysis overlaps measurement. Desktop services and unrelated containers remain active. No second agent runs.

Each size has ten warmups and sixty retained calls per encoder. Arm order reverses each round. Samples include validation, argument encoding, synchronous owner-thread native execution, and result decoding. Process CPU includes native owner CPU. Stage clocks measure elapsed time; summing stage medians is not a CPU decomposition. JSON byte lengths count UTF-16 code units, which equal UTF-8 bytes for this ASCII fixture. Correctness assertions and canonical comparisons run outside the reported end-to-end intervals.

Default dispatcher policy trains for 700 calls per size, with 63-second quota pauses. Each bucket verifies 26 shadows and selects JS locally and in the stand-in. There are no mismatches. Timing uses strict result validation in both record and column builds. Initial harness errors checked the original source instead of the lowered closure and mixed legacy and current handle tables. The final harness checks lowered metadata and uses each encoder's own table. These were harness defects, not runtime defects.

The first writer concatenated array strings into a large rope. Its complete raw samples remain in `local-rope.json.gz` and `container-rope.json.gz`. The final writer joins element strings. Both sessions are retained; they are not paired evidence of the join change's causal effect. In particular, the final container's large generated cell is slower than the first session. Background load, allocation, GC, and Node version limit cross-session conclusions. No confidence interval or hosted prediction is claimed.

## Results and the stringify alternative

All values below are medians in milliseconds. The validated-stringify control runs the old projection walker followed immediately by `JSON.stringify`, omitting the redundant generic serializer pass. The generated writer beats that control centrally in the final cells, but the 60k container difference is small and has no confidence interval. No claim of a universal fastest encoder follows.


local:

| Records | Encoder | Encode wall | Native decode wall | Total wall | Total CPU | JS CPU | JS result decode | Canonical |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 600 | legacy | 0.7744 | 0.0380 | 0.8442 | 0.8720 | 0.0030 | 0.0030 | 0.0035 |
| 600 | stringify | 0.2771 | 0.0380 | 0.3394 | 0.3445 | 0.0020 | 0.0028 | 0.0036 |
| 600 | generated | 0.2261 | 0.0380 | 0.2934 | 0.2995 | 0.0030 | 0.0028 | 0.0034 |
| 6000 | legacy | 7.5770 | 0.3880 | 8.0424 | 8.0585 | 0.0200 | 0.0060 | 0.0047 |
| 6000 | stringify | 2.8478 | 0.3845 | 3.3007 | 3.3090 | 0.0170 | 0.0041 | 0.0043 |
| 6000 | generated | 2.2950 | 0.3865 | 2.8183 | 2.8200 | 0.0170 | 0.0044 | 0.0042 |
| 60000 | legacy | 89.1851 | 3.8175 | 93.4970 | 103.9050 | 0.1680 | 0.0291 | 0.0142 |
| 60000 | stringify | 37.3482 | 3.7975 | 41.6362 | 53.8105 | 0.1645 | 0.0302 | 0.0177 |
| 60000 | generated | 31.4037 | 3.7985 | 36.1563 | 52.3870 | 0.1670 | 0.0299 | 0.0181 |

Column decode wall medians: 600: 0.0160 ms, 6000: 0.1430 ms, 60000: 1.3360 ms.

container-raw:

| Records | Encoder | Encode wall | Native decode wall | Total wall | Total CPU | JS CPU | JS result decode | Canonical |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 600 | legacy | 0.8531 | 0.0388 | 0.9415 | 0.9440 | 0.0030 | 0.0033 | 0.0044 |
| 600 | stringify | 0.3460 | 0.0388 | 0.4286 | 0.4315 | 0.0020 | 0.0030 | 0.0042 |
| 600 | generated | 0.3056 | 0.0387 | 0.3945 | 0.3970 | 0.0030 | 0.0032 | 0.0042 |
| 6000 | legacy | 8.8182 | 0.3893 | 9.3608 | 9.3640 | 0.0250 | 0.0066 | 0.0053 |
| 6000 | stringify | 3.7413 | 0.3870 | 4.2769 | 4.2785 | 0.0200 | 0.0055 | 0.0050 |
| 6000 | generated | 3.0274 | 0.3871 | 3.6242 | 3.6295 | 0.0190 | 0.0056 | 0.0051 |
| 60000 | legacy | 120.6554 | 3.9795 | 125.6372 | 125.6305 | 0.2085 | 0.0326 | 0.0160 |
| 60000 | stringify | 60.1353 | 3.9544 | 65.0855 | 65.0890 | 0.2050 | 0.0344 | 0.0217 |
| 60000 | generated | 57.7745 | 3.9561 | 63.0966 | 63.0935 | 0.2045 | 0.0313 | 0.0215 |

Column decode wall medians: 600: 0.0153 ms, 6000: 0.1416 ms, 60000: 1.3496 ms.

## Column JSON is a decode diagnostic

[columns.ts](boundary-encoders/columns.ts) uses typed arrays per field inside a JSON object. Stock scriptc's typed parse remains the decoder; no unchecked native parser is introduced. The known fixture supplies ordinary dense columns with equal lengths and finite scalars. Every column aggregate is compared with the reference sum and count. At 60k, payload size falls from 4,070,891 to 722,035 ASCII bytes. Native decode falls from 3.80 to 1.34 ms locally and from 3.96 to 1.35 ms in the container.

This is a lower-bound diagnostic. Column creation and serialization occur outside its measured native decode, and its result omits the selected-record identity. The record ABI carries an original-reference handle per row. Thus the comparison also removes handle tokens and repeated keys. It does not isolate parser layout alone or establish an end-to-end column win. A production column path needs validated equal-length construction, handle columns, and either reconstruction into the original record type or compiler support for column access. None is shipped. Decode is about 4 ms of the final 63 ms native CPU call, while JS itself costs 0.20 ms. This experiment does not justify replacing the byte-compatible record wire format.

Result decode and canonicalization are small: at 60k, the final generated container medians are 0.031 and 0.022 ms. The aggregation result has only two numbers and a one-element reference array. Result validation and decoding stay unchanged.

## Revenue gate and correctness

The unchanged D2/M3 revenue protocol runs strict and construction modes, 700 training calls per bucket, the default quotas, sixty steady samples, and the actual 600-call mixed stream. Strict AUTO selects JS at 1k and native at larger sizes. Construction AUTO selects native throughout. Both pass the amended calibration-band gate. Mixed inclusive process CPU is 5,829.921 ms JS, 2,695.269 ms strict AUTO, and 1,957.860 ms construction AUTO. Strict AUTO's largest median excess over the best fixed lane is 1.4%. Construction's is 0.5%. These observations do not establish a statistical equivalence interval. C1 remains a hosted-wall proxy, not calibrated Active CPU or billing evidence. [Full revenue tables](boundary-encoders/m3-tables.md) and [gate decisions](boundary-encoders/revenue-summary.json) retain the results. `summary.json` describes boundary stages.

The new seeded differential test compares legacy and generated argument bytes on 2,000 randomized cases. Cases cover getters, prototypes, holes, symbols, non-enumerable fields, reserved keys, missing and undefined fields, negative zero, non-finite numbers, control characters, Unicode, and lone surrogates. Additional cases cover integer-key order, handle capture order, snapshots, H1/H2, and the CSP fallback. The legacy reference also supplies the validated-stringify benchmark control.

Final Next validation passes 98 tests. Promotion passes 29 tests with two existing skips. The demo passes 24 tests. The final package logs use workspace links into this worktree; initial dependency links resolved some workspace imports to main and were corrected before the final rerun. Suite and fuzzer outcomes are retained in adjacent test logs. The Next suite includes the real-addon fuzzer with seed 20935, 680 inputs, 1,360 comparisons, and 17 candidates. Existing boundary-native tests exercise ordinary and instrumented addons. No new result-validation shortcut is enabled.

The first container completes fixture timing, then the copied revenue harness fails before timing because a Next package link points outside the container. Direct shared-core imports fix the harness. `container-initial.log` retains that failure. Revenue then runs separately. The final array-join fixture rerun follows afterward, with its own container lifecycle. No unrelated container is changed.

## Reproduction

Install dependencies in this worktree and point `SCRIPTC_COMPILER` to executable stock 0.4.6. Run `node research/boundary-encoders/build.mjs`. Build the unchanged revenue artifacts with `M3_ARTIFACTS=research/boundary-encoders/revenue-build.json node research/phase1/build-m3.mjs`. Run `node research/boundary-encoders/measure.mjs host research/boundary-encoders/local.json`, then `bash research/boundary-encoders/run-container.sh`. Do not overlap timing with builds or tests. `E1_FIXTURE_ONLY=1` and `E1_REVENUE_ONLY=1` select the separate reruns recorded here. Run `python3 research/boundary-encoders/analyze-revenue.py` before `python3 research/boundary-encoders/analyze.py`; both accept gzip raw inputs. The latter writes the boundary stage summary.

Artifacts above 256 KiB are compressed. Temporary dependencies and native build outputs are removed after validation. The main checkout, root README, scriptc fork, and `/Users/noah/scriptc` are untouched. There are no hosting calls, merges, or pushes. The work is committed locally.
