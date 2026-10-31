# Performance levers for next-scriptc

> Historical exploration. `vendor/scriptc/` source links require an optional,
> ignored compiler checkout and are unavailable in a fresh clone. Current
> publication results and their retained raw evidence are in the
> [research index](README.md).

**INDICATIVE ONLY — loaded shared Apple M4 Pro / macOS arm64, 2026-10-31. These measurements are not publishable performance claims.** Base HEAD: `42a2368537b08e050c08759e197a685e4483ba81`; installed scriptc **0.4.6**, Node **24.22.0**, Next **16.4.3**. No compiler/runtime changes, demo build, dependency install, commit, branch or index changes were made. Another agent changed the adapter concurrently; HTTP tests use a fixed [shim snapshot](../examples/probe/perf/shim/serve.ts), not that agent's moving implementation.

The useful outcome is selective: typed application compute can be competitive; arbitrary JS packages are not made fast by an optimization flag. Markdown is primarily a regex-engine problem. Search pays substantial dynamic-value, map and reference-count costs. Keeping `release` as the adapter default is justified; globally enabling `speed` is not.

## Ranked levers

| Rank | Lever / application | Expected gain and evidence | Workloads helped | Parity and risk |
| --- | --- | --- | --- | --- |
| 1 | Put hot application kernels in ordinary typed code, retaining exactly the same route file under Node. Use supported built-ins where suitable, after measuring each operation. | JSON parsing + typed aggregation was **2.60× faster** than Node; geo radius filtering **1.36×**; existing one-worker report **1.42×**. These are workload results, not measured before/after gains from adding annotations. Bulk SHA-256 lost badly. | Data processing, aggregation, geo; authenticated JWT verification already wins. | All exercised deterministic outputs match. Validate real external inputs identically under Node; a TS assertion alone is not validation. No native-only algorithm or reduced dataset. |
| 2 | Add an explicit static-body response path in the shim, retaining the streaming path for streaming routes. The probe uses `outgoing.end(new Uint8Array(await response.arrayBuffer()))`. | Hello server CPU fell from **51.6 to 38.7 µs/request**, about **25%**, in the ablation. This is a small-response CPU ceiling, not a 25% application throughput promise. | Hello, small JSON/text responses; negligible relative to 20 ms Markdown or 70+ ms scrypt. | Status, relevant headers and body match for hello. Unconditional buffering changes streaming, cancellation and memory behavior: **not a general replacement**. Only use when the response is known to be a bounded static body. |
| 3 | Offer explicit groups of cheap/trusted routes in one binary/server (`serveMany` prototype), keeping CPU-heavy routes in separate processes. | Six-route initialized summed RSS **86.09 → 67.83 MiB** (21% lower); idle **44.08 → 29.39 MiB** (33% lower). Startup did not improve, and loaded latency isolation was lost. | Many low-traffic routes with overlapping runtime/dependency code. | Tested bodies match, but process failure, blocking work, heap/GC, module state and environment now share a boundary. Markdown load raised grouped hello p50 to **20.61 ms**, versus **0.163 ms** with separate processes. Do not group the whole app by default. |
| 4 | Add `--strip` to production builds, retaining unstripped artifacts separately for profiling. | Markdown **4.860 → 4.513 MiB** (7.2% smaller); hello **1.802 → 1.680 MiB** (6.7% smaller). No demonstrated steady-state or startup win. | Deployment size for every route. | Markdown output matched; code optimization is preserved. Loses useful symbol/debug payload. Low behavior risk; do not claim a memory win from file-size reduction. |
| 5 | Make `--optimization speed` an opt-in, measured per route/kernel; retain `release` as default. | Alternating repeats: primes **4.191 → 3.641 ms** (13% lower); image histogram **0.539 → 0.421 ms** in candidate windows (22% lower). Markdown/search/JWT/report did not show a useful repeatable gain. | Some typed loops; primes is a synthetic control, not a headline application win. | Every mode/workload response matched. Executables grew roughly 2–3% in the original handlers. Larger code and build costs; results vary by workload and platform. |

The shim type warning is **not** a sixth proven gain: replacing the `Response | NextResponse` union with `Response` for the Web-only hello route removed checked-dynamic-slot warnings, but alternating CPU medians were **50.97 vs 50.32 µs/request** (1.3%, within noise). Keep this as a type/maintainability investigation, not a speed claim.

