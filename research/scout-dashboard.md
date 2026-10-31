# Dashboard aggregation scout

**Recommendation: strong candidate, already faster than Node and the tested
idiomatic Go implementations with unmodified scriptc 0.4.6.** At 200k events,
release native is **3.26× faster than Node / 3.29× faster than direct Go JSON v2
on this Mac**, and **3.75× / 4.12× on the Linux confirmation**. This is a large
stored-JSON revenue report, not a numerical microbenchmark. The defensible claim
names the standard-library Go implementations and this input distribution;
third-party/generated Go JSON parsers remain unmeasured.

## Method and fairness

- Harness: [examples/scout/dashboard](../examples/scout/dashboard/README.md).
  Node and native execute the identical `dashboard.ts` bytes. Its kernel is the
  existing `demo/lib/revenue.ts` body with input JSON passed as an argument, the
  async wrapper removed, and the aggregate timer split before sorting. The
  filter, Map key, accumulator updates, output property order and comparator
  are preserved. No workload code or adapter behavior changed.
- Fixtures come directly from the existing `revenueEventsJson` generator:
  31 days, 8 regions, deterministic positive integer prices/quantities, compact
  JSON, 5k / 50k / 200k events. Every benchmark queries the full month and has
  248 buckets. At 200k the export is approximately 14 MiB; generation and one
  file read happen before timing. Node/native retain a UTF-8-decoded string;
  Go retains the file's byte slice, as its stdlib APIs expect.
- Time covers parse, filter, grouping, summation, materialization and sort,
  through function return. Native's synchronous release of parsed records is
  included. JSON output serialization and byte comparison occur after each
  timer in every variant, preventing dead-code elimination. GC uses defaults;
  no forced collection. Deferred Node/Go GC can occur in subsequent calls;
  these are repeated-process steady-state measurements, not isolated allocation
  costs. No HTTP, IPC, Next rendering, process startup or input generation is
  included. The historical 48 ms native / 113 ms Node page numbers are a
  different boundary and are not reused as kernel results.
- Go uses typed `[]Event`, integer cents, `map[Key]*Daily` with a two-string
  struct key, and `slices.SortFunc`. It avoids TS's per-event concatenated key.
  No `map[string]any`, repeated reflection via user code, JSON intermediate
  transforms, HTTP proxy, debug compiler flags, or artificial sleeps. The
  standard typed baseline is `encoding/json.Unmarshal`. `go-stream` is the
  common typed `Decoder.More`/`Decode` memory-saving idiom; it is slower here.
  `go-v2` calls `encoding/json/v2.Unmarshal` directly, avoiding v1 compatibility
  behavior. All use the same accumulator and sorting code, with fresh events
  per query. No buffer/slice pool or third-party decoder was tested.
- The installed Go **1.27.3 already enables JSON v2 by default**. Verified from
  local `internal/buildcfg/exp.go` (`JSONv2: true`), `go list encoding/json`,
  and sampled `encoding/json/v2` stacks. `GOEXPERIMENT` and `GOFLAGS` are empty.
  Thus the baseline is not an artificially old Go JSON engine. Direct v2 has
  different malformed-input/duplicate-key semantics; parity claims here apply
  to the valid fixture domain.
- Mac: Apple M4 Pro, darwin/arm64, Node **24.22.0**, Go **1.27.3**, scriptc
  **0.4.6 --optimization release**. Ordinary `go build`; no PGO or ISA tuning.
  Shared host, no affinity, **indicative**. Each variant/size runs in a fresh
  process: **10 warmups + 40 samples**, sequentially; variant order rotates
  with size. Native binary is built once. No timed local runs overlap.
- Linux: Intel Xeon @ 2.90 GHz, linux/x64, Node **24.22.1**, same scriptc
  version/mode, **1 Sandbox vCPU / 2 GiB**, one visible CPU. Go is cross-built
  with the same 1.27.3 compiler (`GOOS=linux GOARCH=amd64 CGO_ENABLED=0`, default
  GOAMD64=v1). Each variant: **5 warmups + 30 samples** at 200k, then a separate
  30-sample phase profile. No deployment.
- Median/p95 use nearest rank (`ceil(p*N)-1`). RSS is external `/usr/bin/time`
  high-water RSS for the whole child process, including startup, warmup and
  all calls, excluding compiler/controller. Mac bytes and Linux KiB are
  normalized to MiB. This is not live heap or incremental per-request memory.

