import run as p,subprocess,time,os,json,socket,signal,statistics,selectors
PORT=45173
RESULT={}
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
