# Host handshake records ps and load immediately before every timing window.
import subprocess,pathlib,time,json
repo=pathlib.Path.cwd(); dest=repo/'research/papermark-milestone'
name='nsc-standin-pm1'
args=['docker','run','--name',name,'--platform','linux/arm64','--cpus=1','--cpuset-cpus=11','--memory=2g','--memory-swap=2g','--network=none']
for p in [str(repo),'/Users/noah/code/next-scriptc','/Users/noah/code/papermark-gate','/Users/noah/code/papermark-gate-slice']:
 args+=['--mount',f'type=bind,source={p},target={p}']
args+=['--workdir',str(repo),'nsc-standin:node24','node','research/papermark-milestone/measure.mjs']
checks=[]
if subprocess.run(['docker','inspect',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:
 raise RuntimeError('Refusing to reuse an existing '+name+' container')
try:
 with (dest/'run.log').open('w') as log:
  proc=subprocess.Popen(args,stdout=log,stderr=subprocess.STDOUT)
  while proc.poll() is None:
   req=dest/'window-request'
   if req.exists():
    ps=subprocess.check_output(['ps','-A','-o','pid=,pcpu=,comm='],text=True)
    check={'window':req.read_text(),'at':time.time(),'uptime':subprocess.check_output(['uptime'],text=True),'ps':ps}
    checks.append(check);(dest/'host-check.json').write_text(json.dumps(check));(dest/'host-load.json').write_text(json.dumps(checks));req.unlink()
   time.sleep(.25)
  if proc.returncode:raise RuntimeError('measurement failed; see run.log')
finally:
 inspect=subprocess.run(['docker','inspect',name],capture_output=True,text=True)
 (dest/'container.json').write_text(inspect.stdout)
 subprocess.run(['docker','rm','-f',name],check=True)
 for p in ['host-check.json','window-request']:(dest/p).unlink(missing_ok=True)
