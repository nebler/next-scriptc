# PM1: held-out Papermark request CPU

2026-11-02. Milestone measurement on `t3/papermark-milestone-cpu`. No policy, compiler, or adapter changes follow from this measurement.

PM1 does not establish the end goal of a real app using less CPU. The mixed request stream uses 15.6% more inclusive process CPU in AUTO. `documentViewDistribution` never promotes during this observation. Every measured response is byte-identical, and there are zero mismatch demotions. No post-promotion steady-state result exists. Host background load also prevents a clean-machine claim.

## Original request and adapter path

Papermark is pinned to `ed19717ec02a1ac79aecf5569159aa9d2d869312`. The original Pages API video-analytics handler and complete playback module execute from `/Users/noah/code/papermark-gate`. The handler's runtime imports use K1's mocks: an authenticated user, an allowed document, Prisma returning video length 600, and Tinybird returning a fresh `JSON.parse` of the event fixture for every request. The response uses the handler's `res.json` call, supplied as `JSON.stringify`, as in K1. Each event has K1's timestamp, viewer ID, playback interval, rate, volume, and flags. Fixture construction, module transpilation, and response verification are outside request timing. Service JSON decoding and response serialization are inside.

The external slice contains the unchanged complete playback module. `withScriptc({},{nativePromotion:'auto'})`, discovery, `buildPromotion`, the real cross-compiled addon, loader transformation, promotion client, and `loadPromotion` dispatcher execute unchanged. No thresholds, sampling intervals, quotas, concurrency limits, or construction settings are overridden. `constructionResultsDefault` is true in this revision. The only dispatcher option is a log sink. Its real instance is installed in the promotion client's map, as in the local gate, so the generated wrapper uses that instance.

Current discovery accepts five exports: `playbackSeconds`, `resolveVideoLength`, `watchTimeSeconds`, `documentViewDistribution`, and `viewPlaybackTimeline`. All five compile and receive wrappers, including internal calls. The request does not call `viewPlaybackTimeline`. This differs from the older local correctness gate, which discovered only `documentViewDistribution`. The first build attempt stopped on the old harness's one-candidate assertion before compilation or timing. The updated measurement harness retains all accepted candidates, as the current adapter does. The original handler itself is loaded in memory with explicit imports rather than a full Next server or HTTP stack. This preserves K1's scope; it does not prove a whole-Papermark build.

Source hashes, discovered rejections, construction proofs, and binary hashes are in [build.json](papermark-milestone/build.json). Papermark source, extracted closures, transpiled modules, native sources, and binaries remain outside this repository. Stock scriptc and GNU arm64 runtime pack are version 0.4.6. Zig cross-compiles the Linux addon with the existing local-gate recipe. No scriptc fork is modified.

## Schedule and CPU accounting

One Linux arm64 Node 24.22.2 session runs in `nsc-standin-pm1`, with `--cpus=1 --cpuset-cpus=11 --memory=2g --memory-swap=2g --network=none`. The image is the cached `nsc-standin:node24`. [Container settings](papermark-milestone/container.json) retain the actual configuration. Only this container is created and removed.

The two lanes are OFF, which calls the original JavaScript module, and AUTO, which calls its generated wrappers. Each pair executes the same fixture size. Arm order rotates every five requests. In the deterministic mixed sequence, this makes 60,000-event pairs always AUTO-first. The paired CI does not remove that order bias. Training uses 540 requests per lane at each of 600, 6,000, and 60,000 events. Two 63-second pauses between buckets preserve the default rolling quota without changing the clock or quota. Post-warmup measurement uses 200 requests per lane per size. The mixed stream has 600 requests per lane, exactly 420 at 600 events, 120 at 6,000, and 60 at 60,000. These are synthetic fixtures and an assumed 70/20/10 mix, not observed production traffic.

Per-request caller CPU is `process.cpuUsage` user plus system deltas. It includes native owner-thread CPU charged during the call. Caller thread CPU uses the real addon's D2 `threadCpuMs()` clock. Wall time uses `performance.now()`. Nested timers around `documentViewDistribution` measure its synchronous process and thread CPU. Their small instrumentation cost remains in both lanes.

After every request, the harness drains pending shadows with 1 ms timer sleeps. A separate process CPU delta covers the entire drain, including native execution, validation, hashes, training decisions, garbage collection, and timer bookkeeping charged during it. Inclusive request CPU is caller CPU plus drain CPU. OFF uses the same drain operation. No measured rows are filtered. Response comparison and SHA-256 hashing occur after the drain, outside both timing regions. Caller thread CPU excludes the owner thread, so it is not a replacement for process CPU.

Medians and p95 use nearest rank. Median 95% confidence intervals use 2,000 bootstrap resamples of consecutive five-request blocks, with seed 3701. The mixed total saving CI uses paired ten-request blocks, preserving the exact mix. These are within-session sampling intervals. They do not cover host load changes, other deployments, or calibration error. Training medians describe a changing dispatcher and are not stable-state estimates.

