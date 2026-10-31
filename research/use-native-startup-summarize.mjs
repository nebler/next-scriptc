import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
const directory = process.env.STARTUP_OUTPUT ?? 'research/use-native-startup';
const rows = [];
for(const file of (await readdir(directory)).filter(f => /^(before|after)-(native|node)-\d\.json$/.test(f)).sort()) {
  const raw = JSON.parse(await readFile(`${directory}/${file}`,'utf8'));
  const events = [];
  for(const line of (await readFile(`${directory}/${raw.label}-logs.jsonl`,'utf8')).split('\n').filter(Boolean)) {
    const record = JSON.parse(line);
    for(const message of (record.data?.message ?? '').split('\n')) if(message.startsWith('scriptc-startup ')) events.push(JSON.parse(message.slice(16)));
  }
  const first = name => events.filter(e => e.event === name).sort((a,b)=>(a.uptimeMs ?? a.nativeMs ?? 0)-(b.uptimeMs ?? b.nativeMs ?? 0))[0];
  const spawn = first('spawn'), listening = first('listening'), observed = first('observed-ready'), handler = first('handler-start');
  const fixture = events.filter(e=>e.event === 'fixtures').sort((a,b)=>a.uptimeMs-b.uptimeMs);
  const row = {label:raw.label,url:raw.url,id:raw.id,status:raw.status,functions:raw.functions.length,first:raw.first.samples[0],
    launcherNodeUptimeMs:first('launcher-module')?.uptimeMs,spawnNodeUptimeMs:spawn?.uptimeMs,handlerNodeUptimeMs:handler?.uptimeMs,
    nativeFixtureMs:raw.label.includes('before-native') ? fixture[0]?.durationMs : undefined,
    nodeEagerFixtureMs:fixture.length ? fixture.at(-1).durationMs : undefined,
    lazyFixtureMs:first('fixture')?.durationMs,modulesReadyNativeMs:first('modules-ready')?.nativeMs,
    listeningNativeMs:listening?.nativeMs,spawnToListeningMs:spawn && listening ? listening.monoMs-spawn.monoMs : undefined,
    observedReadyMs:observed?.elapsedMs,observationDelayMs:observed && listening ? observed.monoMs-listening.monoMs : undefined,
    readyBeforeHandler:observed && handler ? observed.monoMs<handler.monoMs : undefined,
    observationNodeCpuMs:observed && spawn ? (observed.cpu.user+observed.cpu.system-spawn.cpu.user-spawn.cpu.system)/1000 : undefined};
  if(raw.status === 'complete') {
    for(const sample of [...raw.first.samples,...raw.warm.samples]) {assert(sample.valid);assert.equal(sample.resultSha256,'58e99230368693d8899627a9c334b197a66005e8504ac2874e55fb6596ef720c');}
    assert.equal(new Set([...raw.first.samples,...raw.warm.samples].map(s=>s.targetInstance)).size,1);
  }
  rows.push(row);
}
const summary = {protocol:{freshSuccessfulPreviewsPerVariant:2,firstRequestsPerPreview:1,subsequentRequestsPerPreview:3,retries:0,region:'iad1',client:'E3 existing near-client',events:5000},successfulSamples:rows.filter(r=>r.status==='complete').length*4,failedSamples:rows.filter(r=>r.status==='failed').length,rows};
await writeFile(`${directory}/summary.json`,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
