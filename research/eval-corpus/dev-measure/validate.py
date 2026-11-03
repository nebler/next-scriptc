#!/usr/bin/env python3
"""Audit saved observations, immutable DEV cohort and frozen measurement gates."""
import pathlib,json,gzip,hashlib,collections,math
D=pathlib.Path(__file__).resolve().parent;R=D.parents[2]
def read(p):
 p=p if p.exists() else p.with_name(p.name+'.gz')
 return json.loads(gzip.decompress(p.read_bytes()) if p.suffix=='.gz' else p.read_bytes())
f=read(D/'functions.json');s=read(D/'summary.json');manifest=read(R/'research/eval-corpus/manifest.json')
pins={r['repository']:r['sha'] for r in manifest['repositories'] if r['split']=='DEV'}
cohort=set();native=[];wall=[];sources=collections.Counter();fingerprints=collections.Counter()
for p in sorted((D/'results').glob('*.json*')):
 d=read(p);assert d['repository'] in pins and d['sha']==pins[d['repository']]
 assert d['verifiedSha']==d['sha']
 if d.get('install'):assert d['install']['exit']==0 and d['freeBytesBeforeInstall']>=12_000_000_000
 b=read(R/'research/eval-corpus/dev-census-b1'/p.name.replace('.gz',''))
 for scan in b.get('scans',[]):
  for file in scan.get('report',{}).get('files',[]):
   for fn in file['functions']:
    if fn['status']=='accepted':cohort.add((d['repository'],str(pathlib.Path(scan['scanRoot'])/fn['id'])))
 for scan in d.get('scans',[]):
  assert scan['workerSha256']==hashlib.sha256((D/'worker.mjs').read_bytes()).hexdigest()
  assert scan['inputGeneratorSha256']==hashlib.sha256((D/'input-gen.mjs').read_bytes()).hexdigest()
  fingerprints[scan['workerSha256']]+=1
assert len(list((D/'results').glob('*.json*')))==17
assert cohort=={(r['repository'],r['id']) for r in f} and len(f)==251
for r in f:
 assert r['endpointCpuDelta'] is None and r['compileStatus']!='unknown'
 if r['compileStatus']=='compiler refusal':assert r['compilerCodes']
 assert not r['correctnessFailures']
 for m in r['measurements']:
  if m['status']!='ok':continue
  native.append(m);sources[m['inputSource']]+=1
  assert m['metric']=='process-cpu' and len(m['rawPairsNs'])==60
  assert all(a>0 and b>0 and math.isfinite(a+b) for a,b in m['rawPairsNs'])
  assert m['protocolCI']['resamples']==2000 and m['protocolCI']['block']==5 and m['protocolCI']['seed']==1
  assert m['cold']['firstNativeWallNs']>=0 and m['cold']['firstJsWallNs']>=0
  assert m['intensityBaseline']['screenPass']==m['screenPass']
  assert any(w.get('arguments')==m['arguments'] and w['status']=='js-baseline' for w in r['intensityCases'])
  predicted=sum(b/a<.9 for a,b in m['rawPairsNs'][:24])>=19
  assert predicted==(m['verdict']=='native')
  assert m['protocolPass']==(m['native']['median']/m['js']['median']<=.9 and m['protocolCI']['upper']<1)
  assert m['boundaryShare'] is None or 0<=m['boundaryShare']<=1
 for w in r['intensityCases']:
  if w['status']!='js-baseline':continue
  wall.append(w);assert len(w['rawBatches'])==21
  assert all(b['totalWallNs']>=2_000_000 or b['iterations']==10_000_000 for b in w['rawBatches'])
  assert w['screenPass']==(w['jsWall']['median']>=100_000 and w['jsWall']['median']/w['inputJsonBytes']>=100)
assert len(native)==s['ratioDistribution']['cases']==691
assert sum(r['compileStatus']=='compiled' for r in f)==240
assert not any(r['screenPass'] or r['predictedNative'] or r['protocolPass'] for r in f)
out={'status':'pass','accepted':len(f),'compiled':240,'compilerRefused':11,'nativeCases':len(native),'jsBaselineCases':len(wall),'unknownIntensity':[{'repository':r['repository'],'id':r['id'],'reason':[m.get('reason') for m in r['intensityCases']]} for r in f if r['screenPass'] is None],'inputSourceCases':dict(sources),'inputSourceFunctions':dict(collections.Counter(','.join(sorted({m['inputSource'] for m in r['measurements'] if m['status']=='ok'})) for r in f if r['compileStatus']=='compiled')),'nativeWorkerBatches':dict(fingerprints),'minimumFreeBeforeFinalInstall':min(r['freeBytesBeforeInstall'] for r in s['repositories'] if r['installExit'] is not None),'allNativeCasesHaveMatchingElapsedBaseline':True,'pairedPolicyRecomputed':True,'endpointCpuMeasured':False,'cliffAuditsTriggered':sum(m.get('cliffCheck') is not None for m in native),'checks':['exact pinned DEV cohort; no held-out','successful installs with disk floor','single frozen native worker and input generator','60 CPU pairs and bootstrap settings','21 elapsed batches at minimum duration or iteration cap','identical saved arguments across CPU and elapsed passes','native lane from first 24 pairs','no accepted correctness failures','unknowns remain null']}
(D/'validation.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:v for k,v in out.items() if k not in ['checks','unknownIntensity','nativeWorkerBatches']},indent=2))
