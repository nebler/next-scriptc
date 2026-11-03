import json,gzip,pathlib
base=pathlib.Path(__file__).parent
raw=base/'results.json'
d=json.loads(raw.read_text() if raw.exists() else gzip.decompress((base/'results.json.gz').read_bytes()))
rows=d['rows']
def get(name,mode,n):return next(r['medians'] for r in rows if (r['name'],r['mode'],r['n'])==(name,mode,n))
lines=['All values are median milliseconds. “Before” and “after” use explicit construction preflights. E1 forces catches in both modes and has identical generated entry source, so its differences are host variation, not an implementation effect.','', '| Fixture | Records | Decode before | Decode after | Total wall before | Total wall after | Total CPU before | Total CPU after | JS CPU after |','| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
for name in ['guarded','e1','event','plain','union']:
 for n in [600,6000,60000]:
  a,b=get(name,'before',n),get(name,'after',n)
  vals=[a['nativeDecode'],b['nativeDecode'],a['total'],b['total'],a['totalCPU'],b['totalCPU'],b['jsCPU']]
  lines.append(f'| {name} | {n} | '+' | '.join(f'{v:.3f}' for v in vals)+' |')
lines+=['','Guarded native decode falls by '+', '.join(f"{100*(1-get('guarded','after',n)['nativeDecode']/get('guarded','before',n)['nativeDecode']):.1f}% at {n:,}" for n in [600,6000,60000])+'. The guarded 60k total falls by 23.7% in these sequential windows. Host `parseInputs` validation remains and costs about 20.5 ms after the change; this work removes the extra native parse, not that JS validation.','', 'All 18 trained buckets finish `js-final`, each with 26 verified shadows, zero mismatches, and zero native fallbacks. The optimization does not establish a promotion win. Default guarded-string decode is 27.220 ms at 60k, versus 27.296 ms with the new explicit preflight; default avoids the host parse preflight and has 37.854 ms total wall.','', 'The first measurement attempt failed while evaluating an ESM export as a function body. The next stopped before E1 timing because the identity oracle used the lowered native closure. A later guarded fuzz check incorrectly discarded fallback markers from timing wrappers. The corrected driver retains fallback markers, uses the original E1 JS source, and resumes only unrecorded cells. No retained cell is rerun or selected by its speed.']
ratio=get('guarded','after',60000)['nativeDecode']/get('guarded','before',60000)['nativeDecode']
est=f'''PM2's published 60k stage medians sum to 195.621 ms: 126.489 encode + 1.633 copy + 26.964 decode + 36.318 compute + 4.105 native encode + 0.010 copy back + 0.102 JS decode. This is a sum of wall-stage medians, not measured total CPU.

For the default adapter path, E4 removes no separate preflight. The conservative updated estimate therefore remains 26.964 ms decode and 195.621 ms stage sum, with no predicted lane change. PM2 published a 1.72 paired native/JS CPU ratio and zero winning votes at 60k.

As a conditional sensitivity estimate only, if *all* PM2 decode behaved like this explicit guarded-string fixture, multiplying decode by {ratio:.4f} gives {26.964*ratio:.3f} ms and a {195.621-26.964+26.964*ratio:.3f} ms stage sum, a {(26.964*(1-ratio)/195.621)*100:.2f}% reduction. That affected fraction is unverified, and the actual default path supports a fraction of zero for this duplicate-guard optimization. Even deleting the full published decode stage gives a 168.657 ms stage sum, only 13.78% lower. None of these arithmetic substitutions establishes a CPU ratio, a dispatcher decision, or a hosted saving.'''
p=base.parent/'boundary-decode-path.md'
s=p.read_text().replace('MEASUREMENTS','\n'.join(lines)).replace('ESTIMATE',est).replace('TESTS','Next `pnpm test`: 102 passed. scriptc-promote `pnpm test`: 64 passed, two existing skips. Targeted decode tests: five passed. The measurement driver additionally runs 128 T1 cases for each of 15 fixture/mode combinations, with all differential checks passing; native fallback remains an accepted result. Logs and individual fuzz counts are adjacent to this report.')
p.write_text(s)
summary={k:v for k,v in d.items() if k not in ['rows','ir']};summary['rows']=[{k:v for k,v in r.items() if k!='samples'} for r in rows];summary['lanes']=[{'name':r['name'],'mode':r['mode'],'n':r['n'],'buckets':[{'state':b['state'],'verified':b['verified'],'mismatches':b['mismatches'],'nativeFallbacks':b['nativeFallbacks']} for s in r['state'].values() for b in s['buckets']]} for r in d['lanes']]
(base/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
(base/'results.json.gz').write_bytes(gzip.compress(json.dumps(d).encode(),mtime=0));raw.unlink(missing_ok=True)
