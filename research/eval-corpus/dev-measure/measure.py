#!/usr/bin/env python3
import pathlib,os,json,gzip,subprocess,time,collections,sys,hashlib,shutil
driverHash=hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()
R=pathlib.Path.cwd();slug=sys.argv[1];O=pathlib.Path(os.environ['DEV_CENSUS_OUTPUT']);P=pathlib.Path(os.environ['DEV_CENSUS_TEMP'])/slug

def read(p):return json.loads(gzip.decompress(p.read_bytes()) if p.suffix=='.gz' else p.read_bytes())
b=R/'research/eval-corpus/dev-census-b1'/f'{slug}.json';b=b if b.exists() else b.with_suffix('.json.gz');base=read(b)
initial=O/f'{slug}.json';compressed=O/f'{slug}.json.gz'
d=read(initial if initial.exists() else compressed);compressed.unlink(missing_ok=True);groups=collections.defaultdict(set);cohort=[]
for s in base.get('scans',[]):
 for f in s.get('report',{}).get('files',[]):
  for fn in f['functions']:
   if fn['status']=='accepted':
    root=s['scanRoot'];groups[root].add(f['file']);cohort.append({'id':str(pathlib.Path(root)/fn['id']),'scanRoot':root,'function':fn})
retryPlan=json.loads(os.environ.get('DEV_MEASURE_RETRY_PLAN','{}')).get(slug)
if retryPlan is not None:groups={root:files.intersection(retryPlan.get(root,[])) for root,files in groups.items()}
d['cohort']=cohort;d['scans']=[]
if retryPlan is not None:d['retrySelection']=retryPlan
if os.environ.get('DEV_MEASURE_FINAL'):d['finalFixtureRefresh']=True
for root,files in groups.items():
 files=sorted(files)
 for offset in range(0,len(files),5):
  batch=files[offset:offset+5];scanroot=P/root;target=P.parent/f'{slug}-measure.json'
  env={**os.environ,'DEV_CENSUS_SOURCE_ROOT':str(scanroot),'DEV_CENSUS_SOURCE_FILES':json.dumps([str(scanroot/f) for f in batch]),'TMPDIR':'/tmp','M1_RESEARCH':'1','NODE_OPTIONS':'--import='+str(R/'research/eval-corpus/dev-measure/hook.mjs')}
  cmd=['node','--max-old-space-size=6144']
  if slug in ['n8n','unleash']:
   env['DEV_CENSUS_TYPESCRIPT_HOST_ROOT']=str(R/'packages/scriptc-promote');cmd+=['--import',str(R/'research/eval-corpus/dev-census/typescript-host.mjs')]
  inp=P.parent/(slug+'-inputs.json');inputs={};meta={};raw={};evidence=[]
  for file in batch:
   names=[c['function']['name'] for c in cohort if c['scanRoot']==root and c['function']['file']==file]
   subprocess.run(['node',str(R/'research/eval-corpus/dev-measure/input-gen.mjs'),str(P),file,json.dumps(names),str(inp)],check=True)
   inputs.update(read(inp));meta.update(read(pathlib.Path(str(inp)+'.meta')));raw.update(read(pathlib.Path(str(inp)+'.raw')))
   hits=subprocess.run(['rg','-l','--glob','*.test.*','--glob','*.spec.*','--glob','**/test/**/*.ts','--glob','**/tests/**/*.ts','|'.join(names),str(P)],capture_output=True,text=True)
   evidence.extend(str(pathlib.Path(f).relative_to(P)) for f in hits.stdout.splitlines())
  inp.write_text(json.dumps(inputs));pathlib.Path(str(inp)+'.meta').write_text(json.dumps(meta));pathlib.Path(str(inp)+'.raw').write_text(json.dumps(raw));env['M1_INPUT_RAW']=str(inp)+'.raw';env['M1_INPUT_META']=str(inp)+'.meta'
  cmd+=['--import',str(R/'research/eval-corpus/dev-census/file-scope.mjs'),str(R/'packages/scriptc-promote/src/cli.mjs'),'report',str(scanroot),'--measure','--inputs',str(inp),'--json',str(target)]
  print(slug,root,', '.join(batch),flush=True);start=time.time();workerHash=hashlib.sha256((R/'research/eval-corpus/dev-measure/worker.mjs').read_bytes()).hexdigest()
  try:
   p=subprocess.run(cmd,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=400);result={'exit':p.returncode,'seconds':time.time()-start,'output':p.stdout.decode(errors='replace')[-6000:]}
  except subprocess.TimeoutExpired:result={'exit':'timeout','seconds':time.time()-start}
  item={'scanRoot':root,'selectionFiles':batch,'process':result,'workerSha256':workerHash,'driverSha256':driverHash,'inputGeneratorSha256':hashlib.sha256((R/'research/eval-corpus/dev-measure/input-gen.mjs').read_bytes()).hexdigest(),'inputEvidenceFiles':sorted(set(evidence))[:100]}
  if target.exists():item['report']=read(target);target.unlink()
  d['scans'].append(item);(O/f'{slug}.json').write_text(json.dumps(d,indent=2))
d['status']='installed; B1 accepted source files measured' if d['install']['exit']==0 else 'install failed; provisional measurement'
(O/f'{slug}.json').write_text(json.dumps(d,indent=2))
if shutil.disk_usage(P.parent).free<14_000_000_000:
 for cache in ['store','yarn-global','yarn-cache','cache','bun-cache','npm-cache']:
  shutil.rmtree(P.parent/cache,ignore_errors=True)
