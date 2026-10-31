import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { channel } from 'node:diagnostics_channel';
import { createRequire } from 'node:module';
import http from 'node:http';
const { allowedHost, validateSpec, newObservation } = await import(pathToFileURL(process.argv[2]));
const good = 'next-scriptc-abc123-noahs-projects-8a075d15.vercel.app';
assert(allowedHost(good));
for (const host of ['evil.com', `${good}.evil.com`, 'next-scriptc-abc-other.vercel.app', 'next-scriptc--noahs-projects-8a075d15.vercel.app']) assert(!allowedHost(host));
const spec = { targets: [{ id: 'node', url: `https://${good}/reports?size=5000`, kind: 'report', size: 5000, expected: 'a'.repeat(64) }], warmups: 10, count: 20, concurrency: 1 };
validateSpec(spec);
for (const url of [`http://${good}/reports?size=5000`, `https://${good}.evil.com/reports?size=5000`, `https://user@${good}/reports?size=5000`, `https://${good}:444/reports?size=5000`, `https://${good}/redirect?size=5000`]) assert.throws(() => validateSpec({ ...spec, targets: [{ ...spec.targets[0], url }] }));
for (const patch of [{ count: 21 }, { concurrency: 8 }, { warmups: -1 }, { count: 1.2 }, { concurrency: 4 }]) assert.throws(() => validateSpec({ ...spec, ...patch }));
console.log('Near-client allowlist, path, and load-bound validation passed');
// Simulate pool dispatch occurring out of async-context order and socket reuse.
const a = newObservation(), b = newObservation(), socket = {};
const ra = { headers: ['x-near-client-sample', a.id] }, rb = { headers: ['x-near-client-sample', b.id] };
for (const request of [rb, ra]) channel('undici:request:create').publish({ request });
for (const request of [ra, rb]) { channel('undici:client:sendHeaders').publish({ request, socket }); channel('undici:request:headers').publish({ request }); }
assert.equal(a.observation.reusedSocket, false); assert.equal(b.observation.reusedSocket, true);
assert.equal(a.observation.socketId, b.observation.socketId);
assert(Number.isFinite(a.observation.headersAt) && Number.isFinite(b.observation.headersAt));
a.dispose(); b.dispose();
console.log('Queued concurrent diagnostic correlation and actual socket reuse passed');
const { request, Agent } = createRequire(pathToFileURL(process.argv[2]))('undici');
const server = http.createServer((req, res) => setTimeout(() => res.end('ok'), 2));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const pool = new Agent({ connections: 4, pipelining: 1 });
try {
  const records = [];
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let i = 0; i < 6; i++) {
      const trace = newObservation();
      try {
        const r = await request(`http://127.0.0.1:${server.address().port}`, { dispatcher: pool, headers: { 'x-near-client-sample': trace.id } });
        assert.equal(await r.body.text(), 'ok'); records.push(trace.observation);
      } finally { trace.dispose(); }
    }
  }));
  assert.equal(records.length, 24);
  assert(records.every(r => Number.isFinite(r.headersAt) && typeof r.reusedSocket === 'boolean'));
  assert.equal(records.filter(r => !r.reusedSocket).length, 4);
  assert.equal(new Set(records.map(r => r.socketId)).size, 4);
  console.log('Real Undici C=4 queued requests: all 24 timing/socket observations passed');
} finally { await pool.close(); await new Promise(resolve => server.close(resolve)); }
