#!/usr/bin/env python3
"""DEV-only, serial dependency-installed census. Run from the worktree root."""
import json, os, pathlib, subprocess, shutil, time, gzip, signal, re, sys
ROOT=pathlib.Path.cwd(); OUT=pathlib.Path(os.environ.get('DEV_CENSUS_OUTPUT',ROOT/'research/eval-corpus/dev-census')); TMP=pathlib.Path(os.environ.get('DEV_CENSUS_TEMP','/tmp/nsc-dev-census')); TMP.mkdir(exist_ok=True)
manifest=json.loads((ROOT/'research/eval-corpus/manifest.json').read_text())
SCOPES={
'toeverything/AFFiNE':['packages/backend/server/src','packages/common/env/src','packages/common/error/src','packages/common/s3-compat/src'],
'actualbudget/actual':['packages/sync-server/src','packages/loot-core/src/server','packages/loot-core/src/shared'],
'boardgameio/boardgame.io':['src/server','src/core','src/plugins','src/ai'],
'lissy93/dashy':['services'],
'evidence-dev/evidence':['core/src/connection','core/src/connectors','core/src/metrics','core/src/sql-dialect'],
'excalidraw/excalidraw-room':['src'],
'gristlabs/grist-core':['app/server','app/common'],
'growthbook/growthbook':['packages/back-end/src','packages/shared/src','packages/stats-ts/src'],
'linkwarden/linkwarden':['apps/web/app/api','apps/web/pages/api','apps/web/lib/api','apps/worker','packages/prisma','packages/types','packages/utils'],
'n8n-io/n8n':['packages/cli/src','packages/core/src','packages/workflow/src'],
'nocodb/nocodb':['packages/nocodb/src','packages/nocodb-sdk/src'],
'openpanel-dev/openpanel':['apps/api/src','packages/core','packages/db/src','packages/redis','packages/shared/src/server'],
'PostHog/posthog':['nodejs/src','common/plugin_transpiler','common/replay-shared','common/replay-headless','common/hogvm/typescript'],
'umami-software/umami':['src/app/api','src/lib','src/queries'],
'Unleash/unleash':['src/lib','src/server-impl.ts']}
def save(name,data):
 b=json.dumps(data,indent=2).encode(); p=OUT/name
 if len(b)>256*1024:
  alt=p;p=p.with_suffix(p.suffix+'.gz');p.write_bytes(gzip.compress(b,compresslevel=9,mtime=0));alt.unlink(missing_ok=True)
 else:
  p.write_bytes(b);p.with_suffix(p.suffix+'.gz').unlink(missing_ok=True)
def run(cmd,cwd,timeout=600):
 start=time.time(); p=subprocess.Popen(cmd,cwd=cwd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,start_new_session=True,env={**os.environ,'CI':'true','TMPDIR':'/tmp','YARN_GLOBAL_FOLDER':str(TMP/'yarn-global'),'YARN_CACHE_FOLDER':str(TMP/'yarn-cache'),'XDG_CACHE_HOME':str(TMP/'cache'),'BUN_INSTALL_CACHE_DIR':str(TMP/'bun-cache'),'COREPACK_ENABLE_DOWNLOAD_PROMPT':'0','YARN_ENABLE_SCRIPTS':'false','npm_config_ignore_scripts':'true','PNPM_HOME':str(TMP/'pnpm-home'),'npm_config_cache':str(TMP/'npm-cache'),'COREPACK_HOME':str(TMP/'corepack')})
 try:out=p.communicate(timeout=timeout)[0];code=p.returncode
 except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);out=p.communicate()[0];code='timeout'
 return {'command':cmd,'exit':code,'seconds':round(time.time()-start,2),'output':out.decode(errors='replace').replace(str(TMP),'<tmp>')}
