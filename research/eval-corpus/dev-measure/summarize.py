#!/usr/bin/env python3
import pathlib,json,gzip,statistics,collections,re
R=pathlib.Path.cwd();D=R/'research/eval-corpus/dev-measure';rows=[];repos=[]
def read(p):return json.loads(gzip.decompress(p.read_bytes()) if p.suffix=='.gz' else p.read_bytes())
def stored(p):return p if p.exists() else p.with_name(p.name+'.gz')
for p in sorted((D/'results').glob('*.json*')):
 d=read(p);measurements={};seen={}
 supp=stored(D/'supplements'/(p.name.split('.json')[0]+'.json'));extras=read(supp).get('scans',[]) if supp.exists() and not d.get('finalFixtureRefresh') else []
 valid=stored(D/'supplements/valid-inputs'/(p.name.split('.json')[0]+'.json'));extras+=read(valid).get('scans',[]) if valid.exists() else []
 wallfile=D/'wall'/p.name;wallfile=wallfile if wallfile.exists() else wallfile.with_name(wallfile.name.replace('.json.gz','.json') if wallfile.name.endswith('.gz') else wallfile.name+'.gz')
 wallrows={}
 wallExtras=read(valid).get('wallScans',[]) if valid.exists() else []
 if wallfile.exists():
  for scan in [*read(wallfile).get('scans',[]),*wallExtras]:
   if scan in wallExtras:
    for m in scan.get('report',{}).get('measurements',[]):wallrows.pop(str(pathlib.Path(scan['scanRoot'])/m['id']),None)
   for m in scan.get('report',{}).get('measurements',[]):wallrows.setdefault(str(pathlib.Path(scan['scanRoot'])/m['id']),[]).append(m)
 for s in [*d.get('scans',[]),*extras]:
  if s in extras:
   for m in s.get('report',{}).get('measurements',[]):measurements.pop(str(pathlib.Path(s['scanRoot'])/m['id']),None)
  for m in s.get('report',{}).get('measurements',[]):measurements.setdefault(str(pathlib.Path(s['scanRoot'])/m['id']),[]).append(m)
  for f in s.get('report',{}).get('files',[]):
   for fn in f['functions']:seen[str(pathlib.Path(s['scanRoot'])/fn['id'])]=fn
 # Recover denominator even for installation/disk failures.
 b=R/'research/eval-corpus/dev-census-b1'/p.name;b=b if b.exists() else b.with_name(b.name.replace('.json.gz','.json') if b.name.endswith('.gz') else b.name+'.gz')
 base=read(b) if b.exists() else {}
 cohort={str(pathlib.Path(s['scanRoot'])/fn['id']):fn for s in base.get('scans',[]) for f in s.get('report',{}).get('files',[]) for fn in f['functions'] if fn['status']=='accepted'}
 rr=[]
 for id,fn in cohort.items():
  ms=measurements.get(id,[]);ok=[m for m in ms if m['status']=='ok'];compiled=bool(ok or any(m.get('compileStatus')=='compiled' for m in ms));refused=any(m['status']=='compile-rejected' for m in ms)
  row={'repository':d['repository'],'sha':d['sha'],'id':id,'compileStatus':'compiled' if compiled else 'compiler refusal' if refused else 'unknown','discoveryNow':seen.get(id,{}).get('status','unknown'),'measurements':ms,'endpointCpuDelta':None}
  row['b1RouteEntries']=[route['entry'] for scan in base.get('scans',[]) for route in scan.get('report',{}).get('routes',[]) if id in [str(pathlib.Path(scan['scanRoot'])/v) for v in route.get('reachable',[])]]
  row['intensityCases']=wallrows.get(id,[]);
  if valid.exists() and any(str(pathlib.Path(scan['scanRoot'])/m['id'])==id for scan in read(valid).get('scans',[]) for m in scan.get('report',{}).get('measurements',[])):
   allowed={json.dumps(m['arguments']) for m in ms if 'arguments' in m};row['excludedEarlierInputCases']=sum('arguments' in w and json.dumps(w['arguments']) not in allowed for w in row['intensityCases']);row['intensityCases']=[w for w in row['intensityCases'] if 'arguments' not in w or json.dumps(w['arguments']) in allowed]
  validwall=[m for m in row['intensityCases'] if m['status']=='js-baseline'];row['screenPass']=any(m['screenPass'] for m in validwall) if validwall else None;
  for m in ok:
   match=next((w for w in validwall if json.dumps(w['arguments'])==json.dumps(m['arguments'])),None)
   if match:m['intensityBaseline']={k:v for k,v in match.items() if k not in ['arguments','rawBatches']};m['screenPass']=match['screenPass']
  row['predictedNative']=any(m.get('verdict')=='native' for m in ok);row['protocolPass']=any(m.get('protocolPass') for m in ok)
  # Build logs include other modules in the same batch. Attribute only this
  # function's diagnostic section; retain the complete verbatim log above.
  sections=[]
  for m in ms:
   if m['status']!='compile-rejected':continue
   for chunk in re.split(r'(?=\[next-scriptc\] not a candidate )',m.get('reason','')):
    if chunk.startswith('[next-scriptc] not a candidate '+id.split('#')[-1]+':'):sections.append(chunk.split('[scriptc-promote] Promoted')[0])
  row['compilerCodes']=sorted(set(re.findall(r'\bSC\d+\b','\n'.join(sections))))
  row['correctnessFailures']=[m.get('reason') for m in ms if ('mismatch' in m.get('reason','').lower() or 'SC4013' in m.get('reason','') or 'Native fallback' in m.get('reason','')) and 'argument count' not in m.get('reason','').lower()]
  row['protocolPass']=row['protocolPass'] and not row['correctnessFailures']
  row['bestRatio']=min((m['native']['median']/m['js']['median'] for m in ok),default=None);rr.append(row);rows.append(row)
 repos.append({'repository':d['repository'],'status':d['status'],'installExit':d.get('install',{}).get('exit'),'freeBytesBeforeInstall':d.get('freeBytesBeforeInstall'),'accepted':len(rr),'compiled':sum(r['compileStatus']=='compiled' for r in rr),'screenPass':sum(r['screenPass'] is True for r in rr),'predictedNative':sum(r['predictedNative'] for r in rr)})