## Measurement protocol and retained evidence

The [probe runner and README](../examples/probe/perf/README.md) document reproduction. All raw commands, exit codes, full parity responses, repeated timings, sample reports and V8 profiles are in ignored `examples/probe/.artifacts/perf-levers/`. Primary files: `modes.json`, `recheck.json`, `candidates.json`, `http.json`, `typed.json`, `options.json`, `inputs.json`, `*-native.sample.txt`, and `*-node.cpuprofile`. They remain local artifacts, not committed evidence files.

Original demo handlers are imported directly by [six loop entries](../examples/probe/perf/run.py). Each call creates the same Request, invokes the real successful handler and drains its Response. Startup, search-index construction, report dataset/worker initialization and JWT fixture issuance are outside measured windows. Search uses all 3,000 products, `q=desk lamp`, `limit=7`; Markdown renders the full `reliable-webhooks` post; scrypt performs successful login at N=32768/r=8/p=1 and signs a JWT; verification validates a real signed token; primes uses limit 1,000,000; report uses the full 1,000,000 orders, twelve scenarios and sixty months with **one persistent worker in both runtimes**. No bcrypt shortcut was substituted: the existing cost-10 regression remains in the earlier benchmark.

Warmup/iterations per initial window: Markdown 30/80; search 150/400; scrypt 2/5; verify 150/1000; primes 40/100; report 1/2. There is also one untimed successful response before warmup. Three windows run in each process. Report parity compares its deterministic `result`; its elapsed time, RSS, Node version and sharing metadata intentionally differ. Other routes compare status, sorted headers and complete body. JWT clock is fixed identically with `DEMO_JWT_NOW=1800000000`.

Every optimization mode was built **three times** with `SCRIPTC_NO_CACHE=1`, `SCRIPTC_CHECKER_SERVER=0` and a probe-owned cache path. Build times are medians with installed precompiled runtime packs and warm filesystem/SDK caches; they are not cold installation times. `--no-keep-llvm` matches the adapter. RSS is the median process RSS after timed windows, not peak allocation, PSS or a leak test. Dev file sizes exclude the adjacent `.dSYM` directory. Report RSS includes its worker thread, but is strongly affected by host compression/residency and GC history.

The initial process-block timings varied dramatically while load changed. A second pass ran Node/release/speed in alternating order across **three fresh processes per variant**, each warmed in process. Those results below are preferred for steady-state comparisons. Whole-process `cpuSeconds` in repeat artifacts includes startup/setup/warmup and is **not** steady-state CPU/request. We do not divide it into a headline hot-loop metric. No affinity was available. The host load started near 30/26/28 and exceeded 47 on its one-minute average during the first matrix. Brackets are observed min/max, not confidence intervals.

## Compiler options: measured matrix

Initial three windows in one process; see alternating repeats immediately below before interpreting any mode speedup. Build seconds are medians of three uncached builds.

| Workload | Mode | ms/call median [min,max] | Binary MiB | Warm RSS MiB | Build seconds | Parity |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| markdown | release | 25.900 [22.708, 29.279] | 4.860 | 8.41 | 29.731 | match |
| markdown | speed | 65.362 [52.280, 74.728] | 4.968 | 8.34 | 32.944 | match |
| markdown | dev | 36.676 [34.691, 70.478] | 6.699 | 9.56 | 9.584 | match |
| search | release | 13.171 [11.866, 15.236] | 2.518 | 19.39 | 17.586 | match |
| search | speed | 3.143 [3.049, 3.387] | 2.549 | 23.97 | 8.889 | match |
| search | dev | 12.362 [11.875, 13.630] | 2.955 | 20.02 | 2.336 | match |
| login-scrypt | release | 92.985 [91.814, 104.614] | 3.172 | 36.58 | 6.354 | match |
| login-scrypt | speed | 83.024 [73.744, 97.358] | 3.239 | 36.72 | 5.951 | match |
| login-scrypt | dev | 345.593 [336.119, 353.048] | 4.143 | 37.23 | 2.458 | match |
| verify | release | 0.032 [0.028, 0.032] | 3.243 | 4.80 | 6.216 | match |
| verify | speed | 0.028 [0.028, 0.031] | 3.326 | 4.91 | 6.372 | match |
| verify | dev | 0.110 [0.109, 0.111] | 4.236 | 5.38 | 2.808 | match |
| primes | release | 4.988 [4.876, 11.027] | 1.526 | 5.77 | 0.693 | match |
| primes | speed | 6.046 [5.428, 8.395] | 1.552 | 5.78 | 0.813 | match |
| primes | dev | 19.234 [19.105, 19.412] | 1.785 | 5.86 | 0.745 | match |
| report | release | 1559.595 [1553.462, 1583.275] | 1.732 | 77.89 | 0.932 | match |
| report | speed | 1601.939 [1591.174, 1629.975] | 1.766 | 82.00 | 0.943 | match |
| report | dev | 9266.551 [8879.408, 11937.182] | 2.073 | 72.14 | 0.563 | match |

