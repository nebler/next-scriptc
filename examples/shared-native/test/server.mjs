// Run against a production server. Separate from the fast package suites.
import assert from 'node:assert/strict';
import {forecast} from '../lib/forecast.ts';
import {canonicalResult} from 'scriptc-promote/functions/promotion-encodings.mjs';
const origin = process.env.SHARED_NATIVE_ORIGIN ?? 'http://localhost:3198';
async function call(input) {
  const response = await fetch(origin + '/api/forecast', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(input)});
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(canonicalResult(data.result, {result: 'json'}), canonicalResult(forecast(input), {result: 'json'}));
  assert.deepEqual(Object.keys(data.panel).sort(), ['observed','lanes','shadows','mismatches','fallbacks','nativeCalls','buckets'].sort());
  assert.equal(data.panel.mismatches, 0);
  assert.equal(data.panel.fallbacks, 0);
  return data;
}
for (const trials of [1000,10000,100000]) for (const seed of [1,42,2147483648,4294967295]) {
  await call({trials,seed,cash:250000,revenue:40000,costs:50000});
}
// Let asynchronous shadows finish between calls. No dispatcher threshold overrides.
let data;
for (let i=0;i<950;i++) {
  data = await call({trials:10000,seed:42,cash:250000,revenue:40000,costs:50000});
  if (data.panel.nativeCalls > 0) break;
  await new Promise(resolve=>setTimeout(resolve, 2));
}
assert.ok(data.panel.observed, 'production build must wrap forecast');
assert.ok(data.panel.shadows >= 24, 'default paired verification');
assert.ok(data.panel.nativeCalls > 0, 'automatic lane must actually serve native');
// Repeat every seeded case after promotion so equality exercises native service.
for (const trials of [1000,10000,100000]) for (const seed of [1,42,2147483648,4294967295]) {
  data = await call({trials,seed,cash:250000,revenue:40000,costs:50000});
  assert.ok(data.panel.lanes.includes('native'));
}
const invalid = await fetch(origin + '/api/forecast', {method:'POST',body:JSON.stringify({trials:100001})});
assert.equal(invalid.status,400);
console.log(JSON.stringify({seededCases:12,panel:data.panel},null,2));
