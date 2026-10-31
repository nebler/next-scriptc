# Go-territory routes: Node, native TypeScript and Go

Measured on 2026-10-31. This is a prototype Next.js adapter, without a Next.js fork. The result is workload-specific: Go clearly wins the large CSV report and bcrypt; the JSON transform is a Go loss on self-hosted C=1 latency/CPU. Native TypeScript improves CSV versus this Node implementation, is close to Node on JSON, and loses thumbnail latency and bcrypt badly. Its loaded process-tree RSS also loses on JSON/thumbnail. These are observations from one fixed pass, not language rankings or a sustained-capacity estimate.

The self-hosted runner is **failed**, because native bcrypt's C=16 batch returned HTTP 500 at the ordinary Next proxy timeout. Every other self-hosted window completed; all completed subwindows, including bcrypt C=1, remain shown. Two setup failures are retained too. Hosted run status and coverage appear below; absent values never become zero or a speedup.

## Workloads and contracts

| Route | Real application / work | Self-hosted fixture | Hosted fixture |
| --- | --- | --- | --- |
| `/api/heavy/csv` | Merchant sales CSV import → strict quoted-record parsing, paid/refund filtering, region/SKU totals and descending revenue sort | 100,000 rows, 9,180,351 bytes | 40,000 rows, 3,665,502 bytes |
| `/api/heavy/json` | Commerce bulk export → parse customers/orders, validate, join discounts, filter refunds, aggregate integer cents, sort and serialize all accepted records | 30,000 orders + 256 customers, 4,548,344 bytes | 10,000 orders + 256 customers, 1,515,551 bytes |
| `/api/heavy/thumbnail` | Image service after decode → exact integer 4×4 box averaging, all RGBA channels, return computed pixel bytes | 1024² RGBA, 4,194,304 bytes → 256² | same |
| `/api/heavy/bcrypt` | Existing-account password verification at cost 10 with the same public stored hash and successful password | 43-byte JSON body | same |

The same `route.native.ts` file runs on Node and native. CSV uses one straightforward typed parser for both TS variants; Go uses `encoding/csv.ReadAll`, also materializing the records. This is not Node Papa Parse versus Go: Papa Parse remains a scriptc refusal documented in [scriptc-refusals.md](scriptc-refusals.md). The typed parser is a supported alternative and is not a claim to match the fastest Node CSV library. It handles quoted commas, embedded newlines, escaped quotes, CRLF normalization, empty cells and malformed quotes. Go uses its standard library's parser implementation; the application filter/group/sort is the same.

JSON uses normal runtime JSON parsing and integer-cent arithmetic. Go uses typed structs with pointer fields for required-number/null validation, a customer map and preallocated result slice. TS uses typed records, maps and growing arrays. These are idiomatic implementation choices, not identical parser/sort machine code. The algorithms, filtering, joins, cents, fixtures and tie ordering agree byte-for-byte. No output work is omitted. Thumbnail uses the same nested integer box kernel. **No PNG/JPEG decoding, encoding, color management, alpha unpremultiplication, or image-library compatibility is measured**; pixels are raw RGBA, with each channel averaged independently. Bcrypt is `bcryptjs 3.0.3 compareSync` versus `golang.org/x/crypto v0.45.0 bcrypt.CompareHashAndPassword`, not a rewritten typed kernel or a cheaper failure path. It verifies rather than creates a new randomly salted hash, so successful results can be compared byte-for-byte.

