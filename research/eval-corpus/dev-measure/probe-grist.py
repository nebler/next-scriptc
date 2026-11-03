#!/usr/bin/env python3
"""Replay Grist's permission-object helper with its type-generated object inputs."""
import pathlib,json,os,subprocess,hashlib
R=pathlib.Path.cwd();O=pathlib.Path(os.environ['DEV_CENSUS_OUTPUT']);P=pathlib.Path(os.environ['DEV_CENSUS_TEMP'])/'grist-core';root=P/'app/common';target=P.parent/'grist-valid-inputs.json'
d=json.loads((O/'grist-core.json').read_text());env={**os.environ,'TMPDIR':'/tmp','NODE_OPTIONS':'--import='+str(R/'research/eval-corpus/dev-measure/hook.mjs'),'DEV_CENSUS_SOURCE_ROOT':str(root),'DEV_CENSUS_SOURCE_FILES':json.dumps([str(root/'ACLPermissions.ts')])};env.pop('M1_WALL_ONLY',None)
cmd=['node','--max-old-space-size=6144','--import',str(R/'research/eval-corpus/dev-census/file-scope.mjs'),str(R/'packages/scriptc-promote/src/cli.mjs'),'report',str(root),'--measure','--json',str(target)]
p=subprocess.run(cmd,env=env,capture_output=True,text=True,timeout=400);assert p.returncode==0,p.stdout+p.stderr
report=json.loads(target.read_text());report['measurements']=[m for m in report['measurements'] if m['id'].endswith('#isEmpty')];assert report['measurements']
d['scans']=[{'scanRoot':'app/common','selectionFiles':['ACLPermissions.ts'],'report':report,'workerSha256':hashlib.sha256((R/'research/eval-corpus/dev-measure/worker.mjs').read_bytes()).hexdigest(),'inputGeneratorSha256':hashlib.sha256((R/'research/eval-corpus/dev-measure/input-gen.mjs').read_bytes()).hexdigest(),'reason':'Reject unrelated same-name array fixtures; replay the accepted signature with type-generated permission objects.'}];d['status']='installed; synthetic valid-object probe complete'
(O/'grist-core.json').write_text(json.dumps(d,indent=2));target.unlink()
