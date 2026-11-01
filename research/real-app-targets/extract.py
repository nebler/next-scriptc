"""Extraction recipes used in this investigation.
Requires the pinned sparse checkouts from manifest.json at .checks/real-app-targets/{repo}.
Run from the repository root. This overwrites slices; raw evidence is untouched.
The standalone analytics.ts measurement facade is retained separately.
"""
from pathlib import Path
import json,subprocess
base=Path('.checks/real-app-targets'); out=Path('research/real-app-targets'); manifest={}
def put(repo,source,dest,change=None):
 p=base/repo/source; s=p.read_text(); s=change(s) if change else s
 d=out/repo/dest; d.parent.mkdir(parents=True,exist_ok=True); d.write_text(s)
 manifest.setdefault(repo,{'commit':subprocess.check_output(['git','-C',str(base/repo),'rev-parse','HEAD'],text=True).strip(),'files':[]})['files'].append({'source':source,'slice':dest,'changed':change is not None})
put('papermark','lib/video-analytics/playback.ts','entry.ts')
put('dub','apps/web/lib/analytics/utils/convert-to-csv.ts','entry.ts')
put('twenty','packages/twenty-server/src/engine/api/graphql/workspace-query-runner/utils/parse-result.util.ts','entry.ts',lambda s:s.replace("'src/engine/api/graphql/workspace-query-builder/utils/composite-field-metadata.util'","'./composite.ts'"))
put('twenty','packages/twenty-server/src/engine/api/graphql/workspace-query-builder/utils/composite-field-metadata.util.ts','composite.ts')
# Reachable flattenJSON core only: remove unrelated functions and imports; constants copied verbatim below.
s=(base/'umami/src/lib/constants.ts').read_text(); print(s[s.index('export const DATA_TYPE'):s.index('export const DATA_TYPE')+500])
put('umami','src/lib/data.ts','entry.ts',lambda s: s[s.index('export interface KeyValueData'):s.index('export function getStringValue')]+s[s.index('export function createKeyValue'):s.index('export function objectToArray')])
put('cal','packages/features/schedules/lib/date-ranges.ts','entry.ts',lambda s:'import dayjs from "dayjs";\nimport type { Dayjs } from "dayjs";\nexport type DateRange = { start: Dayjs; end: Dayjs };\n'+s[s.index('export function intersect'):s.index('type SubtractedRange')])
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')

from pathlib import Path
import json,subprocess
b=Path('.checks/real-app-targets'); o=Path('research/real-app-targets')
p=o/'umami/entry.ts'; s=p.read_text(); c=(b/'umami/src/lib/constants.ts').read_text(); s=c[c.index('export const DATA_TYPE'):c.index('export const OPERATORS')]+c[c.index('export const DATETIME_REGEX'):c.index('export const FIELD_LENGTH')]+"type DynamicDataType = 1 | 2 | 3 | 4 | 5;\n"+s; p.write_text(s)
s=(b/'formbricks/apps/web/lib/response/utils.ts').read_text(); start=s.index('export const calculateTtcTotal'); end=s.index('export const getResponsesFileName'); d=o/'formbricks'; d.mkdir(exist_ok=True); (d/'entry.ts').write_text('type TResponseTtc = Record<string, number>;\n'+s[start:end])
m=json.loads((o/'manifest.json').read_text()); m['formbricks']={'commit':subprocess.check_output(['git','-C',str(b/'formbricks'),'rev-parse','HEAD'],text=True).strip(),'files':[{'source':'apps/web/lib/response/utils.ts','slice':'entry.ts','changed':True}]}; (o/'manifest.json').write_text(json.dumps(m,indent=2)+'\n')
drivers={
'papermark':'''import { documentViewDistribution, watchTimeSeconds, viewPlaybackTimeline } from './entry.ts';
const e = [{view_id:'a',event_type:'played',start_time:0,end_time:60}];
console.log(JSON.stringify(documentViewDistribution(e,60)));
console.log(JSON.stringify(watchTimeSeconds(e)));
console.log(JSON.stringify(viewPlaybackTimeline(e,60)));''',
'dub':"import { convertToCSV } from './entry.ts';\nconsole.log(convertToCSV([{a:1,b:'hello'}]));",
'cal':"import dayjs from 'dayjs';\nimport { intersect } from './entry.ts';\nconsole.log(JSON.stringify(intersect([[{start:dayjs('2026-01-01'),end:dayjs('2026-01-02')}],[{start:dayjs('2026-01-01'),end:dayjs('2026-01-03')}]])));",
'umami':"import { flattenJSON } from './entry.ts';\nconsole.log(JSON.stringify(flattenJSON({a:{b:1},c:[2,3]})));",
'twenty':"import { parseResult } from './entry.ts';\nconsole.log(JSON.stringify(parseResult([{__typename:'__Person',COMPOSITE___name_firstName:'Alice'}])));",
'formbricks':"import { calculateTtcTotal } from './entry.ts';\nconsole.log(JSON.stringify(calculateTtcTotal({q1:2,q2:3})));"}
for n,s in drivers.items():
 (o/n/'probe.ts').write_text(s+'\n')
(o/'tsconfig.json').write_text(json.dumps({'compilerOptions':{'target':'ES2022','module':'NodeNext','moduleResolution':'NodeNext','strict':False,'esModuleInterop':True,'allowImportingTsExtensions':True,'noEmit':True,'skipLibCheck':True}},indent=2)+'\n')
