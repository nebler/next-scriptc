# PM2: held-out Papermark with D3

2026-11-02. Measured adapter commit `7a19a40fce9ba1762bfece0061682c61eb854486`. Papermark remains pinned to `ed19717ec02a1ac79aecf5569159aa9d2d869312`.

PM2 does not establish "real app, X% less CPU, identical results." Mixed inclusive process CPU is 14,787.509 ms OFF and 14,865.309 ms AUTO, a 0.53% increase. The paired-block 95% saving CI is -6.368 to 4.340%. This observation is consistent with either a small saving or a loss. PM1 increased mixed CPU by 15.63%. All 5,640 timed responses are byte-identical, with matching PM1 hashes and zero mismatch demotions. No candidate promotes, so there is no post-promotion steady state.

## Exact PM1 protocol

The [PM1 report](papermark-milestone.md) defines the experiment. PM2 copies its build, host driver, measurement, and analysis scripts. Only PM2 artifact paths, external `.pm2` output paths, and the dedicated container name change. [setup.json](papermark-milestone-2/setup.json) identifies the adapter commit and compiler/binary hashes. [build.json](papermark-milestone-2/build.json) retains discovery rejections and construction proofs. No policy, compiler, adapter, candidate-selection, fixture, or measurement-harness tuning occurs.

The unchanged original Pages API handler uses K1 mocks for auth, document access, Prisma video length 600, and a fresh Tinybird fixture JSON decode per request. Complete playback source stays external. Service JSON decoding and response serialization are timed. Fixture creation, transpilation, expected responses, and byte/hash comparisons are outside timing. This executes the request handler in memory, without a full Next server or HTTP stack.

Node v24.22.2 runs Linux arm64 in `nsc-standin-pm2` from cached `nsc-standin:node24`. Limits are `--cpus=1 --cpuset-cpus=11 --memory=2g --memory-swap=2g --network=none`. [container.json](papermark-milestone-2/container.json) records the actual image and settings. Stock scriptc and GNU arm64 runtime pack are 0.4.6; Zig cross-compiles the addon. All five PM1 candidates compile with unchanged construction defaults. The dispatcher receives only a log sink.

Training uses 540 requests per lane per size, with 63-second quota pauses between sizes. Measurement uses 200 per lane per size, followed by 600 per lane in the exact 420/120/60 mixed stream. Lane order rotates every five requests. Mixed 60,000-event pairs are consequently always AUTO-first, the same order bias as PM1. Every request drains pending shadows with 1 ms timer sleeps. Inclusive process CPU is caller CPU plus all drain CPU, including owner-thread work, verification, decisions, GC, and drain bookkeeping. OFF uses the same drain operation. No row is filtered.

Median and p95 use nearest rank. Median 95% CIs use 2,000 resamples of consecutive five-request blocks, seed 3701. Mixed total-saving CIs use paired ten-request blocks. These within-session intervals exclude cross-session host variation and calibration error. Training and post-warmup labels do not imply stable state or promotion.

## CPU beside PM1

All times are milliseconds and include drains. The post-warmup size measurements follow PM1's fixed schedule, even where learning continues.

| Events | Lane | PM1 median / p95 | PM1 median 95% CI | PM2 median / p95 | PM2 median 95% CI |
| ---: | --- | ---: | --- | ---: | --- |
| 600 | off | 1.254 / 1.440 | 1.244 to 1.268 | 1.217 / 1.631 | 1.209 to 1.231 |
| 600 | auto | 1.417 / 3.431 | 1.402 to 1.437 | 1.220 / 3.413 | 1.209 to 1.227 |
| 6000 | off | 12.016 / 13.114 | 11.934 to 12.078 | 11.990 / 12.833 | 11.846 to 12.090 |
| 6000 | auto | 13.585 / 15.127 | 13.447 to 13.765 | 11.976 / 26.916 | 11.888 to 12.040 |
| 60000 | off | 200.047 / 234.265 | 198.122 to 207.550 | 196.971 / 226.740 | 194.739 to 199.201 |
| 60000 | auto | 243.219 / 281.127 | 238.186 to 247.897 | 211.441 / 232.029 | 210.618 to 213.824 |
| mix | off | 1.333 / 217.683 | 1.318 to 1.439 | 1.280 / 209.359 | 1.256 to 1.331 |
| mix | auto | 4.698 / 206.604 | 3.019 to 5.664 | 1.316 / 187.640 | 1.275 to 1.634 |

