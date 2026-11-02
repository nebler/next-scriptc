// Run only after builds/tests finish. wrangler dev --local must be listening.
import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { revenueEventsJson } from '../../examples/demo/app/api/analytics/revenue/events.ts';
const pids = process.argv.slice(2).map(Number);
const pid = pids[0];
if (pids.length !== 2 || pids.some(pid => !Number.isInteger(pid) || pid < 1)) throw Error('Pass both local workerd PIDs, front and application (not wrangler PID)');
const readCPU = pid => {
  const r = spawnSync('python3', ['research/wasm-workerd/cpu.py', String(pid)], { encoding: 'utf8' });
  if (r.status) throw Error(r.stderr);
  return JSON.parse(r.stdout);
};
const cpu = () => { const processes = pids.map(pid => ({pid, ...readCPU(pid)})); return { processes, user_ns: processes.reduce((n,p) => n+p.user_ns,0), system_ns: processes.reduce((n,p) => n+p.system_ns,0) }; };
const hash = text => createHash('sha256').update(text).digest('hex');
const records = { date: new Date().toISOString(), node: process.version, pids, warmups: 40, batches: 6, requestsPerBatch: 20, cases: [] };
for (const size of [0, 5000, 15000]) {
  const input = JSON.stringify(['2026-01-01', '2026-01-31', revenueEventsJson(size)]);
  let expected;
  const samples = [];
  async function request(lane) {
    const start = performance.now();
    const response = await fetch(`http://127.0.0.1:18995/api/cf1?lane=${lane}`, { method: 'POST', body: input });
    const text = await response.text(), wallMs = performance.now() - start;
    if (!response.ok) throw Error(text);
    expected ??= hash(text);
    if (hash(text) !== expected) throw Error('Response bytes differ');
    return { wallMs, sha256: hash(text), responseBytes: Buffer.byteLength(text) };
  }
  for (let i = 0; i < 40; i++) for (const lane of ['js', 'wasm']) await request(lane);
  for (let batch = 0; batch < 6; batch++) for (const lane of batch % 2 ? ['wasm', 'js'] : ['js', 'wasm']) {
    const before = cpu();
    const responses = [];
    for (let i = 0; i < 20; i++) responses.push(await request(lane));
    const after = cpu();
    samples.push({ batch, lane, before, after, cpuMsPerRequest: ((after.user_ns - before.user_ns) + (after.system_ns - before.system_ns)) / 1e6 / 20, responses });
  }
  records.cases.push({ size, inputBytes: Buffer.byteLength(input), sha256: expected, samples, meta: await (await fetch('http://127.0.0.1:18995/api/cf1')).json() });
  console.log(size, 'done');
}
records.timerProbes = [];
for (let i = 0; i < 5; i++) records.timerProbes.push(await (await fetch('http://127.0.0.1:18995/api/cf1')).json());
await writeFile('research/cloudflare-provider/raw/measurement.json', JSON.stringify(records, null, 2));
