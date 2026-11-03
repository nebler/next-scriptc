#!/usr/bin/env python3
"""Exercise derived inputs against real report compilation and invocation."""
import pathlib,tempfile,subprocess,json,os,shutil
R=pathlib.Path.cwd();p=pathlib.Path(tempfile.mkdtemp(prefix='m1-input-check-',dir='/tmp'))
try:
 (p/'tsconfig.json').write_text('{"compilerOptions":{"strict":true,"target":"ESNext"}}')
 (p/'compute.ts').write_text('''type Item={kind:'text';value:string};
export function summarize(rows:Item[]):number{let n=0;for(const row of rows)if(row.kind==='text')n+=row.value.length;return n;}
export function versions(rows:string[]):number{let n=0;for(const row of rows)if(row.startsWith('v'))n+=row.length;return n;}
export function jsonRows(text:string):number{const rows=JSON.parse(text) as Item[];let n=0;for(const row of rows)if(row.kind==='text')n+=row.value.length;return n;}
''')
 (p/'compute.test.ts').write_text('''const rows=[{kind:'text',value:'privatepayload'}] as const;summarize(rows);versions(['v12']);jsonRows('[{"kind":"text","value":"privatepayload"}]');''')
 inp=p/'inputs.json';out=p/'result.json'
 subprocess.run(['node',str(R/'research/eval-corpus/dev-measure/input-gen.mjs'),str(p),'compute.ts','["summarize","versions","jsonRows"]',str(inp)],check=True)
 assert 'privatepayload' not in inp.read_text()
 env={**os.environ,'TMPDIR':'/tmp','M1_INPUT_RAW':str(inp)+'.raw','M1_INPUT_META':str(inp)+'.meta','NODE_OPTIONS':'--import='+str(R/'research/eval-corpus/dev-measure/hook.mjs'),'DEV_CENSUS_SOURCE_ROOT':str(p),'DEV_CENSUS_SOURCE_FILES':json.dumps([str(p/'compute.ts')])}
 subprocess.run(['node','--import',str(R/'research/eval-corpus/dev-census/file-scope.mjs'),str(R/'packages/scriptc-promote/src/cli.mjs'),'report',str(p),'--measure','--inputs',str(inp),'--json',str(out)],env=env,check=True,capture_output=True)
 ms=json.loads(out.read_text())['measurements'];assert len(ms)==3,ms
 for m in ms:
  assert m['status']=='ok',m
  assert m['schemaLiteralTagsRestored'] and m['cold']['firstNativeWallNs']>0
  assert m['metric']=='process-cpu' and len(m['rawPairsNs'])==60
  assert 'privatepayload' not in json.dumps(m)
  if m['id'].endswith('#summarize'):assert m['arguments'][0][0]['kind']=='text'
  if m['id'].endswith('#versions'):assert m['arguments'][0][0].startswith('v') and m['arguments'][0][0]!='v12'
  if m['id'].endswith('#jsonRows'):assert json.loads(m['arguments'][0])[0]['kind']=='text'
 print('Const fixtures, schema tags, source-checked prefixes, valid JSON, payload replacement, parity, cold costs, and 60 process-CPU pairs pass')
finally:shutil.rmtree(p)
