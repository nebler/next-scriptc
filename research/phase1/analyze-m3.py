import json,math,re,pathlib,statistics as st
root=pathlib.Path(__file__).resolve().parents[2]
d=json.loads((root/'research/standin/raw/m3-window2-phase1.json').read_text())
assert 'error' not in d
sizes=[1000,5000,15000,200000];modes=['js','native-new','auto-new','native-construction','auto-construction']
def q(a,p=.5):
 a=sorted(a);return a[max(0,math.ceil(len(a)*p)-1)]
def fmt(v):return f'{v:.3f}'
def band(v):return f'{v:.3f} [{v*.8263:.3f}, {v*1.1737:.3f}]'
rows=d['rows'];summary={};fractions={}
for mode in ['new','construction']:
 for n in sizes:
  a=[r for r in d['stages'] if r['mode']==mode and r['n']==n and r['i']>=0]
  fractions[mode,n]=q([r['stages']['compute']/r['ms'] for r in a])
def lane(mode,n):
 if mode=='js':return 'js'
 if mode.startswith('native-'):return mode.removeprefix('native-')
 family=mode.removeprefix('auto-');b=next(iter(d['decisions'][family].values()))['buckets'];b=next(x for x in b if x['bucket']==int(math.log2(sum(len(x) for x in ['2026-01-01','2026-01-31'])+len_events[n])));return family if b['state']=='native' else 'js'
# Bucket numbers derive from raw rows' distinct training sizes and sorted snapshot buckets.
buckets={family:dict(zip(sizes,sorted(next(iter(d['decisions'][family].values()))['buckets'],key=lambda b:b['bucket']))) for family in ['new','construction']}
def lane(mode,n):
 if mode=='js':return 'js'
 family=mode.split('-',1)[1]
 return family if mode.startswith('native') or buckets[family][n]['state']=='native' else 'js'
def factor(mode,n,cpu=True):
 l=lane(mode,n);c=1 if l=='js' else min(1,max(0,fractions[l,n]));return c*(1.792 if cpu else 1.791)+(1-c)*(2.260 if cpu else 2.254)
lines=['# Phase 1 gate M3','', '2026-11-01. Stand-in results on Linux arm64, Node 24.22.2, stock scriptc 0.4.6. Boundary-driven gains **need hosted confirmation**.','', '## Method','', 'Five arms rotate within each iteration: JS, strict native, strict auto, construction native, and construction auto. Both native result modes use D1 and E1. Construction uses `constructionResults:true` and default `catchFallback:true`; the retained build report confirms revenueCore is eligible and enabled. Arguments contain real event JSON. Each auto arm receives 540 calls per size, with 26 verified shadows required for its first decision at call 520. The rolling 50/minute cap remains active; the harness waits for capacity rather than changing the policy. Training, including asynchronous shadows, hashing and event-loop drains, is separate from steady-state results.','', 'Each cell has 15 warmups and 60 measured calls. The actual mixed stream has 600 calls per arm, exactly 420/120/60 at 1k/5k/200k. Calls and arm order are paired. Every returned result and every shadow is checked byte for byte against JS, with SHA-256 retained. No timed samples are filtered.','', 'The container uses `--cpus=1 --cpuset-cpus=11 --memory=2g`. The unrelated int8 validation container on CPUs 0-5 and all pre-existing containers are untouched. Host load is logged every two seconds. Absolute timings carry extra uncertainty from host load. C1 used CPU 0 and final one-minute loads 2.62-3.64 and 3.04-3.51; VM logical CPU 11 is not a guaranteed physical performance core.','', 'CPU timers use process.cpuUsage and include the native owner thread. Caller CPU excludes byte verification. Separate post-call drain CPU captures background shadow work; mixed inclusive CPU adds that cost, including drain bookkeeping. Wall tables show caller latency, with drain wall retained separately.','', 'A first attempt was stopped during training after inspection found that mixed totals omitted background recheck CPU. Its partial raw artifact and log remain as a method pilot; it contributes no final samples.','', '## Per-bucket measurements','', 'Milliseconds, nearest-rank median and p95. CPU is caller CPU; mixed totals below also include shadow-drain CPU.','', '| Events | Arm | CPU median / p95 | Wall median / p95 | Lane |','| ---: | --- | ---: | ---: | --- |']
for n in sizes:
 for mode in modes:
  a=[r for r in rows if r['section']=='bucket' and r['n']==n and r['mode']==mode]
  v={'cpu':q([r['cpuMs'] for r in a]),'wall':q([r['ms'] for r in a])};v['proxy']=v['cpu']*factor(mode,n);summary[n,mode]=v
  lines.append(f"| {n} | {mode} | {fmt(v['cpu'])} / {fmt(q([r['cpuMs'] for r in a],.95))} | {fmt(v['wall'])} / {fmt(q([r['ms'] for r in a],.95))} | {lane(mode,n)} |")