### Preferred alternating repeats

Each cell is the median [min,max] of three post-warmup windows from separate processes. Markdown uses 20 warmup/60 timed calls and search 100/400 in this pass; the other counts are as above. These windows measure the handler, not HTTP transport.

| Workload | Node ms/call | Native release ms/call | Native speed ms/call | Release / Node | Speed / release |
| --- | ---: | ---: | ---: | ---: | ---: |
| markdown | 0.520 [0.414, 0.530] | 21.486 [20.096, 23.502] | 21.549 [19.420, 24.243] | 41.30× | 1.00× |
| search | 0.683 [0.634, 0.692] | 2.374 [2.049, 2.403] | 2.474 [2.348, 2.488] | 3.48× | 1.04× |
| verify | 0.060 [0.054, 0.091] | 0.024 [0.022, 0.030] | 0.026 [0.023, 0.027] | 0.40× | 1.06× |
| primes | 3.588 [3.243, 3.655] | 4.191 [3.985, 4.205] | 3.641 [3.522, 3.747] | 1.17× | 0.87× |
| login-scrypt | 75.254 [69.842, 87.577] | 77.892 [68.655, 83.139] | 72.641 [70.458, 81.543] | 1.04× | 0.93× |
| report | 1918.167 [1618.518, 1952.316] | 1351.986 [1289.803, 1528.984] | 1504.118 [1293.275, 1513.519] | 0.70× | 1.11× |

`release` is -O2; `dev` is -O0 with source debugging and cached shards; `speed` is still -O2, adding runtime/RC inlining and size-for-speed runtime choices. There is no supported arbitrary LLVM `-O3`, LTO, allocator or inline-threshold flag. Release already performs cross-partition imports/inlining, so “turn on LTO” is not a missing universal adapter setting. See the local CLI (`../vendor/scriptc/docs/content/docs/cli.mdx`; local-only) and pipeline/partition documentation (`../vendor/scriptc/docs/content/docs/how-it-works.mdx`; local-only). Vendor docs describe main and can be ahead of installed 0.4.6; measured installed behavior takes precedence.

| Option / facility | Installed CLI experiment on this Mac | Recommendation / limitation |
| --- | --- | --- |
| `--optimization release` | All six handlers compiled and matched; baseline above. | Keep adapter default. |
| `--optimization speed` | All six matched; no general repeatable win; binary growth above. | Per-route/kernel opt-in after quiet-host repeats, not global. |
| `--optimization dev` | All six matched; substantially slower scrypt, report, primes and JWT. | Development/debugging only. |
| `--strip` | Builds/runs; Markdown parity matched. Size and cold results below. | Safe production size lever if symbol retention is handled separately. |
| `--tier static-only` | Search built and matched. Existing JS dynamic operations remain. | Diagnostic policy, **not** a switch to turn MiniSearch into typed code. Auto/static-only currently compile the same supported operations. |
| `--no-shape-overlay` | Documented disable switch; not performance-tested. Shape overlay is already enabled. | Do not disable default inferred package shapes as an optimization. |
| `--target-cpu native` | Refused: needs an x86-64 Linux/macOS build host. | Not an Apple M-series tuning option. |
| `--target-cpu x86-64-v3` | SC3002: requires an x86-64 target. | On x86, changes the minimum required ISA; do not ship build-host-specific code to arbitrary machines. No local speed measurement possible. |
| `--cpu-dispatch` | Tiny build accepted; x86 dispatch is gated off on arm64. | Linux/x86 follow-up: baseline + v3 copies trade binary size for portable dispatch. No measured gain here. |
| `--profile-generate <pattern>` / `--profile-use <profdata>` | Generation refused with SC3002: Linux executables only. | Genuine PGO is a Linux follow-up, not a measured local win. Train on representative requests and retain fallback/error paths. |
| `--static` | SC3002: Linux executables only. | Can remove dynamic-loader startup on Linux; glibc needs static libraries and refuses hostname/user/group lookup users. No Mac measurement. Musl targets are already static per docs. |
| `--large-pages` | Tiny build accepted; runtime implementation is Linux-only. | Not a Mac win. Linux startup/code-residency penalty makes it a poor default for these small cold-sensitive route binaries. |
| `--exceptions rare` | Tiny build accepted; unwind optimization applies on Linux. | No local gain established. Only consider where exceptions really are rare; throwing paths cost more. |
| `--lto`, `--allocator mimalloc`, `--inline` | All refused as unknown options. | No supported adapter switches of these names. Do not invent flags or substitute a patched runtime. |

