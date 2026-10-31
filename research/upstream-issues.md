# scriptc 0.4.6 upstream issue drafts

**Drafts only; no issues have been filed.** These reports preserve losses and compiler refusals. They use existing performance evidence plus fresh compilation/coverage checks, not new Round 2 speed measurements. All performance comparisons execute identical application code and inputs with normal Node JIT and scriptc release defaults. A reduced repro is a diagnostic starting point; **the historical numbers below belong to the stated full workload, not to an unmeasured reduced file**.

Evidence environments:

- **Linux round 1:** [report](benchmarks/sandbox-2026-10-31T00-39-05.856Z.md), adjacent JSON/provenance, implementation `4ddbf17bc7aff5080a6043bf33b150e286975e42`; Node 24.22.1, scriptc 0.4.6, Next 16.4.3, Linux x64 Intel Xeon @ 2.90 GHz, four logical CPUs. Application CPUs 0/1, generator/controller 2/3; start load 2.19/0.80/0.29, end 1.77/1.43/0.95. Two steady repetitions, C=1/8/64, 1 s warmup/windows; bcrypt separately bounded to three measured successful requests, C=1. This file is on `main` after the `adc6ff5` worktree base; read with `git show main:research/benchmarks/sandbox-2026-10-31T00-39-05.856Z.md` before integration.
- **Mac exploration:** [perf-levers.md](perf-levers.md), Node 24.22.0, scriptc 0.4.6, Next 16.4.3, Apple M4 Pro, macOS arm64; heavily loaded shared host, no affinity. Preferred alternating medians use three fresh processes per variant, warmed in process. Sample shares are profiler observations, not precise cycle accounting. Raw profiles are local ignored artifacts; attach those before filing, rather than implying they are committed public evidence.
- **Earlier compiler/source experiments:** [RESULTS.md](../examples/probe/RESULTS.md) and committed [source-experiment-results.json](../examples/probe/source-experiment-results.json); same Node/scriptc/Next versions as Mac exploration. The original API probe is dated 2026-10-30; source experiments 2026-10-31.

## Common repro commands

From the repo root after `pnpm install`, use Node 24. Each performance repro prints its full deterministic result before a timed loop; compare that result separately from timing lines. Builds/runs should be sequential on a quiet host. Change `REPRO_COUNT` only identically across runtimes. Do not run the full matrix on this loaded development host for public claims.

```sh
mkdir -p examples/probe/.artifacts/upstream
# Substitute marked-regex, sha256-bulk, bcrypt-dynamic or minisearch-costs.
name=sha256-bulk
SCRIPTC_CHECKER_SERVER=0 packages/next-scriptc/node_modules/.bin/scriptc build \
  "examples/probe/repros/$name.ts" --optimization release --node-islands=off \
  --no-keep-llvm -o "examples/probe/.artifacts/upstream/$name"
node "examples/probe/repros/$name.ts"
"examples/probe/.artifacts/upstream/$name"
SCRIPTC_CHECKER_SERVER=0 packages/next-scriptc/node_modules/.bin/scriptc coverage \
  "examples/probe/repros/$name.ts" --node-islands=off --explain-dynamic
```

These wrappers are ≤30 lines and reuse committed fixtures/handlers where shrinking the fixture would remove the observed behavior. The wrapper timings are not identical to the HTTP benchmark. No adapter or runtime fork is required.

## A. marked: QuickJS regex execution dominates a 24–36× route latency gap

**Proposed title:** `marked 18.1.2: lre_exec accounts for 88.2% of native samples; 24–36× slower full-article route than Node`

**Minimal repro:** [marked-regex.ts](../examples/probe/repros/marked-regex.ts), 18 lines, invokes the unchanged article handler with the full `reliable-webhooks` fixture (tables, fenced code, lists, links and Unicode). Setup and fixture generation are outside the loop; rendering and Response draining occur on every call. Keeping the actual article avoids claiming that an arbitrary tiny regex reproduces the same gap. For the original alternating loop use `examples/probe/perf/markdown.ts` with 20 warmups and 60 calls per window.

