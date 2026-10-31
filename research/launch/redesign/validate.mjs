// node research/launch/redesign/validate.mjs — run after generate.mjs.
// Checks every variant's render contract and recomputes every displayed number from the frozen data.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const dir = dirname(fileURLToPath(import.meta.url)), root = resolve(dir, '../../..');
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const data = JSON.parse(readFileSync(join(dir, '../chart-data.json'), 'utf8'));
const extra = JSON.parse(readFileSync(join(dir, 'data-extra.json'), 'utf8'));
const directions = ['a-monolith', 'b-editorial', 'c-spec', 'd-signal'];
const charts = ['vector-search', 'vector-kernel', 'cpu-per-request', 'memory', 'first-response'];
const assets = ['hero', 'og', 'code-route-native', 'code-use-native', ...charts];
const size = { hero: [1200, 628], og: [600, 315], 'code-route-native': [1024, 576], 'code-use-native': [1000, 800] };

assert.equal(manifest.length, assets.length * directions.length, 'One variant per asset × direction');
for (const a of assets) for (const d of directions) assert.ok(manifest.find(x => x.asset === a && x.direction === d), `Missing ${a} ${d}`);

// Independent expectations from chart-data.json.
const metric = l => data.vercel.metrics.find(m => m.label === l);
const pair = m => [m.native.value.toFixed(m.decimals), m.comparison.value.toFixed(m.comparison.decimals ?? m.decimals)];
const x1 = (a, b) => (b / a).toFixed(1) + '×';
const cpu = ['hello', 'revenue', 'nearby'].map(k => metric(`CPU / request: ${k}`)), ratios = cpu.map(m => m.comparison.value / m.native.value);
const expect = {
  'vector-search': { values: data.vectorVercel.results.map(r => r.value.toFixed(1)), ratio: x1(data.vectorVercel.results[0].value, data.vectorVercel.results[1].value) },
  'vector-kernel': { values: data.vector.results.map(r => r.value.toFixed(1)), ratio: x1(data.vector.results[0].value, data.vector.results[1].value) },
  'cpu-per-request': { values: cpu.flatMap(pair), ratio: `${Math.min(...ratios).toFixed(1)}–${Math.max(...ratios).toFixed(1)}×` },
  memory: { values: pair(metric('Serving process RSS')), ratio: x1(metric('Serving process RSS').native.value, metric('Serving process RSS').comparison.value) },
  'first-response': { values: pair(metric('First response after deploy')), ratio: x1(metric('First response after deploy').native.value, metric('First response after deploy').comparison.value) },
};
// Every decimal on a chart must be a measured value or ratio at some precision, or a stated unit/scale step.
const measured = [];
(function walk(v) { if (v && typeof v === 'object') { if (typeof v.value === 'number') measured.push(v.value); Object.values(v).forEach(walk); } })(data);
const allowed = new Set(['0.1']);
for (const v of measured) for (const n of [0, 1, 2, 3]) allowed.add(v.toFixed(n));
for (const a of measured) for (const b of measured) for (const n of [1, 2]) allowed.add((b / a).toFixed(n));

const png = readFileSync, failures = [];
for (const x of manifest) {
  const [w, h] = size[x.asset] ?? [1200, 800], file = join(dir, x.png), buf = png(file);
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', x.name);
  assert.equal(buf.readUInt32BE(16), w * 2, `${x.name} width`); assert.equal(buf.readUInt32BE(20), h * 2, `${x.name} height`);
  assert.equal(buf.length, x.bytes, `${x.name} stale manifest`); assert.ok(buf.length < 1_000_000, `${x.name} ≥ 1 MB`);
  assert.ok(existsSync(join(dir, x.src)), `${x.name} source`);
  const q = x.qa;
  assert.equal(q.fonts, true, `${x.name} fonts`);
  assert.deepEqual(q.outside, [], `${x.name} text outside canvas`); assert.deepEqual(q.overlap, [], `${x.name} overlapping text`); assert.deepEqual(q.boxes, [], `${x.name} element outside canvas`);
  const at600 = q.minFont * 600 / w;
  // Charts and OG must stay legible on a 600px-wide phone column; hero/code images are read larger.
  if (charts.includes(x.asset) || x.asset === 'og') assert.ok(at600 >= 10, `${x.name}: smallest text ${at600.toFixed(1)}px at 600px wide`);
  if (charts.includes(x.asset)) {
    const e = expect[x.asset];
    for (const v of e.values) assert.ok(q.text.includes(v), `${x.name}: missing value ${v}`);
    // Vector headlines are qualitative (faster than Go with SIMD); Monolith states the ratio, as do the native-vs-Node headlines.
    if (x.direction === 'a-monolith' || !x.asset.startsWith('vector')) assert.ok(q.text.includes(e.ratio), `${x.name}: missing ratio ${e.ratio}`);
    if (x.asset.startsWith('vector')) assert.ok(/faster than Go with SIMD|TypeScript still leads/.test(q.text), `${x.name}: takeaway`);
    for (const n of q.text.match(/\d+\.\d+/g) ?? []) assert.ok(allowed.has(n), `${x.name}: unexplained number ${n}`);
    assert.ok(!/int8 search/i.test(q.text), `${x.name}: jargon headline`);
    if (x.asset.startsWith('vector')) assert.ok(/experimental/.test(q.text) && /patched scriptc/.test(q.text), `${x.name}: keep Go SIMD / patched caveats`);
    if (x.asset === 'vector-kernel') assert.ok(/loop/i.test(q.text) && /without HTTP/.test(q.text), `${x.name}: kernel scope`);
    if (x.asset === 'memory') assert.ok(/not whole-instance or billed/.test(q.text), `${x.name}: RSS scope`);
    if (x.asset === 'first-response') assert.ok(/not a certified cold start/.test(q.text), `${x.name}: cold-start caveat`);
    if (x.asset === 'cpu-per-request') assert.ok(/not billed CPU/.test(q.text) && /Markdown/.test(q.text), `${x.name}: CPU scope + loss`);
  }
  console.log(`${x.name.padEnd(36)} ${buf.readUInt32BE(16)}×${buf.readUInt32BE(20)}  ${String(Math.round(buf.length / 1024)).padStart(3)} KB  min text ${at600.toFixed(1)}px@600`);
}
// Gallery-only numbers stay tied to their reports.
assert.ok(readFileSync(join(root, 'research/vector-vercel.md'), 'utf8').includes('10.087 ms p50'), 'Stock imul note');
assert.ok(extra.vectorRss.results.length === 4);
// The published originals must be untouched while the user chooses.
const git = spawnSync('git', ['status', '--porcelain', '--', '.github/assets', 'research/launch/chart-a-vercel.png', 'research/launch/chart-b-int8-vercel.png', 'research/launch/chart-b-int8-kernel.png', 'research/launch/asset-manifest.json'], { cwd: root, encoding: 'utf8' });
assert.equal(git.stdout.trim(), '', 'Published originals changed');
assert.ok(existsSync(join(dir, 'index.html')), 'Gallery missing');
console.log(`OK: ${manifest.length} variants · dimensions, size, fonts, bounds, overlap, legibility, numbers and caveats verified · originals untouched.`);