for r in manifest['repositories']:
 if r['split']!='DEV':continue
 if len(sys.argv)>1 and r['repository'].split('/')[-1] not in sys.argv[1:]:continue
 slug=r['repository'].split('/')[-1]; dest=OUT/(slug+'.json')
 if dest.exists() or dest.with_suffix('.json.gz').exists():continue
 data={'repository':r['repository'],'sha':r['sha'],'split':'DEV','adapterSha':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'status':'started','scopes':[]}
 if slug in ['fider','maybe']:data['status']='non-Node control';save(slug+'.json',data);continue
 p=TMP/slug
 try:
  # Reuse only the task-owned pinned GrowthBook clone from initial inspection.
  if slug=='growthbook' and pathlib.Path('/tmp/nsc-dev-growthbook').exists():shutil.move('/tmp/nsc-dev-growthbook',p)
  elif (p/'.git').exists():pass
  else:
   p.mkdir(exist_ok=True);data['init']=run(['git','init','-q',str(p)],ROOT)
   data['fetch']=run(['git','fetch','--depth=1',r['url']+'.git',r['sha']],p,300)
   if data['fetch']['exit']!=0:data['status']='clone failed';save(slug+'.json',data);continue
   data['checkout']=run(['git','checkout','-q','FETCH_HEAD'],p)
  actual=subprocess.check_output(['git','rev-parse','HEAD'],cwd=p,text=True).strip()
  if actual!=r['sha']:raise RuntimeError('SHA mismatch: '+actual)
  data['verifiedSha']=actual
  data['packageInventory']=[str(f.relative_to(p)) for f in p.glob('**/package.json') if '.git' not in f.parts]
  scopes=[s for s in SCOPES[r['repository']] if (p/s).is_dir()]
  omissions=[]
  def partition(scope):
   if r['repository']=='toeverything/AFFiNE':return [scope]
   d=p/scope; files=[f for f in d.rglob('*') if f.is_file() and f.suffix in ['.ts','.tsx','.js','.jsx','.mjs','.cjs']]
   children=[x for x in d.iterdir() if x.is_dir() and not x.name.startswith('.') and x.name not in ['node_modules','test','tests','__tests__']]
   if len(files)<=180 or not children:return [scope]
   omissions.extend(str(f.relative_to(p)) for f in d.iterdir() if f.is_file() and f.suffix in ['.ts','.tsx','.js','.jsx','.mjs','.cjs'])
   return [v for c in children for v in partition(str(c.relative_to(p)))]
  if not os.environ.get('DEV_CENSUS_BATCH_MODE'):scopes=[v for scope in scopes for v in partition(scope)]
  data['scopePartitionOmissions']=omissions
  data['missingPlannedScopes']=[s for s in SCOPES[r['repository']] if not (p/s).exists()]
  # Exclude tests, seeds, vendored/browser bundles and tooling from discovery.
  excluded=[]
  for s in scopes:
   for f in (p/s).rglob('*'):
    if f.is_file() and (any(x in ['__tests__','__mocks__','test','tests','e2e','seeds','seed','fixtures','bench','benches','benchmark','benchmarks','__benchmarks__','vendor','vendored','build','dist','node_modules','scripts'] for x in f.relative_to(p/s).parts) or any(x in f.name for x in ['.test.','.spec.','.stories.'])):
     if f.suffix in ['.ts','.tsx','.js','.jsx','.mjs','.cjs']:excluded.append(str(f.relative_to(p)))
  for f in excluded:(p/f).unlink()
  data['excludedFiles']=excluded;data['scopes']=scopes
  data['freeBytesBeforeInstall']=shutil.disk_usage(p).free
  if data['freeBytesBeforeInstall']<12_000_000_000:data['status']='skipped: <12 GB free';save(slug+'.json',data);continue
  pkg=json.loads((p/'package.json').read_text()) if (p/'package.json').exists() else {}
  pm=pkg.get('packageManager') or ('bun' if (p/'bun.lock').exists() or (p/'bun.lockb').exists() else 'pnpm' if (p/'pnpm-lock.yaml').exists() else 'yarn' if (p/'yarn.lock').exists() else 'npm')
  if r['repository']=='nocodb/nocodb' and pm=='pnpm':pm='pnpm@10' # pinned CI selects pnpm/action-setup version 10
  data['packageManager']=pm
  if pm.startswith('pnpm'):cmd=['corepack',pm if '@' in pm else 'pnpm','install','--ignore-scripts','--frozen-lockfile','--store-dir',str(TMP/'store')]
  elif pm.startswith('yarn'):
   modern=(p/'.yarnrc.yml').exists();cmd=['corepack',pm if '@' in pm else 'yarn','install']+(['--mode=skip-build'] if modern else ['--ignore-scripts','--frozen-lockfile','--non-interactive'])
  elif pm.startswith('bun'):
   pinnedBun=list(pathlib.Path('/tmp/b1-verified-bun/node_modules/@oven').glob('bun-*/bin/bun'))
   cmd=[os.environ.get('DEV_CENSUS_BUN_BINARY',str(pinnedBun[0]) if len(pinnedBun)==1 else 'bun'),'install','--ignore-scripts','--frozen-lockfile']
  else:cmd=['npm','ci' if (p/'package-lock.json').exists() else 'install','--ignore-scripts','--no-audit','--no-fund']
  print(slug,'install',pm,flush=True);data['install']=run(cmd,p,600)
  # Scanner TypeScript fallback is isolated and does not substitute application deps.
  (p/'node_modules').mkdir(exist_ok=True)
  if not (p/'node_modules/typescript').exists():(p/'node_modules/typescript').symlink_to('/tmp/b1-tools/node_modules/typescript',target_is_directory=True)
  data['generators']=[]
  for schema in p.rglob('*.prisma'):
   if 'node_modules' in schema.parts or '.git' in schema.parts:continue
   providers=re.findall(r'generator\s+\w+\s*\{[^}]*provider\s*=\s*"([^"]+)"',schema.read_text(),re.S)
   if not providers:continue
   record={'schema':str(schema.relative_to(p))}
   if any(x!='prisma-client-js' for x in providers) or list(p.glob('**/prisma.config.*')):record['status']='not run: custom generator/config requires an application execution review'
   else:
    candidates=[c/'node_modules/prisma/build/index.js' for c in [schema.parent,*schema.parents] if c==p or p in c.parents]
    cli=next((f for f in candidates if f.exists()),None)
    if cli is None:record['status']='not available: Prisma CLI file absent'
    else:
     record['process']=run(['sandbox-exec','-p','(version 1)(allow default)(deny network*)','node',str(cli),'generate','--schema',str(schema),'--no-engine'],p,60)
     record['status']='offline generated' if record['process']['exit']==0 else 'offline generation failed'
   data['generators'].append(record)
  save(slug+'.json',data)
  if os.environ.get('DEV_CENSUS_BATCH_MODE'):
   subprocess.run(['python3',str(ROOT/'research/eval-corpus/dev-census/scan-batches.py'),slug],cwd=ROOT,check=True)
   result=OUT/(slug+'.json.gz');result=result if result.exists() else OUT/(slug+'.json')
   data=json.loads(gzip.decompress(result.read_bytes()) if result.suffix=='.gz' else result.read_bytes())
   continue
  data['scans']=[]
  for i,s in enumerate(scopes):
   print(slug,'scan',s,flush=True); target=TMP/(slug+'-report.json')
   scanroot=p
   for candidate in [p/s,*(p/s).parents]:
    if candidate==p.parent:break
    if (candidate/'tsconfig.json').exists():scanroot=candidate;break
   relscope=str((p/s).relative_to(scanroot))
   rr=run(['node','--max-old-space-size=6144',str(ROOT/'packages/scriptc-promote/src/cli.mjs'),'report',str(scanroot),'--source-dir',relscope,'--json',str(target)],ROOT,900)
   item={'scope':s,'scanRoot':str(scanroot.relative_to(p)),'reportProcess':rr}
   if target.exists():
    result=json.loads(target.read_text());target.unlink();item['report']=result
   item['ev1Process']=run(['node','--max-old-space-size=6144',str(ROOT/'research/eval-corpus/census.mjs'),str(scanroot),relscope],ROOT,900)
   try:item['ev1']=json.loads(item['ev1Process']['output']);item['ev1Process'].pop('output');item['ev1']['mode']='dependency-install attempted; see install status'
   except (ValueError,KeyError):pass
   data['scans'].append(item);save(slug+'.json',data)
  data['status']=('installed' if data['install']['exit']==0 else 'install failed')+('; scans complete' if all(x['reportProcess']['exit']==0 for x in data['scans']) and scopes else '; scans partial/missing')
 except Exception as e:data['status']='harness failure';data['error']=str(e)
 finally:
  save(slug+'.json',data);shutil.rmtree(p,ignore_errors=True);print(slug,data['status'],flush=True)
