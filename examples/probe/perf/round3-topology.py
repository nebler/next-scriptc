#!/usr/bin/env python3
"""16 resident routes: simultaneous RSS and bounded, repeated C=1 HOL probe."""
import round3 as r
import run as p
import http_common as h
import os,json,time,subprocess,signal,socket,urllib.request,hashlib,gzip,concurrent.futures
PORT=46173
DATA=p.OUT/'topology.json'
result=json.loads(DATA.read_text()) if DATA.exists() else {'rows':[],'startLoad':os.getloadavg()}
# Each route gets exactly the same successful input as the in-process matrix.
paths={
 'hello':'/api/hello','search':'/api/search?q=desk%20lamp&limit=7','markdown':'/api/posts/reliable-webhooks',
 'verify':'/api/verify','login-scrypt':'/api/login-scrypt','login':'/api/login',
 'primes':'/api/primes?limit=1000000','report':'/api/report?threads=1','url-echo':'/api/url-echo?q=a%20b',
 'items':'/api/items/42','feed':'/api/feed.xml?limit=20','gzip-export':'/api/export.json.gz?rows=5000',
 'upload-integrity':'/api/uploads/verify','image-histogram':'/api/images/histogram?width=512&height=512',
 'nearby-stores':'/api/stores/nearby?lat=51.5074&lng=-0.1278&radiusKm=1000',
 'revenue':'/api/analytics/revenue?from=2026-01-01&to=2026-01-31'}
payload=bytes((i*31+17)%256 for i in range(1024*1024))
token=json.loads(json.loads((p.OUT/'modes.json').read_text())['workloads']['login-scrypt']['node']['body'])['accessToken']
def save():r.save('topology.json',result)
def fetch(name,port):
 headers={'authorization':'Bearer '+token,'accept-language':'de-DE','x-forwarded-host':'demo.test','x-forwarded-proto':'http'}
 body=None
 if name in ['login','login-scrypt']:body=b'{"email":"ada@example.com","password":"correct horse battery staple"}'
 if name in ['image-histogram','upload-integrity']:body=payload
 if name=='upload-integrity':headers['x-content-sha256']=hashlib.sha256(payload).hexdigest()
 with urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:'+str(port)+paths[name],data=body,headers=headers),timeout=120) as res:
  raw=res.read();status=res.status
  if name=='gzip-export':raw=gzip.decompress(raw)
  if name=='report':raw=json.dumps(json.loads(raw)['result'],sort_keys=True).encode()
  return {'status':status,'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
def load(label,lightPort,heavyPort=None,heavyPath=None):
 heavy=None;log=None
 try:
  if heavyPath:
   logpath=p.OUT/(label+'-heavy.log');log=logpath.open('w')
   heavy=subprocess.Popen([p.NODE,str(p.ROOT/'examples/probe/perf/http-client.mjs')],cwd=p.ROOT,env={**p.ENV,'PORT':str(heavyPort),'PERF_PATH':heavyPath,'PERF_WARM':'10','PERF_COUNT':'100000','PERF_REPS':'1'},start_new_session=True,stdout=log,stderr=log);p.ACTIVE.add(heavy)
   deadline=time.monotonic()+60
   while 'WARM' not in logpath.read_text():
    if time.monotonic()>deadline or heavy.poll() is not None:raise RuntimeError('heavy failed '+logpath.read_text())
    time.sleep(.02)
  out=h.client(label,lightPort,count=300,warm=30,reps=1)
  if out['code']:raise RuntimeError(str(out))
  if heavy and heavy.poll() is not None:raise RuntimeError('heavy ended early')
  return {'windows':p.data(out),'heavyActiveAtEnd':heavy.poll() is None if heavy else None}
 finally:
  if heavy:
   os.killpg(heavy.pid,signal.SIGKILL);heavy.wait();p.ACTIVE.discard(heavy)
  if log:log.close()
def measure(mode,rep):
 servers=[];ports={};started=time.perf_counter()
 groups=([('all',r.RESIDENT)] if mode=='all' else [('worker',r.RESIDENT)] if mode=='worker' else [('light',r.LIGHT)]+[(n,[n]) for n in r.RESIDENT if n not in r.LIGHT] if mode=='light' else [(n,[n]) for n in r.RESIDENT])
 try:
  # Same concurrent-spawn policy as adapter; compiler invocations stay serial.
  with concurrent.futures.ThreadPoolExecutor(max_workers=len(groups)) as pool:
   futures=[pool.submit(h.start,'http-'+name+'-release',PORT+i) for i,(name,_) in enumerate(groups)]
   for i,f in enumerate(futures):
    servers.append(f.result())
    for name in groups[i][1]:ports[name]=PORT+i
  readyMs=(time.perf_counter()-started)*1000
  time.sleep(.15);idle=[h.ps(s[0].pid) for s in servers]
  init=time.perf_counter();responses={n:fetch(n,ports[n]) for n in r.RESIDENT};initMs=(time.perf_counter()-init)*1000
  time.sleep(.15);initialized=[h.ps(s[0].pid) for s in servers]
  row={'rep':rep,'mode':mode,'load':os.getloadavg(),'pids':[s[0].pid for s in servers],'readyMs':readyMs,'initMs':initMs,'idle':idle,'initialized':initialized,'responses':responses,'hol':{}}
  row['hol']['idle']=load(f'{mode}-{rep}-idle',ports['hello'])
  for heavy in ['markdown','gzip-export']:
   row['hol'][heavy]=load(f'{mode}-{rep}-{heavy}',ports['hello'],ports[heavy],paths[heavy])
  result['rows'].append(row);save()
  print(mode,rep,'ready',round(readyMs,2),'RSS',round(sum(s['rss'] for s in idle)/1048576,2),round(sum(s['rss'] for s in initialized)/1048576,2),'HOL',{k:[(x['p50'],x['p99']) for x in v['windows']] for k,v in row['hol'].items()},flush=True)
 finally:
  for server in servers:h.stop(server)
try:
 for rep in range(3):
  for mode in (['separate','light','all','worker'] if rep%2==0 else ['worker','all','light','separate']):
   if not any(x['mode']==mode and x['rep']==rep for x in result['rows']):measure(mode,rep)
 result['endLoad']=os.getloadavg();save()
finally:p.cleanup()
