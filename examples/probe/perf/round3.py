#!/usr/bin/env python3
"""Round 3: reuse round-1 process ownership, entries and HTTP shim; serial builds."""
import run as p
import os,sys,json,time,pathlib,statistics,hashlib,platform,subprocess
BASE=p.OUT; p.OUT=BASE/'round3';p.OUT.mkdir(parents=True,exist_ok=True)
GEN=p.ROOT/'examples/probe/perf/round3-generated';GEN.mkdir(exist_ok=True)
ENV={**p.ENV,'SCRIPTC_CACHE_DIR':str(p.OUT/'cache')}
p.ENV=ENV
# The original six fixtures are unchanged. Include both prerendered/Node controls.
WORK={**p.WORK,
 'hello':('hello','GET','handler(new Request("http://demo.test/api/hello",{headers:{"accept-language":"de-DE"}}))',1000,10000),
 'url-echo':('url-echo','GET','handler(new Request("http://demo.test/api/url-echo?q=a%20b",{headers:{host:"demo.test"}}))',1000,10000),
 'items':('items/[id]','GET','handler(new Request("http://demo.test/api/items/42"),{params:Promise.resolve({id:"42"})})',1000,10000),
 'items-new':('items/new','GET','handler()',1000,10000),
 'static-fixture':('static-fixture','GET','handler()',1000,10000),
 'login':('login','POST','handler(new Request("http://demo.test/api/login",{method:"POST",body:JSON.stringify({email:"ada@example.com",password:"correct horse battery staple"})}))',1,3),
 'feed':('feed.xml','GET','handler(new Request("http://demo.test/api/feed.xml?limit=20"))',10,30),
 'gzip-export':('export.json.gz','GET','handler(new Request("http://demo.test/api/export.json.gz?rows=5000"))',30,100),
 'upload-integrity':('uploads/verify','POST','handler(new Request("http://demo.test/api/uploads/verify",{method:"POST",body:payload,headers:{"x-content-sha256":digest}}))',30,100),
 'image-histogram':('images/histogram','POST','handler(new Request("http://demo.test/api/images/histogram?width=512&height=512",{method:"POST",body:payload}))',30,100),
 'nearby-stores':('stores/nearby','GET','handler(new Request("http://demo.test/api/stores/nearby?lat=51.5074&lng=-0.1278&radiusKm=1000"))',50,150),
 'revenue':('analytics/revenue','GET','handler(new Request("http://demo.test/api/analytics/revenue?from=2026-01-01&to=2026-01-31"))',50,150)}
LIGHT=['hello','verify','url-echo','items','nearby-stores','revenue','gzip-export','upload-integrity']
RESIDENT=[n for n in WORK if n not in ['items-new','static-fixture']]
METHODS=['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS']
def entries():
 oldwrite,oldwork=p.write,p.WORK
 def write(name,source):
  source=source.replace('../../demo/','../../../demo/')
  if name.startswith(('upload-integrity.','image-histogram.')):
   setup='const payload=new Uint8Array(1024*1024);for(let i=0;i<payload.length;i++)payload[i]=(i*31+17)%256;'
   if name.startswith('upload-integrity.'):
    source='import {createHash} from "node:crypto";\n'+source
    setup+='const digest=createHash("sha256").update(payload).digest("hex");'
   source=source.replace('async function main() {','async function main() {\n'+setup)
  if name=='gzip-export.ts':
   source='import {gunzipSync} from "node:zlib";\nimport {createHash} from "node:crypto";\n'+source
   source=source.replace('body:body','body:createHash("sha256").update(body).digest("hex")')
   source=source.replace('const body = await first.text();','const body = gunzipSync(new Uint8Array(await first.arrayBuffer())).toString("utf8");')
   source=source.replace('.text()', '.arrayBuffer()').replace('bytes+=(await response.arrayBuffer()).length','bytes+=(await response.arrayBuffer()).byteLength')
  (GEN/name).write_text(source)
  return str(GEN/name)
 p.write,p.WORK=write,WORK
 try:p.entries()
 finally:p.write,p.WORK=oldwrite,oldwork
 for label,names in [('all',RESIDENT),('light',LIGHT)]+[(n,[n]) for n in RESIDENT]:
  imports='import {serveMany} from "../shim/grouped.ts";\n';items=[]
  for i,n in enumerate(names):
   route,method,*_=WORK[n];alias='r'+str(i)
   imports+=f'import {{{method} as {alias}}} from "../../../demo/app/api/{route}/route.ts";\n'
   fields=','.join(f'{m}:{alias if m==method else "undefined"}' for m in METHODS)
   items.append('{module:{'+fields+'},pattern:'+json.dumps('/api/'+route)+'}')
  (GEN/f'http-{label}.ts').write_text(imports+'serveMany(['+','.join(items)+']);\n')
 # Only Markdown moves to a worker; all other resident routes remain present.
 source=(GEN/'http-all.ts').read_text().replace('from "../../../demo/app/api/posts/[slug]/route.ts"','from "../round3-worker-proxy.ts"')
 (GEN/'http-worker.ts').write_text(source)