**Observed numbers:** Linux C=1 direct Node **0.637 ms**, native **23.057 ms** (**36.195×** native/Node); production Next Node **1.019 ms**, native **24.705 ms** (**24.240×**). Same successful 11,074-byte HTML response. Mac alternating in-process release Node **0.520 ms** [0.414, 0.530], native **21.486 ms** [20.096, 23.502] (**41.30×**); speed **21.549 ms** [19.420, 24.243]. These are different experiments/scopes, not pooled samples.

**Profile/coverage:** Mac native main thread: **3,316/3,761 samples (88.2%)** in QuickJS `lre_exec`, **88 (2.3%)** in `scr_to_utf16`; regex/input helpers at least **91.0%** of collapsed leaf samples. Node profile: **63.1%** regex frames; GC **0.85%**. Probe coverage: **924/924 statements compiled**, **600 dynamic-tier**. Package functions compile to native code and call the QuickJS-derived regex library; this is not evidence of whole-package interpretation.

**Expected:** same HTML, with regex-heavy parsing competitive enough for uncached route rendering, or documented engine limitations with an actionable diagnostic.

**Actual:** output parity succeeds, but native rendering is substantially slower. Release-to-speed did not improve this workload in the alternating sample.

**What the evidence suggests:** prioritize regex execution and input conversion for investigation. The sample distribution makes property dispatch/GC a secondary target for this workload. It does not identify a specific regex opcode, prove a general regex slowdown, or establish that a replacement engine would preserve semantics. Attach the sampled stacks and Node cpuprofile before filing.

## B. Bulk SHA-256: 1 MiB input takes 8.81× Node time

**Proposed title:** `crypto.createHash('sha256') on a 1 MiB Buffer is 8.81× slower than Node 24`

**Minimal repro:** [sha256-bulk.ts](../examples/probe/repros/sha256-bulk.ts), 14 lines; deterministic 1 MiB Buffer, one `update`, hex `digest`. No I/O or random generation in the timed loop. Original measured program: [candidates.ts](../examples/probe/perf/candidates.ts), `PERF_CANDIDATE=hash PERF_COUNT=200`; it additionally creates/drains a JSON Response. Both runtimes use exactly that file.

**Observed numbers (Mac exploration only):** Node **0.550 ms/call** [0.548, 0.555]; native release **4.847 ms** [4.207, 4.907], **8.81×**; native speed **4.080 ms** [3.911, 4.866]. 50 warmups, three windows of 200 calls in one process. Digest and byte count match in all variants. **No Linux SHA-256 measurement yet.** Node's implementation uses OpenSSL; this report has no profile of the native hashing implementation.

**Expected:** matching SHA-256 and throughput reasonably comparable to Node's built-in hashing for upload-integrity use.

**Actual:** correct digest, substantial bulk-hashing loss even with speed optimization.

**What the evidence suggests:** investigate the native SHA-256 implementation and bulk update path. These timings alone do not establish missing hardware acceleration, excessive copying, or a particular backend. Retain the loss in the Round 2 upload route and repeat on pinned Linux before a platform-wide claim.

## C. bcryptjs: dynamic-tier hot kernel and 118× successful-login regression

**Proposed title:** `bcryptjs 3.0.3 cost-10 verification: dynamic _encipher kernel; native login 118× Node on Linux`

**Minimal repro:** [bcrypt-dynamic.ts](../examples/probe/repros/bcrypt-dynamic.ts), 10 lines; verify the same stored cost-10 hash with the correct password. This isolates verification; the measured HTTP route additionally normalizes credentials and signs a JWT. Never lower the cost or substitute an invalid-input shortcut. The repro uses one initial successful call and three timed calls, matching the workload's bounded philosophy rather than a long loop.

**Observed numbers (Linux round 1):** direct successful login Node **79.578 ms**, native **9,419.601 ms**, **118.370×**; production Node **80.981 ms**, native **9,409.139 ms**, **116.189×**. Direct process CPU/request **80.000 ms** Node vs **9,416.667 ms** native; production **83.333 vs 9,390.000 ms**. N=3 measured requests per surface; p99 is only the maximum of three. Full JWT responses match. No production timeout occurred in this retained run.

