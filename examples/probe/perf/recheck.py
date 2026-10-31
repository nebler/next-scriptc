import run as p,json,time
results={}
try:
 for rep in range(3):
  for name in ['markdown','search','verify','primes','login-scrypt','report']:
   row=results.setdefault(name,[])
   for mode in (['node','release','speed'] if rep%2==0 else ['speed','release','node']):
    env={**p.ENV,'PERF_REPS':'1'}
    if name=='markdown':env.update(PERF_WARM='20',PERF_COUNT='60')
    elif name=='search':env.update(PERF_WARM='100',PERF_COUNT='400')
    elif name=='report':env.update(PERF_WARM='1',PERF_COUNT='2')
    command=[p.NODE,str(p.ROOT/'examples/probe/perf'/f'{name}.ts')] if mode=='node' else [str(p.OUT/f'{name}-{mode}')]
    r=p.run(command,f'recheck-{name}-{mode}-{rep}',180,env)
    row.append({'rep':rep,'mode':mode,'load':__import__('os').getloadavg(),'run':r})
    print('recheck',name,mode,rep,[x['ms']/x['count'] for x in p.data(r) if x['kind']=='time'],flush=True)
    (p.OUT/'recheck.json').write_text(json.dumps(results,indent=2))
finally:p.cleanup()
