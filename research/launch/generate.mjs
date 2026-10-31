// Offline, dependency-free chart generation. Run from any directory with Node.
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../..');
const data = JSON.parse(readFileSync(join(dir, 'chart-data.json'), 'utf8'));
const C = { bg: '#101518', panel: '#192126', text: '#f1f4f3', muted: '#a9b8be', line: '#425159', native: '#72e0bf', comparison: '#e8b875' };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t = (x, y, s, size = 24, color = C.text, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" ${extra}>${esc(s)}</text>`;
const rect = (x, y, w, h, fill, r = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`;
const line = (x1, y1, x2, y2) => `<path d="M${x1},${y1} H${x2}" stroke="${C.line}" stroke-width="1"/>`;
const fmt = (v, n = 2) => v.toFixed(n);
const ratio = (a, b) => fmt(a / b);
const ceiling = max => { const step = 10 ** Math.floor(Math.log10(max)); return Math.ceil(max / step) * step; };
const svg = (title, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-labelledby="title"><title id="title">${esc(title)}</title><style>text{font-family:'Helvetica Neue',Helvetica,sans-serif;font-weight:500} .heavy{font-weight:700}</style>${rect(0, 0, 1600, 900, C.bg)}${body}</svg>`;

// Check citations offline. Pending values are strings, never zero or guessed results.
function verify(value) {
  if (!value || typeof value !== 'object') return;
  if ('value' in value) {
    if (typeof value.value === 'number') {
      assert.ok(value.value > 0 && Number.isFinite(value.value));
      assert.ok(value.source && value.locator, 'Measured values need source + locator');
      const report = readFileSync(resolve(root, value.source.split('#')[0]), 'utf8');
      const normalized = report.replaceAll(',', '');
      assert.ok(normalized.includes(String(value.value)), `Value ${value.value} missing from ${value.source}`);
    } else {
      assert.match(value.value, /^\{\{VECTOR_VERCEL_[A-Z_]+\}\}$/);
      assert.equal(value.source, null);
    }
  }
  for (const v of Object.values(value)) verify(v);
}
verify(data);

function chartA() {
  const d = data.vercel;
  let out = t(64, 76, d.title, 56, C.text, 'class="heavy"') + t(64, 121, d.subtitle, 27, C.muted);
  out += rect(64, 151, 24, 12, C.native) + t(100, 169, 'Native TypeScript', 23) + rect(360, 151, 24, 12, C.comparison) + t(396, 169, 'Node / Next.js', 23);
  for (const [i, m] of d.metrics.entries()) {
    const x = 64 + (i % 3) * 498, y = 195 + Math.floor(i / 3) * 296, w = 476;
    const a = m.native.value, b = m.comparison.value, max = ceiling(Math.max(a, b));
    const loss = a > b;
    out += rect(x, y, w, 266, C.panel, 12);
    out += t(x + 22, y + 40, m.label, 27, C.text, 'class="heavy"');
    out += t(x + 22, y + 72, loss ? `Native / Node: ${ratio(a, b)}× · LOSS` : `Node / native: ${ratio(b, a)}×`, 22, C.muted);
    for (const [j, v] of [a, b].entries()) {
      const by = y + 111 + j * 67;
      out += t(x + 22, by, j === 0 ? 'Native' : 'Node', 22, C.muted);
      out += t(x + w - 22, by, `${fmt(v, m.decimals)} ${m.unit}`, 26, C.text, 'text-anchor="end"');
      out += rect(x + 22, by + 10, (w - 44) * v / max, 22, j === 0 ? C.native : C.comparison, 3);
    }
    out += line(x + 22, y + 230, x + w - 22, y + 230);
    out += t(x + 22, y + 253, `0 ${m.unit}`, 19, C.muted);
    out += t(x + w - 22, y + 253, `${max} ${m.unit}`, 19, C.muted, 'text-anchor="end"');
  }
  out += t(64, 809, d.note, 24, C.muted);
  out += t(64, 848, d.sourceLine, 22, C.muted);
  return svg(d.title, out);
}
function chartB(d, pending = false) {
  const ready = d.results.every(r => typeof r.value === 'number' && r.source && r.locator);
  let out = t(64, 76, d.title, 56, C.text, 'class="heavy"') + t(64, 121, d.subtitle, 27, C.muted);
  if (!pending) {
    out += t(64, 174, `${data.vector.rows.value.toLocaleString('en-US')} rows × ${data.vector.dimensions.value} dimensions · exhaustive signed dot products + top-10`, 25, C.muted);
    out += t(64, 216, `${ratio(d.results[1].value, d.results[0].value)}× faster than Go SIMD in this kernel run`, 29, C.native);
  } else if (ready) {
    out += t(64, 174, `${data.vector.rows.value.toLocaleString('en-US')} rows × ${data.vector.dimensions.value} dimensions · natural TypeScript · same Function config`, 25, C.muted);
    out += t(64, 216, `${ratio(d.results[1].value, d.results[0].value)}× ${d.headline}`, 29, C.native);
  } else {
    out += t(64, 181, 'PENDING · no hosted performance claim', 30, C.muted);
  }
  const px = 494, pw = 860;
  const max = ready ? ceiling(Math.max(...d.results.map(r => r.value)) / 4) * 4 : null;
  for (const [i, r] of d.results.entries()) {
    const y = 290 + i * 113;
    out += t(64, y, r.label, 32, C.text, 'class="heavy"') + t(64, y + 31, r.detail, 21, C.muted);
    if (ready) {
      out += rect(px, y - 21, pw * r.value / max, 36, C[r.role], 4);
      out += t(1536, y + 8, `${fmt(r.value)} ms`, 36, C.text, 'text-anchor="end"');
    } else {
      out += t(px, y + 5, 'Server-side compute (ms)', 25, C.muted);
      out += t(1536, y + 8, 'PENDING', 32, C.muted, 'text-anchor="end"');
    }
  }
  if (ready) {
    out += line(px, 708, px + pw, 708);
    for (let i = 0; i <= 4; i++) out += t(px + pw * i / 4, 743, `${Number((max * i / 4).toFixed(2))} ms`, 22, C.muted, 'text-anchor="middle"');
  }
  out += t(64, 806, d.note, 23, C.muted);
  out += t(64, 850, d.sourceLine, pending ? 21 : 23, C.muted);
  return svg(d.title, out);
}
const charts = { 'chart-a-vercel': chartA(), 'chart-b-int8-kernel': chartB(data.vector), 'chart-b-int8-vercel': chartB(data.vectorVercel, true) };
for (const [name, content] of Object.entries(charts)) writeFileSync(join(dir, `${name}.svg`), content);

// Export through an existing local Chrome; never install a renderer or fetch an asset.
const candidates = [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].filter(Boolean);
const chrome = candidates.find(existsSync);
if (!chrome && !process.argv.includes('--svg-only')) throw new Error('No local Chrome. Set CHROME_BIN or use --svg-only.');
if (chrome && !process.argv.includes('--svg-only')) {
  for (const name of Object.keys(charts)) {
    const profile = mkdtempSync(join(tmpdir(), 'launch-chart-'));
    try {
      const result = spawnSync(chrome, ['--headless', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--metrics-recording-only', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1600,900', `--user-data-dir=${profile}`, `--screenshot=${join(dir, `${name}.png`)}`, pathToFileURL(join(dir, `${name}.svg`)).href], { encoding: 'utf8', timeout: 30000 });
      if (result.error || result.status !== 0) throw result.error ?? new Error(result.stderr);
      const png = readFileSync(join(dir, `${name}.png`));
      assert.equal(png.readUInt32BE(16), 1600); assert.equal(png.readUInt32BE(20), 900);
    } finally { rmSync(profile, { recursive: true, force: true }); }
  }
  console.log(`PNG export: ${chrome}`);
}

// One-take recording: frozen evidence pages, never a fake live benchmark.
const route = readFileSync(join(root, 'examples/demo/app/api/analytics/revenue/route.native.ts'), 'utf8');
const fn = readFileSync(join(root, 'examples/demo/lib/revenue.ts'), 'utf8');
const f = data.functionLevel;
const recording = `<!doctype html><meta charset="utf-8"><title>next-scriptc evidence walkthrough</title><style>body{margin:0;background:${C.bg};color:${C.text};font-family:'Helvetica Neue',sans-serif}main{width:1600px;height:900px;position:relative;overflow:hidden}section{display:none;padding:64px}section.active{display:block}h1{font-size:60px;margin:0 0 28px}p{font-size:32px;line-height:1.4}pre{font-size:26px;line-height:1.4;white-space:pre-wrap;color:${C.native}}img{width:1600px;height:900px}.chart{padding:0}footer{position:absolute;bottom:10px;right:28px;background:${C.bg};color:${C.muted};font-size:19px}button{font-size:32px;padding:20px;color:${C.bg};background:${C.native};border:0}small{font-size:24px;color:${C.muted}}</style><main><section class="active"><h1>CPU-heavy routes. Still TypeScript.</h1><p>route.native.ts → scriptc → native Vercel Function</p><p>Plain adapter. No Next.js fork.</p><small>Recorded benchmark evidence. This is not a live timing demo.</small><p><button id="start">Start 40-second walkthrough</button></p></section><section><h1>Same TypeScript source</h1><pre>${esc(route.split('\n').slice(8, 25).join('\n'))}</pre><small>examples/demo/app/api/analytics/revenue/route.native.ts · excerpt</small></section><section class="chart"><img src="chart-a-vercel.svg" alt="Vercel benchmark chart"></section><section class="chart"><img src="chart-b-int8-vercel.svg" alt="Vercel vector route chart"></section><section><h1>Offload one function</h1><pre>${esc(fn.split('\n').slice(Math.max(0, fn.split('\n').findIndex(s => s.includes('"use native"')) - 1), fn.split('\n').findIndex(s => s.includes('"use native"')) + 5).join('\n'))}</pre><p>Self-hosted Linux dashboard: ${f.rows.value / 1000}k rows, ${fmt(f.native.value, 0)} vs ${fmt(f.node.value, 0)} ms.</p><small>Native vs Node · full page p50 · research/function-level.md, review round 3</small><p>Observed crossover: between ${f.crossoverLow.value / 1000}k and ${f.crossoverHigh.value / 1000}k rows.</p></section><section><h1>Where Go still wins</h1><p>CSV, bcrypt, raw thumbnails and resize.</p><p>Go SIMD wins float search. Go popcount wins binary search.</p><p>Compiler patch in a fork. Full validation gate pending.</p><small>Sources: go-territory.md · scouting-summary.md · vector-cpu-levels.md · scriptc-int8-range-analysis.md</small></section><footer id="clock">Frozen source reports · no live requests</footer></main><script>const scenes=[...document.querySelectorAll('section')];let begun=false;document.getElementById('start').onclick=()=>{if(begun)return;begun=true;const began=performance.now();function tick(){const s=(performance.now()-began)/1000;const index=s<7?1:s<16?2:s<25?3:s<32?4:5;scenes.forEach((n,i)=>n.classList.toggle('active',i===index));document.getElementById('clock').textContent='Recorded evidence · not live timings · '+Math.min(40,Math.floor(s))+' / 40 s';if(s<40)requestAnimationFrame(tick)}tick()};</script>`;
writeFileSync(join(dir, 'recording.html'), recording);
const preview = `<!doctype html><meta charset="utf-8"><style>body{margin:0;font-family:var(--font-sans,sans-serif);color:var(--foreground)}img{width:100%;height:auto;display:block;margin-bottom:16px}p{line-height:1.5}</style><p>Frozen Vercel observations, the hosted vector route and Linux kernel results.</p>${Object.keys(charts).map(name => `<img src="${name}.png" alt="${name}">`).join('')}`;
writeFileSync(join(dir, 'preview.html'), preview);
console.log('Generated three SVG charts, PNGs (unless --svg-only), recording.html, preview.html.');