| Events | Lane | PM1 inclusive total | PM1 drain total | PM2 inclusive total | PM2 drain total |
| ---: | --- | ---: | ---: | ---: | ---: |
| 600 | off | 258.427 | 0.240 | 254.743 | 0.233 |
| 600 | auto | 336.625 | 7.318 | 322.403 | 28.567 |
| 6000 | off | 2,439.620 | 0.355 | 2,432.363 | 0.356 |
| 6000 | auto | 2,874.850 | 41.879 | 2,621.704 | 59.609 |
| 60000 | off | 41,491.468 | 0.949 | 40,662.031 | 0.837 |
| 60000 | auto | 49,441.873 | 740.086 | 42,786.987 | 376.089 |
| mix | off | 14,971.168 | 1.134 | 14,787.509 | 1.077 |
| mix | auto | 17,311.622 | 455.731 | 14,865.309 | 369.684 |

Mixed saving is -0.53% in PM2 versus -15.63% in PM1. Their paired-block CIs are -6.368 to 4.340% and -21.516 to -10.231%. The difference between sessions is descriptive; it is not a paired estimate of D3's causal effect.

| Training events | Lane | PM1 median / p95 | PM1 median 95% CI | PM1 total | PM2 median / p95 | PM2 median 95% CI | PM2 total | PM2 drain |
| ---: | --- | ---: | --- | ---: | ---: | --- | ---: | ---: |
| 600 | off | 1.218 / 1.569 | 1.213 to 1.225 | 697.399 | 1.192 / 1.494 | 1.191 to 1.195 | 681.353 | 0.756 |
| 600 | auto | 1.361 / 3.101 | 1.354 to 1.368 | 887.346 | 1.193 / 3.222 | 1.189 to 1.196 | 818.799 | 48.429 |
| 6000 | off | 11.995 / 13.090 | 11.917 to 12.055 | 6,570.687 | 11.884 / 12.978 | 11.839 to 11.957 | 6,533.756 | 0.922 |
| 6000 | auto | 13.525 / 27.671 | 13.427 to 13.614 | 7,755.834 | 12.042 / 27.323 | 11.962 to 12.091 | 7,397.589 | 259.767 |
| 60000 | off | 206.725 / 237.036 | 201.049 to 211.828 | 112,871.497 | 198.630 / 232.263 | 196.787 to 203.930 | 110,519.731 | 2.331 |
| 60000 | auto | 232.034 / 285.265 | 228.685 to 235.228 | 130,927.687 | 211.215 / 410.613 | 209.710 to 213.544 | 125,324.343 | 4,262.532 |

| Events | Lane | PM2 caller thread median | PM2 caller wall median / p95 | Distribution share of inclusive CPU |
| ---: | --- | ---: | ---: | ---: |
| 600 | off | 1.218 | 1.216 / 1.630 | 47.2% |
| 600 | auto | 1.220 | 1.219 / 2.868 | 42.5% |
| 6000 | off | 11.862 | 11.989 / 12.881 | 48.6% |
| 6000 | auto | 11.899 | 11.974 / 23.536 | 46.7% |
| 60000 | off | 177.784 | 197.009 / 226.754 | 63.6% |
| 60000 | auto | 179.347 | 211.584 / 232.097 | 62.1% |
| mix | off | 1.279 | 1.283 / 209.376 | 64.0% |
| mix | auto | 1.302 | 1.319 / 187.690 | 60.2% |

The summary thread metric includes caller plus drain thread CPU and excludes native owner-thread CPU. Wall columns cover the caller only. Distribution share sums synchronous distribution CPU and divides by inclusive request CPU.

PM1 whole-schedule inclusive totals, including training, are 179,300.266 ms OFF and 209,535.837 ms AUTO, a 16.86% increase. These totals do not represent the 70/20/10 traffic mix.

PM2 whole-schedule inclusive totals, including training, are 175,871.486 ms OFF and 194,137.134 ms AUTO, a 10.39% increase. These totals do not represent the 70/20/10 traffic mix.

## Every candidate and bucket

Every exercised bucket transitions from `js` to `shadow` at call 20. The table gives final cumulative counts, complete-epoch or partial-epoch pairs, and decision calls. Raw `afterTraining*` snapshots retain live bucket objects, as in PM1. Historical state comes from timestamped transitions, not those mutable fields.

