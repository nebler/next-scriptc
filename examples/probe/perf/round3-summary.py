#!/usr/bin/env python3
"""Preserve compact evidence and render decision tables from measured windows."""
import round3 as r
import run as p
import json,statistics,hashlib,subprocess,os,platform
med=statistics.median
def fmt(xs,d=3,scale=1):
 xs=[x/scale for x in xs]
 return f'{med(xs):.{d}f} [{min(xs):.{d}f}, {max(xs):.{d}f}]'
def parity_hash(x):return hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def main():
 modes=json.loads((p.OUT/'modes.json').read_text());top=json.loads((p.OUT/'topology.json').read_text()) if (p.OUT/'topology.json').exists() else None
 assert set(modes['workloads'])==set(r.WORK)
 assert all(len(x['builds'])==6 and len(x['runs'])==8 and x['parity'] for x in modes['workloads'].values())
 evidence={k:v for k,v in modes.items() if k!='workloads'}
 evidence.update(node=subprocess.check_output([p.NODE,'--version'],text=True).strip(),scriptc=subprocess.check_output([p.COMP,'--version'],text=True).strip(),machine=subprocess.check_output(['sysctl','-n','hw.model','hw.ncpu','hw.memsize'],text=True).splitlines(),branch=subprocess.check_output(['git','branch','--show-current'],text=True).strip(),workloads={})
 evidence['sourceHashes']={str(f.relative_to(p.ROOT)):hashlib.sha256(f.read_bytes()).hexdigest() for f in list((p.ROOT/'examples/demo/app/api').rglob('*.ts'))+[p.ROOT/'pnpm-lock.yaml',p.ROOT/'packages/next-scriptc/src/adapter.mjs',p.ROOT/'packages/next-scriptc/src/routes.mjs',p.ROOT/'examples/probe/perf/shim/grouped.ts',p.ROOT/'examples/probe/perf/shim/next-server.ts',p.ROOT/'examples/probe/perf/http-client.mjs']+list((p.ROOT/'examples/probe/perf').glob('*.py'))+list((p.ROOT/'examples/probe/perf').glob('round3-worker*.ts'))}
 lines=['| Route | release ms/call [range] | speed ms/call [range] | speed/release | Paired speed/release (4 runs) | Parity vs Node |','| --- | ---: | ---: | ---: | --- | --- |']
 resource=['| Route | Binary MiB release / speed | Warm RSS MiB release [range] / speed [range] | Build seconds release [range] / speed [range] |','| --- | ---: | ---: | ---: |']
 for n in r.WORK:
  row=modes['workloads'][n];times={};rss={};builds={};sizes={}
  for m in ['release','speed']:
   runs=sorted([x for x in row['runs'] if x['mode']==m],key=lambda x:x['rep'])
   times[m]=[x['times'][0]['ms']/x['times'][0]['count'] for x in runs];rss[m]=[x['times'][0]['rss'] for x in runs]
   builds[m]=[v['seconds'] for k,v in row['builds'].items() if k.startswith(m)];sizes[m]=[v['bytes'] for k,v in row['builds'].items() if k.startswith(m)]
  ratios=[s/a for a,s in zip(times['release'],times['speed'])]
  lines.append(f'| {n} | {fmt(times["release"],6 if med(times["release"])<.1 else 3)} | {fmt(times["speed"],6 if med(times["speed"])<.1 else 3)} | {med(times["speed"])/med(times["release"]):.3f}× | '+', '.join(f'{x:.3f}' for x in ratios)+f' | {row.get("parity")} |')
  resource.append(f'| {n} | {med(sizes["release"])/1048576:.3f} / {med(sizes["speed"])/1048576:.3f} | {fmt(rss["release"],2,1048576)} / {fmt(rss["speed"],2,1048576)} | {fmt(builds["release"],2)} / {fmt(builds["speed"],2)} |')
  e={k:v for k,v in row.items() if k not in ['node','runs']}
  e['nodeParitySha256']=parity_hash(row['node']);e['sourceSha256']=hashlib.sha256((r.GEN/f'{n}.ts').read_bytes()).hexdigest()
  e['fixture']={'route':r.WORK[n][0],'method':r.WORK[n][1],'call':r.WORK[n][2],'warm':r.WORK[n][3],'count':r.WORK[n][4]}
  e['runs']=[{k:v for k,v in x.items() if k!='parity'}|{'paritySha256':parity_hash(x['parity'])} for x in row['runs']]
  evidence['workloads'][n]=e
 lines+=['','']+resource
 if top:
  assert len(top['rows'])==12
  evidence['topology']=top
  evidence['topologyBinaries']={n:{'bytes':(p.OUT/f'http-{n}-release').stat().st_size,'sha256':hashlib.sha256((p.OUT/f'http-{n}-release').read_bytes()).hexdigest(),'sourceSha256':hashlib.sha256((r.GEN/f'http-{n}.ts').read_bytes()).hexdigest()} for n in ['all','light','worker']+r.RESIDENT}
  lines+=['','| Topology | Processes | Idle summed RSS MiB | Initialized summed RSS MiB | All listeners ready ms | Initialize all routes ms |','| --- | ---: | ---: | ---: | ---: | ---: |']
  for mode in ['separate','light','all','worker']:
   rows=[x for x in top['rows'] if x['mode']==mode]
   lines.append(f'| {mode} | {len(rows[0]["pids"])} | {fmt([sum(p["rss"] for p in x["idle"]) for x in rows],2,1048576)} | {fmt([sum(p["rss"] for p in x["initialized"]) for x in rows],2,1048576)} | {fmt([x["readyMs"] for x in rows],2)} | {fmt([x["initMs"] for x in rows],2)} |')
  lines+=['','| Topology | hello idle p50 / p99 ms | hello with Markdown C=1 p50 / p99 ms | hello with gzip C=1 p50 / p99 ms |','| --- | ---: | ---: | ---: |']
  for mode in ['separate','light','all','worker']:
   rows=[x for x in top['rows'] if x['mode']==mode];cells=[]
   for heavy in ['idle','markdown','gzip-export']:
    cells.append(' / '.join(fmt([x['hol'][heavy]['windows'][0][q] for x in rows]) for q in ['p50','p99']))
   lines.append('| '+mode+' | '+' | '.join(cells)+' |')
  responses=[x['responses'] for x in top['rows']]
  evidence['topologyParity']=all(x==responses[0] for x in responses)
  assert evidence['topologyParity']
  lines+=['',f'Topology full-body initialization parity: {evidence["topologyParity"]}.']
 (p.ROOT/'examples/probe/perf/round3-results.json').write_text(json.dumps(evidence,indent=2)+'\n')
 (p.OUT/'tables.md').write_text('\n'.join(lines)+'\n');print('\n'.join(lines))
if __name__=='__main__':main()
