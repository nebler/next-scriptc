// node research/launch/redesign/validate.mjs — run after generate.mjs.
// Checks every variant's render contract and recomputes every displayed number from the frozen data.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const dir = dirname(fileURLToPath(import.meta.url)), root = resolve(dir, '../../..');
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const data = JSON.parse(readFileSync(join(dir, '../chart-data.json'), 'utf8'));
const extra = JSON.parse(readFileSync(join(dir, 'data-extra.json'), 'utf8'));
const directions = ['a-monolith', 'b-editorial', 'c-spec', 'd-signal'];
const charts = ['vector-search', 'vector-kernel', 'cpu-per-request', 'memory', 'first-response', 'vector-memory', 'vector-e2e', 'use-native-page', 'use-native-call'];
const onlyIn = { 'vector-memory': ['c-spec'], 'vector-e2e': ['c-spec'], 'use-native-page': ['c-spec'], 'use-native-call': ['c-spec'] }, dirsOf = a => onlyIn[a] ?? directions;
const assets = ['hero', 'og', 'code-route-native', 'code-use-native', ...charts];
const size = { hero: [1200, 628], og: [600, 315], 'code-route-native': [1024, 576], 'code-use-native': [1000, 800] };

assert.equal(manifest.length, assets.reduce((n, a) => n + dirsOf(a).length, 0), 'One variant per asset × direction');
for (const a of assets) for (const d of dirsOf(a)) assert.ok(manifest.find(x => x.asset === a && x.direction === d), `Missing ${a} ${d}`);

