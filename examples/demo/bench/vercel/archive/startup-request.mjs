// Diagnostic hello-only Function (the cold harness requires a shared memory
// route, deliberately absent here). One untouched request + 20 warm requests.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { Sandbox } from '@vercel/sandbox';
const url = process.argv[2];
const parsed = new URL(url);
assert.equal(parsed.protocol, 'https:');
assert(parsed.hostname.endsWith('.vercel.app'));
const info = JSON.parse(execFileSync('vercel', ['inspect', url, '--json'], { encoding: 'utf8' }));
assert.notEqual(info.target, 'production');
assert.equal(info.name, 'next-scriptc');
async function run() {
  const https = await import('node:https');
  const { writeFile } = await import('node:fs/promises');
  const url = process.env.DIAGNOSTIC_URL;
  const request = agent => new Promise((resolve, reject) => {
    const start = performance.now(), startedAt = Date.now();
    const req = https.request(new URL('/api/hello', url), { agent, headers: { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET, 'accept-encoding': 'identity' } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ startedAt, finishedAt: Date.now(), ms: performance.now()-start, status: res.statusCode, body: Buffer.concat(chunks).toString(), requestId: res.headers['x-vercel-id'], cache: res.headers['x-vercel-cache'] }));
      res.on('error', reject);
    });
    req.setTimeout(15_000, () => req.destroy(new Error('Timeout')));
    req.on('error', reject); req.end();
  });
  const firstAgent = new https.Agent({ keepAlive: true });
  let first;
  try { first = await request(firstAgent); } finally { firstAgent.destroy(); }
  const agent = new https.Agent({ keepAlive: true });
  const warm = [];
  try { for (let i=0; i<20; i++) warm.push(await request(agent)); } finally { agent.destroy(); }
  await writeFile('result.json', JSON.stringify({ first, warm, requestsIssued: 21 }));
}
const data = { url, deployment: info, diagnostic: true, startedAt: new Date().toISOString() };
const started = Date.now();
let sandbox;
try {
  sandbox = await Sandbox.create({ image: 'vercel/sandbox/node:24', region: 'iad1', resources: { vcpus: 1 }, timeout: 90_000, persistent: false });
  data.sandbox = { id: sandbox.name, region: sandbox.region, vcpus: sandbox.vcpus };
  await sandbox.writeFiles([{ path: 'run.mjs', content: Buffer.from(`await (${run.toString()})();`) }]);
  const command = await sandbox.runCommand({ cmd: 'timeout', args: ['60s', 'node', 'run.mjs'], env: { DIAGNOSTIC_URL: url, VERCEL_AUTOMATION_BYPASS_SECRET: process.env.VERCEL_AUTOMATION_BYPASS_SECRET }, stdout: process.stdout, stderr: process.stderr });
  assert.equal(command.exitCode, 0);
  Object.assign(data, JSON.parse((await sandbox.readFileToBuffer({ path: 'result.json' })).toString()));
  assert.equal(data.first.status, 200);
  data.status = 'complete';
} catch (error) { data.status = 'failed'; data.error = error.stack; process.exitCode = 1; }
finally {
  if (sandbox) { const stopped = await sandbox.stop(); data.sandbox.activeCpuDurationMs = stopped.activeCpuDurationMs ?? null; data.sandbox.provisionedVcpuHours = (Date.now()-started)/3_600_000; }
  await writeFile('research/benchmarks/vercel-round2-diagnostic-isolated.json', JSON.stringify(data, null, 2)+'\n');
  console.log(JSON.stringify({ status: data.status, first: data.first, sandbox: data.sandbox }));
}
