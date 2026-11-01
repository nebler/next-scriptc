"""Regenerate the CPU timing report from retained M3 and contention artifacts."""
import json, math, pathlib, re
root=pathlib.Path(__file__).resolve().parents[2]
raw=root/'research/standin/raw'
d=json.loads((raw/'m3-cpu-timing-phase1.json').read_text())
p=json.loads((raw/'cpu-contention-probe-phase1.json').read_text())
assert 'error' not in d
sizes=[1000,5000,15000,200000]
modes=['js','native-new','auto-new','native-construction','auto-construction']
def q(a,p=.5):
 a=sorted(a);return a[max(0,math.ceil(len(a)*p)-1)]
def f(x):return f'{x:.3f}'
buckets={m:dict(zip(sizes,sorted(next(iter(fs.values()))['buckets'],key=lambda b:b['bucket']))) for m,fs in d['decisions'].items()}
def lane(m,n):
 if m=='js':return 'js'
 family=m.split('-',1)[1]
 return family if m.startswith('native-') or buckets[family][n]['state']=='native' else 'js'
fractions={(m,n):q([r['stages']['compute']/r['ms'] for r in d['stages'] if r['mode']==m and r['n']==n and r['i']>=0]) for m in buckets for n in sizes}
def factor(m,n):
 l=lane(m,n);c=1 if l=='js' else min(1,max(0,fractions[l,n]));return c*1.792+(1-c)*2.260
cells={(n,m):{k:q([r[key] for r in d['rows'] if r['section']=='bucket' and r['n']==n and r['mode']==m]) for k,key in [('cpu','cpuMs'),('wall','ms')]} for n in sizes for m in modes}
mixed={m:{'cpu':sum(r['cpuMs'] for r in d['rows'] if r['section']=='mixed' and r['mode']==m),'inclusive':sum(r['cpuMs']+r['shadowCpuMs'] for r in d['rows'] if r['section']=='mixed' and r['mode']==m),'wall':sum(r['ms'] for r in d['rows'] if r['section']=='mixed' and r['mode']==m),'proxy':sum(r['cpuMs']*factor(m,r['n'])+r['shadowCpuMs']*2.260 for r in d['rows'] if r['section']=='mixed' and r['mode']==m)} for m in modes}
gate={}
for family in buckets:
 native='native-'+family;auto='auto-'+family
 gates=[cells[n,native]['cpu']*factor(native,n)*1.1737<cells[n,'js']['cpu']*factor('js',n)*.8263 for n in sizes[1:]]
 best=all(lane(auto,n)==('js' if cells[n,'js']['cpu']<cells[n,native]['cpu'] else family) for n in sizes)
 mix=all(mixed[auto]['proxy']*1.1737<mixed[m]['proxy']*.8263 for m in ['js',native])
 gate[family]={'sizes':gates,'best':best,'mixed':mix,'pass':all(gates) and best and mix}
lines=['# Dispatcher CPU timing','', '2026-11-01. The contention hypothesis is supported, with one correction: M3 drains every shadow before the next workload call. Its repeated `setImmediate` drain keeps the main thread runnable while the owner thread executes. Concurrent workload JS is a separate production case, reproduced by the probe.','', '## Evidence before the fix','', 'The original `m3-window2-phase1.json` records 15/24 strict and 14/24 construction promotion votes at 200k. Its decision JS/native medians are 102.905/85.242 ms and 105.163/76.422 ms. Fixed native CPU is about 30 ms. At 5k strict, only 11/24 pairs vote native, with decision medians 2.817/2.621 ms versus fixed JS/native CPU 2.141/1.401 ms. The raw artifact alone cannot assign elapsed time to contention; the following controlled probe changes only main-thread activity.','', 'The probe rotates 20 retained samples per condition after three warmups at each size, using the strict addon on CPU 11 with `--cpus=1`. Timer draining sleeps 1 ms between checks; busy draining repeats `setImmediate`; the JS condition executes the same reference workload between checks. Every shadow result is byte checked. Native CPU includes owner execution, input conversion, worker handoff CPU, and result conversion.','', '| Events | Main-thread activity | Native CPU median | Native wall median | Concurrent JS CPU / wall per call |','| ---: | --- | ---: | ---: | ---: |']
for n in [5000,200000]:
 for kind in ['timer','busy','js']:
  a=[r for r in p['rows'] if r['n']==n and r['kind']==kind]
  js='n/a' if kind!='js' else f"{f(q([r['jsCpuMs']/r['jsCalls'] for r in a]))} / {f(q([r['jsWallMs']/r['jsCalls'] for r in a]))}"
  lines.append(f"| {n} | {kind} | {f(q([r['cpuMs'] for r in a]))} | {f(q([r['elapsedMs'] for r in a]))} | {js} |")