No multicore synthetic aggregation was added: the existing million-order report and Node SAB experiment remain separate. This experiment includes concurrent Go HTTP requests/goroutines, but makes no within-request parallel-speedup claim. This choice, raw-image scope and all fixture sizes were [pre-registered](benchmarks.md#go-territory-three-way--pre-registration-2026-10-31) before implementation or timing. Vercel's [documented 4.5 MB request limit](https://vercel.com/docs/functions/limitations#request-body-size) motivates the smaller hosted CSV/JSON fixtures. We did not probe the precise enforcement threshold/units; JSON was conservatively kept below 4,500,000 decimal bytes. Cross-environment timing comparisons are not made for different sizes.

## Method and provenance

Implementation preview source: `6deada2ca6243933465b15cc101dd06795313d94`; initial registration: `68e7a7c0aa9eeb19cc0b4648a8a793cabf6f7089`. Linux source: `16ca192`, which changes the controller/recovery documentation only. [Provenance](benchmarks/heavy-provenance.json) verifies identical application, Go, lockfile and adapter trees between those sources. Later hosted-controller accounting changes do not change measured handlers. All commits are local on `t3/go-territory-bench`; no push/main merge. The source archive hashes, native binary hashes, client upload hash, deploy identities, settings and mappings remain in the raw artifacts. Dirty deploy metadata reflects collected research artifacts and controller-only fixes, not handler or adapter drift.

Local tools: Node 24.22.0, Next 16.4.3, scriptc 0.4.6 default release, Zig 0.16.0, pnpm 11.1.3, Go 1.27.3, Vercel CLI 65.8.0. Linux generator/server Node is 24.22.1; Vercel Node is configured `nodejs24.x`, exact platform patch unavailable. Go `go.mod`/`go.sum` pin the Go minimum and x/crypto; server/proxy builds set `CGO_ENABLED=0`, `GOOS=linux`, `GOARCH=amd64`. The same Go `user-server` SHA-256 is `9622ae2b3a5ced13aa7d24493f5832336139bb5bbdef4c345b802997de208bee` on Linux and Vercel. The hosted native ELF SHA-256 is `64e08493f24eb6a26c5930d69363eca1c7e011686d2ff1654ec2f67f890d914f`. Linux self-hosted builds use their own recorded native executable, not that cross-compiled hosted ELF.

Self-hosted: four-vCPU Linux Sandbox, Intel Xeon @ 2.50 GHz, application affinity 0–1 and generator 2–3. Node uses ordinary `next start`; native uses `next start` plus the grouped native route process and existing native-function sidecar. Go is one `net/http` server reached through an opt-in Next external rewrite (`/api/heavy-go/*`), with a vanilla Node Next entry. Thus both native and Go pay the Next → HTTP backend hop; Node executes in Next. All owned process-tree CPU and summed RSS are counted: Next plus native/sidecar or Next plus Go. No direct-backend number is compared to a proxied number. Grouping all native routes matches the hosted shared-function topology and is explicit, not the product default.

Vercel uses two immutable, inspected READY previews, iad1, x86_64, 2048 MiB, 300 s. [Deployment evidence](benchmarks/heavy-deployments.json): Node has two deployed Functions; native has four (pages, retained Node routes, shared native group, additional shared Go Function). Every measured route shares its own variant's diagnostic Function. The five Go paths are symlink aliases of one physical `.func`, below Hobby's 12-Function limit. The bench-only post-build hook follows [adapter-vercel#147](https://github.com/nextjs/adapter-vercel/pull/147): Go server `user-server`, public Vercel [IPC proxy](https://github.com/vercel/vercel/blob/84878e532142f0ac584953695658b324eb9e5b80/internals/ipc-proxy/bootstrap/proxy.go) pinned to `84878e532142f0ac584953695658b324eb9e5b80` as `executable` (`acdabb85da02103ac5bce79e8ccda69e2bb26841153a4f3c8a667760e540bcfa`), runtime `executable`. Native TS continues to speak IPC in its own process. This packaging is demo tooling only; no product adapter/shim change.

Requests use HTTPS HTTP/1.1 keep-alive on Vercel and HTTP locally, no pipelining or retries. Fixtures are generated once in the client and uploaded anew on every request, never cached in the server. Response status, content type, no-store/CDN state and SHA-256 of drained bytes are checked on every request. Latency ends at body drain before hashing; throughput includes validation cost. Nearest-rank p50/p95, closed-loop service times; no coordinated-omission correction or open-loop claim. Record every cap, drained elapsed time, connection reuse, warmup and client CPU. A duration limit stops dispatch, then outstanding requests drain, so a 2 s window can have a much longer drained elapsed time.

Self-hosted ordinary routes: 5+40 C=1, C=16 warmup 1 s/100 then measurement 2 s/100, first limit wins. Hosted ordinary routes: protocol revision 2 with 20+200 C=1, C=16 warmup 2 s/400 then 3 s/400, first limit wins. Bcrypt for all variants/environments: 1+3 C=1 and one 16-request C=16 batch without concurrent warmup. Three samples cannot establish a stable tail distribution; p95 is their maximum. These bounded bcrypt numbers are not a sustained-capacity result. No deployment-first/certified cold sample is claimed; hosted diagnostics preceded the warm run.

Self CPU is external procfs process-tree user+system ticks divided by successful requests in each completed measured C=1 window, with CLK_TCK=100. No idle subtraction. Serving-process diagnostics were independently checked against procfs before any timed window: Node 2,165,122 versus 2,170,000 µs; native 27,051,518 versus 27,060,000 µs; Go 597,375 versus 600,000 µs. [Retained Linux validation snapshot](benchmarks/heavy-linux-cpu-preflight.json) preceded hosted measurements. This validates the API implementation on Linux, not byte-identical hosted native binaries or Vercel affinity.

Hosted CPU uses cumulative process microseconds around three separate 20-request C=1 windows (bcrypt one request), one keep-alive pool, one untimed connection warm request, diagnostic immediately before/after. Retry only changed boundary tokens, maximum five attempts for three accepted windows. Missing accepted windows remain unavailable. Stable boundary tokens cannot prove every intervening request hit that process or exclude background work. Node counts all process threads; native counts its executable/IPC process; Go counts user-server and its goroutines **but excludes its separate IPC proxy**. These CPU observations have unequal platform-process coverage and cannot establish billed Active CPU or total infrastructure efficiency.

RSS is a process observation. Self tables show the maximum simultaneous summed tree RSS sampled every 100 ms/boundaries during C=1, after validation and all earlier workloads/windows. Shared pages may be counted more than once, this is not PSS, a kernel maximum, per-request allocation or a leak test. Different rows have different allocator/GC/prior-load history. Hosted serving-process RSS can reach different instances; allocated 2048 MiB is not used memory. Go proxy RSS is not collected by this diagnostic. Do not compare hosted process RSS to self whole-tree RSS.

## Vercel CPU allocation evidence

All three untimed hosted diagnostics reported `availableParallelism`/`runtime.NumCPU` = **2**, with `/proc/self/status` `Cpus_allowed_list: 0-1`. cgroup v1 quota/period and v2 `cpu.max` files were unavailable; raw `/proc/self/cgroup` is retained in [vcpu evidence](benchmarks/heavy-vercel-vcpu.json). This establishes visibility/affinity, **not a measured quota or two entitled vCPUs**. The current [Vercel limits](https://vercel.com/docs/functions/limitations#memory-size-limits) document Hobby 2 GB as **1 vCPU**, and 4 GB/2 vCPU for Pro/Enterprise. We therefore report one documented vCPU plus two visible logical CPUs, with enforced quota unverified. No hosted multicore-scaling result is presented.

## Measurements

The following tables are generated from the retained JSON by `node examples/demo/bench/heavy/report.mjs`. Ratios include every selected workload; unavailable/failed subwindows never receive a numeric ratio. CPU is process scope as described above. Self RSS is the C=1 sampled tree high point, not per-request memory. Hosted RSS is the median serving-process RSS at the ends of the three accepted CPU windows, which can be different instances; native-thumbnail RSS is not filled from its incomplete series. The two RSS scopes are not compared across environments. See the raw JSON for C=16 RSS and CPU, full samples, warmup, failures and caps.

The original hosted controller is **failed**: its 510-second command ceiling interrupted native thumbnail's third CPU window, after saving C=1/C=16 and two accepted CPU windows. The worker's last raw status remains `running`, not rewritten to complete. Native bcrypt and all Go timing were unreached in that attempt. A separately pre-registered Go-only completion uses the **same immutable Go preview and original paired digests**, unchanged workload counts/windows, and a different **one-vCPU iad1 generator** within the remaining hosted budget. Its result is a separate experiment. Tables show completed Node/native subwindows alongside this Go-only experiment with explicit resource mismatch; their ratios are descriptive cross-generator observations, not one uninterrupted controlled three-way run. No measured Node/native window was rerun, selected or replaced. Native bcrypt was unreached in the primary run. A final separately registered native-bcrypt diagnostic completed 1 warmup + 3 C=1 requests on another one-vCPU client. It placed CPU boundaries around those same three measured requests to fit the remaining budget, rather than making an additional separate CPU series. The table labels that row diagnostic-only; latency and CPU share samples and differ in order from Node/Go. Hosted native C=16 bcrypt remains **unmeasured**, not a zero or an HTTP failure. Native-thumbnail CPU remains unavailable because 2/3 windows do not meet the registered series requirement (31.6638 and 31.5797 ms/request retained, no substituted median).
<!-- Generated by examples/demo/bench/heavy/report.mjs. Do not substitute historical rows. -->

### Self-hosted Linux values

| Workload | Variant | C=1 p50 / p95 ms | C=16 req/s | CPU ms/request | RSS MiB (scope below) | C=1 / C=16 count |
| --- | --- | --- | --- | --- | --- | --- |
| csv | node (self / 4 vCPU) | 618.074 / 873.110 | 1.778 | 1024.000 | 873.840 | 40 / 19 |
| json | node (self / 4 vCPU) | 55.976 / 80.660 | 17.121 | 79.500 | 894.148 | 40 / 49 |
| thumbnail | node (self / 4 vCPU) | 17.108 / 37.284 | 48.955 | 31.000 | 898.273 | 40 / 100 |
| bcrypt | node (self / 4 vCPU) | 95.119 / 109.024 | 10.580 | 103.333 | 952.719 | 3 / 16 |
| csv | native (self / 4 vCPU) | 377.395 / 420.548 | 2.800 | 400.500 | 418.574 | 40 / 17 |
| json | native (self / 4 vCPU) | 52.938 / 81.409 | 20.813 | 76.250 | 2393.980 | 40 / 55 |
| thumbnail | native (self / 4 vCPU) | 21.256 / 44.533 | 50.105 | 31.250 | 2465.270 | 40 / 100 |
| bcrypt | native (self / 4 vCPU) | 12829.048 / 12839.405 | unavailable | 12823.333 | 632.063 | 3 / — |
| csv | go (self / 4 vCPU) | 86.287 / 107.517 | 18.246 | 125.500 | 274.352 | 40 / 44 |
| json | go (self / 4 vCPU) | 100.759 / 120.458 | 17.439 | 131.500 | 1303.723 | 40 / 43 |
| thumbnail | go (self / 4 vCPU) | 13.813 / 37.715 | 96.772 | 26.750 | 487.176 | 40 / 100 |
| bcrypt | go (self / 4 vCPU) | 70.598 / 71.054 | 28.105 | 70.000 | 498.504 | 3 / 16 |

Ratios: variant / reference. ↓ latency/CPU/RSS; ↑ throughput. Missing values have no ratio.

| Workload / variant | p50 vs Node / Go ↓ | p95 vs Node / Go ↓ | req/s vs Node / Go ↑ | CPU vs Node / Go ↓ | RSS vs Node / Go ↓ |
| --- | --- | --- | --- | --- | --- |
| csv / node | 1.000 / 7.163 | 1.000 / 8.121 | 1.000 / 0.097 | 1.000 / 8.159 | 1.000 / 3.185 |
| json / node | 1.000 / 0.556 | 1.000 / 0.670 | 1.000 / 0.982 | 1.000 / 0.605 | 1.000 / 0.686 |
| thumbnail / node | 1.000 / 1.238 | 1.000 / 0.989 | 1.000 / 0.506 | 1.000 / 1.159 | 1.000 / 1.844 |
| bcrypt / node | 1.000 / 1.347 | 1.000 / 1.534 | 1.000 / 0.376 | 1.000 / 1.476 | 1.000 / 1.911 |
| csv / native | 0.611 / 4.374 | 0.482 / 3.911 | 1.575 / 0.153 | 0.391 / 3.191 | 0.479 / 1.526 |
| json / native | 0.946 / 0.525 | 1.009 / 0.676 | 1.216 / 1.193 | 0.959 / 0.580 | 2.677 / 1.836 |
| thumbnail / native | 1.243 / 1.539 | 1.194 / 1.181 | 1.023 / 0.518 | 1.008 / 1.168 | 2.744 / 5.060 |
| bcrypt / native | 134.873 / 181.720 | 117.767 / 180.699 | unavailable / unavailable | 124.097 / 183.190 | 0.663 / 1.268 |
| csv / go | 0.140 / 1.000 | 0.123 / 1.000 | 10.263 / 1.000 | 0.123 / 1.000 | 0.314 / 1.000 |
| json / go | 1.800 / 1.000 | 1.493 / 1.000 | 1.019 / 1.000 | 1.654 / 1.000 | 1.458 / 1.000 |
| thumbnail / go | 0.807 / 1.000 | 1.012 / 1.000 | 1.977 / 1.000 | 0.863 / 1.000 | 0.542 / 1.000 |
| bcrypt / go | 0.742 / 1.000 | 0.652 / 1.000 | 2.656 / 1.000 | 0.677 / 1.000 | 0.523 / 1.000 |

### Vercel previews values

| Workload | Variant | C=1 p50 / p95 ms | C=16 req/s | CPU ms/request | RSS MiB (scope below) | C=1 / C=16 count |
| --- | --- | --- | --- | --- | --- | --- |
| csv | node (primary / 2 vCPU) | 469.692 / 567.628 | 29.685 | 361.062 | 268.957 | 200 / 103 |
| json | node (primary / 2 vCPU) | 109.542 / 150.431 | 124.621 | 50.761 | 294.516 | 200 / 390 |
| thumbnail | node (primary / 2 vCPU) | 228.573 / 325.107 | 53.617 | 69.219 | 286.961 | 200 / 174 |
| bcrypt | node (primary / 2 vCPU) | 112.658 / 121.594 | 60.359 | 92.140 | 93.301 | 3 / 16 |
| csv | native (primary / 2 vCPU) | 304.438 / 374.892 | 42.459 | 163.918 | 22.719 | 200 / 143 |
| json | native (primary / 2 vCPU) | 169.028 / 206.299 | 83.789 | 93.749 | 9.434 | 200 / 263 |
| thumbnail | native (primary / 2 vCPU) | 225.647 / 310.943 | 53.476 | unavailable | unavailable | 200 / 184 |
| csv | go (Go-only / 1 vCPU) | 179.042 / 279.857 | 67.916 | 41.730 | 23.477 | 200 / 219 |
| json | go (Go-only / 1 vCPU) | 109.140 / 167.881 | 113.737 | 36.851 | 12.953 | 200 / 352 |
| thumbnail | go (Go-only / 1 vCPU) | 210.707 / 354.963 | 56.721 | 13.528 | 17.711 | 200 / 185 |
| bcrypt | go (Go-only / 1 vCPU) | 96.825 / 98.224 | 86.117 | 68.957 | 17.707 | 3 / 16 |
| bcrypt | native (C1 diagnostic / 1 vCPU) | 11973.737 / 12079.359 | unavailable | 11938.958 | 24.914 | 3 / — |

Ratios: variant / reference. ↓ latency/CPU/RSS; ↑ throughput. Missing values have no ratio.

| Workload / variant | p50 vs Node / Go ↓ | p95 vs Node / Go ↓ | req/s vs Node / Go ↑ | CPU vs Node / Go ↓ | RSS vs Node / Go ↓ |
| --- | --- | --- | --- | --- | --- |
| csv / node | 1.000 / 2.623 | 1.000 / 2.028 | 1.000 / 0.437 | 1.000 / 8.652 | 1.000 / 11.456 |
| json / node | 1.000 / 1.004 | 1.000 / 0.896 | 1.000 / 1.096 | 1.000 / 1.377 | 1.000 / 22.737 |
| thumbnail / node | 1.000 / 1.085 | 1.000 / 0.916 | 1.000 / 0.945 | 1.000 / 5.117 | 1.000 / 16.202 |
| bcrypt / node | 1.000 / 1.164 | 1.000 / 1.238 | 1.000 / 0.701 | 1.000 / 1.336 | 1.000 / 5.269 |
| csv / native | 0.648 / 1.700 | 0.660 / 1.340 | 1.430 / 0.625 | 0.454 / 3.928 | 0.084 / 0.968 |
| json / native | 1.543 / 1.549 | 1.371 / 1.229 | 0.672 / 0.737 | 1.847 / 2.544 | 0.032 / 0.728 |
| thumbnail / native | 0.987 / 1.071 | 0.956 / 0.876 | 0.997 / 0.943 | unavailable / unavailable | unavailable / unavailable |
| csv / go | 0.381 / 1.000 | 0.493 / 1.000 | 2.288 / 1.000 | 0.116 / 1.000 | 0.087 / 1.000 |
| json / go | 0.996 / 1.000 | 1.116 / 1.000 | 0.913 / 1.000 | 0.726 / 1.000 | 0.044 / 1.000 |
| thumbnail / go | 0.922 / 1.000 | 1.092 / 1.000 | 1.058 / 1.000 | 0.195 / 1.000 | 0.062 / 1.000 |
| bcrypt / go | 0.859 / 1.000 | 0.808 / 1.000 | 1.427 / 1.000 | 0.748 / 1.000 | 0.190 / 1.000 |
| bcrypt / native | 106.284 / 123.663 | 99.341 / 122.978 | unavailable / unavailable | 129.574 / 173.136 | 0.267 / 1.407 |

### Failed, diagnostic-only or incomplete rows

- self native bcrypt: HTTP 500; route=/api/heavy/bcrypt; platform=absent; request=absent. Completed subwindows remain separately labeled in the values table.
- vercel native thumbnail: CPU series interrupted or instance-token attempts exhausted. Completed subwindows remain separately labeled in the values table.
- vercel native bcrypt: C1/CPU shared samples; C16 unmeasured. Completed subwindows remain separately labeled in the values table.

### Generator saturation / short-window flags



All count/duration caps, actual elapsed times and per-window warmup samples are in the raw artifacts. Bcrypt is a bounded batch; its three sequential samples do not establish a latency distribution.

## Losses and interpretation

Every numeric regression is visible in the ratio tables, including small tail/throughput differences that one pass cannot distinguish from noise. The material ones are:

- **Self-hosted native versus Node:** thumbnail p50/p95 are 1.243×/1.194× slower, CPU 1.008×, RSS 2.744×; JSON p95 is 1.009× and RSS 2.677×; bcrypt p50 is 134.873×, CPU 124.097× and its C=16 batch fails. CSV wins versus this shared typed-parser Node implementation, but loses to Go: native p50/CPU are 4.374×/3.191× Go and throughput is 0.153× Go. Native also loses thumbnail and bcrypt latency/CPU/RSS to Go. Native JSON beats Go latency/CPU/throughput but loses sampled RSS (1.836×).
- **Go losses on self-hosted:** JSON p50/p95/CPU/RSS versus Node are 1.800×/1.493×/1.654×/1.458×; throughput is only 1.019× Node. Go thumbnail p95 is 1.012× Node despite lower p50. Go wins CSV/bcrypt across the listed self metrics. Those are idiomatic stdlib-versus-typed-TS route implementations, not a proof about every Go or Node program.
- **Hosted native versus Node:** JSON p50/p95 are 1.543×/1.371×, throughput 0.672×, process CPU 1.847×. Thumbnail throughput is slightly lower (0.997×) despite slightly lower p50/p95; its registered CPU series is incomplete. The separately labeled bcrypt diagnostic remains a two-order-of-magnitude native loss. The absent hosted C=16 native-bcrypt cell cannot be called a successful comparison or imputed from self-hosted.
- **Hosted Go losses:** JSON p95 is 1.116× Node and throughput 0.913×, with essentially equal p50 (0.996×). Thumbnail p95 is 1.092× Node and 1.142× native despite lower p50. Hosted Go process RSS is higher than native for CSV (1.033×) and JSON (1.373×). Go has lower process RSS than the native bcrypt diagnostic. RSS differences have different instance histories and exclude Go's proxy; they are not per-request allocations. Hosted Go comparisons use a different generator allocation and exclude proxy CPU, as labeled above.

The self-hosted JSON RSS peak consists of **native executable 1,882.730 MiB + Next 461.199 MiB + existing function sidecar 50.051 MiB**, versus Node 894.148 MiB. Go's corresponding tree is **Go 856.441 MiB + Next 447.281 MiB**. The native thumbnail row follows that workload and reaches 2,465.270 MiB total. This is real recorded process-tree memory under the specified history, not evidence of a leak or permanent minimum. Later native bcrypt C=1 drops to 632.063 MiB. Hosted small-fixture/scale-out RSS is not a contradiction or a replacement for these loaded self-hosted observations.

The full pipeline measurements and byte equality are proven for these fixtures. Causes are less certain. The bcrypt dynamic-tier weakness is already documented in [upstream-issues.md](upstream-issues.md#c-bcryptjs-dynamic-tier-hot-kernel-and-118-successful-login-regression); this experiment does not newly profile `_encipher`. Go JSON's self loss includes decoding, required-field validation/allocation, joins, sorting and encoding, so attributing it exclusively to a JSON parser is not established. Native's hosted JSON regression includes IPC/body transport and serialization; it is not isolated kernel timing. Large upload latency includes network/platform transfer, while throughput includes client validation. No billed CPU, full infrastructure efficiency, certified cold-start, PNG codec, within-request multicore, confidence interval or general language superiority is established.

## Failures, cost and verification

No failed artifact was deleted or made successful:

1. `heavy-self-controller.json`: package installation called missing `dnf`; 9,498 ms stopped lifetime, no build/workload requests.
2. `heavy-self-setup-recovery-controller.json`: builds passed, then an invalid absolute output path prevented saving the validation result; 95,812 ms stopped lifetime, no timing could start before all validation phases. Local correctness attempts unknown, conservatively at most 78. The error is a harness defect, not a route correctness failure.
3. `heavy-self-path-recovery-controller.json` / `heavy-self-path-recovery.json`: all validation and 23 of 24 latency/throughput subwindows completed; native bcrypt C=16 retained **HTTP 500**, one successful response and 15 failures, 30,062.161 ms drained time, Next `ECONNRESET` proxy logs. No throughput from that failed window is reported. The native tree was then stopped before independent Go work. Self serving-process CPU/procfs validation passed in all variants.
4. `heavy-vercel-controller.json` / `heavy-vercel.json`: fixed 510 s worker timeout, with raw status still running. All Node rows, native CSV/JSON, and native thumbnail C=1/C=16 are saved. Native thumbnail CPU has only two of three windows. No token-changing attempt or workload failure was retried into success; this interruption is a controller deadline.
5. `heavy-vercel-go-controller.json` / `heavy-vercel-go.json`: separately registered previously unmeasured Go-only experiment completed all four workloads, same preview/digests, one-vCPU generator.
6. `heavy-vercel-native-bcrypt-controller.json` / `heavy-vercel-native-bcrypt.json`: separately registered C=1/CPU diagnostic completed, shared three samples, one-vCPU generator, no C=16. The original hosted run remains failed.

[Arithmetic/coverage/cost audit](benchmarks/heavy-audit.json) recomputes percentiles, CPU deltas, token checks, procfs comparisons, parity and limits. All 35 saved hosted CPU windows (including the incomplete native-thumbnail series) agree with procfs within 50 ms. RSS also agrees with procfs within 1 MiB at the audited CPU boundaries. No measured C=1/C=16 window raised the ≥0.8-core generator-saturation flag; caps and short drained windows remain descriptive. This does not prove network or platform headroom, particularly across different generator sizes.

| Budget / cost | Used or conservative upper charge | Limit |
| --- | ---: | ---: |
| Self-hosted stopped provisioned wall, all three attempts | 0.537899 vCPU-h | 0.6 vCPU-h |
| Self-hosted platform active CPU, including builds/failures | 837,782 ms = 0.232717 vCPU-h | reported separately |
| Hosted generators, all three stopped clients | 0.347367 vCPU-h | prospectively registered 0.35 vCPU-h |
| Hosted-generator platform active CPU | 83,010 ms = 0.023058 vCPU-h | excludes deployed Functions |
| Preview deployments | 2 | 8 |
| Hosted HTTP attempts, conservative upper bound | 5,984 | 20,000 |

The hosted dispatch bound is primary last-saved 3,813 + at most 22 in-flight CPU-attempt requests + 3 allocation diagnostics + Go-only 2,136 + native-bcrypt diagnostic 10. Each CPU attempt must save before the next starts, which bounds the interrupted attempt. These are invocation attempts, not account billing exports. Function monetary cost/billed Active CPU is not available from this client accounting. Full reserved lifetimes and actual stopped-controller wall bounds remain separate in the JSON; no active-CPU value is substituted for provisioned wall. Total self+hosted-generator stopped wall is 0.885266 vCPU-h; the task's self-hosted 0.6 limit is scoped separately from hosted client generation, as registered before provisioning.

Verification:

- Local three-way byte equality: **24 cases × Node/native/Go**, covering both registered sizes, successful/wrong bcrypt passwords, quoting/CRLF, empty datasets and malformed inputs. Linux repeats all 24 cases for all three implementations before timing. Hosted parity: **22 cases × three variants**, constrained to registered hosted sizes, then Go completion checks original primary fixture digests again.
- **20 package tests + 4 workload tests passed on Node 24.22.0**. Independent small expected-value tests cover CSV quote normalization, exact grouping/tie order, joined integer discounts/refunds, and pixel averaging.
- `DEMO_PROXY_TIMEOUT_MS=180000 node examples/demo/test/routes.mjs`: **106 cases passed**, retaining the original 85 assertions and adding 21 heavy cases; status/headers/body and native marker parity verified. The enlarged grouped-process assumption in E2E validates one light process and distinct processes for every outside route rather than using a stale fixed count.
- `node examples/demo/test/e2e.mjs`: **passed** sequentially, including report 1/4/1 worker results, plain next start ownership, cleanup/crash recovery and port conflicts. An accidental overlapping first launch failed with EADDRINUSE; that test-only harness/operator failure is retained in `heavy-e2e-overlap-failed.log`, followed by the successful sequential run. It did not generate performance rows.
- `git diff --check` and pinned Go builds passed. No adapter/shim behavior changed. The first local compiler build required scriptc's bundled install hook to restore helper permissions; no toolchain mutation was committed.

## Files, scope and remaining questions

Implementation: `examples/demo/app/api/heavy/` (four handlers, shared typed helpers/parser, diagnostics), `examples/demo/go/` (one idiomatic stdlib HTTP server plus pinned x/crypto), `examples/demo/bench/heavy/` (fixtures, transport, parity, Linux/hosted controllers, retained-stage follow-ups, audit/report tools), `examples/demo/bench/vercel/heavy-go.mjs`, and a four-line opt-in deployment hook. Demo config adds the bench-only Go rewrite and includes heavy routes in the explicit Vercel group; route/E2E tests are extended. Research registration, report and all raw evidence live in `research/` / `research/benchmarks/heavy-*`. No I/O route, open-loop harness, product adapter or shim was edited.

Open questions for a future separately registered run: a complete controlled three-way hosted pass with one generator allocation, an adequately budgeted native hosted bcrypt C=16 batch, a full third native-thumbnail CPU window, Go proxy/whole-Function CPU and RSS, exact enforced Vercel quota, and repeatability of loaded memory after different request histories. Codec-inclusive thumbnailing and a realistic within-request multicore job remain separate experiments. Current tables should not be published as an uninterrupted successful hosted run or a universal “TypeScript versus Go” verdict.