Before every timing window, the host driver pauses the container runner, records `ps -A -o pid,pcpu,comm` and `uptime`, and then releases the window. No other build, test, or agent job from this task overlaps timing. Desktop apps and macOS background services remain active. Their recorded CPU use means the requested fully quiet machine condition is not established. No unrelated process or existing container is stopped. Absolute timings remain qualified by this load.

All times are milliseconds. The post-warmup label does not imply promotion. CPU includes shadow drains.

| Events | Lane | CPU median | p95 | Median 95% CI | Caller thread median | Caller wall median / p95 | Distribution share |
| ---: | --- | ---: | ---: | --- | ---: | ---: | ---: |
| 600 | off | 1.254 | 1.440 | 1.244 to 1.268 | 1.254 | 1.253 / 1.457 | 46.2% |
| 600 | auto | 1.417 | 3.431 | 1.402 to 1.437 | 1.416 | 1.416 / 2.838 | 43.1% |
| 6000 | off | 12.016 | 13.114 | 11.934 to 12.078 | 11.954 | 12.014 / 13.112 | 48.4% |
| 6000 | auto | 13.585 | 15.127 | 13.447 to 13.765 | 13.203 | 13.581 / 15.123 | 46.8% |
| 60000 | off | 200.047 | 234.265 | 198.122 to 207.550 | 183.798 | 200.041 / 234.527 | 64.4% |
| 60000 | auto | 243.219 | 281.127 | 238.186 to 247.897 | 201.093 | 241.259 / 280.397 | 60.5% |

Distribution share is synchronous `documentViewDistribution` process CPU divided by inclusive request CPU, using sums rather than ratios of medians. It includes any nested wrapper work inside that function. Asynchronous shadows remain in the request denominator.

| Training events | Lane | Inclusive CPU total | CPU median / p95 | Drain CPU total |
| ---: | --- | ---: | ---: | ---: |
| 600 | off | 697.399 | 1.218 / 1.569 | 1.012 |
| 600 | auto | 887.346 | 1.361 / 3.101 | 38.704 |
| 6000 | off | 6570.687 | 11.995 / 13.090 | 1.018 |
| 6000 | auto | 7755.834 | 13.525 / 27.671 | 133.253 |
| 60000 | off | 112871.497 | 206.725 / 237.036 | 2.610 |
| 60000 | auto | 130927.687 | 232.034 / 285.265 | 2085.834 |

| Mixed 600 requests | Inclusive CPU total | CPU median / p95 | Median 95% CI | Drain CPU total | Distribution share |
| --- | ---: | ---: | --- | ---: | ---: |
| off | 14971.168 | 1.333 / 217.683 | 1.318 to 1.439 | 1.134 | 63.3% |
| auto | 17311.622 | 4.698 / 206.604 | 3.019 to 5.664 | 455.731 | 58.3% |

Mixed total CPU saving = 1 − AUTO/OFF = -15.63%, paired-block 95% CI -21.52% to -10.23%. Negative saving means an increase.

| Events | Lane | C1 proxy per-request median | ±17.37% band |
| ---: | --- | ---: | --- |
| 600 | off | 2.248 | 1.857 to 2.638 |
| 600 | auto | 2.540 | 2.099 to 2.981 |
| 6000 | off | 21.534 | 17.793 to 25.274 |
| 6000 | auto | 24.348 | 20.118 to 28.577 |
| 60000 | off | 358.487 | 296.218 to 420.756 |
| 60000 | auto | 438.545 | 362.370 to 514.721 |

| Mixed lane | C1 total proxy | ±17.37% band |
| --- | ---: | --- |
| off | 26828.864 | 22168.690 to 31489.037 |
| auto | 31235.709 | 25810.066 to 36661.351 |

The mixed mean request CPU is 24.952 ms OFF and 28.853 ms AUTO. The C1 per-request mean proxy is 44.715 ms OFF and 52.060 ms AUTO.

Mixed C1 proxy saving is -16.43%, with conservative calibration-error range -65.37% to 18.03%. This is a prediction proxy only.

## Promotion failure is part of the milestone

| Function | Size bucket | Final calls | Verified shadows | Final state | Native answers across function |
| --- | ---: | ---: | ---: | --- | ---: |
| resolveVideoLength | 9 | 1160 | 29 | js-final | 0 |
| resolveVideoLength | 12 | 860 | 28 | js-final | 0 |
| resolveVideoLength | 15 | 800 | 28 | js-final | 0 |
| watchTimeSeconds | 9 | 1160 | 26 | js-final | 0 |
| watchTimeSeconds | 12 | 860 | 15 | shadow | 0 |
| watchTimeSeconds | 15 | 800 | 7 | shadow | 0 |
| playbackSeconds | 0 | 107712000 | 425 | js-final | 0 |
| documentViewDistribution | 9 | 1160 | 3 | shadow | 0 |
| documentViewDistribution | 12 | 860 | 0 | shadow | 0 |
| documentViewDistribution | 15 | 800 | 0 | shadow | 0 |

