#!/usr/bin/env python3
"""Select stale collector batches, or merge their serial pinned-repository reruns."""
import pathlib,json,gzip,hashlib,sys,shutil
R=pathlib.Path.cwd();D=R/'research/eval-corpus/dev-measure';O=D/'results';F=pathlib.Path('/tmp/m1-fixture-final-results');N=pathlib.Path('/tmp/m1-stale-results')
def read(p):return json.loads(gzip.decompress(p.read_bytes()) if p.suffix=='.gz' else p.read_bytes())
def source(slug):
 for base in [F,O]:
  for ext in ['.json.gz','.json']:
   p=base/(slug+ext)
   if p.exists() and 'measured' in read(p)['status']:return p
 return None
def files(s):return s.get('selectionFiles',[s['file']] if 'file' in s else [])
def save(slug,d):
 b=(json.dumps(d,indent=2)+'\n').encode();plain=O/(slug+'.json');gz=O/(slug+'.json.gz')
 if len(b)>256*1024:gz.write_bytes(gzip.compress(b,compresslevel=9,mtime=0));plain.unlink(missing_ok=True)
 else:plain.write_bytes(b);gz.unlink(missing_ok=True)
manifest=read(R/'research/eval-corpus/manifest.json');plan={};worker=hashlib.sha256((D/'worker.mjs').read_bytes()).hexdigest();generator=hashlib.sha256((D/'input-gen.mjs').read_bytes()).hexdigest()
if sys.argv[1:]==['merge']:
 plan=read(pathlib.Path('/tmp/m1-retry-plan.json'))
 for r in manifest['repositories']:
  if r['split']!='DEV':continue
  slug=r['repository'].split('/')[-1];p=source(slug)
  if not p:continue
  d=read(p);old=O/(slug+'.json.gz');old=old if old.exists() else O/(slug+'.json')
  A=D/'attempts/before-final-collector';A.mkdir(parents=True,exist_ok=True)
  if old.exists() and old.read_bytes()!=p.read_bytes():shutil.copy2(old,A/old.name)
  if slug in plan:
   shutil.copy2(p,A/(slug+'-candidate'+''.join(p.suffixes)))
   new=next((N/(slug+e) for e in ['.json.gz','.json'] if (N/(slug+e)).exists()),None);assert new,slug
   fresh=read(new);assert fresh['install']['exit']==0,(slug,fresh['status'])
   kept=[s for s in d['scans'] if not set(files(s)).intersection(plan[slug].get(s['scanRoot'],[]))]
   fresh['scans']=[*kept,*fresh['scans']];fresh['finalFixtureRefresh']=True;d=fresh
  save(slug,d)
else:
 for r in manifest['repositories']:
  if r['split']!='DEV':continue
  slug=r['repository'].split('/')[-1];p=source(slug)
  if not p:continue
  d=read(p)
  for s in d.get('scans',[]):
   if s.get('workerSha256')!=worker or s.get('inputGeneratorSha256')!=generator or 'driverSha256' not in s:
    plan.setdefault(slug,{}).setdefault(s['scanRoot'],[]).extend(files(s))
 pathlib.Path('/tmp/m1-retry-plan.json').write_text(json.dumps(plan))
 print(' '.join(plan));print(json.dumps({k:sum(len(v) for v in roots.values()) for k,roots in plan.items()},indent=2))