## Latency and peak RSS

Final five-way run; each cell is **median / p95 milliseconds**. These are whole
kernel times with phase profiling disabled.

| Platform / events | Node | Native | Go typed | Go streaming | Go direct v2 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Mac 5k | 1.249 / 1.498 | **0.399 / 0.412** | 1.544 / 1.872 | 1.911 / 2.037 | 1.237 / 1.374 |
| Mac 50k | 11.694 / 13.404 | **3.857 / 3.976** | 14.957 / 15.862 | 18.887 / 19.244 | 12.918 / 13.813 |
| Mac 200k | 49.786 / 54.363 | **15.251 / 15.655** | 59.598 / 62.470 | 78.087 / 79.443 | 50.233 / 52.979 |
| Linux 200k | 117.222 / 160.076 | **31.252 / 31.959** | 140.821 / 156.645 | 182.475 / 184.238 | 128.683 / 139.263 |

Ratios below are **native median / comparator median**, lower is better.

| Platform / events | Native / Node | Native / Go typed | Native / Go streaming | Native / Go direct v2 |
| --- | ---: | ---: | ---: | ---: |
| Mac 5k | 0.319 | 0.258 | 0.209 | 0.323 |
| Mac 50k | 0.330 | 0.258 | 0.204 | 0.299 |
| Mac 200k | 0.306 | 0.256 | 0.195 | 0.304 |
| Linux 200k | 0.267 | 0.222 | 0.171 | 0.243 |

Whole-process **peak RSS MiB**, same unprofiled runs:

| Platform / events | Node | Native | Go typed | Go streaming | Go direct v2 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Mac 5k | 95.16 | 3.44 | 11.11 | 10.83 | 10.98 |
| Mac 50k | 247.48 | 12.14 | 28.77 | 15.67 | 30.98 |
| Mac 200k | 453.47 | 40.98 | 89.77 | **37.47** | 86.59 |
| Linux 200k | 263.66 | 42.48 | 87.47 | **34.24** | 86.26 |

Native loses memory against streaming Go at 200k. Go direct v2 cuts typed Go
median by 16% on Mac and 9% on Linux; it does not close the native gap. The
separately retained initial four-way pass agrees in direction: Mac 200k native
15.567 / Node 48.739 / Go 60.644 / streaming 77.194 ms; Linux 30.828 / 117.168 /
146.948 / 181.684 ms. All initial results are retained; final tables use the
complete five-way follow-up, rather than selecting fastest rows across passes.

## Correctness and evidence

All measured iterations produce identical JSON within each process. All five
variants match **byte for byte** on all three Mac sizes and Linux 200k. Four
additional cases check a date subrange, zero matches, empty input, and reordered
events with escaped region strings and a repeated bucket: **35 five-way case
executions on Mac, 25 on Linux**. The final Mac/Linux 200k input/output hashes
match. Separately, original unmodified `demo/lib/revenue.ts` matches the output
hash for every size. The 200k report has 248 buckets and 200000 matched events.
Malformed JSON, arbitrary Unicode ordering and unsafe integer ranges are not
claimed as a cross-language semantic conformance suite.

- Final raw samples, phase samples, tool versions, code/input/output hashes and
  raw RSS output: [Mac](scout-dashboard-darwin-v2.json),
  [Linux](scout-dashboard-linux-v2.json).
- Initial pass: [Mac](scout-dashboard-darwin.json),
  [Linux](scout-dashboard-linux.json).
- Recomputed counts, percentiles, ratios, current source hashes, original-kernel
  parity and budget checks: [audit](scout-dashboard-audit.json).
- Source inspection uses local vendor revision
  `ade56e0c73f0e7db30d94e0c574e4eb4a54b0c82`; measured executables use published
  scriptc 0.4.6. The initial Go source predates adding direct v2 and a harness
  pprof-close-order fix; both final datasets hash the committed TS/Go sources.

## Profile: where time goes

Separate instrumented runs, 200k events. Independent medians are not additive
per-call traces. “Remainder” is outer elapsed minus the three inner phase
timers; native includes result construction and synchronous teardown there.

