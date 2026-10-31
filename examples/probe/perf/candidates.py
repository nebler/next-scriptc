import subprocess
subprocess.run(["python3",str(__import__("pathlib").Path(__file__).with_name("recheck.py"))],check=True)
import run as p,json,os
from pathlib import Path
entry=str(p.ROOT/'examples/probe/perf/candidates.ts')
results={}
try:
 for mode in ['release','speed']:
  b=p.run([p.COMP,'build',entry,'-o',str(p.OUT/f'candidates-{mode}'),'--optimization',mode,'--no-keep-llvm'],'candidates-'+mode+'-build')
  print('build',mode,b['code'],b['seconds'],b['stderr'][:700],flush=True)
  if b['code']: continue
  for candidate in ['hash','compression','aggregation','image','geo']:
   env={**p.ENV,'PERF_CANDIDATE':candidate,'PERF_COUNT':'200'}
   row=results.setdefault(candidate,{})
   if 'node' not in row: row['node']=p.run([p.NODE,entry],candidate+'-node',env=env)
   row[mode]=p.run([str(p.OUT/f'candidates-{mode}')],candidate+'-'+mode,env=env)
   row[mode+'Parity']=p.data(row['node'])[0]==p.data(row[mode])[0] if p.data(row[mode]) else False
   print(candidate,mode,'parity',row[mode+'Parity'],[r['ms']/r['count'] for r in p.data(row[mode]) if r['kind']=='time'],flush=True)
   (p.OUT/'candidates.json').write_text(json.dumps(results,indent=2))
finally:p.cleanup()
