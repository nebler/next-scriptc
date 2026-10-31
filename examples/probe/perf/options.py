import subprocess,pathlib
subprocess.run(["python3",str(pathlib.Path(__file__).with_name("typed.py"))],check=True)
import run as p,json,subprocess,time,statistics
from pathlib import Path
results={'flags':{},'strip':{}}
try:
 entry=str(p.ROOT/'examples/probe/entries/print.ts')
 tiny=p.write('tiny.ts','console.log("ready");\n')
 flags=[['--target-cpu','native'],['--target-cpu','x86-64-v3'],['--cpu-dispatch'],['--profile-generate',str(p.OUT/'profiles/%p.profraw')],['--static'],['--large-pages'],['--exceptions','rare'],['--lto'],['--allocator','mimalloc'],['--inline']]
 for i,flag in enumerate(flags):
  r=p.run([p.COMP,'build',tiny,'-o',str(p.OUT/'flag-tiny'),'--no-keep-llvm',*flag],'option-'+str(i),60)
  results['flags'][' '.join(flag)]=r
  print(flag,r['code'],r['stderr'].splitlines()[:1],flush=True)
  (p.OUT/'options.json').write_text(json.dumps(results,indent=2))
 for name in ['markdown','http-full']:
  entry=str(p.ROOT/'examples/probe/perf'/f'{name}.ts')
  b=p.run([p.COMP,'build',entry,'-o',str(p.OUT/(name+'-stripped')),'--strip','--no-keep-llvm'],name+'-strip-build',300)
  row={'build':b};results['strip'][name]=row
  if b['code']==0:
   row['bytes']= (p.OUT/(name+'-stripped')).stat().st_size
   if name=='markdown':row['run']=p.run([str(p.OUT/(name+'-stripped'))],name+'-strip-run',180)
  (p.OUT/'options.json').write_text(json.dumps(results,indent=2))
 # Tier is a diagnostic policy, not a way to remove existing untyped JS operations.
 entry=str(p.ROOT/'examples/probe/perf/search.ts')
 r=p.run([p.COMP,'build',entry,'-o',str(p.OUT/'search-static-only'),'--tier','static-only','--no-keep-llvm'],'tier-build',300)
 results['tier']={'build':r}
 if r['code']==0:results['tier']['run']=p.run([str(p.OUT/'search-static-only')],'tier-run',180)
 (p.OUT/'options.json').write_text(json.dumps(results,indent=2))
 # Startup comparison, process cold with warm filesystem caches. Hello body first byte.
 # Import our helper by filename avoiding Python stdlib module ambiguity.
 import importlib.util
 spec=importlib.util.spec_from_file_location('perfhttp',p.ROOT/'examples/probe/perf/transport.py')
 # Do not import http.py: it executes the full experiment. Use minimal local launcher.
 import socket,os,signal,urllib.request
 rows=[]
 for rep in range(5):
  for name in (['http-full','http-full-stripped'] if rep%2==0 else ['http-full-stripped','http-full']):
   port=45273
   with socket.socket() as s:
    s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);s.bind(('127.0.0.1',port))
   log=open(p.OUT/f'{name}-startup-{rep}.log','w');t=time.perf_counter()
   child=subprocess.Popen([str(p.OUT/name)],cwd=p.ROOT,env={**p.ENV,'PORT':str(port)},start_new_session=True,stdout=log,stderr=log);p.ACTIVE.add(child)
   try:
    while time.perf_counter()-t<30:
     if child.poll() is not None:raise RuntimeError('server exited')
     try:
      with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/hello',timeout=.5) as response:
       body=response.read().decode();break
     except OSError:time.sleep(.002)
    else:raise RuntimeError('cold timeout')
    rows.append({'rep':rep,'name':name,'firstResponseMs':(time.perf_counter()-t)*1000,'body':body})
   finally:
    os.killpg(child.pid,signal.SIGKILL);child.wait();p.ACTIVE.discard(child);log.close()
 results['stripStartup']=rows;(p.OUT/'options.json').write_text(json.dumps(results,indent=2))
finally:p.cleanup()