| Platform / variant | Parse ms | Group/filter ms | Materialize/sort ms | Remainder ms |
| --- | ---: | ---: | ---: | ---: |
| Mac Node | 25.281 | 23.103 | 0.027 | 0.002 |
| Mac native | 9.349 | 4.571 | 0.010 | 1.341 |
| Mac Go typed | 56.229 | 3.643 | 0.020 | <0.001 |
| Mac Go direct v2 | 47.558 | 3.653 | 0.020 | <0.001 |
| Linux Node | 59.140 | 60.353 | 0.085 | 0.006 |
| Linux native | 17.190 | 10.368 | 0.032 | 3.182 |
| Linux Go typed | 142.189 | 6.684 | 0.036 | <0.001 |
| Linux Go direct v2 | 131.459 | 6.685 | 0.036 | <0.001 |

Streaming interleaves parse/group and cannot assign separate parse cost:
78.059 ms Mac / 182.283 ms Linux for the combined phase. **Go grouping is
already faster than native**: approximately 3.65 vs 4.57 ms Mac and 6.69 vs
10.37 ms Linux. Native's overall win comes from decoding/materialization, not
superior integer arithmetic or sorting.

`sample PID 5 1` on an unprofiled native loop collected 3872 main-thread stacks:
[full sample](scout-dashboard-native-sample.txt).

- Typed JSON parsing: **2330/3872 = 60.2% inclusive** under
  `scr_json_parse_schema`. `scr_jschema_record` is the largest leaf; numeric
  grammar/value decoding (`scr_json_number_value`) and string scanning
  (`scr_json_plain_bytes`) are visible subcosts. This is not the generic dynamic
  JSON tree path. Emitted LLVM calls `sc_jp_0 → scr_json_parse_schema`, with
  a generic checked fallback only when the schema fast path declines.
- Map lookup/hash/equality: **at least 488/3872 = 12.6% inclusive** in the
  largest lookup branch, plus smaller call sites. The fresh concatenated keys
  have no cached hash and take `scr_map_entry_str_slow` even though all but the
  first 248 probes hit. Hashing the same 19-byte content repeats each event.
- Key concatenation/allocation: **314/3872 = 8.1% inclusive** in the principal
  `scr_str_concat_parts` branch. LLVM emits one three-part concatenation per
  matched event and releases it after accumulation. Parsed day/region strings
  and records also allocate; the small-object allocator already serves them,
  so “replace malloc” is not a sufficient diagnosis.
- End-of-call RC teardown: **327/3872 = 8.4% inclusive** in the principal
  `scr_rc_destroy → scr_arr_destroy` branch, releasing event records and their
  two strings. `scr_str_release` is also visible in per-event key cleanup.
  Not all RC work is captured by that one subtree.
- Sorting is below 0.1% by phase timers; only 248 buckets exist at all sizes.
  It is a poor optimization target for this fixture.

Node's V8 CPU profile leaves built-in parse/Map work mostly attributed to
`revenue`, so the split timers provide the useful attribution. The retained
[top profile frames](scout-dashboard-node-profile.json) attribute about 7.6%
of sampled time to GC, the bulk to `revenue`. Go CPU profiles show the
`encoding/json/jsontext` value/object/token readers, v2 struct decoding,
reflection and allocation, consistent with the parse-heavy wall phases:
[typed](scout-dashboard-go-pprof.txt), [direct v2](scout-dashboard-go-v2-pprof.txt).
The Mac process-wide Go profiles also attribute 38–44% to `runtime.madvise` and
include runtime wakeup/wait calls. Those background/runtime samples are not
precise per-query parse percentages. Raw [typed](scout-dashboard-go.pprof) and
[v2](scout-dashboard-go-v2.pprof) profiles are retained; Linux phase timings
independently support the decoding conclusion. Profilers ran separately from
reported timing/RSS runs.

## General compiler/runtime opportunities

These are hypotheses from profiles/source inspection, **not measured patches
or promised speedups**. No source in `vendor/scriptc` was changed.

