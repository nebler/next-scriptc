import json,math,gzip,pathlib
p=pathlib.Path(__file__).parent
def read(name):
 f=p/(name+'.json');return json.loads(f.read_text() if f.exists() else gzip.decompress((p/(name+'.json.gz')).read_bytes()))
def q(a,v=.5):
 a=sorted(a);return a[max(0,math.ceil(len(a)*v)-1)]
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
(p/'m3-tables.md').write_text('\n'.join(lines)+'\n');(p/'revenue-summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary,indent=2))
