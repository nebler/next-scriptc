import os,time,subprocess,pathlib,signal,json,sys
# Wait for the one owned mode experiment, then run subsequent CPU phases serially.
PID=int(sys.argv[1]) if len(sys.argv)>1 else None
while PID:
 try:os.kill(PID,0)
 except ProcessLookupError:break
 time.sleep(2)
root=pathlib.Path(__file__).resolve().parent
for name in ['candidates.py','profile.py','transport.py','options.py']:
 p=subprocess.Popen(['python3',str(root/name)],start_new_session=True)
 try:
  code=p.wait(timeout=1200)
 except (KeyboardInterrupt,subprocess.TimeoutExpired):
  os.killpg(p.pid,signal.SIGTERM);p.wait();raise
 print('PHASE',name,'EXIT',code,flush=True)
 if code:break