lines+=['','## C1 predictions','', 'C1 does not identify hosted CPU. These are CPU-input hosted-wall proxies, not calibrated Active CPU or billing savings. Factors are 1.792 compute and 2.260 boundary for CPU input, and 1.791/2.254 for wall input. As in M2, the median instrumented compute/total-wall fraction allocates uninstrumented time proportionally. CPU stage allocation is an estimate. Auto uses the chosen lane. Bands are ±17.37%, the maximum C1 observed cell error, not confidence intervals. Extending the small-argument calibration to large event strings remains unvalidated.','', '| Events | Arm | CPU-input proxy [band] | Hosted wall prediction [band] |','| ---: | --- | ---: | ---: |']
for n in sizes:
 for mode in modes:
  v=summary[n,mode];lines.append(f"| {n} | {mode} | {band(v['proxy'])} | {band(v['wall']*factor(mode,n,False))} |")
lines+=['','## Decisions and training','', '| Mode | Events | First lane | Call | Cumulative verified | Final lane | Flapped? |','| --- | ---: | --- | ---: | ---: | --- | --- |']
for family in buckets:
 final=next(iter(d['final'][family].values()))['buckets']
 for n,b in buckets[family].items():
  end=next(x for x in final if x['bucket']==b['bucket']);assert b['lastDecision']['atCall']>=520
  ts=[json.loads(x['s'].removeprefix('next-scriptc ')) for x in d['transitions'] if isinstance(x,dict) and x['mode']==family];ts=[x['state'] for x in ts if x['bucket']==b['bucket'] and x['state'] in ['native','js-final','demoted']]
  lines.append(f"| {family} | {n} | {b['lastDecision']['state']} | {b['lastDecision']['atCall']} | {b['verified']} | {end['state']} | {'yes' if len(set(ts))>1 else 'no observed'} |")
lines+=['','| Events | Training CPU total | Training wall total |','| ---: | ---: | ---: |']
for r in d['training']:
 if r.get('total'):lines.append(f"| {r['n']} | {fmt(r['cpuMs'])} | {fmt(r['wallMs'])} |")
lines+=['','Training totals include both auto arms. This short run observes the first decision and partial recheck epochs, not long-term stability.','', '## Mixed workload totals','', '| Arm | Caller CPU sum | Inclusive CPU sum | Caller wall sum | Inclusive CPU proxy [band] |','| --- | ---: | ---: | ---: | ---: |']
mixed={}
for mode in modes:
 a=[r for r in rows if r['section']=='mixed' and r['mode']==mode];assert len(a)==600
 cpu=sum(r['cpuMs'] for r in a);inclusive=sum(r['cpuMs']+r['shadowCpuMs'] for r in a);proxy=sum(r['cpuMs']*factor(mode,r['n'])+r['shadowCpuMs']*2.260 for r in a);mixed[mode]=proxy
 lines.append(f"| {mode} | {fmt(cpu)} | {fmt(inclusive)} | {fmt(sum(r['ms'] for r in a))} | {band(proxy)} |")