The transition log records the first shadow transition at call 20. `resolveVideoLength` reaches `js-final` at call 520 for each size. `playbackSeconds` also settles on JavaScript. `watchTimeSeconds` and `documentViewDistribution` compete with earlier nested calls for the shared pending-shadow slot. A pending shadow suppresses later shadow launches in the same synchronous request. The default 20-call learning schedule and 200-call rechecks align across these functions. This explains why 540 requests are insufficient to reproduce the isolated gate's 26 target shadows. There is no evidence here that the target never promotes under every possible request schedule. It does not promote within this complete observation.

Nested `playbackSeconds` dispatch occurs twice per event on the JS path. That creates substantial AUTO overhead even after its bucket chooses JS. These are observed integration costs. PM1 makes no change to candidate selection, wrapper generation, sampling, or policy to remove them.


Across training, post-warmup, and mixed requests together, inclusive CPU totals 179300.266 ms OFF and 209535.837 ms AUTO, a 16.86% increase. This aggregate uses the complete experimental schedule, not the 70/20/10 traffic mix.

## Prediction and denominator limits

Apply the C1 rule exactly: proxy = compute CPU × 1.792 + boundary CPU × 2.260. For the observed JS lanes, caller CPU is compute, as in M3/D2's chosen-lane rule. Drain CPU receives the boundary factor. The separate instrumented native stage probe is diagnostic only and does not replace an AUTO result. Calibration bands multiply each proxy by 0.8263 and 1.1737. Saving bands compare AUTO's upper band with OFF's lower band and vice versa. The calibration bands are model-error bounds, not statistical confidence intervals.

C1 was fitted against hosted wall time. Its CPU-input proxy cannot identify Vercel Active CPU or billing savings. Large structured arguments and this request's service decode/sort work extend beyond its calibration dataset. Any boundary-driven gain would need hosted confirmation. There are no hosting calls, deployments, or published performance claims in PM1.

The mocked services omit real authentication, Prisma, and Tinybird client CPU. Any positive saving measured here would therefore be an optimistic upper bound for the real endpoint, assuming that omitted CPU is unchanged. This run also excludes framework and HTTP work. The result describes one request path, not traffic-weighted whole-app CPU.

## Correctness, validation, and reproduction

All 5,640 timed lane responses match the corresponding original response byte for byte. Each row retains its SHA-256. Default dispatcher shadows perform their own canonical result comparison. Final state has no demoted bucket and no native answers. The separate timing-addon probe checks 210 additional native distribution results, including warmups, against JS. Final bucket verification counts, transitions, and stage timings are in [raw.json.gz](papermark-milestone/raw.json.gz). [summary.json](papermark-milestone/summary.json) contains CIs, totals, hashes, and final states.

The one-minute host load spans 4.61 to 6.53. The full pre-window process lists are retained in [host-load.json.gz](papermark-milestone/host-load.json.gz). macOS background work reaches tens of percent of a core in those snapshots. The measurements are evidence of this observed failure, with qualified absolute timing.

All 95 Next tests pass. The promotion suite passes 26 tests with two existing skips. The first Next attempt passed 69 and failed 26 because root-level TypeScript resolution was missing from the temporary dependency setup. Correcting the links resolves all failures without code changes. Both attempts are retained in [setup-failure log](papermark-milestone/next-tests-setup-failure.log) and [passing Next log](papermark-milestone/next-tests.log). The [promotion log](papermark-milestone/promotion-tests.log) includes the real addon and integration checks. Tests run after all timing windows. The Next suite also passes the seeded real-addon differential fuzzer with 680 inputs and 1,360 comparisons across 17 candidates.

The raw `afterTraining*` fields contain live dispatcher bucket objects and therefore reflect later mutations in the final artifact. Use the timestamped transition log for state history and `final` for final counts. The report does not infer historical counts from those fields.

[Build harness](papermark-milestone/build.mjs), [host driver](papermark-milestone/run.py), [measurement harness](papermark-milestone/measure.mjs), and [analysis](papermark-milestone/analyze.py) contain only our test code. Reproduction requires the two external source directories, existing Node dependencies, stock compiler, Zig, and the cached Docker image. Link dependencies as for the local gate, set `SCRIPTC_COMPILER` to the installed stock binary, run `node research/papermark-milestone/build.mjs`, then `python3 research/papermark-milestone/run.py`. Run analysis only after measurement ends. The driver requires its dedicated container name to be unused.

[Cleanup record](papermark-milestone/cleanup.json) confirms that the dedicated container, external native build tree, copied temporary handler file, test build outputs, and all task-created dependency links are removed. The external pinned source checkout is clean. Final free disk is 26.61 GiB. The root README and compiler fork are untouched. No merge or push occurs. Raw timing and host process artifacts above 256 KiB use deterministic gzip via `node scripts/compress-artifacts.mjs`.
