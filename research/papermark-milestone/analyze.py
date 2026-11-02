import json, pathlib, math, random, gzip
base=pathlib.Path(__file__).parent
p=base/'raw.json'; r=json.loads(p.read_text() if p.exists() else gzip.decompress((base/'raw.json.gz').read_bytes()))
assert 'error' not in r
random.seed(3701)
def q(xs,p=.5):
 a=sorted(xs);return a[max(0,math.ceil(len(a)*p)-1)]
def cpu(x):return x['cpuMs']+x['drainCpuMs']
def pred(x):return 1.792*x['cpuMs']+2.260*x['drainCpuMs']
def summary(a):
 blocks=[a[i:i+5] for i in range(0,len(a),5)]
 boot=[q([cpu(x) for b in random.choices(blocks,k=len(blocks)) for x in b]) for _ in range(2000)]
 return {'n':len(a),'cpuMedian':q([cpu(x) for x in a]),'cpuP95':q([cpu(x) for x in a],.95),'cpuMedianCI95':[q(boot,.025),q(boot,.975)],'callerCpuMedian':q([x['cpuMs'] for x in a]),'threadMedian':q([x['threadMs']+x['drainThreadMs'] for x in a]),'wallMedian':q([x['wallMs'] for x in a]),'wallP95':q([x['wallMs'] for x in a],.95),'inclusiveWallMedian':q([x['wallMs']+x['drainWallMs'] for x in a]),'distributionSharePct':100*sum(x['distribution']['cpuMs'] for x in a)/sum(cpu(x) for x in a),'cpuTotal':sum(cpu(x) for x in a),'drainCpuTotal':sum(x['drainCpuMs'] for x in a),'proxyMedian':q([pred(x) for x in a]),'proxyTotal':sum(pred(x) for x in a)}
s={}
for section in ['training','settled','mixed']:
 s[section]={}
 for n in ([600,6000,60000] if section!='mixed' else ['mix']):
  s[section][n]={lane:summary([x for x in r['rows'] if x['section']==section and (n=='mix' or x['n']==n) and x['lane']==lane]) for lane in ['off','auto']}
  pair=s[section][n];pair['savingTotalPct']=100*(1-pair['auto']['cpuTotal']/pair['off']['cpuTotal']);pair['proxySavingPct']=100*(1-pair['auto']['proxyTotal']/pair['off']['proxyTotal']);ratio=pair['auto']['proxyTotal']/pair['off']['proxyTotal'];pair['proxySavingErrorBand']=[100*(1-ratio*1.1737/.8263),100*(1-ratio*.8263/1.1737)]
# Paired 10-request blocks retain each mixed 70/20/10 composition and arm pairing.
a=[x for x in r['rows'] if x['section']=='mixed' and x['lane']=='off'];b=[x for x in r['rows'] if x['section']=='mixed' and x['lane']=='auto'];boots=[]
for _ in range(2000):
 idx=[j for k in random.choices(range(60),k=60) for j in range(k*10,k*10+10)]
 boots.append(100*(1-sum(cpu(b[i]) for i in idx)/sum(cpu(a[i]) for i in idx)))
s['mixed']['mix']['savingTotalCI95']=[q(boots,.025),q(boots,.975)]
s['responseChecks']=len(r['rows']);s['responseHashes']=r['expected'];s['transitions']=[json.loads(t['s'].removeprefix('next-scriptc ')) for t in r['transitions'] if '"state"' in t['s']];s['final']=r['final']
(base/'summary.json').write_text(json.dumps(s,indent=2)+'\n')
print(json.dumps(s['mixed'],indent=2));print('transitions',s['transitions'])
