import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {stats,save} from './common.mjs';
const read=async name=>JSON.parse(await readFile(import.meta.dirname+'/raw/'+name+'.json'));
const measure=await read('measure'),boundary=await read('boundary'),cold=await read('cold');
for(const c of measure.cases)for(const m of Object.values(c.modes)){
 assert.equal(m.samples.length,300);assert.equal(m.warmup.length,50);
 for(const s of [...m.samples,...m.warmup])assert.equal(s.sha256,c.expectedSha256);
}
for(const c of boundary.cases)for(const mode of ['sync','async','serialSync','serialAsync']){assert.equal(c[mode].samples.length,20000);assert.equal(c[mode].warmup.length,1000);}
const summary={warm:measure.cases.map(c=>({size:c.size,modes:Object.fromEntries(Object.entries(c.modes).map(([k,v])=>[k,v.wallMs]))})),boundary:boundary.cases.map(c=>({bytes:c.inputBytes,modes:Object.fromEntries(['sync','async','serialSync','serialAsync'].map(k=>[k,c[k].wallMs]))})),cold:cold.cases.map(c=>({mode:c.mode,size:c.size,...c.summary}))};
try{const soak=await read('soak-serialized');assert.ok([2,4].includes(soak.phases.length));for(const p of soak.phases)assert.equal(p.verified,p.count);assert.equal(soak.mixed.calls,2000);summary.soak=soak.phases.map(p=>({mode:p.mode,size:p.size,verified:p.verified,elapsedMs:p.elapsedMs,startRss:p.rss[0].rss,endRss:p.rss.at(-1).rss,range:p.rssBytes}));summary.mixed=soak.mixed.calls;}catch(e){if(e.code!=='ENOENT')throw e;}
await save('summary',summary);
let text='| Events | Plain Node | Sidecar | TLS sync | TLS async | Serialized sync | Serialized async |\n| ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n';
for(const c of summary.warm)text+='| '+c.size+' | '+['node','sidecar','sync','async','serialSync','serialAsync'].map(k=>`${c.modes[k].median.toFixed(3)} / ${c.modes[k].p95.toFixed(3)}`).join(' | ')+' |\n';
await writeFile(import.meta.dirname+'/raw/table.md',text);console.log(text);
