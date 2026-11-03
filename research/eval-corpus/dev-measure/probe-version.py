#!/usr/bin/env python3
"""Use own version labels matching parseVersionDir's pinned decimal-component format."""
import pathlib,json,os,subprocess,hashlib,gzip
R=pathlib.Path.cwd();O=pathlib.Path(os.environ['DEV_CENSUS_OUTPUT']);P=pathlib.Path(os.environ['DEV_CENSUS_TEMP'])/'n8n';root=P/'packages/core';out=P.parent/'version-probe.json';inp=P.parent/'version-inputs.json';id='src/nodes-loader/output-schema-resolver.ts#parseVersionDir'
initial=O/'n8n.json';initial=initial if initial.exists() else initial.with_suffix('.json.gz');d=json.loads(gzip.decompress(initial.read_bytes()) if initial.suffix=='.gz' else initial.read_bytes());initial.with_suffix('.json.gz').unlink(missing_ok=True)
inp.write_text(json.dumps({id:[['v'+'.'.join(map(str,v))] for v in [[1],[2,3],[4,5,6]]]}))
env={**os.environ,'TMPDIR':'/tmp','NODE_OPTIONS':'--import='+str(R/'research/eval-corpus/dev-measure/hook.mjs'),'DEV_CENSUS_SOURCE_ROOT':str(root),'DEV_CENSUS_SOURCE_FILES':json.dumps([str(root/id.split('#')[0])]),'DEV_CENSUS_TYPESCRIPT_HOST_ROOT':str(R/'packages/scriptc-promote')};env.pop('M1_WALL_ONLY',None)
cmd=['node','--max-old-space-size=6144','--import',str(R/'research/eval-corpus/dev-census/typescript-host.mjs'),'--import',str(R/'research/eval-corpus/dev-census/file-scope.mjs'),str(R/'packages/scriptc-promote/src/cli.mjs'),'report',str(root),'--measure','--inputs',str(inp),'--json',str(out)]
d['scans']=[];d['wallScans']=[]
for wall in [False,True]:
 if wall:env.update(M1_WALL_ONLY='1',M1_WALL_SCAN_ROOT='packages/core',M1_WALL_REPO='n8n-io/n8n',M1_BASELINE_FILE=str(R/'research/eval-corpus/dev-measure/functions.json'))
 p=subprocess.run(cmd,env=env,capture_output=True,text=True,timeout=400);assert p.returncode==0,p.stdout+p.stderr;report=json.loads(out.read_text());report['measurements']=[m for m in report['measurements'] if m['id']==id]
 for m in report['measurements']:m['inputSource']='synthetic-source-contract';m['inputProvenance']={'kind':'synthetic-source-contract','source':'packages/core/src/nodes-loader/output-schema-resolver.ts','note':'Own v-prefixed decimal version components; 1, 2, and 3 components.'}
 assert report['measurements']
 d['wallScans' if wall else 'scans']=[{'scanRoot':'packages/core','selectionFiles':[id.split('#')[0]],'report':report,'workerSha256':hashlib.sha256((R/'research/eval-corpus/dev-measure'/('wall-worker.mjs' if wall else 'worker.mjs')).read_bytes()).hexdigest(),'inputGeneratorSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()}]
d['status']='installed; source-contract version probe complete';(O/'n8n.json').write_text(json.dumps(d,indent=2));out.unlink();inp.unlink()
