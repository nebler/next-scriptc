#!/usr/bin/env python3
"""Scan partition-parent files in place with a scoped CLI preload (DEV only)."""
import pathlib,json,gzip,subprocess,os,signal,time,sys,collections
ROOT=pathlib.Path.cwd();BASE=ROOT/'research/eval-corpus/dev-census'; TMP=pathlib.Path('/tmp/nsc-dev-census');OUT=BASE/'supplements';OUT.mkdir(exist_ok=True)
allow={r['repository']:r for r in json.loads((ROOT/'research/eval-corpus/manifest.json').read_text())['repositories'] if r['split']=='DEV'}
def read(p):return json.loads(gzip.decompress(p.read_bytes()) if p.suffix=='.gz' else p.read_bytes())
def save(slug,d):
 b=json.dumps(d,indent=2).encode();p=OUT/(slug+'.json.gz');q=p.with_suffix('.tmp');q.write_bytes(gzip.compress(b,compresslevel=9,mtime=0));q.replace(p)
def run(cmd,env):
 t=time.time();p=subprocess.Popen(cmd,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,start_new_session=True,env=env)
 try:out=p.communicate(timeout=900)[0];code=p.returncode
 except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);out=p.communicate()[0];code='timeout'
 return {'command':cmd,'exit':code,'seconds':round(time.time()-t,2),'output':out.decode(errors='replace')}
for slug in sys.argv[1:]:
 f=BASE/(slug+'.json.gz');f=f if f.exists() else f.with_suffix('')
 try:d=read(f)
 except Exception as e:print(slug,'cannot read checkpoint',str(e),flush=True);continue
 assert d['repository'] in allow and d['sha']==allow[d['repository']]['sha']
 p=TMP/slug
 if not p.exists():print(slug,'checkout already cleaned',flush=True);continue
 result={'repository':d['repository'],'sha':d['sha'],'kind':'partition-parent supplemental scans','scopes':[],'scans':[],'excluded':[],'missing':[]}
 groups=collections.defaultdict(list)
 for rel in d.get('scopePartitionOmissions',[]):
  src=p/rel
  if any(t in src.parts for t in ['scripts','test','tests','__tests__','fixtures','seeds','vendor','demo-datasource']) or any(t in src.name for t in ['.test.','.spec.','.bench.','.stories.']):result['excluded'].append(rel);continue
  if not src.exists():result['missing'].append(rel);continue
  groups[src.parent].append(src.name)
 for parent,files in groups.items():
  scanroot=p
  for candidate in [parent,*parent.parents]:
   if candidate==p.parent:break
   if (candidate/'tsconfig.json').exists():scanroot=candidate;break
  for i in range(0,len(files),12):
   batch=files[i:i+12];scope=str(parent.relative_to(p));rel=str(parent.relative_to(scanroot));target=TMP/(slug+'-supplement-report.json')
   env={**os.environ,'DEV_CENSUS_SCOPE_DIR':str(parent),'DEV_CENSUS_ONLY_FILES':json.dumps(batch)}
   print(slug,scope,i,'/',len(files),flush=True)
   preload=['node','--max-old-space-size=6144','--import',str(BASE/'file-scope.mjs')]
   item={'scope':scope,'scanRoot':str(scanroot.relative_to(p)),'fileBatch':batch,'reportProcess':run(preload+[str(ROOT/'packages/scriptc-promote/src/cli.mjs'),'report',str(scanroot),'--source-dir',rel,'--json',str(target)],env)}
   if target.exists():item['report']=read(target);target.unlink()
   item['ev1Process']=run(preload+[str(ROOT/'research/eval-corpus/census.mjs'),str(scanroot),rel],env)
   try:item['ev1']=json.loads(item['ev1Process']['output']);item['ev1Process'].pop('output')
   except (ValueError,KeyError):pass
   result['scans'].append(item);result['scopes'].append(scope);save(slug,result)
 save(slug,result)
 print(slug,'supplements complete',flush=True)
