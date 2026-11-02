import json,math,gzip,pathlib
p=pathlib.Path(__file__).parent
def read(name):
 f=p/(name+'.json');return json.loads(f.read_text() if f.exists() else gzip.decompress((p/(name+'.json.gz')).read_bytes()))
def q(a,v=.5):
 a=sorted(a);return a[max(0,math.ceil(len(a)*v)-1)]
d=read('nested');lines=['| Records | Phase | OFF thread CPU ms | Before AUTO ms (overhead) | After AUTO ms (overhead) |','| ---: | --- | ---: | ---: | ---: |']
for n in [600,6000,60000]:
 for phase in ['training','steady']:
  med={lane:q([r['threadMs'] for r in d['rows'] if r['n']==n and r['section']==phase and r['lane']==lane]) for lane in ['off','before','after']}
  lines.append(f"| {n} | {phase} | {med['off']:.5f} | {med['before']:.5f} ({100*(med['before']/med['off']-1):+.1f}%) | {med['after']:.5f} ({100*(med['after']/med['off']-1):+.1f}%) |")
lines+=['','Thread CPU excludes native owner CPU; inclusive process totals below include drains. Training medians describe a changing dispatcher.','']
for lane in ['before','after']:
 a={r:q([x['ns'] for x in d['micro'] if x['lane']==lane and x['route']==r]) for r in ['direct','dispatch']}
 lines.append(f"Settled JS microbenchmark {lane}: direct {a['direct']:.2f} ns, dispatch {a['dispatch']:.2f} ns, difference {a['dispatch']-a['direct']:.2f} ns/call.")
lines+=['','| Records | Version | Outer state | Verified | Decision call | Helper dispatches |','| ---: | --- | --- | ---: | ---: | ---: |']
for s in d['snapshots']:
 if s['section']!='steady':continue
 for lane,state in s['states'].items():
  outer=next(v for v in state.values() if any(b['bucket']>0 for b in v['buckets']));helper=next((v for v in state.values() if all(b['bucket']==0 for b in v['buckets'])),{'calls':0})
  b=outer['buckets'][0];lines.append(f"| {s['n']} | {lane} | {b['state']} | {b['verified']} | {b.get('lastDecision',{}).get('atCall','—')} | {helper['calls']} |")
for n in [600,6000,60000]:
 totals={lane:sum(r['inclusiveCpuMs'] for r in d['rows'] if r['n']==n and r['lane']==lane) for lane in ['off','before','after']}
 lines.append(f"\n{n} records inclusive process CPU totals (training + steady): {totals}.")
(p/'nested-tables.md').write_text('\n'.join(lines)+'\n')
m=read('m3');sizes=[1000,5000,15000,200000];modes=['js','native-new','auto-new','native-construction','auto-construction'];lines=[];summary={}
for family in ['new','construction']:
 fs=m['decisions'][family];bs=sorted(next(iter(fs.values()))['buckets'],key=lambda x:x['bucket']);lanes=dict(zip(sizes,[b['state'] for b in bs]));cells={}
 lines+=['',f'{family} revenue:', '', '| Events | JS CPU median / p95 | Fixed native CPU median / p95 | AUTO CPU median / p95 | Lane | AUTO / best |','| ---: | ---: | ---: | ---: | --- | ---: |']
 for n in sizes:
  c={mode:[r['cpuMs']+r['shadowCpuMs'] for r in m['rows'] if r['section']=='bucket' and r['n']==n and r['mode']==mode] for mode in ['js','native-'+family,'auto-'+family]};cells[n]={k:q(v) for k,v in c.items()}
  vs=[f'{q(c[k]):.3f} / {q(c[k],.95):.3f}' for k in c];best=min(cells[n]['js'],cells[n]['native-'+family]);ratio=cells[n]['auto-'+family]/best
  lines.append(f"| {n} | {' | '.join(vs)} | {lanes[n]} | {ratio:.3f} |")
 # C1 stage fraction uses native compute/wall, as D2.
 fractions={n:min(1,max(0,q([r['stages']['compute']/r['ms'] for r in m['stages'] if r['mode']==family and r['n']==n and r['i']>=0]))) for n in sizes}
 totals={};proxy={}
 for mode in ['js','native-'+family,'auto-'+family]:
  rows=[r for r in m['rows'] if r['section']=='mixed' and r['mode']==mode];totals[mode]=sum(r['cpuMs']+r['shadowCpuMs'] for r in rows)
  proxy[mode]=sum(r['cpuMs']*(1.792 if mode=='js' or mode.startswith('auto') and lanes[r['n']]!='native' else 1.792*fractions[r['n']]+2.260*(1-fractions[r['n']]))+r['shadowCpuMs']*2.260 for r in rows)
 best_noise=all(cells[n]['auto-'+family]<=min(cells[n]['js'],cells[n]['native-'+family])*1.1737/.8263 for n in sizes)
 win=proxy['auto-'+family]*1.1737<proxy['js']*.8263
 summary[family]={'lanes':lanes,'cells':cells,'mixedCPU':totals,'mixedProxy':proxy,'withinCalibrationBandEveryBucket':best_noise,'mixedBeatsJSBeyondCalibration':win,'amendedGate':best_noise and win}
 lines+=['',f'Mixed inclusive process CPU totals: {totals}.',f'C1 proxy totals: {proxy}.',f'Amended gate: within calibration noise per bucket {best_noise}; mixed AUTO upper band < JS lower band {win}.']
(p/'m3-tables.md').write_text('\n'.join(lines)+'\n');(p/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary,indent=2))
# Include full-call and background CPU beside the caller-thread diagnostic.
lines=['| Records | Phase | Lane | Inclusive process CPU median / p95 ms |','| ---: | --- | --- | ---: |']
for n in [600,6000,60000]:
 for phase in ['training','steady']:
  for lane in ['off','before','after']:
   a=[r['inclusiveCpuMs'] for r in d['rows'] if r['n']==n and r['section']==phase and r['lane']==lane]
   lines.append(f'| {n} | {phase} | {lane} | {q(a):.5f} / {q(a,.95):.5f} |')
(p/'nested-process-tables.md').write_text('\n'.join(lines)+'\n')
a=read('micro');lines=['| Version | Direct ns | Dispatcher ns | Full wrapper ns | Dispatcher overhead ns | Wrapper overhead ns |','| --- | ---: | ---: | ---: | ---: | ---: |']
for lane in ['before','after']:
 c={r:q([x['ns'] for x in a if x['lane']==lane and x['route']==r]) for r in ['direct','dispatcher','wrapper']}
 lines.append(f"| {lane} | {c['direct']:.2f} | {c['dispatcher']:.2f} | {c['wrapper']:.2f} | {c['dispatcher']-c['direct']:.2f} | {c['wrapper']-c['direct']:.2f} |")
(p/'micro-tables.md').write_text('\n'.join(lines)+'\n')
a=read('revenue');lines=['| Events | Node CPU median / p95 ms | Sidecar | Sync addon | Async addon |','| ---: | ---: | ---: | ---: | ---: |']
for c in a['cases']:
 cells=[]
 for mode in ['node','sidecar','sync','async']:
  rows=[r['cpuMs'] for r in c['rows'] if r['mode']==mode and r['i']>=0];cells.append(f'{q(rows):.3f} / {q(rows,.95):.3f}')
 lines.append(f"| {c['size']} | {' | '.join(cells)} |")
(p/'revenue-tables.md').write_text('\n'.join(lines)+'\n')