| Candidate | Bucket | Calls | Verified shadows | Valid pairs | Final state | Decision call | Promotion votes |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| resolveVideoLength | 9 | 1160 | 25 | 23 | shadow | none | 0 |
| resolveVideoLength | 12 | 860 | 25 | 23 | shadow | none | 0 |
| resolveVideoLength | 15 | 800 | 25 | 23 | shadow | none | 0 |
| watchTimeSeconds | 9 | 1160 | 26 | 24 | js-final | 1064 | 0 |
| watchTimeSeconds | 12 | 860 | 26 | 24 | js-final | 841 | 0 |
| watchTimeSeconds | 15 | 800 | 25 | 23 | shadow | none | 0 |
| documentViewDistribution | 9 | 1160 | 26 | 24 | js-final | 1160 | 0 |
| documentViewDistribution | 12 | 860 | 25 | 23 | shadow | none | 0 |
| documentViewDistribution | 15 | 800 | 26 | 24 | js-final | 799 | 0 |

`playbackSeconds` and `viewPlaybackTimeline` have zero dispatcher entries and no buckets or transitions. PM1 had 107,712,000 playbackSeconds entries. D3 removes that internal helper dispatch entirely. `resolveVideoLength` and `watchTimeSeconds` each still have 2,820 external handler calls, exactly one per AUTO request. `documentViewDistribution` also has 2,820. These external entries are expected and retain wrappers. Every candidate has zero native answers and zero fallback counts.

The target's verified shadows improve from PM1's 3/0/0 to 26/25/26. The small target decides at its final call, and the large target at its penultimate call, both during the mixed stream. The middle target ends one valid pair short of its 24-pair epoch after two cold exclusions. Thus no size measurement is a post-promotion steady state, and there are zero promoted-request observations to report separately.

## Why AUTO does not promote

The former internal-helper overhead is gone and shadows reach every target bucket. The unchanged 540-request training schedule remains shorter than D3's staggered 26-verification learning cycle. Three external candidates also share the 50-launch rolling quota, unlike PM1's per-function quota. Fair admission distributes service, but does not promise completion within this observation. Several buckets finish at 25 verifications, with only 23 usable pairs. No longer or differently ordered training is attempted.

More observations would not establish a win from the pairs already recorded. Every collected target pair loses the 0.90 promotion threshold. Complete target epochs choose JS, as the unchanged decision rule requires.

| Target events | Valid pairs | JS reference median CPU | Native boundary-inclusive median CPU | Median paired native / JS | Winning votes |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 600 | 24 | 0.565 | 1.994 | 3.53 | 0 |
| 6000 | 23 | 5.635 | 17.898 | 3.16 | 0 |
| 60000 | 24 | 111.191 | 196.824 | 1.72 | 0 |

The separate native timing probe explains the remaining deficit. Its stages are diagnostic wall times, not process CPU, and do not substitute for AUTO results. Each cell has 10 warmups and 60 retained native calls. At the largest size, the compute-stage wall median is numerically below the sampled JS CPU median, while JS encoding alone exceeds that reference. These different clocks do not form an exact CPU decomposition. Serializing the complete event graph is the largest stage in this probe. The dispatcher correctly compares the whole boundary-inclusive CPU cost.

| Events | JS encode | Native input copy | Native decode | Compute | Native encode | Copy back | JS decode |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 600 | 1.080 | 0.015 | 0.259 | 0.356 | 0.052 | 0.004 | 0.076 |
| 6000 | 11.157 | 0.164 | 2.659 | 3.228 | 0.338 | 0.006 | 0.084 |
| 60000 | 126.489 | 1.633 | 26.964 | 36.318 | 4.105 | 0.010 | 0.102 |

AUTO also retains shadow encoding and verification costs while learning. The mixed drain total remains much larger than OFF's. The observed total loss is small and its CI overlaps zero. The logs support boundary cost and incomplete learning as explanations; they do not establish a statistically significant residual dispatcher slowdown. No fix follows this held-out measurement.

## Vercel prediction and limits

Use PM1's exact C1 rule: caller CPU × 1.792 + drain CPU × 2.260. All chosen lanes are JS. Calibration bands multiply the proxy by 0.8263 and 1.1737. They are model-error bands, distinct from bootstrap CIs. The fixed-native stage probe is diagnostic only.

| Events | Lane | PM1 proxy median | PM2 proxy median | PM2 ±17.37% band |
| ---: | --- | ---: | ---: | --- |
| 600 | off | 2.248 | 2.181 | 1.802 to 2.560 |
| 600 | auto | 2.540 | 2.187 | 1.807 to 2.567 |
| 6000 | off | 21.534 | 21.487 | 17.754 to 25.219 |
| 6000 | auto | 24.348 | 21.462 | 17.734 to 25.190 |
| 60000 | off | 358.487 | 352.974 | 291.663 to 414.286 |
| 60000 | auto | 438.545 | 378.904 | 313.088 to 444.719 |

