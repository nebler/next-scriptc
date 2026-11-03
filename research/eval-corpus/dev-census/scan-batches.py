#!/usr/bin/env python3
"""Resume static CLI scans in explicit source-file batches at original paths."""
import pathlib,json,gzip,subprocess,os,sys,signal,time,collections,importlib.util
ROOT=pathlib.Path.cwd();BASE=pathlib.Path(os.environ.get('DEV_CENSUS_OUTPUT',ROOT/'research/eval-corpus/dev-census'));TMP=pathlib.Path(os.environ.get('DEV_CENSUS_TEMP','/tmp/nsc-dev-census'));slug=sys.argv[1]
# Use EV3's explicitly labeled compatible hosts for packages without the Node TS API.
if slug in ['n8n','unleash'] and ('dev-census-b1' in os.environ.get('DEV_CENSUS_OUTPUT','') or 'b1-verified' in os.environ.get('DEV_CENSUS_OUTPUT','')):
 os.environ['DEV_CENSUS_ROOT_TYPESCRIPT']='1'
 if slug=='unleash':
  os.environ['DEV_CENSUS_TYPESCRIPT_HOST_DIRECTORY']='/tmp/b1-tools'
  os.environ['DEV_CENSUS_TYPESCRIPT_HOST_REASON']='Protocol TypeScript 5.9.3 host; canonical TypeScript 7 failure retained in EV3'
def read(p):return json.loads(gzip.decompress(p.read_bytes()) if p.suffix=='.gz' else p.read_bytes())
def existing(stem):
 p=BASE/(stem+'.json.gz');return p if p.exists() else BASE/(stem+'.json')
p=TMP/slug;data=read(existing(slug));manifest=json.loads((ROOT/'research/eval-corpus/manifest.json').read_text());r=next(r for r in manifest['repositories'] if r['split']=='DEV' and r['repository']==data['repository']);assert data['sha']==r['sha'];assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=p,text=True).strip()==r['sha']
# Load helper functions without starting its repository loop.
args=sys.argv;sys.argv=['run.py','__helper_only__'];spec=importlib.util.spec_from_file_location('runner',ROOT/'research/eval-corpus/dev-census/run.py');runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner);sys.argv=args
resume=existing('attempts/resume-'+slug);old=read(resume) if resume.exists() else {}
data['scans']=old.get('scans',[]) if old.get('install',{}).get('exit')==0 else [];data['priorPartitionOmissions']=old.get('scopePartitionOmissions',[])
covered=set();supp=existing('supplements/'+slug)
for scan in [*data['scans'],*(read(supp).get('scans',[]) if supp.exists() else [])]:
 prefix='' if scan['scanRoot']=='.' else scan['scanRoot']+'/'
 for f in scan.get('report',{}).get('files',[]):covered.add(prefix+f['file'])
skip={'node_modules','test','tests','__tests__','__mocks__','e2e','seed','seeds','fixtures','bench','benches','benchmark','benchmarks','__benchmarks__','vendor','vendored','build','dist','scripts','demo-datasource'}
groups=collections.defaultdict(list);selected=set();exclusions=[]
for scope in data['scopes']:
 for f in (p/scope).rglob('*'):
  if not f.is_file() or f.suffix not in ['.ts','.tsx','.js','.jsx','.mjs','.cjs']:continue
  rel=str(f.relative_to(p))
  if any(t in f.name for t in ['tsup.config.','vite.config.','vitest.config.','eslint.config.','tsdown.config.','tailwind.config.','postcss.config.','drizzle.config.','playwright.config.']):exclusions.append(rel);continue
  if any(x in skip or x.startswith('.') for x in f.relative_to(p).parts) or any(x in f.name for x in ['.test.','.spec.','.bench.','.stories.']):exclusions.append(rel);continue
  selected.add(rel)
  if rel in covered:continue
  scanroot=p
  for candidate in [f.parent,*f.parent.parents]:
   if candidate==p.parent:break
   if (candidate/'tsconfig.json').exists():scanroot=candidate;break
  groups[scanroot].append(f)
