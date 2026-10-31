#!/usr/bin/env python3
"""Isolated indicative perf research; writes only probe artifacts, owns process groups."""
import os,sys,json,time,subprocess,signal,pathlib,hashlib,statistics,platform,resource
ROOT=pathlib.Path(__file__).resolve().parents[3]
OUT=ROOT/'examples/probe/.artifacts/perf-levers'; OUT.mkdir(parents=True,exist_ok=True)
NODE=os.environ.get('PROBE_NODE','/Users/noah/.local/share/fnm/node-versions/v24.22.0/installation/bin/node')
COMP=str(ROOT/'packages/next-scriptc/node_modules/.bin/scriptc')
ENV={**os.environ,'SCRIPTC_CHECKER_SERVER':'0','SCRIPTC_CACHE_DIR':str(OUT/'cache'),'DEMO_JWT_NOW':'1800000000'}
ENV.pop('NODE_OPTIONS',None)
ACTIVE=set()
def cleanup(*a):
 for p in list(ACTIVE):
  try: os.killpg(p.pid,signal.SIGKILL)
  except ProcessLookupError: pass
 if a: raise SystemExit(130)
signal.signal(signal.SIGINT,cleanup);signal.signal(signal.SIGTERM,cleanup)
def run(cmd,label,timeout=300,env=None):
 cpu0=resource.getrusage(resource.RUSAGE_CHILDREN)
 t=time.perf_counter(); p=subprocess.Popen(cmd,cwd=ROOT,env=env or ENV,start_new_session=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True);ACTIVE.add(p)
 try:
  try: stdout,stderr=p.communicate(timeout=timeout)
  except subprocess.TimeoutExpired:
   os.killpg(p.pid,signal.SIGKILL);stdout,stderr=p.communicate();stderr+='\nTIMEOUT'
  cpu1=resource.getrusage(resource.RUSAGE_CHILDREN)
  result={'cpuSeconds':cpu1.ru_utime+cpu1.ru_stime-cpu0.ru_utime-cpu0.ru_stime,'cmd':list(map(str,cmd)),'seconds':time.perf_counter()-t,'code':p.returncode,'stdout':stdout,'stderr':stderr}
  (OUT/(label+'.json')).write_text(json.dumps(result,indent=2))
  return result
 finally:
  try: os.killpg(p.pid,signal.SIGKILL)
  except ProcessLookupError: pass
  ACTIVE.discard(p)
def write(name,source):
 p=ROOT/'examples/probe/perf'/name;p.write_text(source);return str(p)
WORK={
 'markdown':('posts/[slug]','GET','handler(new Request("http://demo.test/api/posts/reliable-webhooks"), {params:Promise.resolve({slug:"reliable-webhooks"})})',30,80),
 'search':('search','GET','handler(new Request("http://demo.test/api/search?q=desk%20lamp&limit=7"))',150,400),
 'login-scrypt':('login-scrypt','POST','handler(new Request("http://demo.test/api/login-scrypt", {method:"POST",body:JSON.stringify({email:"ada@example.com",password:"correct horse battery staple"})}))',2,5),
 'verify':('verify','GET','handler(new Request("http://demo.test/api/verify", {headers:{authorization:"Bearer " + token}}))',150,1000),
 'primes':('primes','GET','handler(new Request("http://demo.test/api/primes?limit=1000000"))',40,100),
 'report':('report','GET','handler(new Request("http://demo.test/api/report?threads=1"))',1,2),
}
def entries():
 for name,(route,method,call,warm,count) in WORK.items():
  imports=f'import {{ {method} as handler }} from "../../demo/app/api/{route}/route.ts";\n'
  if name=='verify':
   imports+='import { SignJWT } from "jose";\nimport { jwtKey, issuer, audience, now } from "../../demo/app/api/verify/tokens.ts";\n'
   setup='const token = await new SignJWT({role:"editor"}).setProtectedHeader({alg:"HS256",typ:"JWT"}).setSubject("user-42").setIssuer(issuer).setAudience(audience).setIssuedAt(now()).setExpirationTime(now()+3600).sign(jwtKey);'
  else: setup=''
  canonical='JSON.stringify((JSON.parse(body) as {result:unknown}).result)' if name=='report' else 'body'
  write(name+'.ts',imports+f'''
async function main() {{
 {setup}
 const warm = Number(process.env.PERF_WARM ?? "{warm}");
 const count = Number(process.env.PERF_COUNT ?? "{count}");
 const reps = Number(process.env.PERF_REPS ?? "3");
 const first = await {call};
 const body = await first.text();
 const headers: string[] = []; first.headers.forEach((v,k)=>headers.push(k+": "+v)); headers.sort();
 console.log(JSON.stringify({{kind:"parity",status:first.status,headers,body:{canonical}}}));
 for(let i=0;i<warm;i++) await (await {call}).text();
 console.log("WARM");
 for(let r=0;r<reps;r++) {{
  const start = performance.now(); let bytes=0;
  for(let i=0;i<count;i++) {{const response=await {call};if(response.status!==200) throw new Error("unexpected status"); bytes+=(await response.text()).length;}}
  console.log(JSON.stringify({{kind:"time",rep:r,count,ms:performance.now()-start,bytes,rss:process.memoryUsage().rss}}));
 }}
 process.exit(0);
}}
main();
''')
def data(r):
 try:return [json.loads(l) for l in r['stdout'].splitlines() if l.startswith('{')]
 except Exception:return []
def modes(names=None):
 entries();results={'started':time.time(),'host':platform.platform(),'node':run([NODE,'--version'],'node-version')['stdout'],'compiler':run([COMP,'--version'],'compiler-version')['stdout'],'load':os.getloadavg(),'workloads':{}}
 for name in names or WORK:
  entry=str(ROOT/'examples/probe/perf'/f'{name}.ts')
  node=run([NODE,entry],name+'-node',180); d={'node':node,'modes':{}};results['workloads'][name]=d
  for mode in ['release','speed','dev']:
   binary=str(OUT/f'{name}-{mode}'); builds=[]
   for rep in range(int(os.environ.get('PERF_BUILD_REPS','3'))):
    b=run([COMP,'build',entry,'-o',binary,'--optimization',mode,'--no-keep-llvm'],f'{name}-{mode}-build-{rep}',300,env={**ENV,'SCRIPTC_NO_CACHE':'1'})
    builds.append(b)
    if b['code']:break
   native=run([binary],name+'-'+mode+'-run',180) if builds[-1]['code']==0 else None
   parity= bool(native and native['code']==0 and node['code']==0 and data(native) and data(node) and data(native)[0]==data(node)[0])
   d['modes'][mode]={'builds':builds,'bytes':pathlib.Path(binary).stat().st_size if pathlib.Path(binary).exists() else None,'run':native,'parity':parity}
   (OUT/'modes.json').write_text(json.dumps(results,indent=2))
   timings=[x['ms']/x['count'] for x in data(native) if x.get('kind')=='time'] if native else []
   print(name,mode,'build',[round(b['seconds'],2) for b in builds],'ms/call',timings,'parity',parity,flush=True)
 results['finished']=time.time();results['endLoad']=os.getloadavg();(OUT/'modes.json').write_text(json.dumps(results,indent=2))
if __name__=='__main__':
 try:modes(sys.argv[1:] or None)
 finally:cleanup()