| Mixed lane | PM1 proxy total | PM2 proxy total | PM2 ±17.37% band | PM2 mean request proxy |
| --- | ---: | ---: | --- | ---: |
| off | 26,828.864 | 26,499.720 | 21,896.719 to 31,102.722 | 44.166 |
| auto | 31,235.709 | 26,811.646 | 22,154.463 to 31,468.829 | 44.686 |

Mixed predicted saving is -1.18%, versus -16.43% in PM1. Comparing opposing calibration bands gives -43.715 to 28.770% saving. PM2 does not beat calibration error. C1 was fitted to hosted wall time, so this CPU-input prediction is not calibrated Vercel Active CPU or billing evidence. No hosting call is made and no number is published.

Mocks omit real authentication, Prisma, and Tinybird client CPU. They also omit framework and HTTP work. Any positive saving here would be an optimistic upper bound for the real endpoint if omitted CPU stays unchanged. This single endpoint and assumed traffic mix cannot establish whole-app CPU savings.

## Correctness and timing quality

All 5,640 timed responses match original JS bytes before their SHA-256 hashes are retained. The three hashes match PM1 exactly.

| Events | Response bytes | SHA-256 |
| ---: | ---: | --- |
| 600 | 32549 | `32579ff71dbad400b659f88dca97e90613f9c059700efb3130088da7eeeb5687` |
| 6000 | 33752 | `0716f0f58ed82a591d1c6ba77978539bdf71956ca36a765b27187468637fa22a` |
| 60000 | 34955 | `546fee9e1df0b5e1c809bad5ff6d9de53b073a1e13039e26f1cd6e97ace3f33c` |

All dispatcher shadows pass canonical comparisons. There are zero mismatch demotions, zero demoted buckets, zero native fallbacks, and no pending jobs at the end. The independent stage probe checks 210 native distribution outputs against JS, including its warmups.

The host driver pauses before every window and records `ps -A -o pid,pcpu,comm` and `uptime`. [host-load.json.gz](papermark-milestone-2/host-load.json.gz) retains all ten snapshots. No task build, test, analysis, or other agent overlaps timing. Desktop services and existing unrelated containers remain active. One-minute host load ranges from 3.37 to 7.63, so a fully idle host is not established. No unrelated process or container is stopped. The fixed mixed-arm bias and single-session uncertainty also remain. The container reports 241 throttled periods, 174,510 microseconds of throttling, under its required CPU cap.

## Validation and reproduction

The first setup attempts fail before any timing window. The external slice lacked a TypeScript link. An initial compiler path pointed to a non-executable package binary, and its copied toolchain lacked installed-package configuration. The successful build uses the existing executable stock `scriptc/bin/scriptc.exe` without modifying it. The sparse Papermark checkout also lacked the handler removed by PM1 cleanup. Restoring its exact pinned Git blob resolves that startup failure. Adjacent setup-failure logs retain these attempts. No measured window is discarded or repeated.

With temporary dependency links confined to this worktree and the external slice, run the copied [build](papermark-milestone-2/build.mjs), [driver](papermark-milestone-2/run.py), [measurement](papermark-milestone-2/measure.mjs), and unchanged [analysis](papermark-milestone-2/analyze.py). Build with `SCRIPTC_COMPILER` pointing to installed stock 0.4.6. Restore the pinned handler in the sparse external checkout before running. Then run `python3 research/papermark-milestone-2/compare.py` for the parity audit and report tables. Do not overlap builds or analysis with timing.

[raw.json.gz](papermark-milestone-2/raw.json.gz) contains every request hash, CPU sample, transition, stage sample, and final dispatcher state. [summary.json](papermark-milestone-2/summary.json) has PM1-method statistics. [comparison.json](papermark-milestone-2/comparison.json) retains per-candidate diagnostics and correctness checks. Both analysis scripts accept raw JSON or gzip.

Next passes all 98 tests, including the seeded real-addon differential fuzzer with 680 inputs and 1,360 comparisons across 17 candidates. Promotion passes 26 tests with two existing skips. An initial promotion run passes 25 and fails the Zod test because the temporary demo dependency links are missing. Adding links only in this worktree resolves setup before the full passing rerun. Both logs are retained. Tests run after all timing windows.

Cleanup removes only this task's external `.pm2` tree, restored handler, temporary dependency links, and generated test outputs. Main's dependency links are checked against their initial targets. The dedicated container has already been removed. Cleanup evidence is in [cleanup.json](papermark-milestone-2/cleanup.json). Artifacts over 256 KiB use `node scripts/compress-artifacts.mjs`. The root README, main checkout, scriptc fork, and `/Users/noah/scriptc` are untouched. No merge or push occurs. PM2 is retained as measurement evidence, with no policy or implementation change.
