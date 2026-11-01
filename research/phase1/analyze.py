import json,math,statistics,pathlib,re
root=pathlib.Path(__file__).resolve().parents[2]
paths=[root/f'research/standin/raw/m2-window{i}-phase1.json' for i in [1,2,3]]
data=[json.loads(p.read_text()) for p in paths]
assert all('error' not in d for d in data)
rows=[r for d in data for r in d['rows']]; stages=[r for d in data for r in d['stages'] if r['i']>=0]
pct=lambda a,p:sorted(a)[math.ceil(len(a)*p)-1]
med=lambda a:pct(list(a),.5)
fields=['jsEncode','nativeInputCopy','nativeDecode','compute','nativeEncode','copyBack','jsDecode']
sizes=[1000,5000,15000,200000];modes=['js','old','new','auto'];summary={};stage={};decisions=[]
for d in data:
 decisions.append({b['bucket']:b['state'] for f in d['decisions'].values() for b in f['buckets']})
for n in sizes:
 stage[n]={}
 for mode in ['old','new']:
  sr=[r for r in stages if r['n']==n and r['mode']==mode]
  stage[n][mode]={k:med(r['stages'][k] for r in sr) for k in fields}
  stage[n][mode]['wall']=med(r['ms'] for r in sr)
  stage[n][mode]['residual']=med(r['ms']-sum(r['stages'][k] for k in fields) for r in sr)
  stage[n][mode]['computeShare']=med(r['stages']['compute']/r['ms'] for r in sr)
 summary[n]={}
 for mode in modes:
  rr=[r for r in rows if r['section']=='bucket' and r['mode']==mode and r['n']==n]
  v={k:med(r[k] for r in rr) for k in ['cpuMs','ms']};v.update({k+'95':pct([r[k] for r in rr],.95) for k in ['cpuMs','ms']});v['n']=len(rr)
  def prediction(metric):
   total=0
   for di,d in enumerate(data):
    rrr=[r for r in d['rows'] if r['section']=='bucket' and r['mode']==mode and r['n']==n]
    native=mode in ['old','new'] or mode=='auto' and decisions[di][int(math.log2(d['inputBytes'][str(n)]+20))]=='native'
    share=stage[n]['old' if mode=='old' else 'new']['computeShare'] if native else 1
    total+=med(r[metric] for r in rrr)*(1.79*share+2.25*(1-share))
   return total/len(data)
  v['predCpuProxy']=prediction('cpuMs');v['predWall']=prediction('ms');summary[n][mode]=v
mixed=[]
for wi,d in enumerate(data):
 for mode in modes:
  rr=[r for r in d['rows'] if r['section']=='mixed' and r['mode']==mode]
  pred={}
  for metric in ['cpuMs','ms']:
   total=0
   for r in rr:
    n=r['n'];native=mode in ['old','new'] or mode=='auto' and decisions[wi][int(math.log2(d['inputBytes'][str(n)]+20))]=='native'
    share=stage[n]['old' if mode=='old' else 'new']['computeShare'] if native else 1
    total+=r[metric]*(1.79*share+2.25*(1-share))
   pred[metric]=total
  mixed.append(dict(window=wi+1,mode=mode,n=len(rr),cpuMs=sum(r['cpuMs'] for r in rr),wallMs=sum(r['ms'] for r in rr),pred=pred))
