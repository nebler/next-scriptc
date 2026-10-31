# Launch draft: TypeScript in route.go territory

**Review copy. Nothing posted.** Six tweets, in publication order. Only the `text` blocks are tweet copy. Evidence notes, counts, variants and recording directions are editorial material. Counts include spaces and newlines; URLs count as Twitter's fixed 23 characters. Placeholder templates are counted literally and must be recounted after substitution. Run `node research/launch/validate.mjs`.

The narrow claim: Vercel's TypeScript compiler, behind a plain Next.js adapter, can reach Go-class performance on a specific CPU-heavy integer workload. The compiler candidate and CPU dispatch are essential to the natural-code kernel win. The hosted vector comparison is done: on server compute, the patched route beats explicit Go SIMD on Vercel, and stock scriptc matches it with `Math.imul`. This is neither universal Go parity nor a general TypeScript-versus-Go ranking.

## Thread

### Tweet 1: hook, attach Chart B (Vercel) or the one-take video (249 chars)

<!-- count: 249 -->
```text
Do CPU-heavy Next.js routes need route.go?

Int8 vector search on Vercel Functions, server compute p50:
TypeScript via Vercel's scriptc: 10.0 ms
Go with explicit SIMD: 14.2 ms
Node: 108.6 ms

Plain Next.js adapter, no fork. Losses are in the thread.
```

