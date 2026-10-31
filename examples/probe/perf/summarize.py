"""Print compact numeric evidence for the research report."""
import json,pathlib,statistics,collections,re
O=pathlib.Path(__file__).resolve().parents[1]/'.artifacts/perf-levers'
def load(n):return json.loads((O/n).read_text())
def rows(r):return [json.loads(l) for l in r['stdout'].splitlines() if l.startswith('{')]
def metrics(r):
 a=[v for v in rows(r) if v.get('kind')=='time'];return {'median':statistics.median(v['ms']/v['count'] for v in a),'range':[min(v['ms']/v['count'] for v in a),max(v['ms']/v['count'] for v in a)],'rssMiB':statistics.median(v['rss']/1048576 for v in a)} if a else {'error':r.get('stderr')}
if (O/'modes.json').exists():
 d=load('modes.json');print('MODES')
 for n,w in d['workloads'].items():
  print(n,'node',metrics(w['node']))
  for m,v in w['modes'].items():print(m,metrics(v['run']) if v['run'] else None,'sizeMiB',v['bytes']/1048576 if v['bytes'] else None,'buildSec',statistics.median(b['seconds'] for b in v['builds']),'parity',v['parity'])
if (O/'recheck.json').exists():
 print('RECHECK')
 for n,rs in load('recheck.json').items():
  for m in ['node','release','speed']:
   a=[metrics(v['run'])['median'] for v in rs if v['mode']==m and v['run']['code']==0];cpu=[v['run']['cpuSeconds'] for v in rs if v['mode']==m and v['run']['code']==0]
   if a:print(n,m,statistics.median(a),a,'process CPU seconds',cpu)
if (O/'candidates.json').exists():
 print('CANDIDATES')
 for n,w in load('candidates.json').items():print(n,{m:metrics(w[m]) for m in ['node','release','speed'] if m in w})
if (O/'http.json').exists():
 print('HTTP');d=load('http.json')
 for n,w in d.items():
  if n.startswith('http-'):print(n,'cpu ms/call',w['cpuMsPerCall'],'load',[(a['ms']/a['count'],a['p50']) for a in rows(w['load'])], 'rss',w['after']['rss']/1048576)
  elif n=='components':
   by=collections.defaultdict(list)
   for a in rows(w):by[a['kind']].append(a['ms']/a['count']*1000)
   print('components us',{k:statistics.median(v) for k,v in by.items()})
  elif n=='topology':
   for a in w:print(a['mode'],a['rep'],'ready',a['allReadyMs'],'firstAll',a['firstAllMs'],'RSS idle/init',sum(a['idleRSS'])/1048576,sum(a['initializedRSS'])/1048576,'hello',statistics.median(x['ms']/x['count'] for x in rows(a['helloLoad'])))
for name in ['markdown','search']:
 path=O/(name+'-node.cpuprofile')
 if not path.exists():continue
 d=json.loads(path.read_text());nodes={n['id']:n for n in d['nodes']};flat=collections.Counter()
 for sample,dt in zip(d.get('samples',[]),d.get('timeDeltas',[])):
  f=nodes[sample]['callFrame'];flat[(f['functionName'],f['url'],f['lineNumber']+1)]+=dt
 total=sum(flat.values()); print('NODE PROFILE',name,'seconds',total/1e6)
 for f,dt in flat.most_common(20):print(round(dt/total*100,2),*f)