lines+=['','## Implementation','', '`runShadow` now returns `cpuMs` alongside `elapsedMs`. `CLOCK_THREAD_CPUTIME_ID` measures input conversion and result conversion on the caller, native execution on its permanent owner, and worker handoff CPU separately. Queue wait, preemption, and event-loop completion wait consume no measured service CPU. Ordinary synchronous and asynchronous addon return contracts are unchanged.','', 'The addon exposes `threadCpuMs()` for the calling thread. The dispatcher uses it for JS reference execution and caller encoding and decoding, then adds the addon service CPU. CPU pairs require both clocks; invalid CPU durations are skipped rather than mixed with wall. Legacy addons and custom dispatchers without the CPU clock retain wall sampling. No shadow is launched from a JS sample taken while another shadow is pending. Wall pairs remain diagnostic and include caller encode/decode. Correctness checking and hashing stay outside the decision metric.','', 'D1 retains 24 pairs, 19 required votes, a 0.90 promotion ratio, 1.05 demotion ratio, two cold exclusions, existing frequency limits, and one pending shadow. Thread CPU is a service-cost estimate, not a hosted billing measurement. It excludes V8 helper-thread CPU, scheduling bookkeeping outside these regions, and work attributable to later garbage collection. Mixed totals still use process CPU and include background drains.','', '## M3 rerun','', 'The unchanged five-arm schedule uses 540 training calls per bucket and auto mode, 15 warmups and 60 retained calls per cell, then an actual 600-call 70/20/10 mix. The rolling 50/minute cap remains enabled. The busy drain is deliberately retained to reproduce M3 contention. Builds and tests finish before timing starts. The Linux arm64 Node 24 stand-in is pinned to CPU 11 with one CPU and 2 GiB memory. No existing container, scriptc source, Vercel deployment, root README, or Papermark measurement is changed.','', 'All times below are milliseconds. Decision medians use the same upper median as dispatcher logging. Steady medians use M3 nearest-rank convention.','', '| Mode | Events | Chosen lane | Votes / 24 | Decision CPU JS / native | Steady CPU JS / native | Decision wall JS / native |','| --- | ---: | --- | ---: | ---: | ---: | ---: |']
for family in buckets:
 for n,b in buckets[family].items():
  x=b['lastDecision'];assert x['metric']=='thread-cpu';assert len(x['js'])==24
  upper=lambda a:sorted(a)[len(a)//2]
  votes=sum(v<.9*j for j,v in zip(x['js'],x['native']))
  lines.append(f"| {family} | {n} | {b['state']} | {votes} | {f(upper(x['js']))} / {f(upper(x['native']))} | {f(cells[n,'js']['cpu'])} / {f(cells[n,'native-'+family]['cpu'])} | {f(upper([p[0] for p in x['wallPairs']]))} / {f(upper([p[1] for p in x['wallPairs']]))} |")
lines+=['','Each first decision occurs at call 520. Only partial later epochs are observed; this does not establish long-term stability. The native decision CPU/steady CPU ratios at 200k are '+', '.join(f'{m} {sorted(buckets[m][200000]["lastDecision"]["native"])[12]/cells[200000,"native-"+m]["cpu"]:.2f}x' for m in buckets)+'. Compare the original wall ratios of approximately 2.87x strict and 2.53x construction. The remaining CPU gap is real measured service variation; removing contention does not make training and steady-state allocation or warmup costs identical.','', '| Events | Arm | CPU median / p95 | Wall median / p95 |','| ---: | --- | ---: | ---: |']
for n in sizes:
 for m in modes:
  a=[r for r in d['rows'] if r['section']=='bucket' and r['n']==n and r['mode']==m];assert len(a)==60
  lines.append(f"| {n} | {m} | {f(cells[n,m]['cpu'])} / {f(q([r['cpuMs'] for r in a],.95))} | {f(cells[n,m]['wall'])} / {f(q([r['ms'] for r in a],.95))} |")
lines+=['','| Arm | Caller CPU total | CPU including drains | Caller wall total | C1 inclusive CPU proxy [band] |','| --- | ---: | ---: | ---: | ---: |']
for m,v in mixed.items():
 assert len([r for r in d['rows'] if r['section']=='mixed' and r['mode']==m])==600
 lines.append(f"| {m} | {f(v['cpu'])} | {f(v['inclusive'])} | {f(v['wall'])} | {f(v['proxy'])} [{f(v['proxy']*.8263)}, {f(v['proxy']*1.1737)}] |")
lines+=['','Drain CPU includes all process CPU during post-call event-loop draining, including drains with no pending shadow. Strict auto records 677.438 ms of mixed drain CPU versus 23.915 ms for construction auto. The retained fields cannot attribute this difference to shadows, garbage collection, or drain bookkeeping; none is subtracted or filtered. This reproduces M3 accounting and is deliberately conservative.', '', '## Exact M2 gate','', 'Native upper bands must fall below JS lower bands from 5k up. Auto must choose the best fixed lane in every bucket and beat both fixed lanes on the actual mix beyond calibration error. C1 factors remain 1.792 compute and 2.260 boundary, with ±17.37% bands. Compute fractions come from the median instrumented compute/wall ratio, as in M3. Drain CPU receives the boundary factor. These are CPU-input hosted-wall proxies, not calibrated Active CPU savings or confidence intervals. Boundary gains need hosted confirmation.','', '| Mode | 5k | 15k | 200k | Best lane every bucket | Mix beats both beyond error |','| --- | --- | --- | --- | --- | --- |']
for m,v in gate.items():lines.append('| '+m+' | '+' | '.join('PASS' if x else 'FAIL' for x in v['sizes']+[v['best'],v['mixed']])+' |')
lines+=['', 'Compound gate '+('PASS' if any(v['pass'] for v in gate.values()) else 'FAIL')+'. Auto cannot demonstrate a mixed win beyond error merely by matching the best fixed lane. Construction remains opt-in. No policy thresholds were tuned.']
load=list(map(float,re.findall(r'load averages: ([\d.]+)',(raw/'m3-cpu-timing-host-load.log').read_text())))
ov={m:q([r['ms'] for r in d['overhead'] if r['mode']==m]) for m in ['direct','dispatcher']}
lines+=['',f"Host one-minute load spans {min(load):.2f}–{max(load):.2f}; this adds uncertainty to absolute timings. Dispatcher overhead is {ov['dispatcher']-ov['direct']:.6f} ms/call against the 0.005 ms budget. Returned byte checks: {sum(len(d[k]) for k in ['rows','warmups','stages'])+sum(not r.get('total',False) for r in d['training'])}; shadow byte checks: {len(d['shadowHashes'])}. Raw cgroup throttling counters are retained.",'', '## Validation', '', 'All 72 full adapter tests pass with one test worker, including the actual compiled addon ABI test and fake CPU/wall contention tests. Both shim tests pass on Node 24, and all 24 standard demo tests pass. The first shim attempt used host Node 26 and stopped at its explicit Node 24 guard; its log is retained. Builds and tests did not overlap timing runs. No build commands ran concurrently.', '', '## Reproduction and artifacts','', 'Use the installed stock scriptc 0.4.6 compiler with `SCRIPTC_COMPILER=... M3_ARTIFACTS=research/phase1/raw/cpu-timing/artifacts.json node research/phase1/build-m3.mjs`. Builds run sequentially. Run `STANDIN_CPU=11 PHASE1_MEASURE=research/phase1/probe-cpu-timing.mjs research/standin/run.sh phase1 cpu-contention-probe`, finish the tests, then run `STANDIN_CPU=11 PHASE1_MEASURE=research/phase1/measure-m3.mjs research/standin/run.sh phase1 m3-cpu-timing`. Regenerate this report with `python3 research/phase1/analyze-cpu-timing.py`.','', 'Raw artifacts: [probe](standin/raw/cpu-contention-probe-phase1.json), [M3 rerun](standin/raw/m3-cpu-timing-phase1.json), [host load](standin/raw/m3-cpu-timing-host-load.log), [container settings](standin/raw/m3-cpu-timing-container.json), and [build and test records](phase1/raw/cpu-timing/). The historical M3 artifact and report remain unchanged.']
cleanup=root/'research/phase1/raw/cpu-timing/cleanup.json'
if cleanup.exists():
 c=json.loads(cleanup.read_text());lines+=['',f"Disk free before work was about 19 GiB; before cleanup {c['beforeGiB']:.2f} GiB and after cleanup {c['afterGiB']:.2f} GiB. Task build output and all three dependency symlinks were removed. Other host work can affect free space."]
(root/'research/dispatcher-cpu-timing.md').write_text('\n'.join(lines)+'\n')
(root/'research/phase1/raw/cpu-timing/summary.json').write_text(json.dumps({'gate':gate,'mixed':mixed,'cells':[{'n':n,'mode':m,**v} for (n,m),v in cells.items()]},indent=2)+'\n')
print(json.dumps(gate,indent=2))
