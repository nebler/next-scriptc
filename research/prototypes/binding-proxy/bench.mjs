// A separate plain Node process models the container client.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { bindingProxy } from './client.mjs';
const url = process.env.PROXY_URL, token = process.env.PROXY_TOKEN;
const env = bindingProxy(url, token);
const samples = Number(process.env.SAMPLES || 300), warmups = 30;
async function measure(fn) {
  for (let i = 0; i < warmups; i++) await fn();
  const times = [];
  for (let i = 0; i < samples; i++) { const t = performance.now(); await fn(); times.push(performance.now() - t); }
  const sorted = [...times].sort((a, b) => a - b);
  return { n: samples, p50Ms: sorted[Math.floor(samples * .5)], p95Ms: sorted[Math.floor(samples * .95)], meanMs: times.reduce((a,b) => a+b,0)/samples, samplesMs: times };
}
async function status(body, auth = token) {
  const r = await fetch(new URL('/rpc', url), { method: 'POST', headers: { authorization: `Bearer ${auth}` }, body: JSON.stringify(body) });
  await r.text(); return r.status;
}
assert.equal(await status({op:'get',key:'bench:x'},'wrong'),401);
assert.equal(await status({op:'delete',key:'bench:x'}),400);
assert.equal(await status(null),400);
assert.equal(await status({op:'get',key:'other:x'}),400);
assert.equal(await status({op:'put',key:'bench:x',value:'x'.repeat(65537)}),400);
assert.equal(await env.KV.get('bench:missing'),null);
await env.KV.put('bench:unicode','héllo 🌍');
assert.equal(await env.KV.get('bench:unicode'),'héllo 🌍');
const results = { checks: 'auth, allowlist, prefix, value cap, missing key, Unicode, readback passed', ping: await measure(() => env.ping()), payloads: {} };
for (const bytes of [64,4096,65536]) {
  const key = `bench:${bytes}`, value = 'x'.repeat(bytes);
  await env.KV.put(key,value);
  assert.equal(await env.KV.get(key),value);
  results.payloads[bytes] = { get: await measure(() => env.KV.get(key)), put: await measure(() => env.KV.put(key,value)) };
}
console.log(JSON.stringify(results));