lines+=['','Drain CPU is conservatively assigned the boundary factor because no CPU stage split exists for rechecks. Raw rows preserve it separately.','', '## Dispatcher overhead','']
ov={m:q([r['ms'] for r in d['overhead'] if r['mode']==m]) for m in ['direct','dispatcher']};delta=ov['dispatcher']-ov['direct']
lines.append(f"A rotating constant-function probe uses 100 measured batches of 10,000 calls after 10 warmup batches. Direct median {ov['direct']:.6f} ms/call; dispatcher median {ov['dispatcher']:.6f}; difference {delta:.6f}. The ≤0.005 ms budget {'passes' if delta<=.005 else 'fails'}. This measures ordinary JS routing; shadow work is separate.")
lines+=['','## Exact M2 gate','', 'A performance improvement must have native upper band below JS lower band. Auto must select the best fixed lane in every bucket and beat both fixed lanes on the actual mix beyond calibration error.','', '| Mode | 5k | 15k | 200k | Best fixed lane in every bucket | Mixed beats both fixed lanes beyond error |','| --- | --- | --- | --- | --- | --- |']
verdict={}
for family in ['new','construction']:
 native='native-'+family;auto='auto-'+family
 passes=[summary[n,native]['proxy']*1.1737<summary[n,'js']['proxy']*.8263 for n in sizes[1:]]
 best=all(lane(auto,n)==('js' if summary[n,'js']['cpu']<summary[n,native]['cpu'] else family) for n in sizes)
 mix=all(mixed[auto]*1.1737<mixed[m]*.8263 for m in ['js',native]);verdict[family]={'sizes':passes,'best':best,'mixed':mix,'pass':all(passes) and best and mix}
 lines.append('| '+family+' | '+' | '.join('PASS' if x else 'FAIL' for x in passes+[best,mix])+' |')
lines+=['', 'The compound M2 gate '+('PASSES' if any(v['pass'] for v in verdict.values()) else 'FAILS')+'. A hosted CPU gate remains unidentifiable. Construction remains opt-in. No thresholds were tuned from these measurements. At 200k, strict has 15/24 and construction 14/24 promotion votes, below the D1 19-vote requirement. Decision medians are JS/native 102.905/85.242 ms strict and 105.163/76.422 ms construction. These loaded-host service pairs fail confidence despite a lower native median. Only partial recheck epochs follow, so recovery is not demonstrated.','', '## Evidence and reproduction','', '`SCRIPTC_COMPILER=/absolute/stock/scriptc node research/phase1/build-m3.mjs`, then `STANDIN_CPU=11 PHASE1_MEASURE=research/phase1/measure-m3.mjs research/standin/run.sh phase1 m3-window2`. Generate this report with `python3 research/phase1/analyze-m3.py`. The historical M2 harness is unchanged.','', 'Raw final rows, decisions, stages, shadows, quotas and throttling are in [m3-window2-phase1.json](standin/raw/m3-window2-phase1.json). [Host load](standin/raw/m3-window2-host-load.log), [container settings](standin/raw/m3-window2-container.json), and [build/test records](phase1/raw/m3/) are retained. All 69 full adapter tests, both shim tests, and the standard 24 demo tests pass. An initial overly broad demo command included separate integration scripts and failed during setup under dependency symlinks; its log is retained, followed by the passing package-script file set. No Vercel, scriptc source edit, or Papermark timing occurred. Setup caveat: the initial Phase1 build overlapped the two-worker adapter suite, so the two-build ceiling was not guaranteed during that interval. All measurements started after builds and tests finished.']
load=list(map(float,re.findall(r'load averages: ([\d.]+)',(root/'research/standin/raw/m3-window2-host-load.log').read_text())))
lines.append(f"\nObserved host one-minute load spans {min(load):.2f}-{max(load):.2f}. Returned byte checks: {sum(len(d[k]) for k in ['rows','warmups','stages'])+sum(not r.get('total',False) for r in d['training'])}; shadow byte checks: {len(d['shadowHashes'])}.")
(root/'research/phase1-gate-m3.md').write_text('\n'.join(lines)+'\n')
(root/'research/phase1/raw/m3/summary.json').write_text(json.dumps({'cells':[{'n':n,'mode':m,**v} for (n,m),v in summary.items()],'mixed':mixed,'gate':verdict,'overheadMs':delta},indent=2)+'\n')
print(json.dumps(verdict));print('overhead',delta)

cleanup=root/'research/phase1/raw/m3/disk-cleanup.json'
if cleanup.exists():
 info=json.loads(cleanup.read_text())
 note=f"\nDisk free was approximately 18 GiB before work and {info['afterCleanup']['availableBytes']/1024**3:.2f} GiB after cleanup. The pre-cleanup reading was {info['beforeCleanup']['availableBytes']/1024**3:.2f} GiB. Other host work also changes available space. Task-created build trees, caches, demo build output, and all three dependency symlinks were removed. See [cleanup record](phase1/raw/m3/disk-cleanup.json).\n"
 with (root/'research/phase1-gate-m3.md').open('a') as out:out.write(note)
