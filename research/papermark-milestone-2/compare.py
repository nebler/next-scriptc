import json, pathlib, statistics, hashlib, math, gzip
p=pathlib.Path(__file__).parent
s=json.loads((p/'summary.json').read_text()); old=json.loads((p.parent/'papermark-milestone/summary.json').read_text());r=json.loads((p/'raw.json').read_text() if (p/'raw.json').exists() else gzip.decompress((p/'raw.json.gz').read_bytes()));build=json.loads((p/'build.json').read_text()); names={f['id']:f['name'] for f in build['construction']}
assert len(r['rows'])==5640
assert r['expected']==old['responseHashes']
assert all(x['sha256']==r['expected'][str(x['n'])]['sha256'] for x in r['rows'])
assert not any(t.get('state')=='demoted' for t in s['transitions'])
assert all(not b['pending'] and b['nativeFallbacks']==0 for f in r['final'].values() for b in f['buckets'])
diag=[]
for id,f in r['final'].items():
 for b in f['buckets']:
  dec=b.get('lastDecision');pairs=list(zip(dec['js'],dec['native'])) if dec else b['pairs']
  diag.append(dict(name=names[id],bucket=b['bucket'],calls=b['calls'],verified=b['verified'],validPairs=len(pairs),state=b['state'],decisionCall=dec['atCall'] if dec else None,jsMedian=statistics.median(x for x,y in pairs),nativeMedian=statistics.median(y for x,y in pairs),medianPairRatio=statistics.median(y/x for x,y in pairs),promotionVotes=sum(y<.9*x for x,y in pairs),epochs=b['epochs']))
stages={n:{k:statistics.median(x[k] for x in r['stages'] if x['n']==n) for k in ['jsEncode','nativeInputCopy','nativeDecode','compute','nativeEncode','copyBack','jsDecode']} for n in [600,6000,60000]}
totals={v:{lane:sum(vv[section][str(n)][lane]['cpuTotal'] for section in ['training','settled','mixed'] for n in ([600,6000,60000] if section!='mixed' else ['mix'])) for lane in ['off','auto']} for v,vv in [('PM1',old),('PM2',s)]}
evidence=dict(head=json.loads((p/'setup.json').read_text())['head'],diagnostics=diag,stageMedians=stages,allScheduleTotals=totals,correctness=dict(responseChecks=5640,hashesMatchPM1=True,mismatchDemotions=0,nativeFallbacks=0,nativeAnswers=0,stageProbeParityChecks=210),candidateDispatches={f['name']:r['final'].get(f['id'],{}).get('calls',0) for f in build['construction']})
(p/'comparison.json').write_text(json.dumps(evidence,indent=2)+'\n')
f=lambda n:f'{n:,.3f}'
ci=lambda a:' to '.join(f(v) for v in a)
m=s['mixed']['mix']; om=old['mixed']['mix']
text=f'''# PM2: held-out Papermark with D3

2026-11-02. Measured adapter commit `{evidence['head']}`. Papermark remains pinned to `ed19717ec02a1ac79aecf5569159aa9d2d869312`.

PM2 does not establish "real app, X% less CPU, identical results." Mixed inclusive process CPU is {f(m['off']['cpuTotal'])} ms OFF and {f(m['auto']['cpuTotal'])} ms AUTO, a {abs(m['savingTotalPct']):.2f}% increase. The paired-block 95% saving CI is {ci(m['savingTotalCI95'])}%. This observation is consistent with either a small saving or a loss. PM1 increased mixed CPU by 15.63%. All 5,640 timed responses are byte-identical, with matching PM1 hashes and zero mismatch demotions. No candidate promotes, so there is no post-promotion steady state.

## Exact PM1 protocol

The [PM1 report](papermark-milestone.md) defines the experiment. PM2 copies its build, host driver, measurement, and analysis scripts. Only PM2 artifact paths, external `.pm2` output paths, and the dedicated container name change. [setup.json](papermark-milestone-2/setup.json) identifies the adapter commit and compiler/binary hashes. [build.json](papermark-milestone-2/build.json) retains discovery rejections and construction proofs. No policy, compiler, adapter, candidate-selection, fixture, or measurement-harness tuning occurs.

The unchanged original Pages API handler uses K1 mocks for auth, document access, Prisma video length 600, and a fresh Tinybird fixture JSON decode per request. Complete playback source stays external. Service JSON decoding and response serialization are timed. Fixture creation, transpilation, expected responses, and byte/hash comparisons are outside timing. This executes the request handler in memory, without a full Next server or HTTP stack.

Node {r['node']} runs Linux arm64 in `nsc-standin-pm2` from cached `nsc-standin:node24`. Limits are `--cpus=1 --cpuset-cpus=11 --memory=2g --memory-swap=2g --network=none`. [container.json](papermark-milestone-2/container.json) records the actual image and settings. Stock scriptc and GNU arm64 runtime pack are 0.4.6; Zig cross-compiles the addon. All five PM1 candidates compile with unchanged construction defaults. The dispatcher receives only a log sink.

Training uses 540 requests per lane per size, with 63-second quota pauses between sizes. Measurement uses 200 per lane per size, followed by 600 per lane in the exact 420/120/60 mixed stream. Lane order rotates every five requests. Mixed 60,000-event pairs are consequently always AUTO-first, the same order bias as PM1. Every request drains pending shadows with 1 ms timer sleeps. Inclusive process CPU is caller CPU plus all drain CPU, including owner-thread work, verification, decisions, GC, and drain bookkeeping. OFF uses the same drain operation. No row is filtered.

Median and p95 use nearest rank. Median 95% CIs use 2,000 resamples of consecutive five-request blocks, seed 3701. Mixed total-saving CIs use paired ten-request blocks. These within-session intervals exclude cross-session host variation and calibration error. Training and post-warmup labels do not imply stable state or promotion.

## CPU beside PM1

All times are milliseconds and include drains. The post-warmup size measurements follow PM1's fixed schedule, even where learning continues.

| Events | Lane | PM1 median / p95 | PM1 median 95% CI | PM2 median / p95 | PM2 median 95% CI |
| ---: | --- | ---: | --- | ---: | --- |
'''
for n in ['600','6000','60000','mix']:
 section='mixed' if n=='mix' else 'settled'
 for lane in ['off','auto']:
  a=old[section][n][lane];b=s[section][n][lane]
  text+=f"| {n} | {lane} | {f(a['cpuMedian'])} / {f(a['cpuP95'])} | {ci(a['cpuMedianCI95'])} | {f(b['cpuMedian'])} / {f(b['cpuP95'])} | {ci(b['cpuMedianCI95'])} |\n"
