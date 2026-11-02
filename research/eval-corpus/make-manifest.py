#!/usr/bin/env python3
"""Regenerate metadata and rankings from retained inspections and measurements."""
import json,pathlib,re,subprocess
base=pathlib.Path(__file__).parent
notes={
'CrateBytes':'Small SvelteKit/Express analytics app; no numeric syntax hotspot found. This is a syntax screen, not a profile.',
'OopsBudgeter':'Small Next budgeting app; no numeric syntax hotspot found. No dense server kernel demonstrated.',
'evidence':'SvelteKit analytics/reporting. SQL connectors and build/report transforms are not demonstrated synchronous numeric request kernels.',
'umami':'Analytics aggregation is SQL. Accepted path/color/string helpers are controls, not demonstrated dense kernels.',
'rybbit':'Experiment beta statistics are dense but the observed callers are client UI. Server analytics use database queries. No server use of this kernel was established.',
'openpanel':'Source scan includes API, public app, and seed tooling. High loop scores include replay bundles and seeds. Wide census timed out; no heavy promotable server core demonstrated.',
'posthog':'Incomplete checkout from an interrupted clone. Metadata-only failure; do not count as inspected source or as zero coverage.',
'growthbook':'MIT stats-ts contains numerical split search. Observed server import is enterprise contextual-bandit service. Mutation, strict closure and mutable quadrature-cache proofs block the numeric kernels.',
'actual':'Forecast solver is pure synchronous numeric array processing but cheap at 12–120 months. Loot-core server is also used in the local application runtime; Node HTTP request use was not established. Monte Carlo simulation is desktop-client code.',
'ghostfolio':'Portfolio calculator is server-side class code with big.js arithmetic and date helpers. Class methods and dependency/type boundaries prevent install-and-go numeric promotion in this scan.',
'cal.com':'AvailableSlotsService is async/class-based. processWorkingHours loops over days using Dayjs, Date, Map and mutation of a supplied results object, rather than a closed numeric JSON kernel.',
'midday':'Report query construction and asynchronous worker exports dominate the numeric-looking files. Queue-management loops are orchestration. Dense synchronous numeric request work not demonstrated.',
'maybe':'Rails server. Excluded non-Node control.',
'dashy':'Loop hints occur in Vue utility/config/calendar formatting. A dense Node request kernel was not demonstrated.',
'fider':'Go server. Excluded non-Node control.',
'platform':'Query/storage/backup loops are object and I/O orchestration. Whole-source scan is partial and is not proof of absence of a dense kernel.',
'nocodb':'Vendored Swagger/Redoc bundles dominate syntax scores. Formula/data services use class/object/dependency graphs. No measured dense server kernel in this baseline.',
'grist-core':'Node access-control/action summarization loops are object-heavy; formula execution also has a Python engine. No dense promotable JS function demonstrated.',
 'teable':'Computed-field repositories and dependency collectors have large loops but retain database/class state. Most syntax intensity is orchestration, not numeric compute.',
'unleash':'Metrics translation and toggle delta loops operate on objects. Census aborts on parsing; complete coverage is unknown.',
'infisical':'Certificate discovery and policy paths are class/async crypto orchestration; crypto primitives are library calls. Initial scope selection missed backend/src and is recorded as a census failure.',
'immich':'Image processing delegates to sharp/libvips, with async repository methods. ML is outside the JS kernel. Browser timeline loops are excluded.',
'excalidraw-room':'Socket relay server. Drawing geometry is not a demonstrated server compute path here.',
 'tldraw':'Geometry-heavy packages are predominantly editor code; sync is stateful. Custom license requires exclusion from the OSS denominator.',
'boardgame.io':'Game rule/reducer execution depends on state and user callbacks, with randomness/plugins. No closed pure JSON numeric request function established.',
'lila':'Scala server. Excluded non-Node control.',
'directus':'Service/filter/permission paths combine async database operations and objects. Source-available license excluded from OSS denominator.',
'n8n':'Node workflow execution is stateful/async. User code is not a pinned application kernel. Source-available license excluded from OSS denominator.',
'outline':'Document diff/search paths involve ProseMirror/model objects, classes and asynchronous storage. Dense numeric JSON work not demonstrated.',
'nextra':'Next documentation/search tooling. Build-time search indexing must not be counted as a request kernel.',
'AFFiNE':'Document/collaboration code combines CRDT state, classes and storage. Editor geometry is not server coverage.',
'linkwarden':'Archive/search work combines external tools, async storage and strings. No dense synchronous numeric route demonstrated.',
'homepage':'Dashboard server primarily aggregates upstream service data asynchronously.',
'web-check':'Network diagnostics use async I/O and native crypto/TLS dependencies. No numeric JS kernel demonstrated.'}
held={'rybbit','ghostfolio','cal.com','midday','teable','immich','tldraw','directus','outline','nextra','homepage','lila','platform','infisical','web-check','CrateBytes','OopsBudgeter'}
licenses={'growthbook':'MIT outside enterprise directories; enterprise license for observed contextual-bandit server caller','posthog':'Unknown: incomplete checkout','nocodb':'Source-available/custom; review pinned license','tldraw':'Custom tldraw license','directus':'BSL-1.1/custom terms; review pinned license','n8n':'Sustainable Use License and enterprise exceptions','infisical':'MIT with enterprise exceptions','grist-core':'Apache-2.0 with enterprise exceptions','cal.com':'AGPL-3.0 with commercial/enterprise exceptions'}
results=json.load(open(base/'intensity.json'));cases=json.load(open(base/'cases.json'));repos=[]
for p in sorted(base.glob('*-inspection.json')):
 d=json.load(open(p));name=d.get('repo','').split('/')[-1]
 if 'sha' not in d:continue
 census=json.load(open(base/(name+'-census.json')))
 status='failed' if census.get('error') else 'partial-error' if census.get('errors') else 'completed-source-only'
 if name=='posthog':status='incomplete-checkout'
 license=licenses.get(name) or next((x['license'] for x in d.get('packages',[]) if x['file']=='package.json' and x.get('license')),None) or next((x['declaration'] for x in d.get('licenses',[])), 'unverified')
 hints=[h for h in d.get('hotFiles',[]) if not re.search(r'(^scripts/|/scripts/|/public/|^docs/|/seed/|/mocks/|^tooling/)',h['file'])][:3]
 funcs=[dict(f,discovery='accepted-source-only',native=None,requestPath='not established by census',sourceUrl=d['url']+'/blob/'+d['sha']+'/'+f['file']+'#L'+str(f['line'])) for f in census.get('accepted',[])]
 for c in [x for x in cases if x['repo']==name]:
  source=pathlib.Path('/tmp/nsc-eval-targets')/name/c['file'];text=source.read_text();m=re.search(r'\bfunction\s+'+re.escape(c['name'])+r'\s*\(',text);line=text[:m.start()].count('\n')+1 if m else 1
  measured=[r for r in results['rows'] if r['repo']==name and r['name']==c['name']]
  funcs=[f for f in funcs if f['name']!=c['name']]
  blockers=({'rybbit':['strict closure: indexed sum possibly undefined; projections also use nonliteral default parameter'],'growthbook':['purity: argument mutation in split closures' if c['name'] in ['bestExhaustiveBinarySplit','approximateBinaryKMeans'] else 'strict closure: indexed arrays or construction proof'],'actual':['strict closure: indexed array element possibly undefined'],'umami':[]})[name]
  shape={'rybbit':'two {alpha,beta} posterior records, two {units,conversions} counts, or observed/weight number arrays, according to symbol','growthbook':'Float64Array[] categories, two variations, sufficient-statistic triples [n,sum,sumSquares]; BIC uses three number arrays and scalar penalty','actual':'starting balance number, monthly outflow number[], steady monthly rate number','umami':'one ASCII string'}[name]
  loop={'rybbit':'beta exact sum: O(min(alphaA,alphaB)) with repeated Lanczos logGamma; projections repeatedly call decisions; sample ratio: O(arms)','growthbook':'exact split: O(2^(categories-1) * variations), Gray code; approximate K-means: bounded iterations over categories; compact SSE/BIC: linear numeric scans','actual':'O(months), forward cumulative sum and reverse coverage scans','umami':'six-prefix some/startsWith or linear character hashing; string formatting output'}[name]
  funcs.append(dict(blockers=blockers,inputShape=shape,name=c['name'],file=c['file'],line=line,sourceUrl=d['url']+'/blob/'+d['sha']+'/'+c['file']+'#L'+str(line),discovery='accepted-source-only' if name=='umami' else 'blocked',sync=True,pure='yes for these inputs; proof rejects some closures',loopShape=loop,inputCases='cases.json',sizes=[x['size'] for x in c['inputs']],measurements=measured,requestPath={'rybbit':'client-only observed','growthbook':'enterprise server call path','actual':'local/server-shared; HTTP unproven','umami':'tiny control; API-key helper is request-relevant'}[name],dense=any(r.get('medianNs',0)>=100000 and r.get('nsPerInputByte',0)>=100 for r in measured),endpointCpuDelta=None))
 repos.append(dict(repository=d['repo'],url=d['url'],sha=d['sha'],license=license,licenseEvidence=[dict(x,url=d['url']+'/blob/'+d['sha']+'/'+x['file']) for x in d.get('licenses',[])],domain=d['domain'],framework=d['frameworkHypothesis'],split='HELD_OUT' if name in held else 'DEV',census=dict(status=status,artifact=name+'-census.json',scopes=census.get('scopes'),files=census.get('files'),acceptedCount=len(census.get('accepted',[])) if not census.get('error') and not census.get('errors') else None),findings=notes.get(name,'Source hints only; request path not established'),screenHints=hints,functions=funcs))
