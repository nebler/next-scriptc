import run as p,subprocess,json,time,os,signal,selectors
try:
 for name in ['markdown','search']:
  entry=str(p.ROOT/'examples/probe/perf'/f'{name}.ts')
  coverage=p.run([p.COMP,'coverage',entry,'--explain-dynamic'],name+'-coverage',120)
  print(name,'coverage',coverage['code'],flush=True)
  env={**p.ENV,'PERF_COUNT':'10000000','PERF_REPS':'1','PERF_WARM':'100'}
  out=open(p.OUT/(name+'-sample-program.log'),'w')
  child=subprocess.Popen([str(p.OUT/(name+'-release'))],cwd=p.ROOT,env=env,start_new_session=True,stdout=subprocess.PIPE,stderr=out,text=True);p.ACTIVE.add(child)
  try:
   sel=selectors.DefaultSelector();sel.register(child.stdout,selectors.EVENT_READ)
   deadline=time.monotonic()+60;warm=False
   while time.monotonic()<deadline and child.poll() is None:
    if sel.select(1):
     line=child.stdout.readline();out.write(line);out.flush()
     if line.strip()=='WARM':warm=True;break
   if warm:
    result=p.run(['/usr/bin/sample',str(child.pid),'5','1','-file',str(p.OUT/(name+'-native.sample.txt'))],name+'-sample-command',30)
    print(name,'sample',result['code'],flush=True)
   else:print(name,'sample warm timeout',flush=True)
  finally:
   os.killpg(child.pid,signal.SIGKILL);child.wait();p.ACTIVE.discard(child);out.close()
  env={**p.ENV,'PERF_COUNT': '40000' if name=='markdown' else '20000','PERF_REPS':'1','PERF_WARM':'200'}
  r=p.run([p.NODE,'--cpu-prof','--cpu-prof-dir='+str(p.OUT),'--cpu-prof-name='+name+'-node.cpuprofile',entry],name+'-cpu-prof',120,env)
  print(name,'node profile',r['code'],r['seconds'],flush=True)
finally:p.cleanup()