text+='\n| Events | Lane | PM1 inclusive total | PM1 drain total | PM2 inclusive total | PM2 drain total |\n| ---: | --- | ---: | ---: | ---: | ---: |\n'
for n in ['600','6000','60000','mix']:
 section='mixed' if n=='mix' else 'settled'
 for lane in ['off','auto']:
  a=old[section][n][lane];b=s[section][n][lane];text+=f"| {n} | {lane} | {f(a['cpuTotal'])} | {f(a['drainCpuTotal'])} | {f(b['cpuTotal'])} | {f(b['drainCpuTotal'])} |\n"
text+=f"\nMixed saving is {m['savingTotalPct']:.2f}% in PM2 versus {om['savingTotalPct']:.2f}% in PM1. Their paired-block CIs are {ci(m['savingTotalCI95'])}% and {ci(om['savingTotalCI95'])}%. The difference between sessions is descriptive; it is not a paired estimate of D3's causal effect.\n\n| Training events | Lane | PM1 median / p95 | PM1 median 95% CI | PM1 total | PM2 median / p95 | PM2 median 95% CI | PM2 total | PM2 drain |\n| ---: | --- | ---: | --- | ---: | ---: | --- | ---: | ---: |\n"
for n in ['600','6000','60000']:
 for lane in ['off','auto']:
  a=old['training'][n][lane];b=s['training'][n][lane];text+=f"| {n} | {lane} | {f(a['cpuMedian'])} / {f(a['cpuP95'])} | {ci(a['cpuMedianCI95'])} | {f(a['cpuTotal'])} | {f(b['cpuMedian'])} / {f(b['cpuP95'])} | {ci(b['cpuMedianCI95'])} | {f(b['cpuTotal'])} | {f(b['drainCpuTotal'])} |\n"
text+='\n| Events | Lane | PM2 caller thread median | PM2 caller wall median / p95 | Distribution share of inclusive CPU |\n| ---: | --- | ---: | ---: | ---: |\n'
for n in ['600','6000','60000','mix']:
 section='mixed' if n=='mix' else 'settled'
 for lane in ['off','auto']:
  a=s[section][n][lane];text+=f"| {n} | {lane} | {f(a['threadMedian'])} | {f(a['wallMedian'])} / {f(a['wallP95'])} | {a['distributionSharePct']:.1f}% |\n"
