#!/usr/bin/env python3
import pathlib,os,json,gzip,subprocess,time,collections,sys,hashlib
R=pathlib.Path.cwd();slug=sys.argv[1];O=R/'research/eval-corpus/dev-measure/results';P=pathlib.Path('/tmp/m1-dev-clones')/slug

def read(p):return json.loads(gzip.decompress(p.read_bytes()) if p.suffix=='.gz' else p.read_bytes())
b=R/'research/eval-corpus/dev-census-b1'/f'{slug}.json';b=b if b.exists() else b.with_suffix('.json.gz');base=read(b)
d=read(O/f'{slug}.json');groups=collections.defaultdict(set);cohort=[]
for s in base.get('scans',[]):
 for f in s.get('report',{}).get('files',[]):
  for fn in f['functions']:
   if fn['status']=='accepted':
    root=s['scanRoot'];groups[root].add(f['file']);cohort.append({'id':str(pathlib.Path(root)/fn['id']),'scanRoot':root,'function':fn})
d['cohort']=cohort;d['scans']=[]
for root,files in groups.items():
 # One source file per process isolates compiler refusals and measurement failures.
 for file in sorted(files):
  scanroot=P/root;target=P.parent/f'{slug}-measure.json'
  env={**os.environ,'DEV_CENSUS_SOURCE_ROOT':str(scanroot),'DEV_CENSUS_SOURCE_FILES':json.dumps([str(scanroot/file)]),'TMPDIR':'/tmp','M1_RESEARCH':'1','NODE_OPTIONS':'--import='+str(R/'research/eval-corpus/dev-measure/hook.mjs')}
  cmd=['node','--max-old-space-size=6144']
  if slug in ['n8n','unleash']:
   env['DEV_CENSUS_TYPESCRIPT_HOST_ROOT']=str(R/'packages/scriptc-promote');cmd+=['--import',str(R/'research/eval-corpus/dev-census/typescript-host.mjs')]
  names=[c['function']['name'] for c in cohort if c['scanRoot']==root and c['function']['file']==file]
  inp=P.parent/(slug+'-inputs.json')
  subprocess.run(['node',str(R/'research/eval-corpus/dev-measure/input-gen.mjs'),str(P),file,json.dumps(names),str(inp)],check=True)
  env['M1_INPUT_META']=str(inp)+'.meta'
  cmd+=['--import',str(R/'research/eval-corpus/dev-census/file-scope.mjs'),str(R/'packages/scriptc-promote/src/cli.mjs'),'report',str(scanroot),'--measure','--inputs',str(inp),'--json',str(target)]
  print(slug,file,flush=True);start=time.time()
  try:
   p=subprocess.run(cmd,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=400);result={'exit':p.returncode,'seconds':time.time()-start,'output':p.stdout.decode(errors='replace')[-6000:]}
  except subprocess.TimeoutExpired:result={'exit':'timeout','seconds':time.time()-start}
  item={'scanRoot':root,'file':file,'process':result,'workerSha256':hashlib.sha256((R/'research/eval-corpus/dev-measure/worker.mjs').read_bytes()).hexdigest()}
  if target.exists():item['report']=read(target);target.unlink()
  # Record test locations without retaining third-party fixture contents.
  names=[c['function']['name'] for c in cohort if c['scanRoot']==root and c['function']['file']==file]
  hits=subprocess.run(['rg','-l','--glob','*.test.*','--glob','*.spec.*','|'.join(names),str(P)],capture_output=True,text=True)
  item['inputEvidenceFiles']=[str(pathlib.Path(f).relative_to(P)) for f in hits.stdout.splitlines()][:100]
  d['scans'].append(item);(O/f'{slug}.json').write_text(json.dumps(d,indent=2))
d['status']='installed; B1 accepted source files measured' if d['install']['exit']==0 else 'install failed; provisional measurement'
(O/f'{slug}.json').write_text(json.dumps(d,indent=2))
# Preserve caches while space permits; completed scans no longer need downloads.
import shutil
if shutil.disk_usage(P.parent).free<14_000_000_000:
 for cache in ['store','yarn-global','yarn-cache','cache','bun-cache','npm-cache']:
  shutil.rmtree(P.parent/cache,ignore_errors=True)
