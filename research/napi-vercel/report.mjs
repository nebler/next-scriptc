import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
const root=import.meta.dirname,read=n=>JSON.parse(readFileSync(root+'/raw/'+n+'.json'));
const s=read('summary'),pilot=read('attempt-2/summary');
const branch=execFileSync('git',['branch','--show-current'],{encoding:'utf8',cwd:root}).trim();
const f=n=>n.toFixed(3),modes=['node','sidecar','sync','async'],sizes=[1000,5000,15000,200000];
const table=x=>`| Events | Node | Sidecar | Addon sync | Addon async | n per variant |\n| ---: | ---: | ---: | ---: | ---: | ---: |\n`+sizes.map(size=>'| '+[size,...modes.map(mode=>{const r=x.warm.find(r=>r.size===size&&r.mode===mode);return f(r.p50)+' / '+f(r.p95)}),60].join(' | ')+' |').join('\n');
const r=(mode,size=5000)=>s.warm.find(r=>r.mode===mode&&r.size===size);
const win=modes.slice(2).every(mode=>r(mode).p50<r('node').p50);
const cold=s.cold.flatMap(c=>c.samples.map(x=>`| ${c.mode} | ${x.pair} | ${f(x.loadMs)} | ${f(x.firstCallMs)} | ${f(x.totalMs)} |`)).join('\n');
const deployments=[['Failed auto-start','attempt-1/deployment-1'],['Deduplicated 1','attempt-2/deployment-1'],['Deduplicated 2','attempt-2/deployment-2'],['Final 1','deployment-1'],['Final 2','deployment-2']].map(([label,file])=>{const raw=read(file),d=raw.deployment??raw;return `| ${label} | ${d.id} | https://${d.url.replace(/^https:\/\//,'')} |`;}).join('\n');
const lifecycle=['attempt-1/lifecycle','attempt-2/lifecycle','lifecycle'].map((name,i)=>{const e=read(name).events;return '| '+[i+1,e.find(x=>x.action==='unpause-completed')?.at,e.find(x=>x.action==='pause-completed')?.at,e.filter(x=>x.action.startsWith('production-')).map(x=>x.httpStatus+' at '+x.at).join('; ')].join(' | ')+' |';}).join('\n');
const text=`# In-process N-API revenue on Vercel

2026-11-01. Branch \`${branch}\`. A1's exact serialized Linux addon loads and runs on real Vercel hardware. **${win?'GO for the median-based feasibility gate':'NO-GO for the 5k median gate'}**. Every successful revenue result matches plain Node by SHA-256. The earlier warm window also wins 5k median, but loses p95. At 5k, Node takes ${f(r('node').p50)} ms median, addon sync ${f(r('sync').p50)} ms and addon async ${f(r('async').p50)} ms. Async saves ${((1-r('async').p50/r('node').p50)*100).toFixed(1)}%. The 1k workload loses. This is a restricted synchronous-core experiment, not production adapter approval.

## What runs

The prebuilt Build Output API deployment contains five plain Node Functions: one warm comparison and four first-call endpoints. This is the minimal separate application allowed by the task, on the existing next-scriptc project. There is no Next render or adapter extraction in the measured path. Explicit files in each Function bundle replace output-file tracing.

Stock scriptc 0.4.6, runtime ABI 47, stock @scriptc/runtime-linux-x64-gnu 0.4.6, Zig 0.16.0 and x86_64-linux-gnu.2.34 match A1. The reused 676,944-byte addon has SHA-256 \`9f579716b498a7c74ad0f4e7d6c09a357062d3c4656be54cc9c74a69c81771c8\`, identical to A1. Its archive was linked by Zig with the plain C shim in research/napi/src/addon.c. [Artifact record](napi-vercel/raw/artifacts.json) records the new stock sidecar build. The sidecar uses the current serveFunctions, createSidecar and callNative implementations with release, strip and node-islands off, targeting the same GNU pack. Historical adapter deployments used a musl pack and cpu-dispatch; this controlled A1-pack comparison does not reproduce those binary bytes.

All recorded successful hosted responses report Node 24.22.2, linux, x64, VERCEL_REGION iad1 and Intel Xeon at 2.50GHz. Each response's x-vercel-id contains ::iad1::. The first component is fra1 because the request driver runs in Europe. Two visible logical CPUs do not establish CPU entitlement. Function configuration requests 2048 MiB, x86_64, nodejs24.x, iad1 and maxDuration 300. CLI 65.8.0 deployed only previews. The project-level Node setting stayed unchanged.

## Warm comparison

Cells are **median / p95 milliseconds**, nearest-rank percentiles. Each row has **60 measured calls per variant after 15 retained warmups**. Order rotates on every iteration, sequentially, inside a single Function invocation per size. The same instance serves all four sizes. No timed sample is removed. Hashing follows the timer. Fixtures remain cached per runtime after their first call, while every call parses events, aggregates, sorts and returns the full result.

${table(s)}

At 5k, sync saves ${((1-r('sync').p50/r('node').p50)*100).toFixed(1)}% median and async saves ${((1-r('async').p50/r('node').p50)*100).toFixed(1)}%. Sidecar ${r('sidecar').p50>r('node').p50?'loses':'wins'} against Node. ${r('async').p95>r('node').p95?'Async loses 5k p95.':'Async wins 5k p95.'} The kill criterion is interpreted as a median win, consistent with the earlier 4.3 versus 3.8 ms result. The earlier window loses 5k p95 for both addon modes, so a p95 win across placements is not established. At 200k, async is ${(r('node',200000).p50/r('async',200000).p50).toFixed(2)} times as fast at median.

The earlier complete warm window is also retained and reported. Its first-call bundles were deduplicated, but its within-instance warm comparison remains valid. No data from that window is silently pooled or discarded.

${table(pilot)}

These are caller-side function intervals, excluding network and framework work. Node measures await revenue. Sidecar includes strict arguments, readiness access, loopback RPC and result parsing. Addon sync and async include strict argument encoding, native parse, aggregation, strict native result encoding, UTF-8 copies, JSON.parse and the permanent-owner-thread queue. Async also includes libuv scheduling. Server-Timing reports the whole batch interval; each individual interval is in the response JSON and raw data. NATIVE_VERCEL_TIMING is not used because this application measures the function directly.

The driver did not use the existing near-client: all comparisons run within the target Function, so server-side timing removes WAN latency. WAN request wall times are retained but are not the comparison metric. Sustained in-invocation loops can encounter CPU scheduling or quota effects unlike isolated HTTP requests. Tail spikes are included. Two warm instance placements and short windows do not establish fleet performance, sustainable throughput or an absence of scheduling bias.

## Fresh deployment first calls

Each final preview gives each first-call Function a different module file to prevent Vercel deduplication. The four UUIDs per deployment must be distinct. There are eight distinct cold instances across two fresh previews, with order reversed on the second. No first-call Function is warmed or probed before measurement. Size is 5k for all these calls. n is **2 per variant**, and both observations are shown instead of a misleading small-sample percentile.

| Variant | Preview | Module load ms | First call with init ms | Load plus first call ms |
| --- | ---: | ---: | ---: | ---: |
${cold}

Load starts immediately before dynamic workload imports or require of the addon. Addon first call includes pthread creation, runtime initialization and fixture generation. Sidecar load includes importing its client and spawning its child; first call includes waiting for readiness and the first RPC. These totals exclude Node process startup, platform activation and request routing, so they are not end-to-end cold-start latency. Common handler imports precede the timer for every variant. SHA-256 matches for every successful first call.

## Correctness and retained failures

Arguments are [2026-01-01, 2026-01-31, size, false]. Node runs the original async revenue function with types stripped at build time. The addon is A1's synchronous facade with the serialized permanent owner thread. Both addon modes share that owner during the warm comparison. The workload generator and strict result encoder are unchanged. Profile false keeps timings null.

| Events | SHA-256 of complete result JSON |
| ---: | --- |
${sizes.map(size=>`| ${size} | ${r('node',size).sha256} |`).join('\n')}

The server compares every result against its first Node warmup. The driver independently compares every retained result against A1's recorded plain-Node result bytes, including each complete cold result. Raw warmups and all outliers remain in [raw data](napi-vercel/raw). Each complete warm window contains 1,200 checked calls. The two complete windows and 17 successful first calls produce 2,417 verified results; the failed sidecar response is retained separately.

Attempt 1 imported the stock sidecar module without the adapter bootstrap flag. Its automatic singleton tried /var/task/scriptc-functions while the explicit test binary was named functions. Node succeeded, sidecar returned HTTP 500, and the run stopped and paused. The correction sets NEXT_SCRIPTC_VERCEL=1 inside the measurement process before dynamic imports, as the adapter does. No project environment variable changed.

Attempt 2 passed all warm comparisons but Vercel deduplicated byte-identical Function directories. Its first-call records share one UUID per preview, so later paths reuse modules and native initialization. Those eight records are retained as invalid cold evidence. Final packaging appends a distinct exported identifier to each Function module, and the driver asserts four distinct cold UUIDs. The final full warm run was repeated after this packaging correction. No deployment or sample was selected for speed.

## Preview identities and project pause

| Attempt | Deployment ID | Preview URL |
| --- | --- | --- |
${deployments}

| Window | Unpause completed UTC | Pause completed UTC | Production check |
| --- | --- | --- | --- |
${lifecycle}

After attempt 1, the immediate production check still returned 200. A repeated pause POST and subsequent curl returned 503, with API paused=true; [confirmation](napi-vercel/raw/attempt-1/pause-confirmation.json) records the observation by 10:51:51.547 UTC. Final pause completes at ${s.lifecycle.events.find(x=>x.action==='pause-completed').at}. The final production /api/hello check returns **503**. All pause and unpause operations used authenticated vercel api, never a raw auth.json token.

The private bypass was read from the main checkout's ignored .env.local and sent only as a header to the new preview URLs. It was never printed or committed. No production deploy, promotion, explicit alias/domain change, new project, environment setting change, Sandbox, Docker, push or upstream PR was performed. No pull/env-pull command changed .gitignore. Generated outputs are removed within this worktree after measurements.

## Remaining work

A1 now has Linux execution evidence and a hosted median comparison. It still needs restricted synchronous-core extraction, addon lifecycle cleanup, queue backpressure and cancellation, panic policy, ABI/build matrix and architecture-aware artifact tracing before adapter integration. The serialized design limits throughput and its async implementation occupies libuv workers while the owner computes. This experiment adds no concurrency soak, crash recovery proof or memory-growth certification on Vercel. A1's local soak remains separate evidence.

The first-call sample is small and omits platform activation. Warm timings come from a continuously busy custom Function, with no independent CPU quota measurement. The 1k loss and all p95 losses remain constraints on where this approach helps.

Scripts are [prepare.mjs](napi-vercel/prepare.mjs), [package.mjs](napi-vercel/package.mjs), [run.mjs](napi-vercel/run.mjs), [summarize.mjs](napi-vercel/summarize.mjs), and [report.mjs](napi-vercel/report.mjs). Preparation expects the stock GNU pack extracted into .checks/napi-vercel/package, reuses A1_ADDON after a hash check, strips JS with Node 24, and builds the sidecar. Fetch the pack with npm pack @scriptc/runtime-linux-x64-gnu@0.4.6 and extract its tarball there. Copy the existing project link into .checks/napi-vercel/.vercel/project.json. Run prepare.mjs and package.mjs before run.mjs. After the runner pauses, summarize.mjs derives the results. report.mjs formats this retained three-attempt investigation. run.mjs refuses existing lifecycle data, unpauses immediately before the first upload, and pauses in finally and on SIGINT/SIGTERM. To reproduce, use a fresh raw-data directory or preserve the prior raw directory first. Do not overwrite earlier measurements.
`;
writeFileSync(root+'/../use-native-napi-vercel.md',text);
