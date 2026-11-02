import json,gzip,statistics,pathlib
p=pathlib.Path(__file__).parent
def read(name):
 f=p/(name+'.json')
 return json.loads(f.read_text() if f.exists() else gzip.decompress((p/(name+'.json.gz')).read_bytes()))
summary={};lines=[]
for source in ['local','container-raw']:
 d=read(source);summary[source]={};lines+=['',source+':','','| Records | Encoder | Encode wall | Native decode wall | Total wall | Total CPU | JS CPU | JS result decode | Canonical |','| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
 for n in [600,6000,60000]:
  summary[source][n]={}
  for mode in ['legacy','stringify','generated','columns']:
   rows=[r for r in d['rows'] if r['n']==n and r['name']==mode]
   keys=[k for k in rows[0] if k not in ['n','i','name']]
   med={k:statistics.median(r[k] for r in rows) for k in keys};summary[source][n][mode]=med
   if mode!='columns':lines.append('| '+str(n)+' | '+mode+' | '+' | '.join(f'{med[k]:.4f}' for k in ['encode','nativeDecode','total','totalCPU','jsCPU','decode','canonical'])+' |')
 lines+=['','Column decode wall medians: '+', '.join(f"{n}: {summary[source][n]['columns']['nativeDecode']:.4f} ms" for n in [600,6000,60000])+'.']
(p/'tables.md').write_text('\n'.join(lines)+'\n');(p/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