ratios=[m['native']['median']/m['js']['median'] for r in rows for m in r['measurements'] if m['status']=='ok'];ratios.sort();q=lambda p:ratios[min(len(ratios)-1,int(len(ratios)*p))] if ratios else None
summary={'accepted':len(rows),'compiled':sum(r['compileStatus']=='compiled' for r in rows),'compilerRefused':sum(r['compileStatus']=='compiler refusal' for r in rows),'unknownCompile':sum(r['compileStatus']=='unknown' for r in rows),'screenPass':sum(r['screenPass'] is True for r in rows),'predictedNative':sum(r['predictedNative'] for r in rows),'protocolPass':sum(r['protocolPass'] for r in rows),'jsMeasuredFunctions':sum(any(m.get('js') for m in r['measurements']) or any(m['status']=='js-baseline' for m in r['intensityCases']) for r in rows),'nativeMeasuredFunctions':sum(any(m['status']=='ok' for m in r['measurements']) for r in rows),'unknownScreen':sum(r['screenPass'] is None for r in rows),'ratioDistribution':{'cases':len(ratios),'min':q(0),'p10':q(.1),'median':q(.5),'p90':q(.9),'max':q(1)},'repositories':repos,'top10':sorted(({'repository':r['repository'],'id':r['id'],'bestRatio':r['bestRatio'],'screenPass':r['screenPass'],'predictedNative':r['predictedNative']} for r in rows if r['bestRatio'] is not None),key=lambda r:r['bestRatio'])[:10]}
(D/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');(D/'functions.json').write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps({k:v for k,v in summary.items() if k not in ['repositories','top10']},indent=2))
