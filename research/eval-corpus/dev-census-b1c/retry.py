#!/usr/bin/env python3
"""Retry unsuccessful affected-DEV installs after the initial serial pass exits."""
import os,sys,pathlib,json,gzip,shutil,subprocess
ROOT=pathlib.Path.cwd();OUT=pathlib.Path(os.environ['DEV_CENSUS_OUTPUT']);TMP=pathlib.Path(os.environ['DEV_CENSUS_TEMP'])
if not str(TMP).startswith('/tmp/b1c-'):raise RuntimeError('Use a task-owned /tmp/b1c- prefix')
def read(p):return json.loads(gzip.decompress(p.read_bytes()) if p.suffix=='.gz' else p.read_bytes())
lost=json.loads((ROOT/'research/eval-corpus/dev-census-b1/comparison.json').read_text())['lostCoveredAcceptances'];repos=sorted(set(r['repository'] for r in lost));records=read(OUT/'retry-records.json') if (OUT/'retry-records.json').exists() else []
datasets={}
for repository in repos:
 slug=repository.split('/')[1];p=OUT/(slug+'.json.gz');p=p if p.exists() else OUT/(slug+'.json');data=read(p)
 if data.get('status')=='started':raise RuntimeError('Initial pass is still active')
 datasets[repository]=(p,data)
for repository in repos:
 slug=repository.split('/')[1];p,data=datasets[repository]
 if data.get('install',{}).get('exit')==0:continue
 before=shutil.disk_usage(TMP).free;removed=[]
 if before<14_000_000_000:
  for name in ['store','bun-cache','yarn-cache','yarn-global','npm-cache','cache']:
   if (TMP/name).exists():shutil.rmtree(TMP/name);removed.append(name)
 attempt=OUT/'attempts'/('initial-'+p.name);attempt.parent.mkdir(exist_ok=True);sequence=1
 while attempt.exists():
  sequence+=1;attempt=OUT/'attempts'/(f'retry-{sequence}-'+p.name)
 shutil.move(p,attempt)
 record={'repository':repository,'initialStatus':data['status'],'cacheCleanup':removed,'freeBeforeCleanup':before,'freeAfterCleanup':shutil.disk_usage(TMP).free};records.append(record)
 print(slug,'retry',record['freeAfterCleanup'],'free bytes',flush=True)
 subprocess.run([sys.executable,str(ROOT/'research/eval-corpus/dev-census/run.py'),slug],check=True)
 result=OUT/(slug+'.json.gz');result=result if result.exists() else OUT/(slug+'.json');record['retryStatus']=read(result)['status'];(OUT/'retry-records.json').write_text(json.dumps(records,indent=2)+'\n')