text+='\nThe summary thread metric includes caller plus drain thread CPU and excludes native owner-thread CPU. Wall columns cover the caller only. Distribution share sums synchronous distribution CPU and divides by inclusive request CPU.\n'
for v,t in totals.items():text+=f"\n{v} whole-schedule inclusive totals, including training, are {f(t['off'])} ms OFF and {f(t['auto'])} ms AUTO, a {100*(t['auto']/t['off']-1):.2f}% increase. These totals do not represent the 70/20/10 traffic mix.\n"
text+='''
## Every candidate and bucket

Every exercised bucket transitions from `js` to `shadow` at call 20. The table gives final cumulative counts, complete-epoch or partial-epoch pairs, and decision calls. Raw `afterTraining*` snapshots retain live bucket objects, as in PM1. Historical state comes from timestamped transitions, not those mutable fields.

| Candidate | Bucket | Calls | Verified shadows | Valid pairs | Final state | Decision call | Promotion votes |
| --- | ---: | ---: | ---: | ---: | --- | ---: | ---: |
'''
for d in diag:text+=f"| {d['name']} | {d['bucket']} | {d['calls']} | {d['verified']} | {d['validPairs']} | {d['state']} | {d['decisionCall'] or 'none'} | {d['promotionVotes']} |\n"
text+='''
`playbackSeconds` and `viewPlaybackTimeline` have zero dispatcher entries and no buckets or transitions. PM1 had 107,712,000 playbackSeconds entries. D3 removes that internal helper dispatch entirely. `resolveVideoLength` and `watchTimeSeconds` each still have 2,820 external handler calls, exactly one per AUTO request. `documentViewDistribution` also has 2,820. These external entries are expected and retain wrappers. Every candidate has zero native answers and zero fallback counts.

The target's verified shadows improve from PM1's 3/0/0 to 26/25/26. The small target decides at its final call, and the large target at its penultimate call, both during the mixed stream. The middle target ends one valid pair short of its 24-pair epoch after two cold exclusions. Thus no size measurement is a post-promotion steady state, and there are zero promoted-request observations to report separately.

## Why AUTO does not promote

The former internal-helper overhead is gone and shadows reach every target bucket. The unchanged 540-request training schedule remains shorter than D3's staggered 26-verification learning cycle. Three external candidates also share the 50-launch rolling quota, unlike PM1's per-function quota. Fair admission distributes service, but does not promise completion within this observation. Several buckets finish at 25 verifications, with only 23 usable pairs. No longer or differently ordered training is attempted.

More observations would not establish a win from the pairs already recorded. Every collected target pair loses the 0.90 promotion threshold. Complete target epochs choose JS, as the unchanged decision rule requires.

| Target events | Valid pairs | JS reference median CPU | Native boundary-inclusive median CPU | Median paired native / JS | Winning votes |
| ---: | ---: | ---: | ---: | ---: | ---: |
'''
for d in diag:
 if d['name']=='documentViewDistribution':text+=f"| {2**d['bucket'] if False else {9:600,12:6000,15:60000}[d['bucket']]} | {d['validPairs']} | {f(d['jsMedian'])} | {f(d['nativeMedian'])} | {d['medianPairRatio']:.2f} | {d['promotionVotes']} |\n"
text+='''
The separate native timing probe explains the remaining deficit. Its stages are diagnostic wall times, not process CPU, and do not substitute for AUTO results. Each cell has 10 warmups and 60 retained native calls. At the largest size, the compute-stage wall median is numerically below the sampled JS CPU median, while JS encoding alone exceeds that reference. These different clocks do not form an exact CPU decomposition. Serializing the complete event graph is the largest stage in this probe. The dispatcher correctly compares the whole boundary-inclusive CPU cost.

| Events | JS encode | Native input copy | Native decode | Compute | Native encode | Copy back | JS decode |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
'''
for n,v in stages.items():text+=f"| {n} | "+' | '.join(f(x) for x in v.values())+' |\n'
text+='''
AUTO also retains shadow encoding and verification costs while learning. The mixed drain total remains much larger than OFF's. The observed total loss is small and its CI overlaps zero. The logs support boundary cost and incomplete learning as explanations; they do not establish a statistically significant residual dispatcher slowdown. No fix follows this held-out measurement.

## Vercel prediction and limits

Use PM1's exact C1 rule: caller CPU × 1.792 + drain CPU × 2.260. All chosen lanes are JS. Calibration bands multiply the proxy by 0.8263 and 1.1737. They are model-error bands, distinct from bootstrap CIs. The fixed-native stage probe is diagnostic only.

| Events | Lane | PM1 proxy median | PM2 proxy median | PM2 ±17.37% band |
| ---: | --- | ---: | ---: | --- |
'''
for n in ['600','6000','60000']:
 for lane in ['off','auto']:
  a=old['settled'][n][lane];b=s['settled'][n][lane];v=b['proxyMedian'];text+=f"| {n} | {lane} | {f(a['proxyMedian'])} | {f(v)} | {f(v*.8263)} to {f(v*1.1737)} |\n"