Evidence: all four values are server-side compute p50 from [vector-vercel, measurements](vector-vercel.md#measurements): native patched natural TS + dispatch **9.999**, Go experimental archsimd AVX2 **14.216**, Node **108.593 ms**, pooled 120 C=1 requests per variant over three fresh preview sets, identical top-10 on every response. Compute starts after the request body is read and ends after JSON serialization; network, IPC and platform routing are excluded. Native/Go-SIMD p50 ratio per set: 0.704 / 0.726 / 0.677. Go SIMD is the experimental `simd/archsimd` package, labelled as such; plain Go is in tweet 3. Native Function deployment and no Next.js fork: [Vercel publication method](vercel-final.md#method-review-and-provenance). route.go context: [local RFC investigation](next-primitive.md#evidence-and-scope).

### Tweet 2: Vercel observations, attach Chart A (245 chars)

<!-- count: 245 -->
```text
On Vercel, native vs Node:
First response after deploy: 126 vs 240 ms.
Process RSS: 5.6 vs 80 MiB.
Process CPU/request (ms): hello 0.57/3.06; revenue 2.38/7.03; nearby 2.49/5.70.
Same TS routes. First response is not certified process-cold time.
```

Evidence per value, all native/Node:

- **126 / 240 ms** round **125.542 / 240.431 ms**, median first drained hello response across the paired deployments: [deployment-first table](vercel-final.md#deployment-first-latency).
- **5.6 / 80 MiB** round the median after-first serving-process RSS, **5.602 / 80.039 MiB**, calculated from the after-first rows: [process memory table](vercel-final.md#process-memory).
- **0.57 / 3.06 ms/request** round **0.570 / 3.064** for hello: [process CPU table, hello row](vercel-final.md#process-cpu-per-request-self-reported).
- **2.38 / 7.03 ms/request** round **2.384 / 7.029** for revenue: [process CPU table, revenue row](vercel-final.md#process-cpu-per-request-self-reported).
- **2.49 / 5.70 ms/request** round **2.494 / 5.700** for nearby-stores: [process CPU table, nearby-stores row](vercel-final.md#process-cpu-per-request-self-reported).

Media: [Chart A PNG](launch/chart-a-vercel.png). It shows first response, RSS and CPU/request only. The Markdown loss remains in tweet 5 and the README text. CPU is self-reported process CPU, not billed Active CPU. RSS is not whole-instance usage. These are separate diagnostic measurements, not a single trace of one request.

### Tweet 3: the vector route, stock vs patched (235 chars)

<!-- count: 235 -->
```text
The vector route, same Vercel config, same exact top-10:
Native TS 10.0 ms, Go SIMD 14.2, Go 50.0, Node 108.6.

Stock scriptc gets there if you write Math.imul. A +25-line compiler patch makes plain a*b hit the same path: 409 to 10 ms.
```

Evidence per value, all server-side compute p50 from [vector-vercel, measurements](vector-vercel.md#measurements): native patched **9.999**, Go SIMD **14.216**, Go plain v1 **50.000**, Node **108.593**, stock 0.4.6 `Math.imul` + dispatch **10.087**, stock 0.4.6 natural `a*b` + dispatch **408.928 ms**. The compiler diff is +25/-2 production lines: [range analysis](scriptc-int8-range-analysis.md). Losses on this same route, keep ready for replies: first response after deploy was 1.09 to 1.40 s for patched native versus 0.34 to 0.42 s for Go SIMD (slower synthetic corpus generation, 583 to 794 vs 350 to 381 ms), and in the short C=4 window patched native had worse WAN p95 (916 vs 637 ms) and lower req/s: [losses and limits](vector-vercel.md#losses-and-limits-on-the-win).

Media: [Vercel Chart B PNG](launch/chart-b-int8-vercel.png) if it is not already on tweet 1. The [kernel-only chart](launch/chart-b-int8-kernel.png) stays in the repo and video with its label.

### Tweet 4: one function, still TypeScript (255 chars)

<!-- count: 255 -->
```text
You can also mark one async function "use native".

A Server Component dashboard over 200k rows: native 48 ms vs Node 113 ms, full page p50 on self-hosted Linux.

The observed crossover was between 5k and 15k rows. Function offload is self-hosted for now.
```

Evidence per value: **200k rows**, **48 / 113 ms** round the Linux review-round-3 page row **200,000 events**, **48.097 / 112.881 ms** in [the page curve](function-level.md#page-curve-old-vs-new). **5k / 15k** are the measured lower/upper bracket: native loses the smaller page window and wins the larger; no exact threshold or confidence interval was established: [review-round-3 analysis](function-level.md#review-round-3-measurements-after). This is full-page warm sequential latency with a resident fixture, including React rendering, not isolated function CPU. Vercel function-level deployment is unproven: [sidecar/network discussion](function-level.md#vercel-sidecar-or-network-call).

### Tweet 5: honest losses (259 chars)

<!-- count: 259 -->
```text
Where it loses: Markdown is 2.5x slower on Vercel. Regex-heavy libraries can favor V8.

Go still wins CSV, bcrypt, raw thumbnails and resize in our tests. Go SIMD wins float search; Go's popcount wins binary search.

Pick the workload, then measure the route.
```

Evidence per value: **2.5x** rounds **60.620 / 24.329 = 2.492x**, native/Node warm sequential Markdown p50: [warm comparison, Markdown row](vercel-final.md#warm-paired-comparison-final-pair-only). This is a latency loss. Its process CPU loss is larger: **40.209 / 4.593 = 8.754x**, [CPU table, Markdown row](vercel-final.md#process-cpu-per-request-self-reported). Ratios in the assets are computed from the data, never typed into chart templates.

Non-numeric loss claims: [Go-territory Linux values and hosted limitations](go-territory.md#self-hosted-linux-values), [resize scout summary](scouting-summary.md#takeaways), [float and binary CPU-policy results](vector-cpu-levels.md#measurements). Thumbnails are raw RGBA arithmetic, not image decoding/encoding. Hosted Go-territory completion used a different generator allocation and contains incomplete/diagnostic-only rows; use the self-hosted evidence for the broad list, not a claim of one clean hosted three-way experiment. The regex explanation is a plausible implementation explanation from the existing draft, not isolated causal proof; measured Markdown behavior is the claim.

### Tweet 6: mechanism, repo and RFC (254 chars)

<!-- count: 254 -->
```text
How: scriptc compiles route.native.ts into a Linux binary that speaks Vercel's Function protocol. next-scriptc wraps Vercel's Next.js adapter and substitutes native routes. Dev runs the same TS on Node.

Repo: {{REPO_URL}}
Next primitive RFC: {{RFC_URL}}
```

Evidence: [native deployment method/topology](vercel-final.md#method-review-and-provenance), [native Function design](vercel-native-functions.md), [function dev behavior](function-level.md#what-works), [Next primitive investigation/RFC material](next-primitive.md). Fill `{{REPO_URL}}` with the user's public repository and `{{RFC_URL}}` with its published `research/next-primitive.md` permalink or the user's actual RFC. This checkout has no configured remote. The route.go prototype is [Next.js PR](https://github.com/vercel/next.js/pull/100130) and [adapter-vercel PR](https://github.com/nextjs/adapter-vercel/pull/147), context links rather than an RFC for this adapter. No public scriptc primitive is implied.

## Alternative hooks

Each replaces Tweet 1 and retains the same video. No handles and no emoji are needed.

### Hook A: question first (205 chars)

<!-- count: 205 -->
```text
Before rewriting a CPU-heavy Next.js route in Go, try compiling the TypeScript. On an int8 vector route on Vercel Functions, scriptc-compiled TS used 10.0 ms server compute vs 14.2 ms for explicit Go SIMD.
```

Rationale: starts with the developer's decision and states the measurement boundary. Evidence: [Vercel route comparison](vector-vercel.md#measurements), [deployment method](vercel-final.md#method-review-and-provenance).

### Hook B: language boundary (266 chars)

<!-- count: 266 -->
```text
route.go asks you to change languages. What if the compiler changed instead?

Vercel's scriptc, a small compiler patch, and a plain Next.js adapter: TypeScript beats explicit Go SIMD on an int8 vector route. Native routes deploy as Vercel Functions. Losses included.
```

Rationale: makes the compiler work the story without promising a universal performance win. Evidence: [compiler root cause](scriptc-int8-range-analysis.md#root-cause), [Vercel route comparison](vector-vercel.md#measurements), [deployment report](vercel-final.md).

### Hook C: measurable mechanism (259 chars)

<!-- count: 259 -->
```text
route.native.ts: ordinary TypeScript, native Vercel Function.

No Next.js fork. A plain adapter around Vercel's own compiler. With a compiler patch and CPU dispatch, our int8 kernel beats explicit Go SIMD on Linux. Here's the measured scope, including losses.
```

Rationale: opens on the concrete filename and scopes the Go claim immediately. Evidence: [native method](vercel-final.md#method-review-and-provenance), [CPU-policy experiment](vector-cpu-levels.md#measurements).

## Hosted vector result: resolved

The hosted run is a win against explicit Go SIMD on server compute in all three fresh sets ([vector-vercel](vector-vercel.md)). Tweets 1 and 3 use those numbers. The win/tie/loss templates were removed. The route-level losses (first response after deploy, C=4 WAN tail) are listed under tweet 3 and in the reply bank.

## Upstream status: prepared replies

These are optional replies, not extra main-thread tweets. Select one only after checking the actual status. An open PR does not imply acceptance or full validation.

### PR open (225 chars)

<!-- count: 225 -->
```text
The int8 result uses a scriptc compiler patch plus CPU dispatch. The patch is under review: {{SCRIPTC_PR_URL}}. It is not in the published compiler. The benchmarks and remaining validation gates are documented with the patch.
```

### PR coming (244 chars)

<!-- count: 244 -->
```text
The compiler patch is in a local fork; PR coming after the full validation gate. Focused checks pass, but the full compiler suite is still pending. The natural int8 win is not a stock scriptc claim. Patch and reproduction notes are in the repo.
```

Current evidence: [range-analysis validation gate and preserved patch](scriptc-int8-range-analysis.md#tests-and-remaining-gate). At source freeze the fork candidate is uncommitted and no upstream PR exists. Keep `{{SCRIPTC_PR_URL}}` unresolved until a real PR is filed; do not invent one.

## Reply bank

These are prepared technical answers for review, not an instruction to send replies. Attach the relevant source permalink when publishing. Numeric statements below each have their own source.

- **“It's a fork.”** The Next.js integration is an adapter with no Next.js fork. The natural int8 improvement does use a scriptc compiler candidate in a local fork. Its production diff is **25 insertions and 2 deletions**, not the entire test patch: [root cause](scriptc-int8-range-analysis.md#root-cause). The ordinary Vercel publication results use the stock toolchain and predate that candidate: [publication method](vercel-final.md#method-review-and-provenance). Use the selected upstream-status reply above.
- **“Go SIMD is experimental.”** Yes. It is explicit handwritten code using the pinned Go toolchain's experimental `simd/archsimd`, feature-checked on x86. The plain-Go control is included separately and built without that experiment. This is a stronger comparison than scalar Go alone, not a stable-API or broad-adoption claim: [control definitions](vector-route.md#what-is-compared).
- **“These are Sandbox benchmarks.”** The vector chart currently is a Linux Sandbox **kernel-only** result. First-response/RSS/CPU/Markdown numbers are real Vercel Function observations. The function directive result is self-hosted Linux in a Sandbox. Hosted vector compute stays blank until measured. [Vector scope](vector-cpu-levels.md#method-and-scope), [Vercel method](vercel-final.md#method-review-and-provenance), [function measurement](function-level.md#review-round-3-measurements-after).
- **“Why not N-API/FFI?”** That is a reasonable design for an existing native library. This prototype compiles the app's typed TS body, keeps its TS call signature, and uses a separate-process JSON boundary for function offload. It avoids a handwritten native implementation/binding but pays serialization and process costs. This is a different tradeoff, not a benchmark against N-API or FFI: [function transport](function-level.md#transport-errors-and-lifecycle).
- **“Warm latency is the same.”** Warm hello medians are **22.457 ms native / 24.559 ms Node** across deployment pairs: [deployment-first/warm reference table](vercel-final.md#deployment-first-latency). That is approximate parity at this end-to-end scale. The useful observed differences are first response and process resources; network/platform work can hide handler savings. No isolated platform-latency decomposition was measured.
- **“Regex is slow.”** Full Markdown is **2.492x** slower in the warm sequential latency row and **8.754x** higher in process CPU: [warm Markdown table](vercel-final.md#warm-paired-comparison-final-pair-only), [CPU Markdown table](vercel-final.md#process-cpu-per-request-self-reported). Keep regex-heavy rendering on Node unless your route measurements support offloading it. There is no measured regex fix here. An interpreter-versus-JIT explanation is not an isolated causal experiment.
- **“Hobby only?”** These observations are from protected Hobby previews in the recorded region/configuration. Native routes were deliberately grouped into one Function, mirroring Node App Route bundling. It is not a benchmark across plans, ungrouped routes or production traffic: [function topology](vercel-final.md#function-topology-and-sizes). The method does not establish another plan's behavior.
- **“I/O dominates real apps.”** Agreed that CPU savings need not turn into comparable end-to-end gains. The Upstash REST run includes hosted reads, writes and a deduplicated payment webhook, plus tail losses and an unavailable CPU cell. The SDK and Zod route integration also hit compiler refusals. Both sides use the same REST/validation choices: [realistic I/O report](realistic-io.md#library-and-compiler-outcomes), [hosted results](realistic-io.md#hosted-results). No claim that arbitrary npm applications compile unchanged.
- **“Is the compiler patch benchmark-specific?”** It adds a wrapping-only range proof for exact arithmetic, preserving invalid-read/NaN behavior and signed-zero semantics. The **403.673 → 23.379 ms** natural wrapping-int8 result is a paired main-versus-patch Linux experiment: [range-analysis table](scriptc-int8-range-analysis.md#100k768-latency-median-milliseconds). The faster dispatch chart is a separate experiment; do not turn those into one causal speedup. Ordinary Number accumulation remains unchanged.
- **“Did you just turn on AVX2?”** The stock natural-code lowering remains slow even with dispatch. Natural TS needs the range proof and CPU policy in the shown experiment. Dispatch retains a baseline fallback; the full HTTP binary also grows. [CPU-policy method](vector-cpu-levels.md#method-and-scope), [codegen and binary size](vector-cpu-levels.md#binary-size-startup-and-code-generation). No new ISA requirement for every host is implied.
- **“What about float and binary vectors?”** Go SIMD float is **43.228 ms**, patched native dispatch **91.225 ms**. Binary is **2.073 ms** with Go's v3 `bits.OnesCount32` versus **6.457 ms** native dispatch. Binary has no `archsimd` implementation in this experiment; call it Go popcount, not Go SIMD: [float/binary rows](vector-cpu-levels.md#measurements).
- **“Is use native ready on Vercel?”** The shown function directive is self-hosted. Its loopback JSON/process boundary, lifecycle and limitations are documented; sidecar packaging or a network service on Vercel still needs separate validation. Route-level native Vercel Functions are the deployed integration shown here: [function deployment limits](function-level.md#vercel-sidecar-or-network-call).

## Caveats to keep next to the numbers

- **Measurement boundary:** the publication run used **5 fresh Node/native deployment pairs**, frozen at `10d23f6`, from a Linux Sandbox in iad1. The **17 native routes** share one explicit native Function group; the source run fit Hobby's **12-Function** limit. These are recorded experimental settings, not current plan guarantees. [Method](vercel-final.md#method-review-and-provenance), [topology](vercel-final.md#function-topology-and-sizes), [prior caveat and Go topology](go-territory.md#method-and-provenance).
- **First response:** first drained hello on an operator-untouched preview includes DNS/TCP/TLS, network, platform activation and handler/body work. Prewarming/artifact caches are uncontrolled. Do not label it “cold initialization” or compare it directly with a kernel. [Latency definitions](vercel-final.md#deployment-first-latency).
- **Memory/CPU:** RSS is the serving process, excluding separate platform processes. Process CPU is self-reported user+system delta validated against procfs, not billed Active CPU or infrastructure efficiency. Instance routing/background work can affect it. Node verify/gzip CPU rows remain unavailable after the registered retry rule; no substitution. [Memory](vercel-final.md#process-memory), [CPU](vercel-final.md#process-cpu-per-request-self-reported).
- **Recovered/incomplete execution:** control-plane recovery retained completed measurements without repeating workload rows; the original final full-pair runner retains a shutdown failure. The CPU worker reports incomplete coverage. Do not say every runner was green. [Provenance](vercel-final.md#method-review-and-provenance), [CPU status](vercel-final.md#process-cpu-per-request-self-reported).
- **Warm performance:** the warm workload comparison is one deployment pair with short closed-loop windows, not sustained capacity or a confidence interval. Nearby-store throughput and several tails lose; gzip saturates the generator. The charts do not imply every latency metric improved. [Warm tables](vercel-final.md#warm-paired-comparison-final-pair-only), [complete losses](vercel-final.md#losses-evidence-and-limits).
- **Vector scope:** synthetic resident corpus, **100,000 × 768**, exhaustive dot products plus top-10; **20 pooled timed samples** per kernel/control on one shared host. Excludes initialization, allocation, JSON and HTTP. Integer outputs match exactly. No model-quality, ANN, real-embedding or fleet claim. [Method](vector-cpu-levels.md#method-and-scope). CPU ISA and runtime versions are pinned in that report; dispatch falls back on unsupported hosts.
- **Patch scope:** “small patch” means **25 production insertions / 2 deletions**, plus separate tests and baselines. Selected unit/differential/sanitizer checks pass; full plain/sanitized suite and platform contracts remain a gate. It is not upstream-ready on the present evidence. [Root cause](scriptc-int8-range-analysis.md#root-cause), [validation gate](scriptc-int8-range-analysis.md#tests-and-remaining-gate).
- **No conflated experiments:** the causal natural-code main/patch change, later CPU-dispatch kernels, stock self-hosted HTTP route and the hosted Vercel route are separate datasets. The stock HTTP natural-code loss remains in [vector-route](vector-route.md#final-synchronous-kernel-http-implementation-stock-046). No old/new-host speedup is attributed solely to the patch or CPU flag.
- **Function directive:** warm sequential page p50, resident fixtures, self-hosted Linux, includes React/RSC and the strict JSON boundary. The **5k–15k** bracket is observed, not a precise crossover: [round-3 measurements](function-level.md#review-round-3-measurements-after). Function offload serializes across a process boundary, supports a compiler/type subset and has a documented record-narrowing parity limitation. [Boundary and limitations](function-level.md#json-signature-contract-round-3), [parity limitation](function-level.md#review-round-3-measurements-after).
- **Honest Go/I/O comparison:** keep CSV/bcrypt/raw-image/resize/float/popcount losses. Go-territory hosted recovery has mixed generator allocations and unavailable rows; do not present it as a fully controlled uninterrupted hosted comparison. SDK/Zod refusals and Redis tail losses are part of the story. [Go method](go-territory.md#method-and-provenance), [scouting losses](scouting-summary.md#takeaways), [Redis limitations](realistic-io.md#losses-failures-and-limitations).
- **Prototype contract:** the adapter's native IPC packaging demonstrates these routes, not an endorsed stable Next.js primitive, complete Node compatibility, automatic adapter composition or a stable public Vercel executable ABI. [Native Function research](vercel-native-functions.md), [Next primitive investigation](next-primitive.md).

## Charts: edit data, regenerate locally

`research/launch/chart-data.json` holds exact values, units, display precision, source section and row locator per measured value. Placeholder values are strings with a pending source; they never become zero. Each chart has its own measurement label. All ratios are computed from the exact data, not the rounded display labels.

```sh
node research/launch/generate.mjs
node research/launch/validate.mjs
open research/launch/preview.html
```

Outputs (editorial media dimensions, not measurements):

- [Chart A SVG](launch/chart-a-vercel.svg) / [PNG](launch/chart-a-vercel.png) / [README PNG](../.github/assets/chart-vercel-native-vs-node.png): native/Node first response, RSS and process CPU only, 2000 × 1660. Each small chart has a zero baseline and its own unit-labelled scale. Markdown stays in the data and launch text; its panel is excluded.
- [Chart B kernel SVG](launch/chart-b-int8-kernel.svg) / [PNG](launch/chart-b-int8-kernel.png): natural int8, patched native dispatch / experimental Go SIMD / plain Go / Node, 2000 × 1500, labelled KERNEL ONLY.
- [Hosted vector chart SVG](launch/chart-b-int8-vercel.svg) / [PNG](launch/chart-b-int8-vercel.png) / [README PNG](../.github/assets/chart-vector-vercel.png): Vercel server compute p50 from [vector-vercel](vector-vercel.md#measurements), the headline image, 2000 × 1500.
- [Native route](../.github/assets/code-route-native.png)
- [Function directive](../.github/assets/code-use-native.png)
- [README hero](../.github/assets/hero.png)
- [OG image](../.github/assets/og.png)

Renderer used: existing local **Google Chrome headless** at 2x with embedded Geist fonts and Shiki tokenization. Install pinned dependencies once with `npm ci --prefix research/launch`; generation uses local files only. Override `CHROME_BIN` for another local Chrome/Chromium binary. `--svg-only` skips PNG export. See [visual generation notes](launch/README.md). The generator checks citation presence/source text, fonts, clipping, file size and PNG dimensions; this is a guard against transcription errors, not an automatic semantic source audit.

Palette: white for native, blue for comparisons, pure black backgrounds and neutral white/gray text. Separate units/scales rather than combining milliseconds and memory on one axis. The Markdown loss stays in tweet 5 and the README text, not Chart A. Phone review: inspect both in-feed and expanded images; expanded images carry the detailed source line.

## Video script: one-take, 40 seconds

This is an **evidence walkthrough**, not a new live performance experiment. The recording page labels every shot “Recorded evidence · not live timings.” It never replays terminal output or animates a benchmark clock. The source excerpts are read from this checkout at generation time; the chart values come from the cited reports. No build/deploy/request is timed or performed. Durations below are editorial shot lengths.

Preparation, outside the take, from this worktree with Node available:

```sh
node research/launch/generate.mjs
node research/launch/validate.mjs
open -a "Google Chrome" research/launch/recording.html
```

Set the browser viewport to **1600 × 900**, browser zoom **100%**; use DevTools' responsive viewport if needed, then record just that viewport. These are capture settings, not benchmark parameters. Close notifications and unrelated tabs. Use the OS screen recorder to capture continuously. Begin recording, click **Start 40-second walkthrough**, then leave the page alone. Stop after the final caption. Do not trim out waits, accelerate commands, cut between runtime runs or imply the timer measures compute. A brief leading click is fine; the complete take fits the requested duration.

| Shot / time | What the recording page shows | On-screen caption / spoken line |
| --- | --- | --- |
| 0–7 s | Actual excerpt of `examples/demo/app/api/analytics/revenue/route.native.ts`, including GET and typed aggregation setup. Intro card is visible before Start. | “CPU-heavy routes can stay TypeScript. A plain adapter compiles this route to a native Vercel Function.” |
| 7–16 s | Full Chart A: first response, RSS and process CPU. Markdown loss stays in the accompanying text. | “On Vercel: lower first-response time and process resources. First response is not certified cold initialization. Markdown loses.” |
| 16–25 s | Kernel Chart B with KERNEL ONLY visible. No hosted numbers substituted. | “On this Linux int8 kernel, patched scriptc with CPU dispatch beats explicit Go SIMD. This is not hosted route timing.” |
| 25–32 s | Actual function signature and `"use native"` excerpt from `examples/demo/lib/revenue.ts`, plus the self-hosted full-page result and crossover bracket. | “A function directive also works. The dashboard win is self-hosted. The serialization boundary matters.” |
| 32–40 s | Static loss list and fork/validation status. | “Go still wins other workloads. The compiler patch is in a fork, with the full validation gate pending. Source, method and reproduction notes are in the thread.” |

Every benchmark number appearing in the video is cited in the corresponding tweet evidence above; the recording footer identifies frozen evidence. The final card's claims cite Go-territory, scouting, CPU-policy and range-analysis reports on screen. If PR status changes, update the recording text and the draft together before capture. If hosted vector numbers arrive, retain the kernel shot as labelled evidence or deliberately rewrite that shot and its source line; do not silently relabel its bars.

The following is the **exact source-inspection command**, if the user prefers to open files in an editor before recording. It is optional preparation and is not a timed benchmark:

```sh
sed -n '9,25p' examples/demo/app/api/analytics/revenue/route.native.ts
sed -n '8,14p' examples/demo/lib/revenue.ts
```

No deploy command belongs in this recording. Reproducing published Linux/hosted timings is separate work, using the frozen protocols in the source reports and its own authorization/budget, not this media task.

## Pre-posting checklist

- [ ] User reviews every tweet, caption, asset, source and caveat. Nothing is auto-posted.
- [ ] Replace the public repo/RFC placeholders with real public URLs. Link source permalinks from the repo; do not expose local paths as public citations.
- [ ] Re-check tweets 1 and 3 against [vector-vercel](vector-vercel.md#measurements); preserve measurement boundaries (server compute, not WAN latency).
- [ ] For hosted results: verify handler/corpus/query parity, compiler candidate/runtime versions, CPU policy, region/settings, response digests, statistic/window, server-side timer scope and all unavailable rows. Add each value's source and row locator to the JSON and this draft. Native-vs-Go SIMD wording must match the evidence.
- [ ] Confirm patch state. Use “PR open” only with a real `{{SCRIPTC_PR_URL}}`; otherwise keep fork/PR-coming language and full-gate status. No implication of upstream acceptance.
- [ ] Revisit regex issue status if linking one; no filed issue or fix is assumed by this draft.
- [ ] Regenerate all assets from `chart-data.json`; inspect the PNGs. Ratios must still come from exact input values. Check units, runtime labels, loss visibility and source line on a phone.
- [ ] Recount final tweet copy after placeholder/URL substitution and any text changes. Each must fit **280 characters** (platform editorial limit). Confirm the actual composer count before posting. Evidence annotations and char-count comments are not tweet copy.
- [ ] Record one continuous take with frozen-evidence labels visible. Review it for clipped text or accidental claims of live timings.
- [ ] Keep the full caveats and failed/incomplete run status accessible in the public repo. No certification of cold starts, billed CPU, whole-instance RSS or universal Go equivalence.
- [ ] Tagging is the user's decision. Neutral candidates: scriptc maintainers/Vercel Labs, Next.js adapter/runtime maintainers, authors of the route.go prototype, contributors to the Go SIMD experiment. No handles in the main thread and no outreach performed.

## Source audit against the brief

- Headline Vercel, dashboard and kernel values agree after rounding. Exact values are listed next to each tweet, not copied blindly from the brief.
- The brief's “crossover ~15k” is less precise than the current source: the measured Linux bracket is **5k–15k**, not an established point threshold. [Round-3 analysis](function-level.md#review-round-3-measurements-after).
- The brief's warm “~23 ms” is a useful shorthand, but not exact equality: across-pair hello medians are **22.457 ms native / 24.559 ms Node**. [Warm-reference table](vercel-final.md#deployment-first-latency).
- The brief groups binary/popcount with Go SIMD. The **2.073 ms** result is `go-binary-v3`, not a SIMD implementation; default Go popcount is **2.248 ms**, native dispatch **6.457 ms**. [Binary rows and control definition](vector-cpu-levels.md#measurements).
- “25-line patch” means **25 added production lines and 2 removed**, with additional validation/test files. The source explicitly says the full validation gate remains unmet. [Root cause](scriptc-int8-range-analysis.md#root-cause), [gate](scriptc-int8-range-analysis.md#tests-and-remaining-gate).
- The earlier causal Linux patch result **403.673 → 23.379 ms** and later patched-dispatch **9.251 ms** come from different runs/CPU policies. They are not one three-stage controlled timing series. [Causal table](scriptc-int8-range-analysis.md#100k768-latency-median-milliseconds), [dispatch method](vector-cpu-levels.md#method-and-scope).