def build(name,entry,mode,rep,uncached=True):
 binary=p.OUT/f'{name}-{mode}'
 r=p.run([p.COMP,'build',str(entry),'-o',str(binary),'--optimization',mode,'--strip','--no-keep-llvm'],f'build-{name}-{mode}-{rep}',600,{**ENV,**({'SCRIPTC_NO_CACHE':'1'} if uncached else {})})
 print('build',name,mode,rep,round(r['seconds'],2),r['code'],flush=True)
 if r['code']:raise RuntimeError(r['stderr'][-6000:])
 return {k:r[k] for k in ['seconds','cpuSeconds','code','cmd']}|{'bytes':binary.stat().st_size,'sha256':hashlib.sha256(binary.read_bytes()).hexdigest()}
def save(name,data): (p.OUT/name).write_text(json.dumps(data,indent=2))
def modes():
 dest=p.OUT/'modes.json';data=json.loads(dest.read_text()) if dest.exists() else {'host':platform.platform(),'startLoad':os.getloadavg(),'base':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'workloads':{}}
 for name in WORK:
  row=data['workloads'].setdefault(name,{'builds':{},'runs':[]})
  for rep in range(3):
   for mode in (['release','speed'] if rep%2==0 else ['speed','release']):
    key=f'{mode}-{rep}'
    if key not in row['builds']:
     row['builds'][key]=build(name,GEN/f'{name}.ts',mode,rep);save('modes.json',data)
  for rep in range(4):
   for mode in (['release','speed'] if rep%2==0 else ['speed','release']):
    if any(r['rep']==rep and r['mode']==mode for r in row['runs']):continue
    r=p.run([str(p.OUT/f'{name}-{mode}')],f'run-{name}-{mode}-{rep}',300,{**ENV,'PERF_REPS':'1'})
    parsed=p.data(r)
    if r['code'] or len(parsed)<2:raise RuntimeError(str(r))
    parity=parsed[0];times=parsed[1:]
    row['runs'].append({'rep':rep,'mode':mode,'load':os.getloadavg(),'parity':parity,'times':times})
    save('modes.json',data);print('time',name,mode,rep,[round(x['ms']/x['count'],6) for x in times],flush=True)
  if 'node' not in row:
   r=p.run([p.NODE,str(GEN/f'{name}.ts')],f'node-{name}',300,{**ENV,'PERF_WARM':'0','PERF_COUNT':'1','PERF_REPS':'1'})
   if r['code'] or not p.data(r):raise RuntimeError('Node parity failed for '+name+'; inspect node-'+name+'.json')
   row['node']=p.data(r)[0]
  row['parity']=all(r['parity']==row['node'] for r in row['runs']);save('modes.json',data)
 data['endLoad']=os.getloadavg();save('modes.json',data)
if __name__=='__main__':
 try:
  entries()
  if sys.argv[1:] == ['generate']:pass
  elif sys.argv[1:] == ['http-build']:
   for name in ['all','light','worker']+RESIDENT:build('http-'+name,GEN/f'http-{name}.ts','release',0,False)
  else:modes()
 finally:p.cleanup()