text+='\n| Mixed lane | PM1 proxy total | PM2 proxy total | PM2 ±17.37% band | PM2 mean request proxy |\n| --- | ---: | ---: | --- | ---: |\n'
for lane in ['off','auto']:
 a=om[lane];b=m[lane];v=b['proxyTotal'];text+=f"| {lane} | {f(a['proxyTotal'])} | {f(v)} | {f(v*.8263)} to {f(v*1.1737)} | {f(v/600)} |\n"
text+=f'''
Mixed predicted saving is {m['proxySavingPct']:.2f}%, versus {om['proxySavingPct']:.2f}% in PM1. Comparing opposing calibration bands gives {ci(m['proxySavingErrorBand'])}% saving. PM2 does not beat calibration error. C1 was fitted to hosted wall time, so this CPU-input prediction is not calibrated Vercel Active CPU or billing evidence. No hosting call is made and no number is published.

Mocks omit real authentication, Prisma, and Tinybird client CPU. They also omit framework and HTTP work. Any positive saving here would be an optimistic upper bound for the real endpoint if omitted CPU stays unchanged. This single endpoint and assumed traffic mix cannot establish whole-app CPU savings.

## Correctness and timing quality

All 5,640 timed responses match original JS bytes before their SHA-256 hashes are retained. The three hashes match PM1 exactly.

| Events | Response bytes | SHA-256 |
| ---: | ---: | --- |
'''
for n,h in r['expected'].items():text+=f"| {n} | {h['bytes']} | `{h['sha256']}` |\n"
text+='''
All dispatcher shadows pass canonical comparisons. There are zero mismatch demotions, zero demoted buckets, zero native fallbacks, and no pending jobs at the end. The independent stage probe checks 210 native distribution outputs against JS, including its warmups.

The host driver pauses before every window and records `ps -A -o pid,pcpu,comm` and `uptime`. [host-load.json.gz](papermark-milestone-2/host-load.json.gz) retains all ten snapshots. No task build, test, analysis, or other agent overlaps timing. Desktop services and existing unrelated containers remain active. One-minute host load ranges from 3.37 to 7.63, so a fully idle host is not established. No unrelated process or container is stopped. The fixed mixed-arm bias and single-session uncertainty also remain. The container reports 241 throttled periods, 174,510 microseconds of throttling, under its required CPU cap.

## Validation and reproduction

The first setup attempts fail before any timing window. The external slice lacked a TypeScript link. An initial compiler path pointed to a non-executable package binary, and its copied toolchain lacked installed-package configuration. The successful build uses the existing executable stock `scriptc/bin/scriptc.exe` without modifying it. The sparse Papermark checkout also lacked the handler removed by PM1 cleanup. Restoring its exact pinned Git blob resolves that startup failure. Adjacent setup-failure logs retain these attempts. No measured window is discarded or repeated.

With temporary dependency links confined to this worktree and the external slice, run the copied [build](papermark-milestone-2/build.mjs), [driver](papermark-milestone-2/run.py), [measurement](papermark-milestone-2/measure.mjs), and unchanged [analysis](papermark-milestone-2/analyze.py). Build with `SCRIPTC_COMPILER` pointing to installed stock 0.4.6. Restore the pinned handler in the sparse external checkout before running. Then run `python3 research/papermark-milestone-2/compare.py` for the parity audit and report tables. Do not overlap builds or analysis with timing.

[raw.json.gz](papermark-milestone-2/raw.json.gz) contains every request hash, CPU sample, transition, stage sample, and final dispatcher state. [summary.json](papermark-milestone-2/summary.json) has PM1-method statistics. [comparison.json](papermark-milestone-2/comparison.json) retains per-candidate diagnostics and correctness checks. Both analysis scripts accept raw JSON or gzip.

Next passes all 98 tests, including the seeded real-addon differential fuzzer with 680 inputs and 1,360 comparisons across 17 candidates. Promotion passes 26 tests with two existing skips. An initial promotion run passes 25 and fails the Zod test because the temporary demo dependency links are missing. Adding links only in this worktree resolves setup before the full passing rerun. Both logs are retained. Tests run after all timing windows.

Cleanup removes only this task's external `.pm2` tree, restored handler, temporary dependency links, and generated test outputs. Main's dependency links are checked against their initial targets. The dedicated container has already been removed. Cleanup evidence is in [cleanup.json](papermark-milestone-2/cleanup.json). Artifacts over 256 KiB use `node scripts/compress-artifacts.mjs`. The root README, main checkout, scriptc fork, and `/Users/noah/scriptc` are untouched. No merge or push occurs. PM2 is retained as measurement evidence, with no policy or implementation change.
'''
(p.parent/'papermark-milestone-2.md').write_text(text)
