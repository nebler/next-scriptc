# Pre-registered workload selection — final round

Selection criterion: choose operations common in real Next.js applications, not operations selected for native performance. The fixed headline set is successful stored-password login using cost-10 bcryptjs, successful stored-password login using Node's built-in async scrypt, authenticated HS256 JWT verification, retained-index search over 3,000 products, uncached Markdown article rendering, and request-dependent full-content RSS. Small JSON `hello` is the transport control; primes is a synchronous CPU control; the million-order report at 1/2/4 workers is the synthetic sharing experiment, including the hand-flattened Node SharedArrayBuffer baseline. Existing CSV and OG-image probe refusals remain reported.

**Every selected workload is reported whatever the result**, including slower execution, compiler refusals, parity failures and Next's default 30-second proxy timeout. No workload will be removed or substituted after this registration. Both Node and native execute the same handler and request fixtures; Node retains its normal production optimization and JIT. Any intended native GET must depend on a realistic request input so both runtimes compute the response on every measured request. Node build prerendered paths are recorded separately.

The pre-registered library experiment compares installed `marked` 18.1.2 and `minisearch` 7.2.0 with their matching upstream TypeScript tags, using the demo's full article/RSS and catalog inputs. It reports Node published-JS, native published-JS and native TS-source steady-state per-call times, byte parity and coverage dynamic-tier counts, including exact compilation refusals. It does not change demo library resolution. One uninterrupted final quick local suite is indicative only; no sandbox run is authorized in this round.

---

# Benchmark protocol and final-round implementation

The direct comparison executes **the identical generated `.next/scriptc/entry-N.ts`**, HTTP shim included, under Node 24 type stripping and as a scriptc 0.4.6 binary. Production compares optimized Next 16.4.3 `next build` / plain `next start` with the adapter disabled (`.next-node`) against plain `next start` with the adapter and all resident native routes. Node keeps its default JIT, libuv threadpool and Next optimizations. No runtime tuning or speed-only compiler flags are added.

## Reproduce

Use Node **24.x**, pnpm **11.1.3**, and sequential builds from unchanged source:

```sh
pnpm install --frozen-lockfile
pnpm --filter demo build
NEXT_SCRIPTC_BASELINE=node pnpm --filter demo build
node examples/demo/bench/check.mjs
node examples/demo/bench/run.mjs --profile quick --output research/benchmarks/local-indicative
```

`quick` is one complete plumbing pass: every workload, both scopes/runtimes, three isolation loads and all worker variants at 1/2/4 workers. It uses one cold/steady repetition, 300 ms warmup, 400 ms measurement windows and at most 40 fixed-count CPU requests. `sandbox` uses three cold repetitions, two steady repetitions, 1 s warmup/windows, C=1/8/64. **Both password logins are bounded separately:** one cold sample per scope/runtime, one generator warmup plus three measured C=1 requests, once per scope/runtime. The same fixed sample supplies CPU and latency; p99 is only the maximum of three. Readiness/fixture checks execute additional untimed requests. No failed or cheaper authentication path replaces successful password verification.

All measured responses must have expected status and byte-identical SHA-256 bodies on all four surfaces. Successful JWT fixtures pin `DEMO_JWT_NOW=1793318400` and a public test signing key. Verify uses a precomputed valid HS256 token outside the timed work. Search uses `q=desk%20lamp&limit=7`; Markdown renders the full `reliable-webhooks` guide; RSS renders both full posts. Every server, generator and worker controller uses `process.execPath`. The harness rejects other Node majors and nonempty `NODE_OPTIONS`, records versions, source/entry/binary hashes, build IDs, dirty state, load averages and affinity, then rejects source/artifact/build changes during the run.

Sections are `coverage,cold,direct,production,isolation,threads`; `--sections direct,production` still automatically adds coverage and labels omitted sections absent. `--reverse` reverses steady runtime blocks for a distinct order check. There is no native start selector or results-resume/composition path. A retained local run comes from one uninterrupted invocation of the final harness.

