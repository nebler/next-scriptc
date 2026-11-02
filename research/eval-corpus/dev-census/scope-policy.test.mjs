import test from 'node:test';import assert from 'node:assert/strict';import {isMeasuredSource} from './scope-policy.mjs';
test('benchmark tooling is excluded without excluding production names by substring',()=>{
 assert.equal(isMeasuredSource('nodejs/src/logs/transformations/benchmarks/bench-stats.ts'),false);
 assert.equal(isMeasuredSource('src/compute.bench.ts'),false);
 assert.equal(isMeasuredSource('src/benchmarksEnabled.ts'),true);
 assert.equal(isMeasuredSource('src/server/compute.ts'),true);
});