// Independent expectations from chart-data.json.
const metric = l => data.vercel.metrics.find(m => m.label === l);
const pair = m => [m.native.value.toFixed(m.decimals), m.comparison.value.toFixed(m.comparison.decimals ?? m.decimals)];
const x1 = (a, b) => (b / a).toFixed(1) + '×';
// Half-up on the reported 3-decimal value (152.350 → 152.4).
const h1 = v => (Math.round(Math.round(v * 1000) / 100 + 1e-6) / 10).toFixed(1);
const un = extra.useNativeFinal, near = extra.vectorNear;
const cpu = ['hello', 'revenue', 'nearby'].map(k => metric(`CPU / request: ${k}`)), ratios = cpu.map(m => m.comparison.value / m.native.value);
const expect = {
  'vector-search': { values: data.vectorVercel.results.map(r => r.value.toFixed(1)), ratio: x1(data.vectorVercel.results[0].value, data.vectorVercel.results[1].value) },
  'vector-kernel': { values: data.vector.results.map(r => r.value.toFixed(1)), ratio: x1(data.vector.results[0].value, data.vector.results[1].value) },
  'cpu-per-request': { values: cpu.flatMap(pair), ratio: `${Math.min(...ratios).toFixed(1)}–${Math.max(...ratios).toFixed(1)}×` },
  memory: { values: pair(metric('Serving process RSS')), ratio: x1(metric('Serving process RSS').native.value, metric('Serving process RSS').comparison.value) },
  'vector-memory': { values: extra.vectorRss.results.map(r => r.value.toFixed(1)) },
  'vector-e2e': { values: near.results.map(r => h1(r.p50.value)) },
  'use-native-page': { values: [h1(un.endToEnd200k.native.value), h1(un.endToEnd200k.node.value)], ratio: (un.endToEnd200k.node.value / un.endToEnd200k.native.value).toFixed(2) + '×' },
  'use-native-call': { values: [h1(un.function200k.native.value), h1(un.function200k.node.value)], ratio: (un.function200k.node.value / un.function200k.native.value).toFixed(2) + '×' },
  'first-response': { values: pair(metric('First response after deploy')), ratio: x1(metric('First response after deploy').native.value, metric('First response after deploy').comparison.value) },
};
// Every decimal on a chart must be a measured value or ratio at some precision, or a stated unit/scale step.
const measured = [];
(function walk(v) { if (v && typeof v === 'object') { if (typeof v.value === 'number') measured.push(v.value); Object.values(v).forEach(walk); } })(data);
// Extra values drawn on charts: vector RSS, in-region vector full request (p50 bars, p95 note), final use-native 200k.
for (const r of extra.vectorRss.results) measured.push(r.value);
for (const r of near.results) measured.push(r.p50.value, r.p95.value);
for (const k of ['endToEnd200k', 'function200k']) measured.push(un[k].native.value, un[k].node.value);
// Each extra value must appear verbatim in its report section (independent of generate.mjs).
(function walk(v) {
  if (!v || typeof v !== 'object') return;
  if (typeof v.value === 'number') {
    const [file, anchor] = v.source.split('#'), text = readFileSync(join(root, file), 'utf8');
    const section = text.split(/\n(?=#+ )/).find(sec => sec.split('\n')[0].toLowerCase().replace(/[^a-z0-9 -]/g, '').trim().replace(/ /g, '-') === anchor);
    assert.ok(section, `${v.source}: section missing`);
    const row = section.split('\n').find(l => l.startsWith('| ' + (v.row ?? v.locator.split(' | ')[0]) + ' |'));
    assert.ok(row && row.replaceAll(',', '').includes(v.value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')), `${v.locator}: ${v.value} not in its row`);
  }
  Object.values(v).forEach(walk);
})(extra);
const allowed = new Set(['0.1']);
for (const v of measured) { for (const n of [0, 1, 2, 3]) allowed.add(v.toFixed(n)); allowed.add(h1(v)); }
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
  // F1 first-call values (fresh-instance use-native) are not final and must never be drawn.
  assert.ok(!/\b(58\.6|51\.5|13\.2|66\.0|359\.4|500\.5|806|514)\b/.test(q.text), `${x.name}: first-call value in image`);
  // Charts and OG must stay legible on a 600px-wide phone column; hero/code images are read larger.
  if (charts.includes(x.asset) || x.asset === 'og') assert.ok(at600 >= 10, `${x.name}: smallest text ${at600.toFixed(1)}px at 600px wide`);
  if (charts.includes(x.asset)) {
    const e = expect[x.asset];
    for (const v of e.values) assert.ok(q.text.includes(v), `${x.name}: missing value ${v}`);
    // Vector headlines are qualitative (faster than Go with SIMD); Monolith states the ratio, as do the native-vs-Node headlines.
    if (e.ratio && (x.direction === 'a-monolith' || !x.asset.startsWith('vector'))) assert.ok(q.text.includes(e.ratio), `${x.name}: missing ratio ${e.ratio}`);
    if (x.asset === 'vector-search' || x.asset === 'vector-kernel') assert.ok(/faster than Go with SIMD|faster than Go \+ SIMD|TypeScript still leads/.test(q.text), `${x.name}: takeaway`);
    for (const n of q.text.match(/\d+\.\d+/g) ?? []) assert.ok(allowed.has(n), `${x.name}: unexplained number ${n}`);
    assert.ok(!/int8 search/i.test(q.text), `${x.name}: jargon headline`);
    if (x.asset === 'vector-search' || x.asset === 'vector-kernel') assert.ok(/experimental/.test(q.text) && /patched scriptc/.test(q.text), `${x.name}: keep Go SIMD / patched caveats`);
    if (x.direction === 'c-spec') {
      // Chosen direction: chart alone on the right, every sentence in the left column, no top kicker.
      const sp = q.split; assert.ok(sp, `${x.name}: split layout`);
      assert.ok(sp.leftRight <= 470 && sp.rightLeft >= 500, `${x.name}: text crosses the column divide (${sp.leftRight} / ${sp.rightLeft})`);
      // Units live on the chart: the right column opens with the axis unit, above the ticks. No left method footer.
      const unit = { 'cpu-per-request': 'ms / request', memory: 'MiB', 'vector-memory': 'MiB' }[x.asset] ?? 'ms';
      assert.ok(sp.rightText.startsWith(unit + ' '), `${x.name}: unit '${unit}' must head the axis in the chart column`);
      assert.ok(!sp.leftText.includes(` ${unit} `) && !/lower is better|· Vercel|ms per request/i.test(q.text), `${x.name}: method footer (unit · lower is better · Vercel) must be gone`);
      assert.ok(!/[a-z]{4,} [a-z]{3,} [a-z]{3,}/i.test(sp.rightText.slice(unit.length).replace(/TypeScript on Node\.js/g, '')), `${x.name}: sentence in chart column: ${sp.rightText}`);
      assert.ok(!/Vector search · Vercel Functions|Native vs Node\.js · Vercel|Vector search · search loop|Excludes network/.test(q.text), `${x.name}: kicker or 'Excludes network' wording`);
      // Lean copy: the left column is a headline, scope tag, one or two short sentences and one qualifier.
      const words = sp.leftText.split(' ').length; assert.ok(words <= 50, `${x.name}: left column too dense (${words} words)`);
      // Old Europe full-request medians belong in notes only, never next to iad1 values.
      assert.ok(!/\b(157|160|156\.9|160\.2)\b/.test(q.text), `${x.name}: Europe full-request medians in image`);
    }
    if (x.asset === 'vector-search' && x.direction === 'c-spec') {
      assert.ok(q.split.leftText.startsWith('TypeScript faster than Go + SIMD Server compute'), `${x.name}: scope label must sit directly under the headline`);
      assert.ok(/Vector search over 100,000 embeddings\. Median of 120 requests\./.test(q.text), `${x.name}: workload + request count`);
      assert.equal(data.vectorVercel.sourceLine.match(/(\d+) C=1 requests/)[1], '120', 'request count provenance');
      assert.ok(/Go \+ SIMD/.test(q.split.rightText), `${x.name}: Go + SIMD label`);
    }
    if (x.asset === 'vector-e2e') {
      const r = near.results;
      assert.ok(q.split.leftText.startsWith('Full request: ahead of Go + SIMD End to end · client in iad1'), `${x.name}: headline + scope`);
      assert.ok(/Median of 60 requests/.test(q.text) && q.text.includes(`p95 favors Go + SIMD: ${h1(r[1].p95.value)} vs ${h1(r[0].p95.value)} ms`) && /Patched scriptc/.test(q.text), `${x.name}: p95 loss + scope`);
      assert.ok(r[0].p50.value < r[1].p50.value && r[0].p95.value > r[1].p95.value, 'median win / p95 loss still holds');
      assert.ok((r[1].p50.value - r[0].p50.value) / r[1].p50.value < 0.15, 'Observed median lead remains below 15%' );
    }
    if (x.asset === 'use-native-page' || x.asset === 'use-native-call') {
      assert.ok(q.text.includes(e.ratio) && /Median of 120 warm requests/.test(q.text) && /200k rows/.test(q.text), `${x.name}: ratio, sample, size`);
      assert.ok(x.asset === 'use-native-page' ? /Small inputs lose\. Crossover: 5k to 15k rows\./.test(q.text) : /Loses at 5k rows and below\./.test(q.text), `${x.name}: small-input loss`);
      assert.ok(un.function5k.native.value > un.function5k.node.value, '5k function loss still holds');
      assert.ok(/“use native”/.test(q.split.rightText), `${x.name}: series label`);
    }
    if (x.asset === 'vector-memory') {
      assert.ok(/on par with Go/.test(q.text) && /half of Node/.test(q.text), `${x.name}: near-tie headline`);
      assert.ok(/IPC proxy is not counted/.test(q.text) && /not billed/i.test(q.text) && /Median of 120 requests/.test(q.text), `${x.name}: coverage caveat`);
      assert.ok(!/\b5\.6\b|\b14\.3×|\b80\b/.test(q.text), `${x.name}: hello-route values must not appear`);
      const r = extra.vectorRss.results; assert.ok(Math.abs(r[0].value - r[1].value) / r[1].value < 0.02, 'near tie claim holds');
      assert.ok(r[3].value / r[0].value > 1.8 && r[3].value / r[0].value < 2.1, '“about half” claim holds');
    }
    if (x.asset === 'vector-kernel') assert.ok(/loop/i.test(q.text) && /without HTTP/i.test(q.text), `${x.name}: kernel scope`);
    if (x.asset === 'memory') assert.ok(/not whole-instance or billed/.test(q.text), `${x.name}: RSS scope`);
    if (x.asset === 'first-response') assert.ok(/not a certified cold start/.test(q.text), `${x.name}: cold-start caveat`);
    if (x.asset === 'cpu-per-request') assert.ok(/not billed CPU/.test(q.text) && /Markdown/.test(q.text), `${x.name}: CPU scope + loss`);
  }
  // Chosen direction markets the function-level "use native" directive, never the route.native.ts file convention.
  if (x.direction === 'c-spec') assert.ok(!/route\.native\.ts|\.native\.ts|← compiles to native|· simplified/.test(q.text), `${x.name}: route.native.ts in a Spec Sheet image`);
  if (x.asset === 'hero' && x.direction === 'c-spec') {
    assert.ok(q.text.includes('"use native" → scriptc → native binary') && q.text.startsWith('"use native" next-scriptc TypeScript, compiled to native Vercel Functions.'), `${x.name}: "use native" hook at the top`);
    assert.ok(q.text.includes('// app/api/hello/route.ts async function greet(name: string) { "use native";'), `${x.name}: function-level directive in route.ts`);
  }
  if (x.asset === 'og' && x.direction === 'c-spec') assert.equal(q.text, 'next-scriptc TypeScript, compiled to native Vercel Functions. "use native" → scriptc → native binary', `${x.name}: approved OG copy with the "use native" tagline`);
  if (x.asset === 'code-use-native' && x.direction === 'c-spec') assert.ok(q.text.startsWith('lib/revenue.ts') && q.text.includes('"use native";') && !/simplified|← compiles to native/.test(q.text), `${x.name}: clean filename and directive without annotations`);
  if (x.asset === 'code-route-native' && x.direction === 'c-spec') {
    assert.ok(q.text.includes('"use native";') && /async function greet\(name: string\)/.test(q.text) && /app\/api\/hello\/route\.ts/.test(q.text) && !/route\.native\.ts/.test(q.text), `${x.name}: function-level directive in a route.ts`);
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
// Approved images stay byte-identical. Both were re-approved on 2026-10-31 when the user asked for the "use native" hook:
// the OG tagline now reads '"use native" → scriptc → native binary'; the hero adds the hook on top and shows the
// function-level directive in route.ts instead of route.native.ts. Hero re-pinned after the user requested removing its blue square.
const sha = f => createHash('sha256').update(readFileSync(join(dir, f))).digest('hex');
assert.equal(sha('png/og--c-spec.png'), '22bec91378579a24ac51a3b4cfb84b075cf998847fe556045664b36b71e783df', 'Approved OG changed');
assert.equal(sha('png/hero--c-spec.png'), 'e15fc977b8557d919b472c622ae625a3125cdad48010f1abd5a794a25641d57b', 'Approved hero changed');
const spec = readFileSync(join(dir, 'spec-sheet.html'), 'utf8');
for (const a of assets) assert.ok(spec.includes(`png/${a}--c-spec.png`), `spec-sheet.html missing ${a}`);
const w = extra.vectorWan.results, c4 = extra.vectorC4.results;
for (const r of [...w, ...c4]) for (const k of ['p50', 'p95']) assert.ok(spec.includes(`${r[k].value.toFixed(1)}`), `spec-sheet.html missing full-request ${r.label} ${k}`);
assert.ok(/No matched Go measurement exists/.test(spec) && /native loses to Go \+ SIMD/.test(spec), 'spec-sheet.html: Go coverage + concurrency loss');
// In-region table and all six stock-compiler control values live in the notes.
const h1n = v => (Math.round(Math.round(v * 1000) / 100 + 1e-6) / 10).toFixed(1);
for (const r of near.results) for (const k of ['p50', 'p95']) assert.ok(spec.includes(`${h1n(r[k].value)} ms`), `spec-sheet.html missing iad1 ${r.label} ${k}`);
const ctl = [...extra.vectorStockCompute.results.map(r => r.value), ...near.controls.flatMap(r => [r.p50.value, r.p95.value])];
assert.equal(ctl.length, 6); for (const v of ctl) assert.ok(spec.includes(h1n(v)), `spec-sheet.html missing control ${v}`);
assert.ok(spec.includes('final-hosted-measurement-after-o1--o2'), 'spec-sheet.html: final use-native source link');
// Function-level "use native" deploys as a sidecar on Vercel; the old fallback note must be gone.
const gallery = readFileSync(join(dir, 'index.html'), 'utf8');
for (const [n, t] of [['spec-sheet.html', spec], ['index.html', gallery]]) assert.ok(!/currently runs on Node on Vercel/.test(t) && t.includes('bundleFunctionSidecar'), `${n}: sidecar support note`);
assert.ok(readFileSync(join(root, 'packages/next-scriptc/src/vercel.mjs'), 'utf8').includes('export async function bundleFunctionSidecar'), 'sidecar packaging exists');
// README warm table uses the final M1 values, not E3.
const readme = readFileSync(join(root, 'README.md'), 'utf8');
assert.ok(readme.includes(`| ${h1n(un.endToEnd200k.node.value)} ms | ${h1n(un.endToEnd200k.native.value)} ms |`) && readme.includes(`| ${h1n(un.function5k.node.value)} ms | ${h1n(un.function5k.native.value)} ms |`), 'README final use-native rows');
assert.ok(!/203\.3|97\.4|40\.5 ms|42\.1 ms/.test(readme), 'README still has E3 values');
// A/B/D variants are preserved: none of their PNGs differ from the committed versions.
const abd = spawnSync('git', ['status', '--porcelain', '--', 'png', 'src'], { cwd: dir, encoding: 'utf8' }).stdout.split('\n').filter(l => l && !/--c-spec\./.test(l));
assert.deepEqual(abd, [], 'A/B/D variants changed');
console.log(`OK: ${manifest.length} variants · dimensions, size, fonts, bounds, overlap, legibility, numbers, sources and caveats verified · Spec Sheet split layout, route directive, full-request table · approved OG + hero, units on the axis, no route.native.ts in Spec Sheet images, A/B/D variants and published originals untouched · README final values.`);