The installed Markdown executable contains internal cycle-threshold environment names, but there is no supported CLI allocator selector. No collector was disabled and no GC/allocator threshold was increased for these measurements. The profiles do not justify doing so. `LifetimeRegion`, `InternTable`, `ThreadSlots` and `InlineArray` in experimental APIs (`../vendor/scriptc/docs/content/docs/experimental.mdx`; local-only) require specific application object contracts; they do not transparently optimize marked/MiniSearch. Regions are for generations of ProgramLifetime objects, interned values are immutable/long-lived, and inline arrays are constrained and platform dependent. No gain is claimed for these unmeasured APIs. Native object output is an ABI/linking facility (`../vendor/scriptc/docs/content/docs/native-objects.mdx`; local-only), not an optimization flag that removes the runtime.

## Where native time goes

Native profiles use `/usr/bin/sample <pid> 5 1 -file <path>` **after the entry prints WARM**, in long in-process loops. Node uses `node --cpu-prof --cpu-prof-dir=... --cpu-prof-name=... <entry.ts>` with a long loop (40,000 Markdown / 20,000 search calls after warmup). Node profiles cover the whole process; setup is a small minority, and no startup speed is inferred from them. The percentages below are sample shares, not precise CPU-cycle accounting. Native collapsed leaf tables suppress symbols below five samples; grouped shares from those tables are lower bounds and do not sum to 100%.

### Markdown / marked

Of **3,761 native main-thread samples**, **3,316 (88.2%)** ended in QuickJS `lre_exec`; **88 (2.3%)** in `scr_to_utf16`. Regex/input-conversion helpers together accounted for at least **91.0%** of collapsed leaves. String copying/building, dynamic release/disposal and cycle machinery were minor in comparison. The regex engine, rather than property dispatch or GC, dominates this workload. Removing all other overhead cannot close the roughly 41× warmed release/Node gap.

Node spent **63.1%** of sample time in regex frames, **4.3%** in marked `list`, **3.1%** in its private `#e` helper, **1.5%** in `inlineTokens`, and **1.4%** in `blockTokens`; GC was **0.85%**. Node and native execute the same parser workload, but the native regex implementation is the clear first bottleneck. This is not an embedded interpreter executing the whole JS package: package functions compile to native code and call scriptc's QuickJS-derived regex library.