## Async scrypt login

`POST /api/login-scrypt` keeps the bcrypt route's account normalization, input validation pattern, unknown-user derivation and HS256 JWT issuance. It uses a stored **16-byte salt and 64-byte derived key**, derived with **N=32768 (2^15), r=8, p=1, maxmem=64 MiB**. The salt/hash are public deterministic test fixtures; a real account would receive a fresh random salt. The working-memory term is about `128*N*r = 32 MiB`; 64 MiB allows implementation overhead. This is a realistic bounded demo work factor in the requested range, chosen before timing, not a universal password-policy recommendation. Scrypt has no bcrypt 72-byte truncation; input is explicitly bounded at 1024 UTF-8 bytes to limit request abuse.

The route wraps callback `crypto.scrypt` in a Promise rather than using `scryptSync`: production Node should keep request handling responsive while password derivation runs in libuv's default threadpool. `crypto.timingSafeEqual` compares equal-length stored/derived Buffers before the email check. Unknown users still do the derivation and comparison. The same JWT fields/signature are compared in full. Parity cases include successful login, wrong password, unknown email, malformed JSON/shape, empty/missing/wrong types, multibyte passwords above bcrypt's boundary, and the scrypt input limit.

Node documents [async scrypt, its memory bound and salt guidance](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback) and [threadpool use](https://nodejs.org/docs/latest-v24.x/api/crypto.html#crypto_scrypt_password_salt_keylen_options_callback). The [scriptc crypto reference](https://github.com/vercel-labs/scriptc/blob/main/docs/content/limitations/builtin-apis/crypto.mdx) supports scrypt options and timingSafeEqual but states that native derivations finish **before deferred callbacks**, blocking the caller. Isolation therefore measures runtime scheduling as well as process topology. The existing synchronous bcrypt regression remains reported; its isolation result cannot stand in for async production Node hashing. Async scrypt is also measured as an isolation load, with the same one-outstanding-request policy on both sides.

## Dynamic routes and the Node baseline

With `cacheComponents: true`, Next prerenders GET handlers that never touch runtime data. The pinned [Next route-handler guide](https://nextjs.org/docs/app/getting-started/route-handlers#with-cache-components), also installed at `examples/demo/node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`, explicitly lists `request.url` and `request.headers` reads as prerender termination signals. `export const dynamic` is not used.

`hello` reads `Accept-Language` and returns an English or German greeting with `Vary: Accept-Language`. RSS reads a validated `limit` query parameter and renders that many newest posts; the benchmark's default still includes both complete posts. These are useful request inputs, not dummy cache-busting reads. Both builds compute every measured response. The harness separately records `.next-node/prerender-manifest.json` paths. Ordinary UI and genuinely static output retain normal Next optimization.

`test/routes.mjs` sets **DEMO_PROXY_TIMEOUT_MS=180000** for correctness testing only and no longer preloads `test/proxy-timeout.mjs`. The adapter agent owns the config hook that consumes this variable; the reviewer must reconcile the name on merge. Benchmarks clear the variable and keep Next's **default 30 s upstream proxy timeout**. Native production failures with a ≥29 s HTTP 500 and an upstream `ECONNRESET`/socket-hang-up log are identified explicitly as exceeding that default, with elapsed time and full server logs retained. Other failures remain failures with their own diagnostic. A timeout is a real deployment consequence, never counted as low successful throughput. The entire production tree restarts before the next independent workload so abandoned bcrypt computation cannot contaminate later samples.

## TypeScript-source library experiment

See [the probe results](../examples/probe/RESULTS.md) and [retained machine-readable evidence](../examples/probe/source-experiment-results.json). Reproduce independently of the demo builds:

```sh
mkdir -p examples/probe/.sources
git clone --depth 1 --branch v18.1.2 https://github.com/markedjs/marked.git examples/probe/.sources/marked
git clone --depth 1 --branch v7.2.0 https://github.com/lucaong/minisearch.git examples/probe/.sources/minisearch
node examples/probe/source-experiment.mjs
```

The runner checks the clean tag commit, copies only the application handlers into ignored probe artifacts, resolves their local fixture imports to the originals, and changes **only the library import** for the TS variant. Upstream TS files are unmodified. Node uses the published package. Both native builds use release defaults and `--node-islands=off`. Each successful program warms 200 calls then times 500 calls in the same process; index construction and process startup are outside timing. Timing includes handler invocation and Response draining; a full untimed response is compared byte-for-byte against Node. All variants, counts, commands and compiler refusals are retained, including losses. Demo imports are unchanged. A useful TS-source outcome would require adapter support for **native-only aliases** while Next/Node resolve published JS, with source version/integrity pinned and parity rechecked.

## Historical diagnostics and cleanup

The previous local report was assembled from interrupted and replacement blocks. Those stitched/intermediate artifacts, composition script and one-off transport diagnostics are removed; history retains them. Their conclusions remain relevant: the old generator warmed a different process/connection pool from the measured one, and global `ps -axo` sampling every 100 ms disturbed short windows on this heavily loaded Mac. The corrected harness warms the same generator and keep-alive pool, uses an IPC measurement barrier and samples only established PIDs between boundary censuses. Server-side connection checks demonstrate actual reuse, not just a keep-alive flag. Historical hello p50/throughput disagreement did not establish a stable native transport regression.

The old worker metric subtracted a GC-sensitive post-construction RSS high-water mark and divided by workers. It could produce misleading negative allocation claims. The retained metric compares warmed 1-worker and 4-worker states in the same growing process: `(RSS4 - RSS1) / 3`, alongside raw RSS. This is net resident growth including GC/JIT/allocator history, not clone allocation size. Even warmed SAB RSS can fall; negative net deltas remain visible. The stronger Node SAB baseline stays beside Node object clones and native published objects.

## Metrics and resource isolation

- **Cold start:** monotonic spawn-to-first-fully-drained successful response, fresh process per sample, 2 ms retry polling. It includes route initialization and work, with filesystem caches retained; process-cold, not machine-cold or a platform/serverless cold start. Median averages the middle values; p90 uses nearest rank.
- **Idle RSS:** each owned process and simultaneous total after readiness plus the profile quiet interval, with the initializing route named. Native production includes Next, all route binaries and the current supervisor, even for uncalled routes. RSS is not PSS; shared pages can be counted more than once.
- **CPU/request:** stable application-tree user+system delta over exactly N sequential successful requests after generator warmup, divided by N. Linux `/proc/PID/stat` uses `utime+stime` and the host's `CLK_TCK`, excluding child-CPU counters; worker-thread CPU is already in process totals. macOS `ps TIME` has centisecond resolution. Generator CPU is separate. CPU boundaries still include census and generator shutdown gaps; tiny fixed counts are noisy. This is not a reproduction of Vercel's Active CPU billing instrumentation.
- **Peak RSS:** largest simultaneous known-tree RSS total sampled every 100 ms and at boundaries, with each process retained. It is a sampled lower bound, not a kernel high-water mark. Boundary discovery verifies stable PID membership; sampling cannot capture every transient subprocess or spike.
- **Throughput and latency:** HTTP/1.1 keep-alive, no pipelining; C closed-loop outstanding requests, dispatch until deadline then drain in-flight bodies. Throughput divides completions by actual dispatch-to-last-drain time, including drain. Latency includes request scheduling/socket acquisition/body draining. Nearest-rank per-run p50/p99, with median [min,max] across repetitions, not confidence intervals. No coordinated-omission correction or open-loop SLA claim. Login uses a fixed count instead of a deadline.
- **Topology cost:** native production minus native direct median p50/p99 and throughput ratio. Separate-run percentile differences are descriptive, not paired hop percentiles. They can be negative under noise and include Next routing/proxy effects.
- **Isolation:** separate bcrypt login, async scrypt login (realistic) and primes (synthetic) heavy loads. Warm heavy first; baseline/loaded probe `/` and `/api/hello` in parallel, one outstanding request per path, 20 ms pause after completion. Loaded holds one heavy request outstanding, starting 100 ms before probes. Record heavy completions; equal offered concurrency, not equal achieved RPS. An expensive request can outlive the window and is drained, not abandoned.

On Linux, discover four allowed logical CPUs from `/proc/self/status`. Both runtimes' entire application trees inherit the first two through `taskset`; the generator/controller/sampler use the next two. Thread experiments use all four without a sustained external generator. This fits Hobby's **four-vCPU** limit. CPU topology, SMT, memory bandwidth, shared-host interference and container resource accounting remain limitations. macOS cannot pin through taskset, so all local results are indicative. A single Node generator can saturate one JS core; rows flag CPU/wall ratios ≥0.8, marking throughput as a possible client-limited lower bound. This is not a calibrated generator ceiling.

Cold runtime order alternates by repetition. Default steady blocks are direct Node/native then production Node/native; `--reverse` reverses each runtime block. Run quiet sandbox passes in both orders before publishing close comparisons. Fixed fixture work and per-runtime budgets remain identical.

An HTTP failure or timeout is recorded as a `workload-failure` with the server log, and the dataset remains **failed** with a nonzero exit. Independent workloads continue. A failed production/isolation route causes its entire production tree to restart before the next workload, so abandoned bcrypt computation cannot contaminate later CPU/RSS/latency samples. Byte-parity and artifact-integrity failures still invalidate the run. Production keeps Next’s normal 30-second proxy timeout: it is never raised to make slow native login pass.

All processes started by the suite are owned and shut down in `finally`, including detached descendants. It refuses occupied ports rather than killing unrelated servers; checks port 3417 and every manifest port after each block and final cleanup. Failed measurements preserve partial JSON/Markdown labelled `failed`. SIGINT/SIGTERM abort through cleanup; SIGKILL cannot execute cleanup.


## Sandbox command and budget (not run here)

After merging and committing the implementation, run from the intended branch with Node 24 and existing Sandbox credentials in `.env.local`:

```sh
node --env-file=.env.local scripts/sandbox-bench.mjs
# Independent order check, if requested separately:
node --env-file=.env.local scripts/sandbox-bench.mjs --reverse
```

The runner uploads a SHA-256-verified **HEAD archive**, never uncommitted changes, ignored source clones, credentials or node_modules. It requests `vercel/sandbox/node:24`, four vCPUs, 30-minute lifetime, installs clang and taskset, installs the frozen lockfile and builds native then Node sequentially. Linux application/load affinity is 2+2 logical CPUs; worker experiments use all four. Downloads and provenance include partial failures; nested cleanup always attempts stop and reports active CPU or its unavailability.

With the extra bounded scrypt workload and isolation pair, estimated suite time is **9–18 min**, plus **about 8 min** tool/install/build allowance: **17–27 min total**, below the 28-minute overall abort and 30-minute lifetime. Extra scrypt work is bounded to one cold and three measured requests per surface plus untimed checks and one-outstanding isolation; it adds no C=8/64 hashing window. This is a budget estimate, not a measured sandbox guarantee: loaded hosts or slow builds can fail within the ceiling. Native build has a 10-minute timeout, Node build 3 minutes, install 3 minutes; the overall deadline takes precedence. No sandbox was provisioned in this round.

## Final local indicative run

Pending the final implementation checks. Only one uninterrupted quick invocation will replace [JSON](benchmarks/local-indicative.json) and [generated Markdown](benchmarks/local-indicative.md). It is a loaded-Mac plumbing check, not public performance evidence.