ranking=sorted([dict(repo=r['repository'],name=f['name'],maxNsPerByte=max((x.get('nsPerInputByte',0) for x in f['measurements']),default=0),dense=f['dense']) for r in repos for f in r['functions'] if 'measurements'in f],key=lambda x:-x['maxNsPerByte'])
out=dict(schemaVersion=1,splitFreezeCommit='e002d480caee9f8b2474fb0db273c877c3195e70',finalMeasurementMilestone='CORPUS_BASELINE_FINAL; external /tmp execution; no intervening optimization',baselineAdapterSha=json.load(open(base/'manifest.json'))['baselineAdapterSha'] if (base/'manifest.json').exists() else subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),freeze='Baseline source/intensity screen only. No optimization performed. App-level split frozen by the manifest commit before future tuning.',protocol='protocol.md',repositories=repos,ranking=ranking,preservedHeldOut=dict(repository='mfts/papermark',sha='ed19717ec02a1ac79aecf5569159aa9d2d869312',split='HELD_OUT',executed=False,protocol='../papermark-milestone-2.md'))
# Manifest stays small: raw samples remain in intensity.json.
for r in out['repositories']:
 for f in r['functions']:
  for m in f.get('measurements',[]):
   for key in ['samplesNs','cpuSamplesNs','result']:m.pop(key,None)
   if m.get('native'):
    m['native'].pop('samplesNs',None);m['native'].pop('cpuSamplesNs',None)
   if m.get('boundary'):m['boundary'].pop('stages',None)
json.dump(out,open(base/'manifest.json','w'),separators=(',',':'));print('repos',len(repos),'measured functions',len(ranking))