`coverage --explain-dynamic` reports **924/924 statements compile**, with **600 dynamic-tier statements**. It names `list`, `blockTokens`, `lex`, `#e`, `emStrong`, `del` and many option/property helpers (`dynInvoke`, `%dyn.class.property`, `dynArrLit`). The mangled native frames include the corresponding `...blockTokens`, `...list` and private `...#e` names. Coverage confirms dynamic work exists; the profile shows it is not the principal cost here. No shim change, strip flag or tier policy changes the regex engine. Compiling package TS sources is not a demonstrated workaround: the [prior source experiment](../examples/probe/RESULTS.md#final-round-typescript-source-experiment--2026-10-31-local-indicative) refused both libraries.

### Search / MiniSearch

Of **3,695 native samples**, collapsed leaves include `calcBM25Score` **301 (8.1%)**, `scr_dyn_release` **263 (7.1%)**, `scr_map_find` **197 (5.3%)**, `scr_dyn_dispose` **148 (4.0%)**, `scr_typed_ref_forget` **114 (3.1%)**, and `scr_dyn_invoke_impl` **100 (2.7%)**. A conservative exclusive-name grouping of leaves gives at least **20.6% reference/disposal**, **18.0% maps and key comparisons**, **27.0% other dynamic-runtime operations**, and **3.1% cycle/trace machinery**. Generated BM25/term-results/recurse functions take much of the remainder. These categories are operational guides, not a complete causal decomposition; some collector work calls ordinary disposal helpers.

Node instead concentrates in `termResults` **49.0%**, `executeQuerySpec` **21.9%**, the result combinator **5.6%**, `search` **3.3%**, application GET **3.2%**, and `combineResults` **2.7%**. `calcBM25Score` is **1.6%**, GC **1.4%**, regex about **0.06%**. The search gap is consistent with dynamic value/property/method operations, map/key operations and ownership traffic, not a regex or primarily cycle-collection problem. Native JSON formatting/string building is present but not dominant.

Coverage reports **731/731 compiled statements, 301 dynamic-tier statements**, including `MiniSearch.search` (`dynObjLit`, index.js:1279), `executeQuerySpec` (`dyn.copyDataProperties`, :1578), `termResults` (`dyn.iteratorResult`, :1709), `calcBM25Score` (`%dyn.class.property`, :1920), and `SearchableMap` helpers. These names match hot native frames and the Node hot functions. The apparent “100% static” label does not mean typed machine operations. Its report-only Node-island suggestion is also not an actual fallback; the binary runs natively. Preserve this regression in later benchmarks. Typed application-side result mapping alone cannot remove library-owned dynamic score/index operations.

### Other measured routes

JWT verification is already fast in process (release about 24 µs versus Node 60 µs). Scrypt is dominated by real password derivation and remains near Node; the native callback implementation still blocks before callback deferral, unlike Node's async threadpool. Neither optimization posture changes that scheduling model. Report's typed million-order kernel wins in the repeated one-worker comparison; primes needs `speed` to approach the warmed V8 control here. These four were timed across modes, not separately sampled, so no invented per-function attribution is given for them.

## Shim and HTTP runtime cost

Sequential HTTP/1.1 keep-alive: one connection, 500 client warmups and three windows of 5,000 requests; the same agent/socket pool spans windows. All successful bodies and relevant response headers match. CPU comes from server-only `ps TIME` deltas (10 ms resolution), over 15,500 calls including the repeated client warmup; it excludes the load generator. These are direct native measurements, without Next proxying.

| Native variant | Server CPU µs/request | Mean latency ms, median of windows | p50 ms, median of windows | Warm RSS MiB |
| --- | ---: | ---: | ---: | ---: |
| http-bare | 23.23 | 0.065 | 0.061 | 2.30 |
| http-web | 30.97 | 0.073 | 0.068 | 3.08 |
| http-full | 51.61 | 0.089 | 0.083 | 3.42 |
| http-buffered | 38.71 | 0.083 | 0.077 | 3.39 |
| http-grouped | 44.52 | 0.087 | 0.079 | 30.14 |

The raw HTTP + equivalent tiny handler costs about **23.2 µs/request**; full adaptation costs **51.6 µs**. The **28.4 µs difference (55% of full CPU)** is an indicative adaptation/representation budget; raw HTTP plus its trivial handler is the remaining **45%**. This is an ablation estimate, not exact attribution: allocation, generated code and runtime paths interact. The Web-only Request/Response variant costs **31.0 µs**, placing basic Web packaging at about 7.7 µs above the raw floor. The full route/method/NextRequest/stream machinery adds another roughly 20.6 µs. Do not sum unrelated microbench timings into an exact per-request accounting.

The native hello sample has 4,022 main-thread samples: `poll` **1,499 (37.3%)**, `kevent` **698 (17.4%)**, `read` **346 (8.6%)** and `sendmsg` **212 (5.3%)**. Much of this sequential profile is waiting/syscall interaction with the client, not productive CPU. Active leaves include allocation/free, array ownership, `scr_url_new`, HTTP header parsing/building and dynamic response dispatch. This is why wall-stack percentages alone cannot identify a precise shim CPU fraction; the server CPU ablations are more useful.

Concrete shim options and upper-bound estimates:

| Change | Evidence / estimated hello CPU saving | Constraint |
| --- | --- | --- |
| Known bounded static response → `arrayBuffer()` then one `end()` | **~12.9 µs / 25%** observed. | Keep streaming/cancellation path; no unconditional materialization of unknown or large streams. The current snapshot already coalesces a closed stream's first chunk, so the remaining cost includes reader/microtask setup. |
| Lazy internal Web Request creation for transport-owned requests | Plain Request microbench **2.35 µs**, an approximate **4–5% ceiling**, not a demonstrated full-server saving. | Keep constructor validation, header snapshots, body/signal/clone semantics; use an internal incoming-request path rather than changing the public constructor blindly. |
| Reduce duplicate header representation/copy work | Raw-header → Headers microbench **1.80 µs**, about a **3–4% ceiling**. | Preserve repeated headers, case behavior, host override, Set-Cookie and mutation semantics. Header copying alone cannot explain the total shim budget. |
| Reuse/lazily construct URL where routing permits | URL + forwarded-query canonicalization microbench **2.23 µs**, about **4% ceiling**. | Match path/escape/dot-segment/query semantics. `NextRequest.nextUrl` is already lazy, so there is **no duplicate nextUrl parse on hello** to remove. |
| Remove the NextRequest wrapper object alone | Wrapper minus Request microbench only **0.21 µs**, under **0.5%**. | Cookies and nextUrl are already lazy. Low priority. |
| Simplify static route parameter matching | Representative static path split/decode/context microbench **0.19 µs**; expect a sub-microsecond opportunity, without a measured full-matcher saving. | Keep malformed escapes, trailing slash and dynamic/catch-all behavior. Low priority. |
| Specialize Web-only response types instead of `Response | NextResponse` | Alternating medians **50.97 vs 50.32 µs**, **no established gain**. | Typed probe removes four SC6104 warnings but supports only the exercised Web-response paths. Do not remove NextResponse compatibility globally. |

The microbench uses ten raw header strings / five headers including forwarded host/proto, and 10,000 operations per window after 1,000 warmups. Values are medians of three windows. Estimates are ceilings for the isolated operation and are not additive. Probe files are [components.ts](../examples/probe/perf/components.ts), [buffered shim](../examples/probe/perf/shim/buffered.ts), and [typed shim](../examples/probe/perf/shim/typed.ts).

## One server / several routes: memory, startup and isolation

The [serveMany prototype](../examples/probe/perf/shim/grouped.ts) dispatches by route pattern to the same snapshot request/response adaptation. It groups hello, search, Markdown, verify, login-scrypt and primes. This is six actual route modules, not six aliases of hello. Compare six simultaneous separate native processes with one grouped process; the Next frontend process is excluded in both. Separate processes start concurrently, matching adapter supervision. Three repeats alternate group/separate order. Each route receives one successful initialization request, including valid authentication and full-cost scrypt.

| Topology | Processes | All listeners ready ms | Initialize all routes after readiness ms | Idle summed RSS MiB | Initialized summed RSS MiB | Hello mean latency ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| separate | 6 | 330.072 [300.589, 330.601] | 107.468 [104.899, 147.654] | 44.078 [44.016, 44.625] | 86.094 [86.047, 86.484] | 0.084 [0.081, 0.087] |
| grouped | 1 | 367.029 [367.015, 446.177] | 133.300 [104.390, 230.766] | 29.391 [29.391, 29.938] | 67.828 [67.750, 67.828] | 0.140 [0.092, 0.179] |

All six route bodies matched across every topology repeat. Memory saves about **18.27 MiB initialized**, but summed RSS overcounts shared mappings; this is not a physical-memory/PSS reduction claim. The grouped binary eagerly initializes search before serving hello, so shared startup is not automatically faster. All-ready median was **367 vs 330 ms** and initializing every route cost **133 vs 107 ms** after readiness. These are process-cold, filesystem-warm startup measurements; no VM/serverless platform scheduling is included. The original architecture's eleven-process totals cannot be extrapolated linearly from this six-route subset.

After initializing every route, grouped hello mean latency median was **0.140 ms** versus **0.084 ms** separately; the grouped range was wide (0.092–0.179 ms). Before warming all handlers, the HTTP ablation showed essentially equal mean latency. Treat this as additional routing/shared-heap/history cost plus host noise, not a precisely isolated dispatch cost.

A bounded isolation check warmed continuous Markdown at one outstanding request, then measured three windows of 100 hello calls. Separate hello p50 medians across windows: **0.163 ms**, p95 **0.239 ms**. Grouped hello p50 **20.607 ms**, p95 **28.476 ms**. Same request work, and the heavy load is drained/terminated with its owned server afterward. This is direct evidence that synchronous parser work blocks the common event loop. It is not a p99 SLA experiment. Process isolation also separates crashes, restarts, module globals, memory pressure and environment configuration; grouping shares all of those. Separate groups or a bounded worker pool are safer future designs for CPU-heavy routes, but a worker-pool adapter was not implemented/measured here.

### Smaller binaries / startup options

| Binary | Unstripped MiB | Stripped MiB | Reduction | Stripped build seconds (one, cached where reusable) |
| --- | ---: | ---: | ---: | ---: |
| markdown | 4.860 | 4.513 | 7.2% | 25.011 |
| http-full | 1.802 | 1.680 | 6.7% | 0.614 |

`http-full` spawn-to-first-drained-hello, five fresh processes: **7.143 [6.783, 36.829] ms**.

`http-full-stripped` spawn-to-first-drained-hello, five fresh processes: **6.948 [6.380, 335.126] ms**.

The 7.14 vs 6.95 ms medians do not establish a startup win. First launches were outliers (including 335 ms for the new stripped binary); filesystem/code-signing/host state is not machine-cold controlled. Stripping reduced file size, not demonstrated working RSS. Runtime packs already select feature families; neither hand-linking native objects nor embedding one copy of each route runtime is an evidenced speed lever. Linux `--static` may help true loader cost, while `--large-pages` explicitly increases code residency/startup work and `--detached-exit` affects exit rather than cold start. These Linux behaviors were not benchmarked here.

## Common CPU candidates (wins and losses retained)

All five execute the **same [candidates.ts](../examples/probe/perf/candidates.ts) file** on Node/native, with 50 warmups, one full parity result and three windows of 200 requests. Each request returns/drains a Response; input fixtures are initialized once, output work is never cached. Release and speed outputs matched Node for all five. A ratio above 1 is a native loss. This is a quick exploratory set, not a selection of only native winners.

| Candidate / real use | Input/work per request | Node ms | Native release ms | Native speed ms | Release / Node | Assessment |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Bulk SHA-256 / upload integrity | 1 MiB Buffer, SHA-256 + hex digest | 0.550 | 4.847 | 4.080 | 8.81× | Clear native loss; builtin does not guarantee hardware/runtime parity. |
| Gzip data export | 5,000-row JSON; gzip level 6 + gunzip + SHA-256 validation | 2.645 | 2.817 | 2.663 | 1.07× | Near parity; includes decompression and validation, not pure gzip throughput. |
| JSON invoice/event aggregation | Parse 5,000 rows; sum integer cents × quantity into 8 regions | 1.017 | 0.392 | 0.387 | 0.39× | Strongest new typed-data candidate; same parse/reduction under Node. |
| Image analysis/preprocessing | 512×512 RGBA; integer Rec.601 luma + 256-bin histogram | 0.508 | 0.539 | 0.421 | 1.06× | Release near parity; speed helped. Not JPEG/PNG decoding or resizing. |
| Store radius / geo filtering | 20,000 coordinate pairs; Haversine radius filter and rounded distance sum | 0.737 | 0.540 | 0.557 | 0.73× | Moderate native win; uses typed arrays and Math functions. |

Observed ranges and warmed RSS (these candidates share the same initialized binary graph; do not interpret as per-library memory):

| Candidate | Node range ms / RSS MiB | Native release range ms / RSS MiB | Native speed range ms / RSS MiB |
| --- | ---: | ---: | ---: |
| hash | 0.548–0.555 / 92.52 | 4.207–4.907 / 5.80 | 3.911–4.866 / 5.86 |
| compression | 2.393–2.780 / 164.11 | 2.653–3.204 / 8.73 | 2.662–2.665 / 7.89 |
| aggregation | 1.014–1.018 / 104.86 | 0.388–0.393 / 6.36 | 0.385–0.393 / 6.38 |
| image | 0.499–0.519 / 93.86 | 0.505–0.546 / 5.88 | 0.419–0.421 / 5.95 |
| geo | 0.640–0.742 / 95.73 | 0.540–0.548 / 5.80 | 0.557–0.557 / 5.86 |

For compression, parity is semantic: the decompressed bytes' digest and input byte count match; different valid gzip encodings are allowed. The round trip is performed in every timed request on both sides. Geo rounds each accepted distance to metres before summing to avoid asserting bit-identical libm internals. No JS/WASM image package or native extension is substituted on one runtime. Report, JWT and scrypt above supplement these five candidates; bcrypt, marked, MiniSearch, SHA-256 and any future loser must remain visible in a credible CPU-heavy pitch.

## Exact commands / implementation hooks for the next round

From the workspace root:

```sh
# Production baseline; add --strip after arranging symbol retention.
packages/next-scriptc/node_modules/.bin/scriptc build ENTRY.ts -o BIN --optimization release --strip --no-keep-llvm

# Measured opt-in for a particular typed kernel, not an adapter-wide default.
packages/next-scriptc/node_modules/.bin/scriptc build ENTRY.ts -o BIN --optimization speed --no-keep-llvm

# Inspect why hot library code still uses dynamic operations.
packages/next-scriptc/node_modules/.bin/scriptc coverage examples/probe/perf/search.ts --explain-dynamic
packages/next-scriptc/node_modules/.bin/scriptc coverage examples/probe/perf/markdown.ts --explain-dynamic

# Reproduce the shared-file CPU candidates.
PROBE_NODE=/path/to/node24 python3 examples/probe/perf/candidates.py

# Reproduce the complete local research sequentially, with artifact-owned builds.
PROBE_NODE=/path/to/node24 python3 examples/probe/perf/run.py
PROBE_NODE=/path/to/node24 python3 examples/probe/perf/after.py
```

There is **no existing adapter flag** for grouping or known-static-body writes. Their concrete reviewable prototypes are [grouped.ts](../examples/probe/perf/shim/grouped.ts), [http-grouped.ts](../examples/probe/perf/http-grouped.ts) and [buffered.ts](../examples/probe/perf/shim/buffered.ts). The call shapes are `serveMany([{ module, pattern }, ...])` and the bounded-static response write shown in ranked lever 2. Port them into the adapter only with equivalent Node behavior and full HTTP/stream/cookie/method parity checks; this research did not edit the shared implementation.

On a Linux host, a separate PGO experiment would use real representative traffic, including errors and multiple routes if grouped:

```sh
scriptc build ENTRY.ts -o BIN-instrumented --optimization release --profile-generate 'profiles/%p.profraw' --no-keep-llvm
# Run representative requests; instrumented programs are not benchmark results.
scriptc merge-profiles -o app.profdata profiles/*.profraw
scriptc build ENTRY.ts -o BIN-pgo --optimization release --profile-use app.profdata --no-keep-llvm
```

No PGO, x86 ISA or allocator gain is credited without that platform's measurement. No caching, password-cost reduction, unauthorized/invalid-token shortcut, precomputed response, native-only route algorithm, Node JIT disablement or scriptc fork was used.

## Completion / limits

All 18 original handler/mode builds and executions passed parity; all ten candidate runtime/mode comparisons passed; stripped Markdown and static-only search matched; all topology responses matched. The typed shim and HTTP ablations are diagnostics, not production-ready general replacements. A startup probe initially mistook a closed listener's TIME_WAIT state for an occupied port; the socket precheck was corrected to use SO_REUSEADDR and the complete topology block was rerun. No active unrelated listener was killed. Initial failed probe typing (`Headers.entries`) was replaced by supported `Headers.forEach` before the reported measurements.

Every owned compiler, profiler, load generator and server process was stopped. The final audit checked the probe PID paths and ports 45173–45178 / 45273; no listener remained. Original measured demo route inputs remained unchanged; the other agent's shared-file edits were left untouched. The final one-minute host load is recorded with cleanup evidence in `completion.json`. Quiet, pinned Linux repeats and broader parity inputs are required before close ratios or new adapter defaults become public claims.