data['explicitSelectionFiles']=sorted(selected);data['additionalExclusions']=exclusions
batchSize=int(os.environ.get('DEV_CENSUS_BATCH_FILES','180'));heap=int(os.environ.get('DEV_CENSUS_NODE_HEAP_MIB','6144'));data['finalBatchLimits']={'files':batchSize,'heapMiB':heap,'timeoutSeconds':900}
for root,files in groups.items():
 groupBatchSize=min(batchSize,32) if slug=='growthbook' and root.name=='shared' else batchSize
 for i in range(0,len(files),groupBatchSize):
  batch=files[i:i+groupBatchSize];print(slug,'batch',str(root.relative_to(p)),i,'/',len(files),flush=True)
  env={**os.environ,'DEV_CENSUS_SOURCE_ROOT':str(root),'DEV_CENSUS_SOURCE_FILES':json.dumps([str(f) for f in batch])}
  def run(cmd):
   start=time.time();proc=subprocess.Popen(cmd,cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,env=env,start_new_session=True)
   try:out=proc.communicate(timeout=900)[0];code=proc.returncode
   except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);out=proc.communicate()[0];code='timeout'
   return {'command':cmd,'exit':code,'seconds':round(time.time()-start,2),'output':out.decode(errors='replace')}
  node=['node',f'--max-old-space-size={heap}']
  if os.environ.get('DEV_CENSUS_ROOT_TYPESCRIPT'):
   env['DEV_CENSUS_TYPESCRIPT_HOST_ROOT']=os.environ.get('DEV_CENSUS_TYPESCRIPT_HOST_DIRECTORY',str(p));node+=['--import',str(ROOT/'research/eval-corpus/dev-census/typescript-host.mjs')]
   data['typescriptHostOverride']=os.environ.get('DEV_CENSUS_TYPESCRIPT_HOST_REASON','Installed root TypeScript 6.0.2 Node API; package TypeScript 7 host lacks sys.readFile (canonical failures retained)')
  node+=['--import',str(ROOT/'research/eval-corpus/dev-census/file-scope.mjs')];target=TMP/(slug+'-batch-report.json')
  item={'scope':str(root.relative_to(p)),'scanRoot':str(root.relative_to(p)),'sourceDir':'.','selectionFiles':[str(f.relative_to(p)) for f in batch],'reportProcess':({'exit':'not-retried','command':[],'seconds':0,'output':'Earlier EV2 memory failures retained; this is an explicit EV1-only resource-limited retry'} if os.environ.get('DEV_CENSUS_EV1_ONLY') else run(node+[str(ROOT/'packages/scriptc-promote/src/cli.mjs'),'report',str(root),'--source-dir','.','--json',str(target)]))}
  if target.exists():item['report']=read(target);target.unlink()
  item['ev1Process']=run(node+[str(ROOT/'research/eval-corpus/census.mjs'),str(root),'.'])
  try:item['ev1']=json.loads(item['ev1Process']['output']);item['ev1Process'].pop('output')
  except (ValueError,KeyError):pass
  if os.environ.get('DEV_CENSUS_EV1_ONLY'):item['ev1Only']=True
  data['scans'].append(item);runner.save(slug+'.json',data)
files=set(covered)
for scan in data['scans']:
 prefix='' if scan['scanRoot']=='.' else scan['scanRoot']+'/'
 for f in scan.get('report',{}).get('files',[]):files.add(prefix+f['file'])
data['scopePartitionOmissions']=sorted(selected-files);data['status']=('installed' if data['install']['exit']==0 else 'install failed')+('; requested files covered' if not data['scopePartitionOmissions'] else '; scans partial')
runner.save(slug+'.json',data);print(slug,data['status'],len(data['scopePartitionOmissions']),'uncovered files',flush=True)
