// Offline editorial checks. Counts use Twitter's 23-character URL convention.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const file = new URL('../launch-draft.md', import.meta.url);
const draft = readFileSync(file, 'utf8');
export const count = s => [...s.replace(/https?:\/\/[^\s]+/g, 'x'.repeat(23))].length;
const blocks = [...draft.matchAll(/### (Tweet [1-6]|Hook [ABC]|Hosted (?:win|tie|loss)|PR (?:open|coming))[^\n]*\n\n<!-- count: (\d+) -->\n```text\n([\s\S]*?)\n```/g)];
assert.equal(blocks.filter(b => b[1].startsWith('Tweet')).length, 6);
assert.equal(blocks.length, 11, 'Six tweets, three hooks, two PR variants');
for (const [, label, declared, body] of blocks) {
  const n = count(body);
  assert.ok(n <= 280, `${label}: ${n} > 280`);
  assert.equal(n, Number(declared), `${label}: stale count`);
  assert.ok(!body.includes('—'), `${label}: em dash`);
  assert.ok(!/@[\w]+/.test(body), `${label}: handle`);
  const withUrls = count(body.replace(/\{\{(?:REPO_URL|RFC_URL|SCRIPTC_PR_URL)\}\}/g, 'https://example.invalid/link'));
  assert.ok(withUrls <= 280, `${label}: resolved URLs exceed limit`);
  console.log(`${label}: ${n}/280${withUrls !== n ? `; with resolved URLs: ${withUrls}` : ''}`);
}
console.log('Templates are counted literally; recount after replacing placeholders or URLs.');

// Asset checks run after generation. They cover the measured labels and render contract.
const { existsSync } = await import('node:fs');
const { createHash } = await import('node:crypto');
const data = JSON.parse(readFileSync(new URL('chart-data.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('asset-manifest.json', import.meta.url), 'utf8'));
const root = new URL('../../', import.meta.url);
const digest = buffer => createHash('sha256').update(buffer).digest('hex');
assert.equal(existsSync(new URL('.github/assets/code-route-go-vs-native.png', root)), false, 'Dropped comparison image must not exist');
assert.equal(manifest.length, 7, 'Two code images, three charts, hero and OG');
const markdown = data.vercel.metrics.find(m => m.label === 'Markdown warm latency');
assert.ok(markdown && markdown.native.source && markdown.comparison.locator, 'Keep Markdown evidence');
assert.equal(markdown.includeInChart, false, 'Markdown is text-only launch evidence');
const chartA = readFileSync(new URL('chart-a-vercel.svg', import.meta.url), 'utf8');
assert.ok(!/Markdown|LOSS/.test(chartA), 'Chart A must omit the Markdown panel');
assert.equal(data.vercel.metrics.filter(m => m.includeInChart !== false).length, 5);
for (const m of data.vercel.metrics.filter(m => m.includeInChart !== false)) {
  assert.ok(chartA.includes(m.label), `Missing chart A metric: ${m.label}`);
  for (const [role, value] of [['native', m.native], ['comparison', m.comparison]]) {
    const label = value.value.toFixed(role === 'comparison' ? value.decimals ?? m.decimals : m.decimals);
    assert.ok(chartA.includes(`>${label}</text>`), `Missing chart A value: ${m.label} ${label}`);
  }
  assert.ok(chartA.includes((m.comparison.value / m.native.value).toFixed(2) + '×'), 'Compute ratios from exact values');
}
for (const [key, file] of [['vector', 'chart-b-int8-kernel.svg'], ['vectorVercel', 'chart-b-int8-vercel.svg']]) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  for (const r of data[key].results) assert.ok(source.includes(`>${r.value.toFixed(data[key].decimals)}</text>`), `Missing ${key} value`);
  assert.ok(source.includes((data[key].results[1].value / data[key].results[0].value).toFixed(2) + '×'));
  assert.ok(source.includes('Go SIMD = experimental simd/archsimd'));
  if (key === 'vector') assert.ok(source.includes('KERNEL ONLY'));
  for (const family of ['Geist', 'Geist Mono']) assert.ok(source.includes(`font-family:'${family}'`));
  assert.ok(source.includes('data:font/woff2;base64,'));
}
for (const asset of manifest) {
  const png = readFileSync(new URL(asset.path, root));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), asset.width);
  assert.equal(png.readUInt32BE(20), asset.height);
  assert.equal(png.length, asset.bytes);
  assert.ok(png.length < 1_000_000, asset.name + ' exceeds 1 MB');
  assert.equal(asset.scale, 2);
  assert.equal(asset.qa.fonts, true);
  assert.deepEqual(asset.qa.overflow, []);
  console.log(`${asset.name}: ${asset.width}×${asset.height}; ${Math.round(png.length / 1024)} KB; fonts/layout OK`);
}
for (const [asset, legacy] of [['chart-vector-vercel', 'chart-b-int8-vercel'], ['chart-vercel-native-vs-node', 'chart-a-vercel']]) {
  assert.equal(digest(readFileSync(new URL(`.github/assets/${asset}.png`, root))), digest(readFileSync(new URL(`${legacy}.png`, import.meta.url))), `Stale legacy copy: ${legacy}`);
}
assert.ok(draft.includes('Markdown loss remains in tweet 5'), 'Keep the loss in launch text');
console.log('Assets: exact data labels, source references, display exclusions, 2x exports and legacy copies verified.');