output={'summary':summary,'stages':stage,'mixed':mixed,'decisions':decisions}
(root/'research/phase1/raw/analysis.json').write_text(json.dumps(output,indent=2))
f=lambda x:f'{x:.3f}'
band=lambda x:f'{x:.3f} [{x*.8263:.3f}, {x*1.1737:.3f}]'
lines=['# Phase 1 stand-in results (M2)','', '2026-11-01. Local measurements only. The compound Phase 1 gate fails. Raw UTF-8 improves this real-argument workload, but auto does not reliably choose the best fixed lane in every bucket. Boundary gains **need hosted confirmation**.','', '## Workload and method','', 'The unchanged P1 `revenueCore(from,to,eventsJson)` receives generated event JSON as an actual string argument. Fixture generation and SHA-256 validation are outside timed calls. There is no A2 internal fixture cache. Input bytes are '+', '.join(str(n)+": "+str(data[0]["inputBytes"][str(n)]) for n in sizes)+'.','', 'Merge source is `t3/per-type-boundary-encodings` at 3d514ac, including the automatic-promotion prototype. The only merge conflict was the hill log; both histories were preserved. Stock scriptc and runtime 0.4.6, ABI 47, Zig 0.16.0, Linux arm64 GNU 2.34, Node 24.22.2, one CPU pinned to VM CPU 0, and 2 GiB match the calibrated stand-in. The pin does not guarantee a physical Apple performance core.','', 'The old lane reconstructs P1\'s boundary: serialize `[from,to,eventsJson]` as one strict JSON string, copy it, parse the tuple in native code, call the unchanged core, strictly serialize its object result, copy back, and JSON.parse in JS. A one-tuple wrapper lets the current shim build that exact all-JSON wire contract. Thus this isolates encoding and uses the same current owner-thread shim on both lanes; it is not the historical P1 addon binary. The wrapper adds a trivial call. The new lane passes three raw UTF-8 strings and keeps JSON for the object result.','', 'Each of three windows discards 15 warmups and measures 60 calls per size and mode with rotated order. Pooled n=180 per cell. A separate 600-call stream per mode per window uses exactly 420 at 1k, 120 at 5k, and 60 at 200k, interleaved in a repeated 70/20/10 sequence. Mixed totals are actual sums. They exclude learning and warmups. No samples are filtered.','', 'Auto uses the prototype defaults. Each bucket receives 120 training calls, draining asynchronous shadows between calls. Five shadows at calls 20,40,60,80,100 decide its lane. All training rows and total CPU including shadows are retained. This is a sequential warm-instance experiment, not a concurrent production arrival-rate test.','', 'CPU encloses each invocation with process.cpuUsage and includes the native owner thread and all Node threads. Wall encloses the same synchronous call. Seven-stage diagnostics use separate instrumented builds, 15 discarded warmups and 60 measured calls per cell per window. Instrumented totals never enter the primary tables. Stage clocks measure elapsed time, not CPU.','', '## Local CPU and wall','', 'Cells are nearest-rank median / p95 milliseconds. All cells have n=180.','', '| Events | Mode | CPU median / p95 | Wall median / p95 |','| ---: | --- | ---: | ---: |']
for n in sizes:
 for m in modes:
  v=summary[n][m];lines.append(f"| {n} | {m} | {f(v['cpuMs'])} / {f(v['cpuMs95'])} | {f(v['ms'])} / {f(v['ms95'])} |")
lines+=['','## Predicted hosted wall and CPU-input proxy','','Apply compute × 1.79 + boundary × 2.25. The seven stages define compute as the original core, including event JSON.parse. All other stages and unassigned end-to-end overhead are boundary. For each cell, estimate the compute fraction as the median of instrumented compute / total wall; apply that fraction to the uninstrumented total. This proportional CPU allocation is an estimate because there are no per-stage CPU counters. Scheduling and throttling can distort it. JS has no boundary. Auto uses its actual lane in each window. Window predictions are averaged.','','Bands are ±17.37%, the calibration maximum observed cell error; mean absolute fit error was 6.44%. These are sensitivity bands, not confidence or prediction intervals. The calibration came from A2 with tiny arguments and hosted wall observations. Extending it to large real arguments is unvalidated. The CPU-input column predicts hosted wall from local CPU; it does not identify hosted Active CPU or billing savings.','','| Events | Mode | CPU-input hosted-wall proxy [band], ms | Predicted hosted wall [band], ms |','| ---: | --- | ---: | ---: |']
for n in sizes:
 for m in modes:
  v=summary[n][m];lines.append(f"| {n} | {m} | {band(v['predCpuProxy'])} | {band(v['predWall'])} |")