| Priority | General change and evidence | Effort / semantic risk |
| --- | --- | --- |
| 1 | Fuse short concatenation with Map probing: hash/compare borrowed parts or a bounded stack probe, allocating a persistent key only on insertion. Current backend `backend/llvm/string-construction.ts` emits `scr_str_concat_parts`; runtime `scr_map.c` receives an uncached heap string and takes the general lookup. Benefits joins, grouping, counters and caches without recognizing dates/regions. | Roughly 3–7 engineering days for a narrow prototype, 1–2 weeks with regression coverage. Preserve UTF-16/WTF-8 equality, concatenation order, exceptions, insertion order and ownership. A stack string must never be retained by `Map.set`; explicit promotion/copy on escape is required. Existing `map-read-lifetimes.ts` and `map-entry-fusion.ts` are relevant proof infrastructure, not a complete implementation. |
| 2 | Improve typed JSON parsing/materialization. `scr_json.c:13700–14347` already implements a one-pass schema parser; `backend/llvm/dyn.ts:jsonParseHelper/jsonSchema` builds the schema and fallback. Generate straight-line readers for common record shapes, or extend short-name direct matching beyond eight bytes (`amountCents` currently misses it). Preserve fallback/error semantics. | Days for extending the key fast path; roughly 1–3 weeks for schema-specialized readers plus parity/error tests. Largest measured time pool (~60%), but returns cannot be predicted from this scout. Numeric parsing already has an exact short-decimal fast path; “avoid strtod” is not a new fix for these integer tokens. |
| 3 | Bounded per-parse interning of repeated short primitive string values could share the 31 day / 8 region values instead of allocating 400k strings. `scr_json_string_scr → scr_str_new` currently scans/copies/allocates; `scr_string.c` and `scr_rc.h` define ownership/immutability. Repeated categorical JSON is a general case. | Roughly 3–7 days for an experimental bounded cache, 1–2 weeks to establish wins across high-cardinality/Unicode inputs. Cache hashing may cost more than allocation on unique strings. Must retain shared values correctly and avoid unbounded process-lifetime intern tables. |
| 4 | General escape/region analysis for parsed typed arrays could bulk-release records/strings or avoid materializing nonescaping fields. The return keeps some day/region strings, so an unconditional arena rewind is incorrect. Emitted LLVM releases the parsed array on return; `scr_rc.h` explains typed ownership and the separate dynamic-region machinery. | Multiweek compiler/runtime work with ownership, aliasing and exception-unwind risk. Only ~8–10% here is the readily visible end-of-call teardown; do not expect a whole-program win by deleting RC operations blindly. |

Start with key probing or the short JSON-key fast path: both are narrower than
a new ownership model and useful beyond this workload. Parsing offers the
largest longer-term opportunity. Go's better aggregation phase is a useful
target even while native already wins the whole kernel.

## Story strength and limits

**Strong:** “Compile the same TypeScript monthly-revenue report to native and
process a 200k-event JSON export ~3–4× faster than Node 24 and the measured Go
standard-library implementations, with identical JSON output.” Native wins
median and p95 at every measured size, on both tested architectures, with no
compiler changes. This is realistic for reading stored JSON exports whose
materialization dominates a small dashboard result.

**Scope:** regular four-field ASCII records, low-cardinality grouping and valid
schema-conforming JSON favor scriptc's typed fast path. Richer event objects,
extra/reordered keys, arbitrary Unicode, higher-cardinality groups, third-party
Go decoders, predecoded input, multi-core queries, or buffer pooling could
change the result. Do not generalize this to “TypeScript beats Go” or reuse
these numbers as HTTP/page latency. One shared Mac plus two short Linux runs
does not establish production variance or a confidence interval.

## Sandbox lifecycle and budget

Credentials were copied only to ignored `.env.local`, never uploaded or
committed. Both one-vCPU nonpersistent Sandboxes stopped successfully:

| Run | Hard lifetime ms | Stopped elapsed ms | Conservative allocated vCPU-hours |
| --- | ---: | ---: | ---: |
| Initial four-way | 175000 | 69122 | 0.019201 |
| Five-way follow-up | 105000 | 80813 | 0.022448 |
| **Total** | — | **149935** | **0.041649 < 0.05** |

The follow-up was allocated only after the first Sandbox stopped; its 105000 ms
hard cap plus the first run's 69122 ms was below the remaining combined budget.
Platform active CPU totaled 129263 ms (0.035906 vCPU-hours), reported separately
from the conservative allocated bound. Full lifecycle records:
[initial](scout-dashboard-linux-provenance.json),
[follow-up](scout-dashboard-linux-v2-provenance.json). No deployment, merge,
push, compiler fork or upstream change was made.
