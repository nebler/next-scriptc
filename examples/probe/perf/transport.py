import run as p,subprocess,time,os,json,socket,signal,statistics,selectors
PORT=45173
RESULT=json.loads((p.OUT/'http.json').read_text()) if os.environ.get('PERF_TOPOLOGY_ONLY') and (p.OUT/'http.json').exists() else {}
def start(name,port=PORT):
 # Refuse occupied ports; never kill an unrelated server.
 with socket.socket() as sock:
  sock.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
  sock.bind(('127.0.0.1',port))
 log=open(p.OUT/(name+f'-{port}.server.log'),'w')
 t=time.perf_counter();child=subprocess.Popen([str(p.OUT/name)],cwd=p.ROOT,env={**p.ENV,'PORT':str(port)},start_new_session=True,stdout=log,stderr=log);p.ACTIVE.add(child)
 while time.perf_counter()-t<60:
  if child.poll() is not None:raise RuntimeError(name+' exited: '+(p.OUT/(name+f'-{port}.server.log')).read_text())
  with socket.socket() as s:
   s.settimeout(.1)
   if s.connect_ex(('127.0.0.1',port))==0:return child,log,(time.perf_counter()-t)*1000
  time.sleep(.002)
 raise RuntimeError('startup timeout')
def stop(server):
 child,log,*_=server
 try:os.killpg(child.pid,signal.SIGKILL)
 except ProcessLookupError:pass
 child.wait();p.ACTIVE.discard(child);log.close()
def ps(pid):
 out=subprocess.check_output(['ps','-p',str(pid),'-o','rss=,time='],text=True).split();rss=int(out[0])*1024
 parts=out[1].split(':');seconds=float(parts[-1])+60*float(parts[-2]);return {'rss':rss,'cpu':seconds}
def client(label,port=PORT,count=5000,warm=500,reps=3,path='/api/hello'):
 return p.run([p.NODE,str(p.ROOT/'examples/probe/perf/http-client.mjs')],label,180,env={**p.ENV,'PORT':str(port),'PERF_COUNT':str(count),'PERF_WARM':str(warm),'PERF_REPS':str(reps),'PERF_PATH':path})
