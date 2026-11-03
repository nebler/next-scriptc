import {test} from 'node:test';
import assert from 'node:assert/strict';
import {forecast} from '../lib/forecast.ts';
import {panelFromSnapshot} from '../lib/panel.mjs';
import {canonicalResult} from 'scriptc-promote/functions/promotion-encodings.mjs';
test('seeded forecasts are deterministic, bounded, and do not mutate inputs', () => {
  for (const seed of [1, 42, 2147483648, 4294967295]) {
    const input = Object.freeze({trials: 1000, seed, cash: 250000, revenue: 40000, costs: 50000});
    const a = forecast(input);
    assert.equal(canonicalResult(a, {result: 'json'}), canonicalResult(forecast({...input}), {result: 'json'}));
    assert.equal(a.trials, 1000);
    assert.ok(a.solvent >= 0 && a.solvent <= a.trials);
    assert.ok(Number.isSafeInteger(a.totalEndingCash));
  }
  assert.equal(forecast({trials: 10, seed: 42, cash: 0, revenue: 0, costs: 1}).solvent, 0);
  assert.equal(forecast({trials: 10, seed: 42, cash: 100, revenue: 1, costs: 0}).solvent, 10);
});
test('panel is an aggregate allowlist, handles missing dispatchers', () => {
  const empty = {observed: false, lanes: [], shadows: 0, mismatches: 0, fallbacks: 0, nativeCalls: 0, buckets: []};
  assert.deepEqual(panelFromSnapshot({dispatchers: []}), empty);
  const settled = {fallback: 0, native: 0, buckets: [{lane: 'settled', verified: 24, mismatches: 0, decision: {ratio: 1.5, samples: 24}}]};
  assert.deepEqual(panelFromSnapshot({dispatchers: [{functions: {'lib/forecast.ts#forecast': settled}}]}).lanes, ['js']);
  const f = {fallback: 2, native: 7, arguments: 'private', buckets: [{bucket: 8, lane: 'native', reason: 'faster', verified: 24, mismatches: 1, decision: {ratio: .4, samples: 24}}]};
  assert.deepEqual(panelFromSnapshot({dispatchers: [{functions: {'lib/forecast.ts#forecast': f, unrelated: f}}]}), {
    observed: true, lanes: ['native'], shadows: 24, mismatches: 1, fallbacks: 2, nativeCalls: 7,
    buckets: [{bucket: 8, lane: 'native', reason: 'faster', ratio: .4, samples: 24}],
  });
});

test('Mulberry32 forecast has pinned outputs across unsigned seed boundaries', () => {
  const cases = [
    [1000, 1, 499, 181001523],
    [1000, 42, 524, 195016098],
    [1000, 2147483648, 491, 168259231],
    [1000, 4294967295, 540, 241022735],
    [10000, 42, 5168, 1924625910],
    [100000, 42, 51926, 19493054141],
  ];
  for (const [trials, seed, solvent, totalEndingCash] of cases) {
    assert.deepEqual(forecast({trials, seed, cash: 250000, revenue: 40000, costs: 50000}),
      {solvent, trials, totalEndingCash});
  }
  const base = {trials: 100, seed: 0, cash: 250000, revenue: 40000, costs: 50000};
  assert.deepEqual(forecast(base), forecast({...base, seed: 4294967296}));
  assert.deepEqual(forecast({...base, seed: -1}), forecast({...base, seed: 4294967295}));
  assert.equal(forecast({...base, trials: 0}).trials, 1);
  assert.equal(forecast({...base, trials: 2.9}).trials, 2);
  assert.equal(forecast({...base, trials: 100001}).trials, 100000);
});
