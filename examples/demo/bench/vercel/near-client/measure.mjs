import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import https from 'node:https';
import { vectorFixture } from '../../heavy/fixtures.mjs';
const directory = process.env.NEAR_OUTPUT ?? 'research/vercel-near-client';
mkdirSync(directory, { recursive: true });
const load = file => JSON.parse(readFileSync(file));
const save = (name, value) => writeFileSync(`${directory}/${name}.json`, JSON.stringify(value) + '\n');
const configs = [];
for (let set = 1; set <= 3; set++) for (const kind of ['node', 'stock', 'patched']) {
  const d = load(`research/vector-vercel/${kind}-${set}.json`);
  configs.push({ group: 'vector', kind, set, id: d.id, url: d.url });
}
for (const kind of ['node', 'native']) {
  const d = load(`research/use-native-vercel/${kind}.json`);
  configs.push({ group: 'report', kind, id: d.id, url: d.url });
}
if (process.argv[2] === 'inspect') {
  const rows = [];
  for (const d of configs) {
    try {
      const info = JSON.parse(execFileSync('vercel', ['inspect', d.url, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
      assert.equal(info.id, d.id); assert.notEqual(info.target, 'production');
      const functions = new Map();
      for (const b of info.builds ?? []) for (const o of b.output ?? []) if (o.lambda) functions.set(o.lambda.functionName, { runtime: o.lambda.runtime, regions: o.lambda.deployedTo, memory: o.lambda.memorySize });
      rows.push({ ...d, checkedAt: new Date().toISOString(), state: info.readyState, target: info.target, functions: [...functions.values()] });
    } catch { rows.push({ ...d, state: 'unavailable' }); }
    save('targets', rows); console.log(JSON.stringify(rows.at(-1)));
  }
  process.exit(0);
}
const resume = process.argv[2] === 'finish-c4';
const correction = process.env.NEAR_CORRECTION ?? '2';
assert(/^[2-9]$/.test(correction));
assert(resume || process.argv[2] === 'run', 'Use inspect, run or finish-c4');
if (!resume) assert(!existsSync(`${directory}/run.json`), 'Refusing to overwrite measurement run');
const ready = load(`${directory}/targets.json`);
const chosen = (group, kind) => {
  const d = ready.find(d => d.group === group && d.kind === kind && (group !== 'vector' || d.set === 1));
  return d?.state === 'READY' ? d : undefined;
};
const reference = load('research/vector-vercel/reference.json');
const vector = [];
for (const [kind, id, path] of [
  ['patched', 'patched-natural', '/api/heavy/vectors'], ['stock', 'stock-imul', '/api/heavy/vectors-imul'],
  ['stock', 'stock-natural', '/api/heavy/vectors'], ['node', 'go-simd', '/api/heavy-go-simd/vectors?kernel=simd'],
  ['node', 'go-plain', '/api/heavy-go/vectors?kernel=plain'], ['node', 'node', '/api/heavy/vectors'],
]) { const d = chosen('vector', kind); if (d) vector.push({ id, url: d.url + path, kind: 'vector', body: vectorFixture().toString(), expected: reference.responseSha256 }); }
const old = load('research/use-native-vercel/measurements.json');
const reports = [5000, 200000].map(size => ['node', 'native'].flatMap(kind => {
  const d = chosen('report', kind); if (!d) return [];
  const expected = old.rows.find(r => r.mode === kind && r.size === size).samples[0].digest;
  return [{ id: `report-${kind}-${size}`, url: `${d.url}/reports?size=${size}`, kind: 'report', size, expected }];
}));
const secret = parseEnv(readFileSync(process.env.NEAR_ENV_FILE ?? '.env.local', 'utf8')).VERCEL_AUTOMATION_BYPASS_SECRET;
assert(secret, 'Missing private bypass');
const client = load(`${directory}/client-deployment.json`);
const agent = new https.Agent({ keepAlive: true, maxSockets: 1 });
const report = resume ? load(`${directory}/run.json`) : { startedAt: new Date().toISOString(), client: client.url, protocol: { selectedVectorSet: 1, warmups: 10, count: 60, concurrency: 1, batchCount: 20, c4Warmups: 4, c4Cap: 16, c4DurationMs: 2000, retries: 0 }, targets: [...vector, ...reports.flat()].map(({ body, ...t }) => t), batches: [], status: 'running' };
if (resume) {
  assert.equal(report.status, 'failed');
  assert(!report.batches.some(b => b.name.startsWith(`vector-c4-v${correction}-`)), 'Refusing duplicate corrected windows');
  report.clientRevisions = [...(report.clientRevisions ?? [load(`${directory}/client-deployment-v1.json`)]), client];
  report.instrumentationCorrection = 'Async-context correlation lost socket metadata in initial C=4. Original window retained; corrected explicit-ID correlation used only for new C=4 windows. C=1 unchanged.';
  report.status = 'running';
}
save('run', report);
async function invoke(name, spec) {
  const raw = await new Promise((resolve, reject) => {
    const data = JSON.stringify(spec);
    const req = https.request(`${client.url}/bench`, { method: 'POST', agent, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), 'x-vercel-protection-bypass': secret, 'x-bench-target-bypass': secret } }, res => {
      const chunks = []; res.on('data', x => chunks.push(x)); res.on('error', reject);
      res.on('end', () => {
        try { const out = JSON.parse(Buffer.concat(chunks)); resolve({ callerStatus: res.statusCode, callerVercelId: res.headers['x-vercel-id'], ...out }); }
        catch { reject(Error('Client response is not JSON')); }
      });
    });
    req.setTimeout(55000, () => req.destroy(Error('Client invocation timeout')));
    req.on('error', () => reject(Error('Client invocation transport failed'))); req.end(data);
  });
  save(name, raw); report.batches.push({ name, status: raw.status, count: raw.samples?.length }); save('run', report);
  assert.equal(raw.callerStatus, 200); assert.equal(raw.status, 'complete'); assert.equal(raw.region, 'iad1');
  console.log(JSON.stringify({ name, count: raw.samples.length, elapsedMs: raw.elapsedMs, cpu: raw.cpu, instance: raw.instance }));
}
try {
  if (!resume) for (const [group, targets] of [['vector', vector], ...reports.map((ts, i) => [`report-${[5000, 200000][i]}`, ts])]) {
    if (!targets.length) continue;
    // These are first-observed requests in this experiment, not deployment-first or proven cold.
    await invoke(`${group}-first`, { targets, warmups: 0, count: 1, concurrency: 1 });
    for (let batch = 0; batch < 3; batch++) await invoke(`${group}-c1-${batch + 1}`, { targets, warmups: batch === 0 ? 10 : 0, count: 20, concurrency: 1, rotation: batch * 20 });
  }
  for (const t of vector) await invoke(`vector-c4-${resume ? `v${correction}-` : ''}${t.id}`, { targets: [t], warmups: 4, count: 16, concurrency: 4, durationMs: 2000 });
  report.status = 'complete';
} catch { report.status = 'failed'; throw Error('Measurement failed; partial batches retained without retries'); }
finally { report.finishedAt = new Date().toISOString(); save('run', report); agent.destroy(); }
