"""Regenerate the tables and sample-bootstrap fit without third-party dependencies."""
import json, math, random, statistics as st
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]; RAW=ROOT/'research/standin/raw'
windows=[json.loads((RAW/f'window{i}-revenue.json').read_text()) for i in (5,6)]
modes=['node','sidecar','sync','async']; cells=[]
def med(a): return sorted(a)[math.ceil(len(a)*.5)-1]
def pct(a,p): return sorted(a)[math.ceil(len(a)*p)-1]
def solve(x,y):
 n=len(x[0]); a=[[sum(r[i]*r[j] for r in x) for j in range(n)]+[sum(r[i]*v for r,v in zip(x,y))] for i in range(n)]
 for i in range(n):
  k=max(range(i,n),key=lambda k:abs(a[k][i]));a[i],a[k]=a[k],a[i]
  d=a[i][i];a[i]=[v/d for v in a[i]]
  for j in range(n):
   if j!=i:
    d=a[j][i];a[j]=[v-d*w for v,w in zip(a[j],a[i])]
 return [r[-1] for r in a]
def design(c,total,bound,kind):
 b=0 if c['mode']=='node' else bound; compute=max(0,total-b)
 return [compute,b] if kind=='two' else [compute if c['mode']=='node' else 0,compute if c['mode']!='node' else 0,b]
def fit(cs,metric='ms',kind='two',resample=False,relative=True):
 x=[];y=[]
 for c in cs:
  def value(a):return med(random.choices(a,k=len(a))) if resample else med(a)
  t=value(c[metric]); b=value(c['b'+metric]); h=value(c['host'])
  row=design(c,t,b,kind); scale=h if relative else 1
  x.append([v/scale for v in row]);y.append(h/scale)
 return solve(x,y)
for size in [1000,5000,15000,200000]:
 host=json.loads((ROOT/f'research/napi-vercel/raw/1-bench-{size}.json').read_text())['result']
 for mode in modes:
  c={'size':size,'mode':mode}
  for metric in ['ms','cpuMs']:
   c[metric]=[r[metric] for w in windows for a in w['cases'] if a['size']==size for r in a['rows'] if r['i']>=0 and r['mode']==mode]
   c['b'+metric]=[r[metric] for w in windows for a in w['cases'] if a['size']==size for r in a['boundary'] if r['i']>=0 and r['mode']==mode]
  c['host']=[r['ms'] for r in host['rows'] if r['i']>=0 and r['mode']==mode]
  assert len(c['ms'])==120 and len(c['host'])==60
  for w in windows:
   for a in w['cases']:
    if a['size']==size:assert a['expectedSha256']==host['expectedSha256']
  cells.append(c)
random.seed(20261101);models={}
for metric in ['ms','cpuMs']:
 for kind in ['two','three']:
  factors=fit(cells,metric,kind); boot=[fit(cells,metric,kind,True) for _ in range(2000)]
  errors=[];loo=[]
  for c in cells:
   row=design(c,med(c[metric]),med(c['b'+metric]),kind);h=med(c['host']);pred=sum(a*b for a,b in zip(row,factors))
   errors.append((pred/h-1)*100)
   f=fit([a for a in cells if a['size']!=c['size']],metric,kind);loo.append((sum(a*b for a,b in zip(row,f))/h-1)*100)
  models[metric+'-'+kind]={'factors':factors,'ci95':[[pct([b[i] for b in boot],.025),pct([b[i] for b in boot],.975)] for i in range(len(factors))],'mape':st.mean(map(abs,errors)),'maxError':max(map(abs,errors)),'looMape':st.mean(map(abs,loo)),'errors':errors,'looErrors':loo}
summary={'nLocalPerCell':120,'nHostedPerCell':60,'bootstrap':2000,'seed':20261101,'models':models,'cells':[]}
lines=['| Events | Mode | Local wall median / p95 | Local CPU median / p95 | Boundary wall / CPU median | Hosted wall median | Predicted wall | Error |','| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |']
for i,c in enumerate(cells):
 b=0 if c['mode']=='node' else med(c['bms']);bc=0 if c['mode']=='node' else med(c['bcpuMs']);t=med(c['ms']);cpu=med(c['cpuMs']);h=med(c['host']);f=models['ms-two']['factors'];pred=(t-b)*f[0]+b*f[1]
 summary['cells'].append({'size':c['size'],'mode':c['mode'],'wallMedian':t,'wallP95':pct(c['ms'],.95),'cpuMedian':cpu,'cpuP95':pct(c['cpuMs'],.95),'boundaryWall':b,'boundaryCpu':bc,'computeWall':t-b,'computeCpu':cpu-bc,'hostMedian':h,'predicted':pred,'errorPct':(pred/h-1)*100})
 lines.append(f"| {c['size']} | {c['mode']} | {t:.3f} / {pct(c['ms'],.95):.3f} | {cpu:.3f} / {pct(c['cpuMs'],.95):.3f} | {b:.3f} / {bc:.3f} | {h:.3f} | {pred:.3f} | {(pred/h-1)*100:+.1f}% |")
(RAW/'analysis.json').write_text(json.dumps(summary,indent=2)+'\n');(RAW/'table.md').write_text('\n'.join(lines)+'\n')
print(json.dumps(models,indent=2))
# Sensitivity checks expose deployment and local-window effects beyond sample CIs.
sensitivity={}
for wi,w in zip([5,6],windows):
 cs=[]
 for c in cells:
  d=dict(c);a=next(a for a in w['cases'] if a['size']==c['size'])
  for metric in ['ms','cpuMs']:
   d[metric]=[r[metric] for r in a['rows'] if r['i']>=0 and r['mode']==c['mode']]
   d['b'+metric]=[r[metric] for r in a['boundary'] if r['i']>=0 and r['mode']==c['mode']]
  cs.append(d)
 sensitivity[f'window{wi}']=fit(cs)
cs=[]
for c in cells:
 d=dict(c);h=json.loads((ROOT/f"research/napi-vercel/raw/attempt-2/1-bench-{c['size']}.json").read_text())['result']
 d['host']=[r['ms'] for r in h['rows'] if r['i']>=0 and r['mode']==c['mode']];cs.append(d)
sensitivity['earlierHostedWindow']=fit(cs)
sensitivity['unweightedAbsoluteLeastSquares']=fit(cells,relative=False)
summary['sensitivity']=sensitivity
summary['mixed']={}
for mode in modes:
 cc=[(next(c for c in summary['cells'] if c['size']==size and c['mode']==mode),weight) for size,weight in [(1000,.7),(5000,.2),(200000,.1)]]
 f=models['cpuMs-two']['factors']
 summary['mixed'][mode]={'localCpuMs':sum(c['cpuMedian']*w for c,w in cc),'localWallMs':sum(c['wallMedian']*w for c,w in cc),'cpuToHostedWallProxyMs':sum((c['computeCpu']*f[0]+c['boundaryCpu']*f[1])*w for c,w in cc),'hostedWallMs':sum(c['hostMedian']*w for c,w in cc)}
(RAW/'analysis.json').write_text(json.dumps(summary,indent=2)+'\n')
print('sensitivity',sensitivity,'mixed',summary['mixed'])