def checkpoint(): (p.OUT/'http.json').write_text(json.dumps(RESULT,indent=2))
try:
 names=['http-full','http-bare','http-web','http-buffered','http-typed','http-grouped']+['http-single-'+s for s in ['hello','search','markdown','verify','scrypt','primes']]
 for name in names+['components']:
  if os.environ.get('PERF_SKIP_BUILDS'):continue
  entry=str(p.ROOT/'examples/probe/perf'/f'{name}.ts');b=p.run([p.COMP,'build',entry,'-o',str(p.OUT/name),'--no-keep-llvm'],name+'-build',300)
  print('build',name,b['code'],round(b['seconds'],2),b['stderr'][:400] if b['code'] else '',flush=True)
  if b['code']:raise RuntimeError('build failed '+name)
 if not os.environ.get('PERF_TOPOLOGY_ONLY'):
  r=p.run([str(p.OUT/'components')],'components-run');RESULT['components']=r;checkpoint()
 for name in ([] if os.environ.get('PERF_TOPOLOGY_ONLY') else ['http-full','http-bare','http-web','http-buffered','http-typed','http-grouped']):
  server=start(name)
  try:
   time.sleep(.1);idle=ps(server[0].pid)
   client(name+'-warm',count=500,warm=0,reps=1)
   before=ps(server[0].pid);r=client(name+'-load');after=ps(server[0].pid)
   RESULT[name]={'startupMs':server[2],'idle':idle,'before':before,'after':after,'load':r,'cpuMsPerCall':(after['cpu']-before['cpu'])*1000/15500}
   if name=='http-full':
    log=open(p.OUT/'hello-sample-client.log','w');load=subprocess.Popen([p.NODE,str(p.ROOT/'examples/probe/perf/http-client.mjs')],cwd=p.ROOT,env={**p.ENV,'PORT':str(PORT),'PERF_COUNT':'100000','PERF_REPS':'1'},start_new_session=True,stdout=log,stderr=log);p.ACTIVE.add(load)
    try:
     time.sleep(1);r=p.run(['/usr/bin/sample',str(server[0].pid),'5','1','-file',str(p.OUT/'hello-native.sample.txt')],'hello-sample-command',30)
    finally:
     os.killpg(load.pid,signal.SIGKILL);load.wait();p.ACTIVE.discard(load);log.close()
   checkpoint();print(name,RESULT[name]['cpuMsPerCall'],flush=True)
  finally:stop(server)
 # Six-route processes versus grouped: repeated startup, idle and initialized RSS.
 top=[]
 for rep in range(3):
  for mode in (['separate','grouped'] if rep%2==0 else ['grouped','separate']):
   servers=[];t=time.perf_counter()
   try:
    if mode=='grouped':servers.append(start('http-grouped',PORT))
    else:
     from concurrent.futures import ThreadPoolExecutor
     with ThreadPoolExecutor(max_workers=6) as executor:
      futures=[executor.submit(start,'http-single-'+alias,PORT+i) for i,alias in enumerate(['hello','search','markdown','verify','scrypt','primes'])]
      servers=[future.result() for future in futures]
    readyMs=(time.perf_counter()-t)*1000;time.sleep(.15)
    idle=[ps(s[0].pid)['rss'] for s in servers]
    # Warm realistic route state using successful requests; verify token supplied separately below.
    import urllib.request
    token=json.loads(next(x['body'] for x in p.data(json.loads((p.OUT/'login-scrypt-node.json').read_text())) if x['kind']=='parity'))['accessToken']
    paths=['/api/hello','/api/search?q=desk%20lamp&limit=7','/api/posts/reliable-webhooks','/api/verify','/api/login-scrypt','/api/primes?limit=1000000']
    firstAll=time.perf_counter()
    responses=[]
    for i,path in enumerate(paths):
     port=PORT if mode=='grouped' else PORT+i
     data=b'{"email":"ada@example.com","password":"correct horse battery staple"}' if i==4 else None
     req=urllib.request.Request('http://127.0.0.1:'+str(port)+path,data=data,headers={'authorization':'Bearer '+token,'accept-language':'de-DE'})
     with urllib.request.urlopen(req,timeout=60) as res:responses.append({'status':res.status,'body':res.read().decode()})
    firstAllMs=(time.perf_counter()-firstAll)*1000
    time.sleep(.15);initialized=[ps(s[0].pid)['rss'] for s in servers]
    row={'rep':rep,'mode':mode,'allReadyMs':readyMs,'firstAllMs':firstAllMs,'idleRSS':idle,'initializedRSS':initialized,'responses':responses}
    if mode=='grouped':row['helloLoad']=client('grouped-'+str(rep),PORT,count=2000,warm=500)
    else:row['helloLoad']=client('separate-'+str(rep),PORT,count=2000,warm=500)
    if rep==2:
     heavyPort=PORT if mode=='grouped' else PORT+2
     heavyLogPath=p.OUT/(mode+'-isolation-heavy.log');heavyLog=open(heavyLogPath,'w')
     heavy=subprocess.Popen([p.NODE,str(p.ROOT/'examples/probe/perf/http-client.mjs')],cwd=p.ROOT,env={**p.ENV,'PORT':str(heavyPort),'PERF_COUNT':'100000','PERF_REPS':'1','PERF_WARM':'10','PERF_PATH':'/api/posts/reliable-webhooks'},start_new_session=True,stdout=heavyLog,stderr=heavyLog);p.ACTIVE.add(heavy)
     try:
      deadline=time.monotonic()+30
      while 'WARM' not in heavyLogPath.read_text():
       if time.monotonic()>deadline or heavy.poll() is not None:raise RuntimeError('heavy warmup failed')
       time.sleep(.05)
      row['loadedHello']=client(mode+'-isolation-hello',PORT,count=100,warm=20,reps=3)
     finally:
      os.killpg(heavy.pid,signal.SIGKILL);heavy.wait();p.ACTIVE.discard(heavy);heavyLog.close()
    top.append(row);RESULT['topology']=top;checkpoint();print(mode,rep,readyMs,sum(idle)/1048576,sum(initialized)/1048576,flush=True)
   finally:
    for server in servers:stop(server)
finally:p.cleanup()
