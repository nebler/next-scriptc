import json,statistics, pathlib
base=pathlib.Path(__file__).parent
s=json.loads((base/'raw/summary.json').read_text())
def table(run):
 lines=['| Events | Always JS | Always native | Auto | n per mode |','| ---: | ---: | ---: | ---: | ---: |']
 for c in s[run]['cells']:
  lines.append('| '+str(c['size'])+' | '+' | '.join(f"{c['modes'][m]['median']:.3f} / {c['modes'][m]['p95']:.3f}" for m in ['js','native','auto'])+' | '+str(c['modes']['js']['n'])+' |')
 lines+=['','| 100-call mixed total | Always JS | Always native | Auto |','| --- | ---: | ---: | ---: |','| ms | '+' | '.join(f'{s[run]["mixed"][m]:.3f}' for m in ['js','native','auto'])+' |']
 return '\n'.join(lines)
local=json.loads((base/'raw/local-overhead.json').read_text())
localms=lambda k:statistics.median(x['dispatch']-x['direct'] for x in local[k]['rows'])
text=f'''# Automatic promotion prototype results

2026-11-01. Branch `t3/automatic-native-promotion`. **NO GO for useful automatic acceleration on this workload.** Discovery, one-library compilation, dispatch and shadow demotion work in the restricted prototype. Corrected auto chooses JavaScript in every bucket. Its observed mixed total beats both baselines, but that difference cannot be attributed to native acceleration because auto makes zero native answers. Fleet performance and the per-bucket noise gate are not established.

## Corrected hosted measurements

Cells show conventional median / nearest-rank p95 in milliseconds. Every sample and outlier is retained in [the corrected response](auto-promotion/raw/corrected/measurement.json).

{table('corrected')}

Mixed totals sum exactly 100 timed calls per configuration: 70 at 1k, 20 at 5k and 10 at 200k. These are observed totals, not sums of bucket medians. Auto is 6.46% faster than JS by observed total, despite executing the same JavaScript. At 1k its median is 2.76% slower, and at 5k 1.40% slower. This placement has scheduling spikes, including JS p95 outliers. One corrected placement with n=10 at 200k cannot establish an equivalence margin or a repeatable mixed win. No samples were filtered.

All buckets enter shadow at call 20 and settle at call 100 after five verified native matches, with one shadow opportunity every 20 calls. Buckets 16, 18 and 23 all settle on `js-final`. **No corrected bucket promotes.** The earlier, incorrect timing policy promotes 200k at call 100. Defaults cap shadows at 50 per minute per function and skip them whenever native work is outstanding. The harness drains background work outside the caller interval so a synthetic tight loop cannot starve all completion callbacks.

The 300 retained warmup answers and 300 measured answers match their strict serialized JS baseline, 600 of 600 per preview. Fifteen revenue shadow results per preview also match strict serialized bytes. The deliberately corrupted mismatch candidate is separate: its first shadow at call 2 mismatches, demotes, and all ten caller answers remain the expected JS value 6. Its native answer counter stays zero. The corruption adds one to the actual second compiled table entry's native result. It is an explicit injection, not a naturally occurring compiler mismatch. The mismatch input hash is retained in transition logs.

## Dispatcher overhead

The microbenchmark compares direct `fn(...args)` with dispatch of the same trivial function. Each of 20 retained rounds contains 10,000 calls per path. Overhead is the paired per-call difference; no round is discarded. A result accumulator prevents dead-code removal. The initial-state case sets the JS sampling threshold to Infinity, retaining both timing calls and bounded timing-history updates without transitioning. The settled-state case uses the JS routing mode with the same lookup and dispatch path as `js-final`.

| Location | Settled JS median overhead, ms/call | Initial JS median overhead, ms/call | Rounds × calls/path |
| --- | ---: | ---: | ---: |
| Local Node 26.13.0 | {localms('result'):.9f} | {localms('initial'):.9f} | 20 × 10,000 |
| Vercel Node 24.22.2 | {s['corrected']['overhead']['overhead']['median']:.9f} | {s['corrected']['overhead']['initialOverhead']['median']:.9f} | 20 × 10,000 |

Both pass the 0.005 ms budget. The local machine is shared with another agent's WebAssembly CPU benchmarks; it is not an idle-machine result. No sustained local throughput run was added. The hosted timings run entirely inside iad1 and exclude WAN latency. Server-Timing records the batch interval; individual function intervals are in JSON. Shadow native work runs on the permanent pthread through N-API async work, while JS answers synchronously. Input capture and strict validation add cost only at shadow opportunities and are included in warmup caller intervals.

## Retained first attempt and correction

{table('first')}

The first timing implementation omitted argument serialization and result parsing from native shadow timings. Native caller intervals included both. That biased the promotion test and incorrectly promoted 200k. The first mixed auto total loses to JS by 28.28%. The correction records input-encoding duration and adds native output parsing before recording the native interval. Strict comparison follows that timer. The complete first deployment and observations remain evidence of this failed policy, not a second replicate of the corrected implementation.

The corrected shadow intervals total {s['corrected']['shadowTimeLowerBound']:.3f} ms across 15 calls. This is elapsed native-boundary work, not isolated CPU billing, and omits strict comparison cost. All corrected buckets remain JS, so these shadows buy no subsequent compute savings. Thus the shadow-cost kill concern remains: this workload pays verification cost with no native savings. A CPU-billing experiment and production arrival-rate experiment were not performed.

## Method and build

The demo adds `examples/demo/lib/revenue-core.ts`: a plain sync `revenueCore(from,to,eventsJson)` with no directive, plus the time-reading decoy, getter decoy and injected-mismatch candidate. Existing async `revenue` and its explicit native path remain intact. The core receives actual event JSON rather than A2's numeric size and lazy fixture cache. This makes the specified shallow string-length estimator meaningful. It also changes the boundary substantially: the event text is encoded into the JSON arguments, copied into native, and parsed there. A2's speedup with four small fixture-selection arguments does **not** carry over. Generating inputs is outside timed calls in every configuration.

Stock scriptc 0.4.6, ABI 47, Zig 0.16.0, stock GNU runtime 0.4.6 and target `x86_64-linux-gnu.2.34` match A1/A2. The host is macOS arm64, Node 26.13.0. Hosted responses report Node 24.22.2, x64 and iad1. Both addons are newly compiled from the discovered core and mismatch candidate into one archive and one addon per target. [Artifact sizes and hashes](auto-promotion/raw/artifacts.json) identify them. A1's C serialized owner-thread implementation is generalized to an id-indexed function table. Runtime-owned output bytes are copied before the next export. Panic poisons the native instance and demotes all dispatcher buckets.

Discovery reuses `extractFunctions` and the application TypeScript checker. The v1 purity screen rejects opaque runtime imports, time, randomness, I/O, module mutation and direct argument mutation. Type-only imports remain valid. Local helpers and constants are included by extraction. Runtime imports are deliberately more conservative than the design's ideal transitive analysis. The work screen requires a loop, recursion, array callback or JSON parse. `use js` opts out. `nativePromotion` defaults to off for compatibility. Explicit sync hints in auto mode skip the work screen and fail loudly on compile refusal; existing async `use native` stays on its original sidecar path. File-level sync hints are not added.

The compiler probes the growing accepted set, then leaves one combined archive. A failed automatic candidate is logged and excluded; a forced candidate propagates its failure. The addon is copied to traced Node outputs, conservatively included when tracing is uncertain. Dev never calls the production preparation hook.

Validation includes root `pnpm test`, eight new discovery/dispatch/loader/refusal tests, three host core parity calls at 1k/5k/200k, and 105 correct calls through actual `prepareFunctions`, loader, promotion client and host addon. Test logs and the integration record are retained. The Vercel measurement uses a minimal Build Output API Function like A2, not a full Next application deployment. Full Next build and production-server lifecycle validation, including custom dist directories and monorepo tracing, remains a blocker.

## Deployments and pause lifecycle

| Implementation | Deployment ID | Preview |
| --- | --- | --- |
| Incorrect shadow timing | dpl_GokzYRnaYYcMXdoHh8NnE7TSyy4e | https://next-scriptc-7jhrxulj6-noahs-projects-8a075d15.vercel.app |
| Corrected timing | dpl_4SL5PUwKJFRwqNd55tspw5gzuduX | https://next-scriptc-2w517zwhl-noahs-projects-8a075d15.vercel.app |

| Window | Unpause completed UTC | Last measurement UTC | Pause completed UTC | Final confirmation UTC |
| --- | --- | --- | --- | --- |
| First | 11:21:13.679 | 11:21:49.238 | 11:21:50.779 | 11:22:07.743 |
| Corrected | 11:24:02.665 | 11:24:37.139 | 11:24:38.225 | 11:24:39.093 |

All timestamps are on 2026-11-01. The first immediate check returned 200 despite API paused=true, including after a second pause request. A further pause confirmed **503 and paused=true** at 11:22:07.743. The corrected window confirmed **503 and paused=true** immediately after its pause. Lifecycle records preserve the failed first confirmation. A preflight attempt stopped before unpausing because `project inspect` writes its details to stderr; its failure is retained separately. Local initial builds failed on the worktree compiler's TypeScript server permission and then a missing Linux runtime pack. Using A1's main-checkout installed compiler and restoring the stock pack produced both targets. No compiler source checkout was changed.

The runner reads the bypass only from the main checkout's private `.env.local`. It never prints it. No production deployment, promotion, explicit alias, domain, project setting, environment setting, new project, Sandbox, Docker, push or upstream issue/PR was used. No `vercel pull` command ran, so `.gitignore` needed no reversal. Generated outputs are deleted only inside this worktree after validation.

## GO and kill verdicts

| Criterion | Outcome |
| --- | --- |
| Best per bucket within noise; mixed total beats both | Observed corrected mixed total wins, but all auto answers use JS. Per-bucket equivalence and repeatability are unproven. No useful native promotion demonstrated. |
| Dispatcher overhead ≤0.005 ms | Pass locally and on Vercel, including the initial timed state. |
| Outputs identical | Pass for all 1,200 returned revenue answers across both windows and 30 revenue shadows. Intentional corruption is detected separately. |
| Injected mismatch demoted before native answer | Pass in both previews and unit tests; native answer count zero. |
| 1k overhead kill | Microbenchmark does not trigger the budget kill. Observed 1k auto median is slower; its source is not isolated from scheduling noise. |
| Shadow CPU cancels mixed savings | No native savings exist after correction. Verification cost is positive; a CPU billing verdict is unmeasured. |

Remaining blockers include full Next deployment validation, transparent imported-helper purity analysis, robust addon unload/cancellation, architecture/header provisioning beyond the tested matrix, and representative traffic timing. A conservative `/tmp` active marker disables automatic loading after an unclean prior process exit; that marker can also reject a normal hard serverless termination or another isolate. It is not proof of crash recovery. A native segfault still kills the process. The reused A1 owner thread has no environment cleanup hook and async requests occupy libuv workers. Periodic counters and transition logs exist; per-function Server-Timing and CPU-saved estimates are not yet integrated into Next responses. No production-readiness claim follows from this prototype.

Reproduce data summaries with `node research/auto-promotion/summarize.mjs` and this document with `python3 research/auto-promotion/report.py`. Build using `prepare.mjs`, then `package.mjs`; the preparation requires the cached GNU pack path in `LINUX_PACK` and supports `SCRIPTC_COMPILER` and `NODE_HEADERS`. The runner refuses existing lifecycle records; use a fresh `AUTO_RAW` directory for another explicitly authorized preview experiment.
'''
(base.parent/'auto-promotion-results.md').write_text(text)
