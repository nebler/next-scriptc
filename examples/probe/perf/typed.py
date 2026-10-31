import run as p,json,time,statistics
from http_common import start,stop,ps,client
results=[]
try:
 b=p.run([p.COMP,'build',str(p.ROOT/'examples/probe/perf/http-typed.ts'),'-o',str(p.OUT/'http-typed'),'--no-keep-llvm'],'http-typed-build')
 print('typed build',b['code'],b['stderr'][:500],flush=True)
 if b['code']:raise RuntimeError('typed shim build failed')
 for rep in range(3):
  for name in (['http-full','http-typed'] if rep%2==0 else ['http-typed','http-full']):
   server=start(name)
   try:
    client(name+'-typed-warm-'+str(rep),count=500,warm=0,reps=1)
    before=ps(server[0].pid);r=client(name+'-typed-load-'+str(rep));after=ps(server[0].pid)
    row={'name':name,'rep':rep,'load':r,'before':before,'after':after,'cpuMsPerCall':(after['cpu']-before['cpu'])*1000/15500}
    results.append(row);(p.OUT/'typed.json').write_text(json.dumps(results,indent=2));print('typed compare',name,rep,row['cpuMsPerCall'],flush=True)
   finally:stop(server)
finally:p.cleanup()
