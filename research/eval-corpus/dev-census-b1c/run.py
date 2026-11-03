#!/usr/bin/env python3
"""Serial affected-DEV census with task-owned cache cleanup under disk pressure."""
import os,sys,pathlib,json,gzip,shutil,subprocess
ROOT=pathlib.Path.cwd();OUT=pathlib.Path(os.environ['DEV_CENSUS_OUTPUT']);TMP=pathlib.Path(os.environ['DEV_CENSUS_TEMP'])
if not str(TMP).startswith('/tmp/b1c-'):raise RuntimeError('Use a task-owned /tmp/b1c- prefix')
OUT.mkdir(parents=True,exist_ok=True);TMP.mkdir(parents=True,exist_ok=True)
manifest=json.loads((ROOT/'research/eval-corpus/manifest.json').read_text());lost=json.loads((ROOT/'research/eval-corpus/dev-census-b1/comparison.json').read_text())['lostCoveredAcceptances'];affected=set(r['repository'] for r in lost)
repos=[r for r in manifest['repositories'] if r['repository'] in affected]
if len(repos)!=11 or any(r['split']!='DEV' for r in repos):raise RuntimeError('Affected DEV selection drift')
installed=[r for r in repos if (TMP/r['repository'].split('/')[1]/'node_modules').is_dir()]
if len(installed)>1:raise RuntimeError('More than one retained application clone')
if installed:repos.sort(key=lambda r:r['repository']!=installed[0]['repository'])
records=[]
for r in repos:
 slug=r['repository'].split('/')[1];clone=TMP/slug;reuse=(clone/'node_modules').is_dir()
 before=shutil.disk_usage(TMP).free;removed=[]
 if before<14_000_000_000 and not reuse:
  for name in ['store','bun-cache','yarn-cache','yarn-global','npm-cache','cache']:
   if (TMP/name).exists():shutil.rmtree(TMP/name);removed.append(name)
 record={'repository':r['repository'],'freeBeforeCleanup':before,'freeAfterCleanup':shutil.disk_usage(TMP).free,'removedCaches':removed};records.append(record)
 print(r['repository'],'serial scan',record['freeAfterCleanup'],'free bytes',flush=True)
 if reuse:
  p=OUT/(slug+'.json.gz');p=p if p.exists() else OUT/(slug+'.json');data=json.loads(gzip.decompress(p.read_bytes()) if p.suffix=='.gz' else p.read_bytes())
  if data.get('install',{}).get('exit')!=0 or data.get('status')!='installed; pending final scan':raise RuntimeError('Retained installation lacks verified setup provenance')
  record['reusedVerifiedInstallation']=True
  try:subprocess.run([sys.executable,str(ROOT/'research/eval-corpus/dev-census/scan-batches.py'),slug],check=True)
  finally:shutil.rmtree(clone,ignore_errors=True)
 else:subprocess.run([sys.executable,str(ROOT/'research/eval-corpus/dev-census/run.py'),slug],check=True,env={**os.environ,'DEV_CENSUS_BATCH_MODE':'1'})
 (OUT/'run-records.json').write_text(json.dumps(records,indent=2)+'\n')