lines+=['','## Seven elapsed stages','','Medians in ms, n=180 per cell. Residual is the median per-call end-to-end time minus the sum of its seven stages; sums of medians need not equal the median total.','','| Events | Lane | JS encode | Input copy | Native decode | Compute | Native encode | Copy back | JS decode | Residual | Instrumented total |','| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
for n in sizes:
 for m in ['old','new']:
  v=stage[n][m];lines.append('| '+str(n)+' | '+m+' | '+' | '.join(f(v[k]) for k in fields+['residual','wall'])+' |')
lines+=['','## Mixed totals','','Each row is an observed 600-call stream, not a weighted sum of medians. Each predicted total receives the same ±17.37% sensitivity band.','','| Window | Mode | Local CPU total, ms | Local wall total, ms | CPU-input proxy [band], ms | Predicted wall [band], ms |','| ---: | --- | ---: | ---: | ---: | ---: |']
for v in mixed:lines.append(f"| {v['window']} | {v['mode']} | {f(v['cpuMs'])} | {f(v['wallMs'])} | {band(v['pred']['cpuMs'])} | {band(v['pred']['ms'])} |")
lines+=['','## Dispatcher decisions','','| Window | Bucket | State | Decision call | Verified shadows | JS decision median, ms | Async native decision median, ms |','| ---: | ---: | --- | ---: | ---: | ---: | ---: |']
for wi,d in enumerate(data):
 for raw in d['transitions']:
  t=json.loads(raw.removeprefix('next-scriptc '))
  if t.get('state') in ['native','js-final']:lines.append(f"| {wi+1} | {t['bucket']} | {t['state']} | {t['calls']} | {t['n']} | {f(t['js'])} | {f(t['native'])} |")
lines+=['','No policy thresholds were tuned. Buckets are 16,18,20,23 for 1k,5k,15k,200k. Training CPU includes SHA validation and event-loop drains, so it is an inclusive learning cost, not isolated shadow CPU.','', '| Window | Size | Inclusive 120-call training CPU, ms | Inclusive training wall, ms |','| ---: | ---: | ---: | ---: |']
for wi,d in enumerate(data):
 for r in d['training']:
  if r.get('total'):lines.append(f"| {wi+1} | {r['n']} | {f(r['cpuMs'])} | {f(r['wallMs'])} |")
lines+=['','## Gate and interpretation','','Use disjoint worst-fit bands as the conservative criterion: new upper bound must be below JS lower bound. This is stricter than merely exceeding a 17.37% central reduction.','','| Events | New CPU-proxy central reduction vs JS | Disjoint bands? |','| ---: | ---: | --- |']
for n in sizes:
 j=summary[n]['js']['predCpuProxy'];v=summary[n]['new']['predCpuProxy'];lines.append(f'| {n} | {(1-v/j)*100:.1f}% | {"yes" if v*1.1737<j*.8263 else "no"} |')
lines+=['','The full gate requires all sizes from 5k upward to beat JS beyond calibration error, auto to match the best fixed choice in every bucket, and auto to beat both fixed choices on the mix. Passing one condition does not establish the others. A hosted CPU gate remains unidentifiable with the current calibration.','','## Evidence, failures, and cleanup','','The initial build failed because dependencies were absent. `pnpm install --offline --frozen-lockfile` restored dependencies; the retry built all four addons. The failed build log is retained. An initial report-generator syntax check caught invalid quoting; it was corrected before analysis. Automatic approval review rejected the initial rm-style cleanup command. A replacement enumerated only generated files inside this worktree, checked path containment, and removed those files individually. No compiler source checkout was modified. Window 1 checks every returned answer by SHA-256; its 20 shadows use the dispatcher\'s exact canonical-byte comparison. Windows 2 and 3 additionally hash all 40 shadow results outside the shadow decision timer. The current harness uses the same dispatcher and addon wiring as loadPromotion. This verification-only change is recorded; no timing sample is dropped.','','Raw training, warmups, measured rows, stages, decisions, hashes, CPU quotas, throttle counters, and artifact hashes are retained in [phase1/raw](phase1/raw) and [standin/raw](standin/raw). Reproduce builds with `SCRIPTC_COMPILER=/absolute/stock/scriptc node research/phase1/build.mjs`, then run `research/standin/run.sh phase1 fresh-window`. Regenerate tables with `python3 research/phase1/analyze.py`. The analysis explicitly selects windows 1, 2, and 3.','','No Vercel, Sandbox, push, issue, or PR operation was used. Only newly created nsc-standin containers were removed. Generated artifacts are removed after validation.']
lines+=['', 'Root `pnpm test` passes all 38 package tests and 24 demo tests. Shell and JavaScript syntax checks pass. This task changes research tools only; no compiler implementation changed.', '', '## Window stability and validation', '', '| Window | Host one-minute load min / max | Returned SHA checks | Shadow SHA checks |', '| ---: | ---: | ---: | ---: |']
for wi,d in enumerate(data):
 load=list(map(float,re.findall(r'load averages: ([\d.]+)',(root/f'research/standin/raw/m2-window{wi+1}-host-load.log').read_text())))
 count=len(d['rows'])+len(d['warmups'])+len(d['stages'])+sum(not r.get('total',False) for r in d['training'])
 assert count==4680
 assert all(r['sha256']==d['expected'][str(r['n'])] for name in ['rows','warmups','stages','training'] for r in d[name] if 'sha256' in r)
 lines.append(f"| {wi+1} | {min(load):.2f} / {max(load):.2f} | {count} | {len(d.get('shadowHashes',[]))} |")
lines+=['', 'Window 1 load spiked from about 3 to 8.81. Window 2 repeated the experiment as load declined, then rose near its end. Window 3 is another repeat. Every window and every loss remains in the pooled results. No process or unrelated container was stopped. There is no claim of an idle host.', '', '| Window | Events | JS CPU median | Old CPU median | New CPU median | Auto CPU median |', '| ---: | ---: | ---: | ---: | ---: | ---: |']
for wi,d in enumerate(data):
 for n in sizes:
  vals=[med(r['cpuMs'] for r in d['rows'] if r['section']=='bucket' and r['n']==n and r['mode']==m) for m in modes]
  lines.append('| '+str(wi+1)+' | '+str(n)+' | '+' | '.join(f(v) for v in vals)+' |')
lines+=['', 'The input escaping and native outer-JSON decode explain almost all of the old-to-new savings. At 200k, these two stages shrink by about 59 ms while core compute stays near 26 ms. At 1k, roughly 0.58 ms of native result validation and encoding remains, exceeding the JS core alone. At 5k, removing argument escaping helps locally but leaves too little predicted gain to clear the calibration error.', '', 'Auto makes zero native answers at 1k in every window. Its settled caller overhead is visible in the main table and is not erased. At 5k or 15k, five async samples can reject a lane that wins with synchronous native calls. The decision timer includes libuv and event-loop scheduling; this mechanism can explain the conservative decisions, but the experiment does not isolate a single cause.', '', 'Auto mixed CPU totals beat fixed JS and fixed native in the retained windows. The extra win over fixed new native is small relative to the calibration bands, so it does not count as an established improvement under hill-plan.md. The per-bucket requirement also fails. Keep the encoding implementation and measurement tools, but reject a Phase 1 performance pass.', '', 'Instrumented and uninstrumented medians differ due to instrumentation, run order, and allocation state. Diagnostics do not identify a causal instrumentation penalty; they provide a stage allocation estimate. No negative overhead is subtracted. The calibration band does not account for this additional model uncertainty.']
(root/'research/phase1-standin-results.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({'summary':summary,'decisions':decisions,'mixed':mixed},indent=2))
