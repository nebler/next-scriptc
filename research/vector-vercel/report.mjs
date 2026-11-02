import { readArtifact } from '../lib/artifact.mjs';
import {writeFileSync} from 'node:fs';
const load=n=>JSON.parse(readArtifact(`research/vector-vercel/${n}.json`));
const s=load('summary'),m=load('measurements'),rows=s.rows;
const find=n=>rows.find(r=>r.variant===n),p=find('patched-natural'),g=find('go-simd'),n=find('node'),plain=find('go-plain'),stock=find('stock-natural');
const f=x=>x.toFixed(3),pct=(a,b)=>((1-a/b)*100).toFixed(1);
const labels={'patched-natural':'Native patched, natural TS + dispatch','stock-natural':'Native stock 0.4.6, natural TS + dispatch','stock-imul':'Native stock 0.4.6, Math.imul + dispatch','go-simd':'Go experimental archsimd AVX2, v3','go-plain':'Go plain, v1, no SIMD experiment','node':'Node, natural TS'};
const table=['| Variant | Compute p50 / p95 ms | CPU ms/request | RSS MiB | WAN p50 / p95 ms |','| --- | ---: | ---: | ---: | ---: |',...rows.map(r=>`| ${labels[r.variant]} | ${f(r.computeP50Ms)} / ${f(r.computeP95Ms)} | ${f(r.cpuMsPerRequest)} | ${f(r.rssMiB)} | ${f(r.e2eP50Ms)} / ${f(r.e2eP95Ms)} |`)].join('\n');
const sets=['| Set | Variant | Compute p50 / p95 ms | CPU mean ms/request | RSS median MiB | Instances |','| --- | --- | ---: | ---: | ---: | ---: |',...rows.flatMap(r=>r.sets.map((x,i)=>`| ${i+1} | ${r.variant} | ${f(x.computeP50Ms)} / ${f(x.computeP95Ms)} | ${f(x.cpuMeanMs)} | ${f(x.rssMedianMiB)} | ${x.instances.length} |`))].join('\n');
const first=['| Set | Variant | First WAN ms | First compute ms | Corpus init ms |','| --- | --- | ---: | ---: | ---: |',...rows.flatMap(r=>r.first.map(x=>`| ${x.round} | ${r.variant} | ${f(x.e2eMs)} | ${f(x.computeMs)} | ${f(x.initMs)} |`))].join('\n');
const concurrent=['| Variant | C=4 count | Compute p50 / p95 ms | WAN p50 / p95 ms | Per-set req/s |','| --- | ---: | ---: | ---: | --- |',...rows.map(r=>`| ${r.variant} | ${r.concurrent.n} | ${f(r.concurrent.computeP50Ms)} / ${f(r.concurrent.computeP95Ms)} | ${f(r.concurrent.e2eP50Ms)} / ${f(r.concurrent.e2eP95Ms)} | ${r.concurrent.sets.map(x=>f(x.rps)).join(' / ')} |`)].join('\n');
const deploys=[1,2,3].flatMap(i=>['node','stock','patched'].map(k=>load(`${k}-${i}`)));
const deploymentTable=['| Set | Group | Preview | ID | Functions |','| --- | --- | --- | --- | ---: |',...deploys.map(d=>`| ${d.round} | ${d.kind} | [${new URL(d.url).hostname}](${d.url}) | \`${d.id}\` | ${d.deployed.functions.length} |`)].join('\n');
const audit=load('patched-audit'),sz=load('stock-size'),go=load('go-sizes');
const sizeRows=[['Native stock grouped executable',sz.bytes,sz.sha256],['Native patched grouped executable',audit.stripped.bytes,audit.stripped.sha256],...Object.entries(go).filter(([path])=>!path.includes('simd')||path.endsWith('user-server')).map(([path,v])=>[path.includes('simd')?'Go SIMD user-server':path.endsWith('executable')?'Go IPC proxy, shared identical bytes':'Go plain user-server',v.bytes,v.sha256])];
const sizes=['| Artifact | Bytes | SHA-256 |','| --- | ---: | --- |',...sizeRows.map(x=>`| ${x[0]} | ${x[1]} | \`${x[2]}\` |`)].join('\n');
const dispatch=m.rounds.map(r=>{const v=r.rows.find(v=>v.variant==='patched-natural');return {round:r.round,level:v.afterSequential.body.dispatchLevel,instance:v.afterSequential.body.vectorInstance,matched:v.sequential.filter(x=>x.instance===v.afterSequential.body.vectorInstance).length}});
const headline=p.computeP50Ms<g.computeP50Ms?`Natural TypeScript int8 vector search, compiled by the patched scriptc with CPU dispatch, used **${f(p.computeP50Ms)} ms server compute p50 versus ${f(g.computeP50Ms)} ms for experimental Go SIMD** on Vercel iad1, **${pct(p.computeP50Ms,g.computeP50Ms)}% lower**. The same query, 100,000×768 corpus and exact top-10 output were checked on every response across three fresh preview sets. Go plain was ${f(plain.computeP50Ms)} ms, Node ${f(n.computeP50Ms)} ms, and stock natural TS ${f(stock.computeP50Ms)} ms. This is a short, synthetic resident-vector workload, not a general TypeScript-versus-Go ranking.`:`The hosted headline claim does not hold: patched natural TypeScript used **${f(p.computeP50Ms)} ms server compute p50 versus ${f(g.computeP50Ms)} ms for experimental Go SIMD** on Vercel iad1. All variants returned identical results. Go plain was ${f(plain.computeP50Ms)} ms and Node ${f(n.computeP50Ms)} ms. Keep this hosted loss alongside the earlier Linux kernel win.`;
let doc=`# Vector search on Vercel: patched TypeScript and fair Go controls

${headline}

2026-10-31. Local branch \`hillclimb/vector-vercel\`, based on \`hillclimb/int8-vectors\` at \`${load('provenance').baseCommit}\`. No push or merge. All previews belong to the existing linked \`next-scriptc\` project. No Sandbox, custom domain or project-setting change. The existing Docker validation suite and Supabase containers were not touched.

## Measurements

${table}

Each row pools **120 C=1 requests**, 40 from each of three fresh preview sets after ten warmups per set. All samples remain included. Compute and WAN percentiles are nearest-rank; CPU/request is the arithmetic mean of direct process user+system deltas, and RSS is the median post-work serving-process observation. The raw samples also retain CPU median, RSS maxima, instance tokens, warmups, request IDs and corpus-generation durations. WAN latency is secondary: this load client runs on a busy Mac in Europe, outside iad1, and includes the long network round trip. No timing benchmark ran on this Mac.

The headline compute boundary starts after the complete request body has been read, immediately before JSON parsing and query validation, and ends after scoring, top-10 selection and JSON serialization/Response creation. Both languages use that definition. TS \`Response.json\` constructs the response; Go \`json.Marshal\` creates the matching bytes before \`w.Write\`. Native/Node response-object construction is included; Go has no equivalent object. Headers already set by the vector response/init path can enter the interval, but diagnostic/timing header construction, RSS sampling and the final network write are outside it. Corpus generation, Next/platform routing, IPC, request-body transport and response transport are excluded. These are server handler observations, not the platform's full Function duration.

CPU uses \`process.cpuUsage()\` before/after on Node/native and \`getrusage(RUSAGE_SELF)\` on Go, in microseconds, around that work. It includes the monotonic clock reads and any background process/thread work in that interval; it omits CPU before/after it, including most framework/IPC transport work. Go excludes its separate IPC proxy. Native includes the executable and its in-process IPC runtime; Node includes all process threads. This direct per-response method avoids inferring request affinity from two separate diagnostic requests. It does not establish billed Active CPU, whole-instance efficiency or full-route CPU/request. C=4 overlapping process CPU samples are retained but are not used for per-request efficiency comparisons.

A read-only [accounting consistency audit](vector-vercel/accounting.json) compares all 33 retained diagnostics with process stat CPU ticks. With the existing protocol's 100 Hz conversion, API versus procfs totals differ by at most 16.257 ms across separately timed reads; all available VmRSS readings agree exactly. Hosted CLK_TCK was not independently queried, and this is a cumulative-counter consistency check, not full concurrent-thread validation or a total-route CPU measurement.

RSS is resident process memory immediately after work, not allocation, PSS, whole-instance memory or a lifetime maximum. The Go proxy is excluded. Native routes share a corpus and other application modules, so stock natural and stock imul memory history is shared. Different instances/GC/allocator histories can affect these values. All variants request 2048 MiB, which is allocation rather than measured use.

### Losses and limits on the win

Patched TS wins the registered C=1 compute comparison against Go SIMD in all three sets. That does not turn the full route into a universal win. Its C=1 WAN p95 is **${f(p.e2eP95Ms)} ms versus ${f(g.e2eP95Ms)} ms** for Go SIMD. In C=4, patched TS has **${f(p.concurrent.e2eP50Ms)} / ${f(p.concurrent.e2eP95Ms)} ms** WAN p50/p95 versus Go SIMD **${f(g.concurrent.e2eP50Ms)} / ${f(g.concurrent.e2eP95Ms)} ms**, and lower observed req/s in every set. These remain losses in the retained short WAN experiment; no cause is assigned and no maximum-capacity claim is made.

The first patched responses were 1.091–1.405 seconds, versus 0.339–0.417 seconds for the separate Go SIMD Functions, with different deployment-first/Function-first scopes as labelled below. Set 2 patched first response also loses to Node, 1404.619 versus 1097.851 ms. Corpus generation alone is slower for patched TS, 583–794 ms versus Go SIMD 350–381 ms. Platform prewarming and placement prevent treating these as certified cold-start ratios.

Stock imul is already competitive at **${f(find('stock-imul').computeP50Ms)} ms p50** and has a slightly lower compute p95 than patched natural TS, **${f(find('stock-imul').computeP95Ms)} versus ${f(p.computeP95Ms)} ms**. Patched native also uses slightly more observed RSS, ${f(p.rssMiB)} versus ${f(find('stock-imul').rssMiB)} MiB, and its full grouped executable is 870,984 bytes larger than stock, about 5.04%. The practical result is that natural multiplication reaches the fast path; this run does not establish that the patch accelerates an already-optimized imul route.

Node's set p50s range from 67.285 to 111.786 ms, and Go plain from 46.137 to 56.329 ms. Their CPU deltas can be materially below elapsed compute time. Scheduling, throttling, GC, JIT tier and hardware placement are not isolated here. Reported timing differences are observations under these platform conditions. This is a comparison with the shared fair Go implementations packaged via the pinned proxy, not a measurement of the Next team's route.go prototype itself.

### Variation across fresh sets

${sets}

The native/Go-SIMD p50 ratios by set are ${p.sets.map((x,i)=>f(x.computeP50Ms/g.sets[i].computeP50Ms)).join(' / ')}. Values below one favor native. These are three descriptive sets, not a confidence interval, hardware-matched pairs or a fleet guarantee. Build/deployment creation order was Node/Go sets 1–3, then stock sets 1–3, then patched sets 1–3. Warm measurement was interleaved across all six variants within each set, one request at a time, rotating variant order after every pass and reversing base order in set 2. Set 3 uses the set-1 base order. Deployment age and host placement were not controlled.

### Short concurrency windows

${concurrent}

Each set/variant uses a new keep-alive pool, C=4, four warmup requests, then at most 2 s or 16 dispatched requests, first limit wins, draining all outstanding requests. Raw JSON records each cap, drained elapsed time and client CPU. C=4 can introduce queueing, overlapping CPU observations and scale-out. These short closed-loop WAN windows are secondary observations, not sustainable Function throughput or an open-loop tail test. No coordinated-omission correction is applied.

## First requests after deploy

${first}

For every preview, the natural TS or Node request was the first operator request, before diagnostics or warmup. Go plain and Go SIMD each use an untouched separate Function, after the Node request on that preview. Stock imul is only route-first: it shares the already-invoked natural Function and resident corpus. No browser, health check or parity invocation preceded these samples. Preview deployment freshness does not prove process-cold state; the platform may prewarm or reuse cached artifacts. The client uses a fresh HTTP agent for each first endpoint, so these WAN values include connection setup. Corpus init is a separately reported generation duration, not total activation or startup time.

## Dispatch and patched-code evidence

The patched CLI and emitted wrapping-sum implementation match the V4 provenance hashes exactly. The source wrapping-sum file in \`/Users/noah/code/scriptc-fork-v4\` matches too. That checkout contains the rebuilt main-compatible musl runtime but no built CLI, so compilation reuses the existing read-only CLI in \`/Users/noah/code/scriptc-fork\`, with the existing runtime resolver preload directed at V4's musl pack. No shared fork was rebuilt or edited. [Provenance](vector-vercel/provenance.json), [binary audit](vector-vercel/patched-audit.json), [route codegen](vector-vercel/vector-assembly.json).

Both native compilers receive \`--cpu-dispatch\`. Stock uses the normal adapter build. Patched recompiles the **identical generated Vercel entry** with release optimization and the patched compiler/runtime, then replaces the shared native Function's executable. The audit retains the entry SHA-256, fixed-address ELF header, compiler global address and exact stripped executable hash. It verifies byte-identical \`.text\` and \`.data\` before/after stripping. This is the same real adapter entry and IPC handler, not a kernel executable substituted for the route.

The optimized search is inlined into request closures. Both v3 closures contain \`vpmovsxbw\`, signed pair multiplication \`vpmaddwd\` and 256-bit \`vpaddd\` accumulation. The dispatcher compares \`sc_cpu_level\` with 3 at the recorded global address **${audit.address}** (\`${audit.addressHex}\`); baseline copies have no AVX instructions. The natural source still uses \`(sum + data[base + j] * embedding[j]) | 0\`; it was not rewritten to imul or intrinsics. LLVM retains ordinary floating semantics/fallback in its input IR while the valid integer path is optimized.

The diagnostic opens \`/proc/self/mem\` and reads exactly four bytes at that fixed ELF symbol address in its **own process**, only when the benchmark address environment variable is supplied. It neither writes memory nor changes dispatch. The three initial hosted patched diagnostics and these post-C=1 diagnostics report actual level **3**, with \`SCRIPTC_CPU_LEVEL\` unset:

| Set | Observed dispatch level after C=1 | C=1 responses matching diagnostic process token |
| --- | ---: | ---: |
${dispatch.map(x=>`| ${x.round} | ${x.level} | ${x.matched} / 40 |`).join('\n')}

Every retained native CPU-info diagnostic exposes AVX2 and the v3 feature family; sampled hosts show family 6/model 63, two visible logical CPUs and affinity \`0-1\`. The raw flags and status are retained with each deployment and post-C=1 diagnostic. [Vercel's documented Hobby allocation](https://vercel.com/docs/functions/limitations#memory-size-limits) is **2 GB / 1 vCPU**. Visibility of two logical CPUs is not evidence of two entitled vCPUs. Quota files were unavailable; the enforced quota was not measured. No within-request threads or multicore search were added. The optional forced-baseline preview was omitted because reading the actual dispatch global succeeded on all three measured native processes; no tenth preview was needed.

## Baselines, correctness and scope

All variants use the existing 100,000×768 xorshift32 corpus, 76,800,000 bytes resident, seed 0x12345678, and the existing 2,813-byte query fixture. The server receives the quantized query, scans every row, computes exact signed int8 dot products and returns top-10 IDs/scores ordered by descending score and ascending ID on ties. There is no result memoization. The request SHA-256 is \`${load('reference').requestSha256}\`; the byte-identical response SHA-256 is \`${load('reference').responseSha256}\`, also matching the prior HTTP experiment. [Reference](vector-vercel/reference.json).

Every timed, warmup and first response validates HTTP status, JSON content type, no-store, non-HIT CDN state and the complete drained-body hash. Each response also validates finite nonnegative compute/CPU, positive RSS and an instance token. Errors stop the run and preserve partial JSON. No failed response, outlier or slow sample is dropped. Latency stops at body drain before hashing, while window throughput includes validation overhead. Diagnostics have dynamic JSON and are validated for status/type/no-store rather than a fixed content hash.

Go plain is the existing idiomatic signed widening/int32 loop, built with \`GOAMD64=v1\` and no SIMD experiment. Go SIMD is the existing explicit **experimental Go 1.27.3 \`simd/archsimd\` AVX2** implementation, built separately with \`GOEXPERIMENT=simd GOAMD64=v3\`; a feature-check failure returns 503, never a scalar fallback. This is handwritten use of Go's experimental intrinsics API, not a claim about a stable third-party SIMD library. [Official experiment description](https://go.dev/blog/simd-experiment). Node runs the vanilla Next route using the same TS source and no special runtime tuning.

Go deployment reuses the pinned public Vercel IPC proxy at \`84878e532142f0ac584953695658b324eb9e5b80\`, as in [go-territory.md](go-territory.md). Each Go binary has its own Function; aliases are symlinks, and every inspected deployment is below 12 Functions. Native talks IPC in-process; Go uses the separate proxy plus net/http user-server. These differences affect WAN/full-route behavior and process coverage even though the server compute interval excludes the proxy. Build helper resource settings are iad1, x86_64, 2048 MiB, 300 s; Node is \`nodejs24.x\`, native/Go \`executable\`.

Stock 0.4.6 versus patched main includes intervening compiler and runtime changes. It demonstrates the practical installed-versus-patched effect, not a patch-only causal estimate. The separate main-versus-patch causal experiment remains [scriptc-int8-range-analysis.md](scriptc-int8-range-analysis.md). Earlier Linux kernel/self-hosted results are not pooled with these hosted samples. This is synthetic exhaustive resident-index retrieval, not ANN recall, embedding/model quality, cosine normalization, external-storage access or a general language ranking. The compiler patch's full validation status belongs to that separate work; this experiment does not certify a full compiler suite.

## Binary sizes and packaging

${sizes}

These are uncompressed executable bytes, not private platform image/download size. The native number covers the full grouped demo, not only the vector kernel. Go total executable payload is user-server plus the 7,241,888-byte proxy per Function. Node has no standalone native executable. Uploaded Function ZIP sizes and path grouping are preserved in deployment metadata. Dataset generation avoids shipping a random 76.8 MB file in every bundle. Build duration on this busy Mac is not a performance result.

## Deployments

${deploymentTable}

All are inspected READY previews, retained for inspection. Node group exposes \`/api/heavy/vectors\`, \`/api/heavy-go/vectors?kernel=plain\` and \`/api/heavy-go-simd/vectors?kernel=simd\`. Native groups expose \`/api/heavy/vectors\`; stock imul uses \`/api/heavy/vectors-imul\`. The diagnostic is \`/api/heavy/diagnostics\` or the corresponding Go-prefix diagnostic. Protected requests use the existing private bypass from gitignored \`.env.local\`. No secret value is printed or committed.

## Commands and validation

Exact reproducible commands are below. Node 24.22.0, pnpm 11.1.3, Next 16.4.3, Vercel CLI 65.8.0, Go 1.27.3 and Zig 0.16.0 were used. Artifacts under \`/tmp/vector-vercel\` and \`.vercel\` are not committed. The deployment script refuses duplicate saved labels; move the previous raw run directory before intentionally reproducing a new experiment. Retain its accepted deployment IDs before retrying any failed control-plane action.

\`\`\`sh
# Initial branch, before any edit
git checkout -b hillclimb/vector-vercel hillclimb/int8-vectors
export PATH=/Users/noah/.local/share/fnm/node-versions/v24.22.0/installation/bin:/Users/noah/.local/share/zig-0.16.0:$PATH
pnpm install --frozen-lockfile
# Existing root project link and private .env.local copied into this worktree
vercel project inspect --non-interactive
vercel pull --yes --environment=preview
# Restore duplicate .gitignore lines added by pull to the original tracked content

VECTOR_VERCEL_TIMING=1 node --test examples/demo/bench/heavy/vector-test.mjs
node --test examples/demo/bench/heavy/vector-test.mjs examples/demo/bench/vercel/test.mjs
(cd examples/demo/go && GOEXPERIMENT=simd go test ./vectors)

NEXT_SCRIPTC_BASELINE=node NEXT_SCRIPTC_DEMO_GROUPS=vercel VECTOR_VERCEL_TIMING=1 node examples/demo/bench/vercel/build.mjs
node --input-type=module <<'JS'
import {addHeavyGo} from './examples/demo/bench/vercel/heavy-go.mjs';
await addHeavyGo({prefix:'heavy-go',goamd64:'v1',experiment:''});
await addHeavyGo({prefix:'heavy-go-simd',goamd64:'v3',experiment:'simd'});
JS
node research/vector-vercel/deploy.mjs node

# Initial native build failed with SC3004, then this documented hook fixed it
node node_modules/.pnpm/scriptc@0.4.6/node_modules/scriptc/scripts/install-native.mjs
NEXT_SCRIPTC_DEMO_GROUPS=vercel VECTOR_VERCEL_TIMING=1 node examples/demo/bench/vercel/build.mjs
node research/vector-vercel/deploy.mjs stock

mkdir -p /tmp/vector-vercel
SCRIPTC_TARGET=x86_64-linux-musl SCRIPTC_CHECKER_SERVER=0 SCRIPTC_CACHE_DIR=/tmp/vector-vercel/cache \\
  research/vector-vercel/patched-cli.sh build "$PWD/examples/demo/.vercel/scriptc-build/entry-0.ts" \\
  --optimization release --cpu-dispatch --keep-llvm -o /tmp/vector-vercel/patched-unstripped
node research/vector-vercel/audit.mjs
python3 research/vector-vercel/codegen.py
cp /tmp/vector-vercel/patched .vercel/output/functions/api/heavy/vectors.func/executable
chmod +x .vercel/output/functions/api/heavy/vectors.func/executable
node research/vector-vercel/deploy.mjs patched
node research/vector-vercel/measure.mjs
node research/vector-vercel/summarize.mjs
node research/vector-vercel/accounting.mjs
node research/vector-vercel/report.mjs
\`\`\`

\`deploy.mjs\` uses the established trace-integrity check and exact preview command \`vercel deploy --prebuilt --regions iad1 --environment preview --force --json\`, adding only public per-deployment benchmark settings and the existing public parity fixture environment. It records accepted identity before inspection or HTTP. No \`vercel env pull\` secret is passed in a command argument. The initial patched wrapper attempt failed before compilation because its preload path was relative; the corrected wrapper resolves its directory absolutely. Both setup failures remain in [setup.json](vector-vercel/setup.json), and the native permission failure log is retained. No hosted attempt was retried or replaced.

Local checks: 10/10 existing vector/harness tests and 21/21 adapter tests pass; Go vector correctness tests pass. The only standalone local vector search was a correctness reference/hash smoke, with no retained timing. Hosted main measurement status is **${m.status}**, **${m.requestsIssued}** client requests including 18 post-C=1 diagnostics, plus **${deploys.reduce((a,d)=>a+d.first.length+d.diagnostics.length,0)}** deployment-first/diagnostic requests. Total hosted attempts are ${m.requestsIssued+deploys.reduce((a,d)=>a+d.first.length+d.diagnostics.length,0)} across nine previews, with zero failed application responses and zero Sandboxes. Main client elapsed ${f(m.elapsedMs/1000)} s; its own CPU/wall ratio ${f(m.generatorCpuCores)} cores. Concurrency-window client CPU is in raw JSON. The Mac's background load and WAN restrict end-to-end and throughput interpretation; they do not enter the server's monotonic compute interval directly.

Raw artifacts are compact JSON in [vector-vercel/](vector-vercel/): complete samples in [measurements.json](vector-vercel/measurements.json.gz), derived [summary.json](vector-vercel/summary.json), per-preview first requests/diagnostics/deployment identities, compiler/runtime [provenance](vector-vercel/provenance.json), [reference](vector-vercel/reference.json), [assembly](vector-vercel/vector-assembly.json), binary audit/sizes, tests and [prospective protocol](vector-vercel/method.md). No screenshots or response/error bodies containing protection credentials are retained.
`;
writeFileSync('research/vector-vercel.md',doc);
console.log(table);