**Kernel evidence:** bcryptjs authors label `_encipher` their bottleneck, attributing **1714/1905 ticks / 90%** to it in a source comment ([pinned upstream 3.0.3 source](https://github.com/dcodeIO/bcrypt.js/blob/v3.0.3/index.js#L738-L739)). This is **their historical profile**, not a new scriptc profile. `_encipher` works on untyped JS array/value operations, and `coverage --explain-dynamic` identifies dynamic operations in this function. A fresh Round 2 reduced-repro coverage check reports **427/427 compiled statements**, **199 dynamic-tier**, and explicitly lists `_encipher` at `index.js:738:1` with `%dyn.class.computed` at `index.js:741:9`. The Linux complete login entry has **2,111 statements**, **98% compile-statically**, **429 dynamic-tier statements**; these totals include jose, application and shim work, not just bcrypt.

**Expected:** correct cost-10 verification, with compilation of an ordinary JS CPU kernel avoiding a two-order-of-magnitude regression, or explicit documentation of dynamic-tier performance limitations.

**Actual:** byte-correct successful login but roughly 9.4 s of native CPU, versus about 80 ms Node. Package mode `static` does not mean that its arithmetic/array accesses are typed machine operations.

**What the evidence suggests:** use `_encipher` and its array/bitwise operations as a focused dynamic-tier optimization case. The authored hotspot comment plus coverage directs investigation; neither establishes scriptc's native hot-path sample percentage. Do not attribute a measured 90% of scriptc time to `_encipher`, claim a missing interpreter JIT, or infer that adding annotations alone fixes it. Function-level coverage was checked in this round; attach native sampling before filing a stronger causal claim.

## D. MiniSearch: reference/disposal and map/key work in retained-index queries

**Proposed title:** `MiniSearch 7.2.0 retained-index search: 3–3.7× Node latency with substantial ownership/map runtime samples`

**Minimal repro:** [minisearch-costs.ts](../examples/probe/repros/minisearch-costs.ts), 16 lines, queries the unchanged 3,000-product index (`desk lamp`, limit 7). Index construction occurs once before the loop; each call executes search/ranking and response mapping. Application metadata comes from a typed catalog map on both runtimes. Original alternating loop: `examples/probe/perf/search.ts`, 100 warmups/400 calls.

**Observed numbers:** Linux direct C=1 Node **0.797 ms**, native **2.956 ms**, **3.708×**; production Node **1.149 ms**, native **3.450 ms**, **3.004×**. Mac alternating in-process Node **0.683 ms** [0.634, 0.692], native release **2.374 ms** [2.049, 2.403], **3.48×**; speed **2.474 ms** [2.348, 2.488]. Full query responses match.

**Mac profile:** **3,695 samples**; leaves include `calcBM25Score` **301 (8.1%)**, `scr_dyn_release` **263 (7.1%)**, `scr_map_find` **197 (5.3%)**, `scr_dyn_dispose` **148 (4.0%)**, `scr_typed_ref_forget` **114 (3.1%)**, `scr_dyn_invoke_impl` **100 (2.7%)**. Conservative exclusive-name grouping: at least **20.6% reference/disposal**, **18.0% maps/key comparisons**, **27.0% other dynamic-runtime operations**, **3.1% cycle/trace**. These groups are incomplete lower bounds, not a causal allocation of all time. Node: `termResults` **49.0%**, `executeQuerySpec` **21.9%**, `calcBM25Score` **1.6%**, GC **1.4%**, regex about **0.06%**.

**Coverage:** Mac probe **731/731 statements compiled**, **301 dynamic-tier**; dynamic explanations name `search`, `executeQuerySpec`, `termResults`, `calcBM25Score` and SearchableMap helpers. Linux HTTP entry **1,050 statements**, **97%**, **347 dynamic-tier**; graph counts differ because the shim is included.

**Expected:** correct retained-index search with competitive query latency and useful ownership/map optimization guidance.

**Actual:** correct results but consistent native loss; release/speed did not show a useful improvement in the alternating experiment.

**What the evidence suggests:** investigate dynamic scoring/result objects, maps/key comparisons and reference/disposal traffic together. The evidence does not justify blaming regex or primarily cycle collection, disabling collection, or claiming a leak. Typed application result mapping cannot eliminate library-owned work. Attach profiles/coverage with the report; do not conflate sample share with an optimization's achievable gain.

## E1. next/server: SC3004 at entry 1:1 for a four-line Web API wrapper

**Proposed title:** `next/server 16.4.3 NextRequest/NextResponse repro fails with SC3004 attributed to entry 1:1`

**Minimal repro:** existing [next-request.ts](../examples/probe/repros/next-request.ts):

```ts
import { NextRequest, NextResponse } from "next/server";
const request = new NextRequest("http://probe.test/?preview=1");
console.log(NextResponse.json({ preview: request.nextUrl.searchParams.get("preview") }).status);
```

```sh
SCRIPTC_CHECKER_SERVER=0 packages/next-scriptc/node_modules/.bin/scriptc build \
  examples/probe/repros/next-request.ts --no-keep-llvm \
  -o examples/probe/.artifacts/upstream/next-request
node examples/probe/repros/next-request.ts
```

**Environment/outcome:** Mac compiler probe, Node **24.22.0**, scriptc **0.4.6**, Next **16.4.3**, `@types/node` **24.19.2**. Node exits **0**, prints **200**. Native build exits **1**; no executable/timing. The full next-server route's coverage also exits **1** without a report. Exact build diagnostic:

```text
error SC3004: undefined is not representable in the target union (a value narrowed or asserted past it still held it)
```

The full entry reports this at **1:1**. The reduced repro reproduces the same message; do not invent a more precise source location. See RESULTS.md for retained original stderr.

**Expected:** compile this small supported wrapper or report a source-specific unsupported Next/API/type constraint.

**Actual:** native helper code-generation failure with poor attribution, before execution.

**What the evidence suggests:** inspect undefined-field/union lowering and attribution. The diagnostic registry labels SC3004 a native helper generation failure, but it does not identify the offending Next field. A local Web-only shim compiles/matches; that does not establish full Next compatibility. Keep separate from the smaller JSON-only import's **1,005 SC0001 declaration errors** (duplicate `strict` first), which is a distinct preflight integration failure.

## E2. Upstream TypeScript sources: generic class fields prevent a typed-library comparison

**Proposed title:** `marked 18.1.2 and MiniSearch 7.2.0 TS sources refuse generic class fields (SC1090/SC2009)`

**Small import-graph repros:** [marked-ts-source.ts](../examples/probe/repros/marked-ts-source.ts) and [minisearch-ts-source.ts](../examples/probe/repros/minisearch-ts-source.ts), 4/6 lines. They retain unmodified upstream code rather than erasing generics until it compiles. The exact earlier measured/refused experiment is the committed `examples/probe/source-experiment.mjs`. Fresh sequential builds of the small import graphs in this round also exit **1**: marked **29 errors**, with the same first generic-field diagnostic; MiniSearch **3 errors**. The latter first reports `SC2008` at `src/MiniSearch.ts:612:13` for `OptionsWithDefaults<T>` resolving to no runtime shape, then the generic `RadixTree<T>` field `SC1090` at `src/SearchableMap/SearchableMap.ts:24:3` and the entry shape `SC2009`. These reductions have different graphs from the original experiment; their counts are reported separately.

```sh
mkdir -p examples/probe/.sources
# Check these exact tag commits after cloning; do not patch source.
git clone --depth 1 --branch v18.1.2 https://github.com/markedjs/marked.git examples/probe/.sources/marked
git clone --depth 1 --branch v7.2.0 https://github.com/lucaong/minisearch.git examples/probe/.sources/minisearch
# marked: 5beecae42b0beb07eaccc3a732560f56867a8301
# minisearch: 3d239d1c3ae7aef1bf5d8945dd7b5f0709f646f5
node examples/probe/source-experiment.mjs
```

The small files also use the common build command with `name=marked-ts-source` / `minisearch-ts-source`; no TS-source runtime parity claim is possible after a refusal.

**Exact original outcomes (Mac source experiment):** marked TS build exits **1**, **29 errors**; MiniSearch exits **1**, **4 errors**. Both coverage commands exit **0 despite blockers**. First marked error at `src/Hooks.ts:8:3`:

```text
error SC1090: 'MarkedOptions<ParserOutput, RendererOutput>'-typed class fields are not supported yet (instantiating class '_Hooks' with <unknown, unknown>)
```

First MiniSearch error at generated `search.ts:7:15`:

```text
error SC2009: values of type 'MiniSearch<any>' cannot be compiled: the record shape is supported, but its member '_options' has type 'OptionsWithDefaults<any>', which does not compile
```

Other MiniSearch diagnostics refuse `addAll`, `search`, and the `RadixTree<T>` field at `src/SearchableMap/SearchableMap.ts:24:3`. marked also reports recursive options/hooks shape SC2009 and function-object property assignment SC1090; generic fields are not the only blocker.

For context, the successful **published-JS** variants in that same experiment use 200 warmups/500 measured handler calls: Node/native article **1.133/58.737 ms**, RSS **1.454/57.881 ms**, search **1.238/5.088 ms**. Published outputs match byte-for-byte. **Native TS has no latency or parity result**. These loaded-Mac numbers are not Linux HTTP results. Reduced/incomplete TS coverage graphs do not establish a dynamic-tier reduction for an executable program.

**Expected:** support these generic field shapes or provide precise documented limitations so a native-only TS-source experiment is actionable.

**Actual:** both unmodified source graphs refuse compilation; the fallback proposal cannot be evaluated.

**What the evidence suggests:** compiler support/diagnostics are prerequisites to the experiment. Module aliases alone cannot fix it. No TS-source speedup, generic-erasure workaround, or underlying runtime crash is established. Attach the committed full diagnostic JSON when filing.

## Round 2 repro verification

On Node 24.22.0 / scriptc 0.4.6 / the loaded Apple M4 Pro, builds were run sequentially with release, `--node-islands=off`, `--no-keep-llvm`, checker server disabled. `marked-regex`, `sha256-bulk`, `bcrypt-dynamic` and `minisearch-costs` all built with exit **0**. `next-request` reproduced **one SC3004 at 1:1**, exit **1**. Both source reductions refused as detailed above; source tag commits were verified. The first marked reduction also logged a separate `console.log` Promise-union inspect refusal (30 total); awaiting the result removed that unrelated repro artifact, leaving the 29 upstream-source errors. No source patches or generic erasure were used.

Fresh bcrypt coverage exits **0** and confirms the named dynamic kernel. Logs are local ignored `examples/probe/.artifacts/upstream-drafts/`; the material counts/diagnostics are transcribed above, while original source-experiment diagnostics remain committed in JSON. No reduced repro executable was timed in this round. The full HTTP parity suite separately passed 85 cases (including the reused article/search handlers). All owned compiler/server processes exited; no issue was filed.


## Round 3: upload profiling and async typed-array ownership

**Environment:** scriptc 0.4.6 release, Node 24.22.0, Apple M4 Pro/macOS
arm64, 2026-10-31. Loaded shared machine, no affinity; indicative only. These
are new local diagnostics, not revisions to the pinned Linux round 2 results.

Sequential 1 MiB upload load through the unchanged real handlers was sampled
with `/usr/bin/sample PID 5 1 -file FILE`; the identical generated HTTP entry
ran under Node with `--cpu-prof`. In histogram, **2,557/3,842 main-thread
samples (66.6%)** were in POST: 997 handler leaves, 921 `scr_bytes_release`
and 639 `scr_bytes_retain_v`. These retain/release calls are children of the
handler's loop, not chunk collection. `Buffer.concat` has 62 inclusive samples;
Request construction 45; Web body collection 159. The Node profile spends
46.5% in POST, 6.7% in GC, 2.2% in BufferSource snapshot copying and 1.9% in
`Buffer.concat`, including idle/startup samples in the denominator.

For upload verification, **3,265/3,815 native samples (85.6%)** end in
`scr_sha256_blocks`; Node spends 37.7% in `Hash.update`, 7.5% in GC and 28.5%
idle. The native upload loss is principally hashing on this platform. This
supplies the native profile previously missing from draft B; it does not prove
which hashing backend or instruction-set change would help on Linux.

**Minimal typed-array reduction:** save the following as `array-buffer-loop.ts`,
run with Node 24, then build/run with the common release command above. No HTTP,
Next, adapter, hashing, Response serialization or native-only application
algorithm is involved. Both async variants create and consume the same Request;
the helper moves only the numeric loop out of the async frame.

```ts
const size = 1024 * 1024;
const globalBytes = new Uint8Array(size);
for (let i = 0; i < size; i++) globalBytes[i] = i % 251;
function sum(bytes: Uint8Array): number {
  let total = 0;
  for (let i = 0; i < bytes.length; i += 4) total += (77 * bytes[i] + 150 * bytes[i + 1] + 29 * bytes[i + 2]) >>> 8;
  return total;
}
async function inline(request: Request): Promise<number> {
  const bytes = new Uint8Array(await request.arrayBuffer());
  let total = 0;
  for (let i = 0; i < bytes.length; i += 4) total += (77 * bytes[i] + 150 * bytes[i + 1] + 29 * bytes[i + 2]) >>> 8;
  return total;
}
async function helper(request: Request): Promise<number> {
  const bytes = new Uint8Array(await request.arrayBuffer());
  return sum(bytes);
}
async function main() {
  const expected = sum(globalBytes);
  for (const kind of ['global', 'inline', 'helper']) {
    for (let rep = 0; rep < 3; rep++) {
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        const value = kind === 'global' ? sum(globalBytes) : await (kind === 'inline' ? inline : helper)(new Request('http://fixture.test', { method: 'POST', body: globalBytes }));
        if (value !== expected) throw new Error('parity');
      }
      console.log(JSON.stringify({kind,rep,ms:performance.now()-start,expected}));
    }
  }
}
main();
```

All results were **32554081**. Median ms/call across three windows
of 1,000 calls in one process: native global **0.261**, inline **0.497**, helper
**0.356**; Node global **0.359**, inline **0.645**, helper **0.921** (the Node
helper windows vary **0.599–0.943**). No warmed, alternating-process kernel speed
claim follows from these diagnostic windows. Global excludes Request work and
is not a same-work baseline for the other rows. The inline/helper difference,
together with the actual HTTP stacks, suggests avoidable byte ownership traffic
for a typed-array local kept in an async frame. It does **not** establish that
`Request.arrayBuffer()` itself is the main histogram bottleneck. Investigate
hoisting typed-array references/bounds out of loops in resumed async functions;
no handler rewrite or compiler fork was shipped.

A separate same-file 1 MiB Request-construction/arrayBuffer diagnostic compares
BufferSource versus a closed stream holding the same owned Uint8Array. Native
medians are **0.0911 → 0.0834 ms/call**; Node **0.1694 → 0.0898 ms/call**
(three windows, 1,000 calls each, BufferSource then stream, no HTTP).
This supports eliminating constructor snapshot copies but is not evidence that
all HTTP upload latency disappears. Web collection still copies to produce the
independent ArrayBuffer required by its API.

**Additional transport discrepancy:** `http.createServer` with `data`, `end`,
`aborted`, `error`, and `close` listeners receives a POST declaring
Content-Length 1048576, then seven bytes followed by a client FIN. Node emits
`data(7), aborted, error(Error: aborted), close(complete=false)`. The installed
native emits `data(7), close(complete=true)` without end/error/aborted. The shim
now rejects a pending collection on close, tracking end itself without trusting
complete or allocating errors on normal closes. The parity suite exercises the interrupted upload and
subsequent successful requests on both runtimes. This is an HTTP runtime issue,
independent of the upload kernel/copy costs.

Raw samples, CPU profiles, exact reduction, builds and clients are local ignored
artifacts in `packages/next-scriptc/.next/round3/`. No issue has been filed.

## F. Fully static typed-array RGBA histogram loop remains slower than Node

**Draft title:** `Typed Uint8Array → Uint32Array histogram in an async function is 1.76× Node steady-state time (0 dynamic-tier statements)`

**Standalone repro:** [typed-array-histogram.ts](../examples/probe/repros/typed-array-histogram.ts), **28 lines**, no imports, HTTP, Next, adapter, Request/Response, hashing or image decoding. It uses the demo's unchanged deterministic 512×512 RGBA fixture and Rec.601 histogram kernel: typed `Uint8Array` reads, typed `Uint32Array` increments, sum, min and max. `await Promise.resolve(bytes)` keeps the local typed view in a resumed async function without including HTTP/body collection. The fixed bytes initialize before warmup. Each call allocates the 256-bin result and consumes all bins in a weighted checksum; the timed region includes the async call/await and checksum. All runs return **66683127**. No demo route was changed.

Reproduce from the repository root with Node 24 (set `REPRO_NODE` to its absolute path if the shell default differs):

```sh
node examples/probe/repros/time-typed-array.mjs
# The controller builds the SAME file sequentially with these two modes:
packages/next-scriptc/node_modules/.bin/scriptc build \
  examples/probe/repros/typed-array-histogram.ts -o /tmp/histogram-release \
  --optimization release --strip --no-keep-llvm
# Repeat with --optimization speed and a separate output.
packages/next-scriptc/node_modules/.bin/scriptc coverage \
  examples/probe/repros/typed-array-histogram.ts --explain-dynamic
node examples/probe/repros/typed-array-histogram.ts
```

**New local measurements:** Node **24.22.0**, scriptc **0.4.6**, Apple M4 Pro, macOS arm64, 2026-10-31. Shared loaded host, no affinity: load averages **19.49/15.66/10.76 → 20.89/16.08/10.97**. Each fresh process warms **100 calls**, then measures **three windows of 500 calls**. Three rotating process orders are fixed in the controller: Node/release/speed, speed/Node/release, release/speed/Node. Nine windows per runtime are all retained; medians below are across all nine per-window ms/call values, not chosen runs or confidence intervals. No application suite ran concurrently with this repro.

| Runtime | Median ms/call | Min–max ms/call | Runtime / Node time (lower is better) |
| --- | ---: | ---: | ---: |
| Node | 0.523786 | 0.520981–0.537275 | 1.000× |
| Native release | 0.920054 | 0.918552–0.921752 | 1.757× |
| Native speed | 0.885676 | 0.884856–0.902880 | 1.691× |

Both native builds exit **0**. `coverage --explain-dynamic` exits **0**: **27 statements analyzed, 27 compile statically (100%), 0 functions / 0 statements in the dynamic tier, 0 demotion requests**. No dynamic explanations are emitted. This reduction is fully static, so an explanation based solely on untyped third-party JS/dynamic-tier execution cannot account for it. Speed improves this local median by about 3.7% relative to release but retains the native loss; it does not justify switching the demo or selecting a different final-run optimization.

**Prior route context, kept separate:** Linux round 3 direct HTTP p50 was **4.409 ms native vs 1.603 ms Node** (about **2.75×**). The earlier Mac HTTP profile attributed **2,557/3,842 main-thread samples (66.6%)** to POST and its byte retain/release children: 997 handler leaves, 921 `scr_bytes_release`, 639 `scr_bytes_retain_v`. Those are samples from the full HTTP handler, not a fresh profile of this reduction. The standalone numbers above are new local steady-state results and do not replace Linux route latency or establish the same slowdown ratio on Linux.

**Expected:** ordinary typed byte reads and integer histogram updates should compile to a competitive numeric loop while preserving async ownership semantics.

**Actual:** the same no-HTTP program produces the same checksum but takes 1.76× Node time under native release; speed retains a 1.69× loss despite zero dynamic-tier statements.

**Investigation suggested:** inspect retain/release and bounds/reference handling for typed-array locals across async suspension, plus typed histogram increments and min/max lowering. The full-route stacks motivate this direction; this repro has no new native profile and no synchronous comparison, so it does not isolate ownership as the sole cause, prove an async-only regression, or show which optimization would recover the gap. Do not rewrite the application loop as an alleged compiler fix.

[Complete measured evidence](../examples/probe/repros/typed-array-histogram-results.json) retains the source SHA-256, exact commands, build output, full coverage output, all 27 timing windows, checksums and host load. No issue was filed and no sandbox was run.
