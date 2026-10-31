// npm ci --prefix research/launch && node research/launch/redesign/generate.mjs [--html-only] [--only=asset[,asset]]
// Four design directions × every launch graphic. Layout is HTML/CSS; Chrome rasterizes at 2x with local fonts.
// The published assets in .github/assets and research/launch are never written by this script.
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHighlighter } from 'shiki';
import sharp from 'sharp';

const dir = dirname(fileURLToPath(import.meta.url));
const launch = resolve(dir, '..');
const root = resolve(dir, '../../..');
const srcDir = join(dir, 'src'), pngDir = join(dir, 'png');
mkdirSync(srcDir, { recursive: true }); mkdirSync(pngDir, { recursive: true });
const data = JSON.parse(readFileSync(join(launch, 'chart-data.json'), 'utf8'));
const extra = JSON.parse(readFileSync(join(dir, 'data-extra.json'), 'utf8'));
const palette = JSON.parse(readFileSync(join(launch, 'reference-palette.json'), 'utf8'));
const P = Object.fromEntries(Object.entries(palette.colors).map(([k, v]) => [k, v.hex]));

// Same provenance contract as ../generate.mjs: each measured value must appear in its report.
function verify(value) {
  if (!value || typeof value !== 'object') return;
  if ('value' in value) {
    assert.ok(typeof value.value === 'number' && value.value > 0 && Number.isFinite(value.value));
    assert.ok(value.source && value.locator, 'Measured values need source + locator');
    const report = readFileSync(resolve(root, value.source.split('#')[0]), 'utf8').replaceAll(',', '');
    assert.ok(report.includes(String(value.value)), `Value ${value.value} missing from ${value.source}`);
  }
  for (const v of Object.values(value)) verify(v);
}
verify(data); verify(extra);

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (v, n) => v.toFixed(n);
const times = (fast, slow) => (slow / fast).toFixed(1) + '×';

// ---------- Data → chart specs ----------
const metric = label => { const m = data.vercel.metrics.find(m => m.label === label); assert.ok(m, label); return m; };
const firstResponse = metric('First response after deploy'), rss = metric('Serving process RSS');
const cpu = ['hello', 'revenue', 'nearby'].map(k => metric(`CPU / request: ${k}`));
const pair = (m, unit) => [
  { label: 'Native', value: m.native.value, text: fmt(m.native.value, m.decimals), native: true },
  { label: 'Node.js', value: m.comparison.value, text: fmt(m.comparison.value, m.comparison.decimals ?? m.decimals) },
].map(r => ({ ...r, unit }));
function vectorRows(results, decimals) {
  assert.deepEqual(results.map(r => r.label), ['Patched native', 'Go SIMD', 'Go plain', 'Node']);
  const names = [['TypeScript, native', 'TypeScript', 'native'], ['Go with SIMD', 'Go', 'with SIMD'], ['Go', 'Go', ''], ['TypeScript on Node.js', 'TypeScript', 'on Node.js']];
  return results.map((r, i) => ({ label: names[i][0], short: names[i].slice(1), value: r.value, text: fmt(r.value, decimals), native: i === 0, unit: 'ms' }));
}
const cpuRatios = cpu.map(m => m.comparison.value / m.native.value);
const cpuRange = `${Math.min(...cpuRatios).toFixed(1)}–${Math.max(...cpuRatios).toFixed(1)}×`;
const vv = data.vectorVercel.results, vk = data.vector.results;
const rows100k = data.vector.rows.value.toLocaleString('en-US'), dims = data.vector.dimensions.value;
assert.equal(data.vectorVercel.decimals, 1); assert.equal(data.vector.decimals, 1);

// Spec Sheet (c-spec) is the chosen direction; its revisions live in `spec` so A/B/D stay as first reviewed.
// Each spec override adds `scope`: a short label set directly under the headline so the measurement boundary is never buried.
const goPlus = rows => rows.map((r, i) => i === 1 ? { ...r, label: 'Go + SIMD', short: ['Go', '+ SIMD'] } : r);
const wan = extra.vectorWan.results, vr = extra.vectorRss.results;
assert.deepEqual(wan.map(r => r.label), ['Patched native', 'Go SIMD', 'Go plain', 'Node']);
const ms0 = v => Math.round(v).toString();
const charts = {
  'vector-search': {
    title: 'Vector search on Vercel Functions',
    kicker: 'Vector search · Vercel Functions',
    headline: 'Vector search in TypeScript, faster than Go with SIMD',
    sub: `Time to find the 10 closest of ${rows100k} embeddings, per request. Lower is better.`,
    method: `int8 · ${dims} dimensions · server compute, median of 120 requests`,
    foot: 'Excludes network. Go with SIMD uses Go’s experimental archsimd package. Native uses a patched scriptc.',
    big: times(vv[0].value, vv[1].value), bigCaption: 'faster than Go with SIMD',
    groups: [{ rows: vectorRows(vv, 1) }], unitStep: 1, unitLabel: '1 ms',
    spec: {
      headline: 'TypeScript faster than Go + SIMD',
      scope: 'Vector-search server compute',
      sub: `Find the top 10 of ${rows100k} embeddings. Median of 120 warm requests, sent one at a time. Lower is better.`,
      method: 'ms · Vercel Functions, iad1',
      foot: `Full requests including network are about even: ${ms0(wan[0].p50.value)} vs ${ms0(wan[1].p50.value)} ms median. Go\u00a0+\u00a0SIMD uses Go’s experimental archsimd. Native uses a patched scriptc.`,
      groups: [{ rows: goPlus(vectorRows(vv, 1)) }],
    },
  },
  'vector-kernel': {
    title: 'Vector search loop only',
    kicker: 'Vector search · search loop only',
    headline: 'The search loop alone: TypeScript still leads',
    sub: `The same ${rows100k}-embedding search, timed without HTTP, JSON or startup. Lower is better.`,
    method: `Kernel only · int8 · ${dims} dimensions · median · Linux Vercel Sandbox`,
    foot: 'Same host and data for every runtime. Go with SIMD is experimental. Native uses a patched scriptc.',
    big: times(vk[0].value, vk[1].value), bigCaption: 'faster than Go with SIMD, loop only',
    groups: [{ rows: vectorRows(vk, 1) }], unitStep: 1, unitLabel: '1 ms',
    spec: {
      headline: 'The search loop alone: TypeScript still leads',
      scope: 'Search loop only',
      method: `ms · int8 · ${dims} dimensions · Linux Vercel Sandbox`,
      foot: 'Same host and data for every runtime. Go\u00a0+\u00a0SIMD is experimental. Native uses a patched scriptc.',
      groups: [{ rows: goPlus(vectorRows(vk, 1)) }],
    },
  },
  'vector-memory': {
    title: 'Vector search memory', dirs: ['c-spec'],
    headline: 'Memory on par with Go, about half of Node.js',
    scope: 'Vector-search process memory',
    sub: `Memory held while serving the same search over ${rows100k} embeddings. Every runtime keeps the same dataset in memory. Lower is better.`,
    method: 'Resident memory (RSS) · MiB · median of 120 requests',
    foot: 'Serving process only, not billed memory. Go’s separate IPC proxy is not counted.',
    groups: [{ rows: goPlus(vectorRows(vr, 1)).map(r => ({ ...r, unit: 'MiB' })) }], unitStep: 1, unitLabel: '1 MiB',
  },
  'cpu-per-request': {
    title: 'CPU per request, native vs Node.js',
    kicker: 'Native vs Node.js · Vercel Functions',
    headline: `Same routes, ${cpuRange} less CPU per request`,
    sub: 'CPU time per request, measured inside the serving process. Lower is better.',
    method: 'ms per request · median of 3 windows of 100 requests',
    foot: 'Self-reported process CPU, not billed CPU. Not every route wins: Markdown rendering is slower natively.',
    big: cpuRange, bigCaption: 'less CPU per request',
    groups: [['Hello world', cpu[0]], ['Revenue report', cpu[1]], ['Nearby-store search', cpu[2]]].map(([name, m]) => ({ name, rows: pair(m, 'ms') })),
    unitStep: 0.1, unitLabel: '0.1 ms',
    spec: { scope: 'Process CPU per request' },
  },
  memory: {
    title: 'Serving process memory, native vs Node.js',
    kicker: 'Native vs Node.js · Vercel Functions',
    headline: `Same route, ${times(rss.native.value, rss.comparison.value)} less memory`,
    sub: 'Memory held by the process serving a hello route, after its first response. Lower is better.',
    method: 'Resident memory (RSS) · MiB · median of 5 deployments',
    foot: 'Measures the serving process only, not whole-instance or billed memory.',
    big: times(rss.native.value, rss.comparison.value), bigCaption: 'less memory',
    groups: [{ rows: pair(rss, 'MiB') }], unitStep: 1, unitLabel: '1 MiB',
    spec: { headline: `Hello route, ${times(rss.native.value, rss.comparison.value)} less memory`, scope: 'Hello-route process memory' },
  },
  'first-response': {
    title: 'First response after deploy, native vs Node.js',
    kicker: 'Native vs Node.js · Vercel Functions',
    headline: `First response after deploy, ${times(firstResponse.native.value, firstResponse.comparison.value)} sooner`,
    sub: 'Time to the first hello response on a fresh deployment, end to end. Lower is better.',
    method: 'ms · median of 5 deployment pairs · iad1',
    foot: 'Includes network and TLS. Fresh deployments, but not a certified cold start.',
    big: times(firstResponse.native.value, firstResponse.comparison.value), bigCaption: 'sooner first response',
    groups: [{ rows: pair(firstResponse, 'ms') }], unitStep: 5, unitLabel: '5 ms',
    spec: { scope: 'End to end, network included' },
  },
};
assert.equal(vr.length, 4);

function scale(max) {
  const raw = max / 4, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
  const top = Math.ceil(max / step - 1e-9) * step;
  const ticks = []; for (let t = 0; t <= top + step / 2; t += step) ticks.push(Number(t.toFixed(6)));
  return { top, ticks };
}
const tickText = t => String(Number(t.toFixed(2)));
const allRows = s => s.groups.flatMap(g => g.rows);
for (const s of Object.values(charts)) { s.scale = scale(Math.max(...allRows(s).map(r => r.value))); if (s.spec?.groups) s.spec.scale = scale(Math.max(...s.spec.groups.flatMap(g => g.rows).map(r => r.value))); }
const specOf = s => ({ ...s, ...s.spec });

// ---------- Code ----------
const stripFirst = s => s.split('\n').slice(1).join('\n');
const nativeCode = `// app/api/hello/route.native.ts
export function GET() {
  return Response.json({
    message: "Hello from native TypeScript!"
  });
}`;
// Spec Sheet route code: the user asked for a "use native" directive. A route.native.ts file is excluded from function
// extraction, and a file-level directive in any route file fails the build, so the directive goes where the adapter
// supports it: a named module-level async function with a JSON result, called from an ordinary route.ts handler.
const routeUseNativeCode = `// app/api/hello/route.ts
async function greet(name: string) {
  "use native";
  return { message: \`Hello, \${name}!\` };
}

export async function GET() {
  return Response.json(await greet("world"));
}`;
{
  const { extractFunctions } = await import(pathToFileURL(join(root, 'packages/next-scriptc/src/functions/extract.mjs')).href);
  const found = extractFunctions(stripFirst(routeUseNativeCode), '/project/app/api/hello/route.ts');
  assert.deepEqual(found?.functions.map(f => f.name), ['greet'], 'Route code directive must be a valid function-level "use native"');
}
const revenueSource = readFileSync(join(root, 'examples/demo/lib/revenue.ts'), 'utf8');
for (const f of ['"use native";', 'event.day < from || event.day > to', 'event.amountCents * event.quantity']) assert.ok(revenueSource.includes(f));
const useNativeCode = `// examples/demo/lib/revenue.ts · simplified
import type { RevenueEvent } from
  "../app/api/analytics/revenue/events.ts";

export async function revenue(
  events: RevenueEvent[], from: string, to: string
) {
  "use native";
  let revenueCents = 0;
  for (const event of events) {
    if (event.day < from || event.day > to) continue;
    revenueCents += event.amountCents * event.quantity;
  }
  return { from, to, revenueCents };
}`;
const darkTheme = {
  name: 'ref-dark', type: 'dark', colors: { 'editor.background': '#000', 'editor.foreground': P.punctuation },
  tokenColors: [
    { scope: ['comment'], settings: { foreground: P.comment } },
    { scope: ['keyword', 'storage', 'storage.type', 'keyword.operator'], settings: { foreground: P.keyword } },
    { scope: ['entity.name.function', 'entity.name.type', 'entity.name.namespace', 'support.function', 'support.type', 'support.class', 'support.constant', 'constant.numeric', 'constant.language', 'variable.language', 'meta.type.annotation'], settings: { foreground: P.type } },
    { scope: ['string', 'punctuation.definition.string'], settings: { foreground: P.string } },
    { scope: ['punctuation'], settings: { foreground: P.punctuation } },
  ],
};
// Paper theme for direction B: same token roles, darkened for 4.5:1+ on #f4f2ec.
const lightTheme = {
  name: 'paper', type: 'light', colors: { 'editor.background': '#f4f2ec', 'editor.foreground': '#1c1c1a' },
  tokenColors: [
    { scope: ['comment'], settings: { foreground: '#6f6c63' } },
    { scope: ['keyword', 'storage', 'storage.type', 'keyword.operator'], settings: { foreground: '#b3245b' } },
    { scope: darkTheme.tokenColors[2].scope, settings: { foreground: '#5a37c8' } },
    { scope: ['string', 'punctuation.definition.string'], settings: { foreground: '#17703f' } },
    { scope: ['punctuation'], settings: { foreground: '#1c1c1a' } },
  ],
};
const highlighter = await createHighlighter({ themes: [darkTheme, lightTheme], langs: ['typescript'] });
// Returns one HTML string per line. opts.dim → every non-directive line in a single muted color.
function codeLines(source, theme, opts = {}) {
  const { tokens } = highlighter.codeToTokens(source, { lang: 'typescript', theme });
  return tokens.map((line, i) => {
    const raw = source.split('\n')[i], directive = raw.includes('"use native"');
    const color = t => opts.dim && !directive ? opts.dim : opts.mono && directive ? opts.mono : t.color;
    if (directive) { // indent outside, the directive itself inside .dl so directions can mark it
      const indent = raw.match(/^\s*/)[0];
      const spans = line.map((t, k) => `<span style="color:${color(t)}">${esc(k === 0 ? t.content.trimStart() : t.content)}</span>`).join('');
      return { html: `${indent}<span class="dl">${spans}</span>`, directive, raw };
    }
    const spans = line.map(t => `<span style="color:${color(t)}">${esc(t.content)}</span>`).join('');
    return { html: spans || ' ', directive, raw };
  });
}

// ---------- Fonts, shell and in-page QA ----------
const nm = '../../node_modules/geist/dist/fonts';
const fontCss = [
  ['Geist', `${nm}/geist-sans/Geist-Regular.woff2`, 400, 'woff2'], ['Geist', `${nm}/geist-sans/Geist-Medium.woff2`, 500, 'woff2'], ['Geist', `${nm}/geist-sans/Geist-SemiBold.woff2`, 600, 'woff2'],
  ['Geist Mono', `${nm}/geist-mono/GeistMono-Regular.woff2`, 400, 'woff2'], ['Geist Mono', `${nm}/geist-mono/GeistMono-Medium.woff2`, 500, 'woff2'],
  ['Instrument Serif', '../fonts/InstrumentSerif-Regular.ttf', 400, 'truetype'],
].map(([f, u, w, t]) => `@font-face{font-family:'${f}';src:url(${u}) format('${t}');font-weight:${w};font-style:normal;font-display:block}`).join('')
  + `@font-face{font-family:'Instrument Serif';src:url(../fonts/InstrumentSerif-Italic.ttf) format('truetype');font-weight:400;font-style:italic;font-display:block}`;
for (const f of ['geist-sans/Geist-Regular.woff2', 'geist-sans/Geist-Medium.woff2', 'geist-sans/Geist-SemiBold.woff2', 'geist-mono/GeistMono-Regular.woff2', 'geist-mono/GeistMono-Medium.woff2'])
  assert.ok(existsSync(join(launch, 'node_modules/geist/dist/fonts', f)), `Run npm ci --prefix research/launch (missing ${f})`);

// Checks: fonts loaded, no text outside the canvas, no two text fragments' em boxes overlapping,
// no non-bleed element outside the canvas, smallest font size, and the visible text for numeric checks.
const qaScript = `(async()=>{const faces=['400 20px Geist','500 20px Geist','600 20px Geist','400 20px "Geist Mono"','500 20px "Geist Mono"','400 20px "Instrument Serif"','italic 400 20px "Instrument Serif"'];await Promise.all(faces.map(f=>document.fonts.load(f)));await document.fonts.ready;
const W=document.body.offsetWidth,H=document.body.offsetHeight,outside=[],frags=[];let min=1e9;const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n,id=0;
while(n=w.nextNode()){const t=n.textContent.trim();if(!t)continue;const el=n.parentElement;if(el.closest('script,style'))continue;min=Math.min(min,parseFloat(getComputedStyle(el).fontSize));const r=document.createRange();r.selectNodeContents(n);id++;for(const b of r.getClientRects()){if(b.width<1)continue;if(b.left<-.5||b.top<-.5||b.right>W+.5||b.bottom>H+.5)outside.push(t.slice(0,40));const fs=parseFloat(getComputedStyle(el).fontSize),em=b.top+(b.height-fs)/2;frags.push({id,t:t.slice(0,30),l:b.left,r:b.right,tp:em,bt:em+fs})}}
const overlap=[];for(let i=0;i<frags.length;i++)for(let j=i+1;j<frags.length;j++){const a=frags[i],b=frags[j];if(a.id===b.id)continue;const ix=Math.min(a.r,b.r)-Math.max(a.l,b.l);const iy=Math.min(a.bt,b.bt)-Math.max(a.tp,b.tp);if(ix>2&&iy>2)overlap.push(a.t+' × '+b.t+' ['+Math.round(iy)+'px]')}
const boxes=[];for(const el of document.querySelectorAll('body *')){if(el.closest('[data-bleed],script,style'))continue;const b=el.getBoundingClientRect();if(!b.width&&!b.height)continue;if(b.left<-.5||b.top<-.5||b.right>W+.5||b.bottom>H+.5)boxes.push(el.getAttribute('class')||el.tagName)}
let split=null;const L=document.querySelector('[data-col=left]'),R=document.querySelector('[data-col=right]');if(L&&R){const ext=(root,f,init)=>{let v=init;const tw=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let t;while(t=tw.nextNode()){if(!t.textContent.trim())continue;const g=document.createRange();g.selectNodeContents(t);for(const b of g.getClientRects())v=f(v,b)}return v};split={leftRight:ext(L,(v,b)=>Math.max(v,b.right),0),rightLeft:ext(R,(v,b)=>Math.min(v,b.left),1e9),leftText:L.innerText.replace(/\\s+/g,' ').trim(),rightText:R.innerText.replace(/\\s+/g,' ').trim()}}
const fonts=faces.every(f=>document.fonts.check(f));document.body.dataset.qa=JSON.stringify({fonts,split,outside,overlap:overlap.slice(0,10),boxes:boxes.slice(0,10),minFont:min,text:document.body.innerText.replace(/\\s+/g,' ').trim()});})()`;
const page = (w, h, title, css, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${fontCss}*{box-sizing:border-box;margin:0;padding:0}html,body{width:${w}px;height:${h}px;overflow:hidden}body{position:relative;font-family:Geist,sans-serif;-webkit-font-smoothing:antialiased;font-feature-settings:"tnum" 0}.num{font-variant-numeric:tabular-nums}h1,.sub,.cap{text-wrap:balance}${css}</style></head><body>${body}<script>${qaScript}</script></body></html>`;

// ---------- Unit tally (direction D) ----------
// Each square is one unitStep. Columns of `per` squares fill top-to-bottom, left-to-right. The last square is
// drawn at its exact fractional width, so the tally length is linear in the value and starts at zero.
function tally(value, step, pitch, per, color) {
  const units = value / step, full = Math.floor(units + 1e-9), frac = units - full, gap = Math.max(2, Math.round(pitch * 0.2)), size = pitch - gap;
  const cols = Math.ceil(units / per - 1e-9), w = Math.max(1, cols) * pitch - gap, h = per * pitch - gap;
  let out = '';
  for (let i = 0; i < full; i++) out += `<rect x="${Math.floor(i / per) * pitch}" y="${(i % per) * pitch}" width="${size}" height="${size}" fill="${color}"/>`;
  if (frac > 0.001) out += `<rect x="${Math.floor(full / per) * pitch}" y="${(full % per) * pitch}" width="${(size * frac).toFixed(2)}" height="${size}" fill="${color}"/>`;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${out}</svg>`;
}

// ---------- Direction A · Monolith ----------
const A = { bg: '#000', fg: '#ededed', muted: '#8f8f8f', faint: '#262626', other: '#3d3d3d', otherText: '#a1a1a1' };
function chartA(s) {
  const W = 1200, H = 800, L = 88, grouped = s.groups.length > 1, rows = allRows(s).length;
  const track = W - 2 * L - (grouped ? 230 : 0), thick = rows <= 2 ? 44 : grouped ? 10 : 12;
  const w = r => (track * r.value / s.scale.top).toFixed(1);
  const color = r => r.native ? '#fff' : A.other, tcolor = r => r.native ? '#fff' : A.otherText;
  // Ungrouped: label and value share a line above each bar. Grouped: value + series name follow each bar.
  const body = grouped
    ? s.groups.map(g => `<div class="grp"><div class="lab">${esc(g.name)}</div>${g.rows.map(r => `<div class="row"><div class="bar" style="width:${w(r)}px;height:${thick}px;background:${color(r)}"></div><span class="v num" style="color:${tcolor(r)}">${r.text} ${r.unit} <span class="tag">${esc(r.label)}</span></span></div>`).join('')}</div>`).join('')
    : allRows(s).map(r => `<div class="grp"><div class="line" style="width:${Math.max(Number(w(r)), 0)}px"><span class="lab" style="color:${tcolor(r)}">${esc(r.label)}</span></div><div class="row"><div class="bar" style="width:${w(r)}px;height:${thick}px;background:${color(r)}"></div><span class="v num" style="color:${tcolor(r)}">${r.text} ${r.unit}</span></div></div>`).join('');
  return page(W, H, s.title, `body{background:${A.bg};color:${A.fg}}
  .wrap{position:absolute;inset:68px ${L}px 56px;display:flex;flex-direction:column}
  .k{font:400 22px 'Geist Mono';color:${A.muted}}
  .big{margin:8px 0 0 -6px;font:600 136px/1 Geist;letter-spacing:-.045em;color:#fff}
  .cap{margin-top:4px;font:500 36px/1.1 Geist;letter-spacing:-.015em;color:#fff}
  .sub{margin-top:12px;font:400 24px/1.35 Geist;color:${A.muted};max-width:1000px}
  .chart{margin-top:auto;border-left:1px solid #555}.wrap>.sub{margin-bottom:28px}
  .grp{margin-bottom:${grouped ? 18 : rows <= 2 ? 40 : 16}px}.grp:last-child{margin-bottom:0}
  .lab{display:block;font:500 24px/1 Geist;color:${A.fg};margin:0 0 10px 16px;white-space:nowrap}
  .row{display:flex;align-items:center;gap:16px}.grp .row+.row{margin-top:6px}
  .bar{flex:none}.v{font:500 24px/1 Geist;white-space:nowrap}.tag{color:${A.muted};font-weight:400}
  .foot{margin-top:34px;font:400 22px/1.4 Geist;color:${A.muted}}`,
    `<div class="wrap"><div class="k">${esc(s.kicker)}</div><div class="big num">${esc(s.big)}</div><div class="cap">${esc(s.bigCaption)}</div><p class="sub">${esc(s.sub)}</p><div class="chart">${body}</div><p class="foot">${esc(s.foot)}</p></div>`);
}
function heroA(w, h, og) {
  const k = og ? .5 : 1;
  return page(w, h, 'next-scriptc: TypeScript, compiled to native', `body{background:#000;color:#fff}
  .wm{position:absolute;left:${72 * k}px;top:${64 * k}px;font:400 ${og ? 14 : 22}px 'Geist Mono';color:${A.fg}}
  h1{position:absolute;left:${68 * k}px;top:${(og ? 88 : 172)}px;font:600 ${og ? 52 : 96}px/1.04 Geist;letter-spacing:-.045em}
  p{position:absolute;left:${72 * k}px;bottom:${og ? 34 : 72}px;font:400 ${og ? 16 : 28}px/1.35 Geist;color:${A.muted}}
  p b{color:${A.fg};font-weight:400;font-family:'Geist Mono';font-size:.92em}`,
    `<div class="wm">next-scriptc</div><h1>TypeScript,<br>compiled to native.</h1><p>Name a Next.js route <b>route.native.ts</b> and it ships<br>as a native Vercel Function.</p>`);
}
function routeA() {
  const lines = codeLines(stripFirst(nativeCode), 'ref-dark');
  return page(1024, 576, 'A route.native.ts handler', `body{background:#000;color:#fff}
  .f{position:absolute;left:96px;top:84px;font:600 44px Geist;letter-spacing:-.03em}
  .c{position:absolute;left:96px;top:154px;font:400 24px Geist;color:${A.muted}}
  pre{position:absolute;left:96px;top:256px;font:400 25px/1.6 'Geist Mono';white-space:pre}`,
    `<div class="f">route.native.ts</div><div class="c">Rename the file. The route compiles to native code.</div><pre>${lines.map(l => l.html).join('\n')}</pre>`);
}
function useA() {
  const lines = codeLines(stripFirst(useNativeCode), 'ref-dark', { dim: '#5c5c5c' });
  return page(1000, 800, 'Offload one function with use native', `body{background:#000;color:#fff}
  .f{position:absolute;left:88px;top:76px;font:600 44px Geist;letter-spacing:-.03em}
  .c{position:absolute;left:88px;top:140px;width:820px;font:400 24px/1.4 Geist;color:${A.muted}}
  pre{position:absolute;left:88px;top:250px;font:400 21px/1.75 'Geist Mono';white-space:pre}
  .dl{color:#fff}`,
    `<div class="f">One line moves one function.</div><div class="c">“use native” compiles this function to native code. The rest of the app stays on Node.js.</div><pre>${lines.map(l => l.html).join('\n')}</pre>`);
}

// ---------- Direction B · Editorial ----------
const B = { bg: '#f4f2ec', ink: '#151514', muted: '#5f5d57', rule: '#d8d4c9', native: '#1d4ed8', other: '#bdb8ab', paper2: '#ebe7dc' };
function chartB(s) {
  const W = 1200, H = 800, L = 72, labelW = s.groups.length > 1 ? 280 : 300, valueRoom = 150, track = W - 2 * L - labelW - valueRoom;
  const grouped = s.groups.length > 1, n = allRows(s).length, thick = n <= 2 ? 64 : grouped ? 24 : 34;
  const barRow = r => `<div class="br"><div class="bar" style="width:${(track * r.value / s.scale.top).toFixed(1)}px;height:${thick}px;background:${r.native ? B.native : B.other}"></div><span class="v num${r.native ? ' nv' : ''}">${r.text}${grouped ? '' : ` ${r.unit}`}</span></div>`;
  const rowsHtml = s.groups.map(g => grouped
    ? `<div class="r g"><div class="l">${esc(g.name)}</div><div class="t">${g.rows.map(barRow).join('')}</div></div>`
    : g.rows.map(r => `<div class="r"><div class="l${r.native ? ' nv' : ''}">${esc(r.label)}</div><div class="t">${barRow(r)}</div></div>`).join('')).join('');
  const grid = s.scale.ticks.map(t => `<div class="gl" style="left:${(labelW + track * t / s.scale.top).toFixed(1)}px"><span>${tickText(t)}</span></div>`).join('');
  const legend = grouped ? `<div class="lg"><i style="background:${B.native}"></i>Native<i style="background:${B.other}"></i>Node.js<span>${allRows(s)[0].unit} per request</span></div>` : '';
  return page(W, H, s.title, `body{background:${B.bg};color:${B.ink}}
  .wrap{position:absolute;inset:56px ${L}px 44px;display:flex;flex-direction:column}
  .rule{height:6px;background:${B.ink};flex:none}
  .k{margin-top:22px;font:500 22px Geist;letter-spacing:.06em;text-transform:uppercase;color:${B.muted}}
  h1{margin-top:12px;font:400 60px/1.04 'Instrument Serif';letter-spacing:-.01em;max-width:1000px}
  .sub{margin-top:14px;font:400 24px/1.35 Geist;color:${B.muted}}
  .chart{position:relative;margin-top:auto;padding-bottom:40px}
  .lg{display:flex;align-items:center;gap:10px;font:500 22px Geist;margin:0 0 14px ${labelW}px}.lg i{width:16px;height:16px;display:inline-block}.lg i+i,.lg i:nth-of-type(2){margin-left:18px}.lg span{margin-left:auto;color:${B.muted};font-weight:400}
  .rows{position:relative}
  .r{display:flex;align-items:center;min-height:${thick + (n <= 2 ? 48 : 18)}px}.g{padding:8px 0;border-top:1px solid ${B.rule}}.g:first-child{border-top:0}
  .l{width:${labelW}px;flex:none;font:400 24px/1.2 Geist;padding-right:20px}.l.nv{font-weight:600}
  .t{flex:1;position:relative;z-index:1}.br{display:flex;align-items:center;gap:12px}.br+.br{margin-top:6px}
  .v{font:500 24px Geist;white-space:nowrap;color:${B.muted}}.v.nv{color:${B.ink};font-weight:600}
  .gl{position:absolute;top:0;bottom:-8px;border-left:1px solid ${B.rule}}.gl:first-child{border-left:2px solid ${B.ink}}
  .gl span{position:absolute;bottom:-34px;transform:translateX(-50%);font:400 22px Geist;color:${B.muted}}
  .foot{flex:none;border-top:1px solid ${B.rule};padding-top:14px;margin-top:18px;font:400 22px/1.4 Geist;color:${B.muted};display:flex;gap:24px;justify-content:space-between}
  .foot b{font-weight:400;color:${B.ink}}`,
    `<div class="wrap"><div class="rule"></div><div class="k">${esc(s.kicker)}</div><h1>${esc(s.headline)}</h1><p class="sub">${esc(s.sub)}</p><div class="chart">${legend}<div class="rows">${grid}${rowsHtml}</div></div><p class="foot"><span>${esc(s.foot)}</span></p></div>`);
}
function heroB(w, h, og) {
  const lines = codeLines(nativeCode, 'paper');
  if (og) return page(w, h, 'next-scriptc', `body{background:${B.bg};color:${B.ink}}
    .rule{position:absolute;left:36px;right:36px;top:30px;height:4px;background:${B.ink}}
    .k{position:absolute;left:36px;top:46px;font:500 13px Geist;letter-spacing:.08em;text-transform:uppercase;color:${B.muted}}
    h1{position:absolute;left:36px;top:82px;width:520px;font:400 50px/1.02 'Instrument Serif'}
    p{position:absolute;left:36px;bottom:30px;font:400 15px Geist;color:${B.muted}}p b{font:400 14px 'Geist Mono';color:${B.ink}}`,
    `<div class="rule"></div><div class="k">next-scriptc</div><h1>TypeScript routes, compiled to native Vercel Functions.</h1><p>A Next.js adapter · <b>route.native.ts</b></p>`);
  return page(w, h, 'next-scriptc', `body{background:${B.bg};color:${B.ink}}
  .rule{position:absolute;left:64px;right:64px;top:56px;height:6px;background:${B.ink}}
  .k{position:absolute;left:64px;top:84px;font:500 20px Geist;letter-spacing:.08em;text-transform:uppercase;color:${B.muted}}
  h1{position:absolute;left:64px;top:150px;width:520px;font:400 72px/1.02 'Instrument Serif';letter-spacing:-.01em}
  .note{position:absolute;left:64px;bottom:60px;width:470px;font:italic 400 28px/1.25 'Instrument Serif';color:${B.muted}}
  figure{position:absolute;left:620px;right:64px;top:150px;bottom:60px;background:${B.paper2};padding:34px 30px;display:flex;flex-direction:column;justify-content:center}
  pre{font:400 16px/1.8 'Geist Mono';white-space:pre}`,
    `<div class="rule"></div><div class="k">next-scriptc</div><h1>TypeScript routes, compiled to native Vercel Functions.</h1><p class="note">A Next.js adapter powered by scriptc. No fork of Next.js.</p><figure><pre>${lines.map(l => l.html).join('\n')}</pre></figure>`);
}
function routeB() {
  const lines = codeLines(stripFirst(nativeCode), 'paper');
  return page(1024, 576, 'A route.native.ts handler', `body{background:${B.bg};color:${B.ink}}
  .m{position:absolute;left:56px;top:64px;width:260px;border-top:4px solid ${B.ink};padding-top:18px;font:italic 400 34px/1.15 'Instrument Serif'}
  .m small{display:block;margin-top:18px;font:normal 400 20px/1.4 Geist;color:${B.muted}}
  figure{position:absolute;left:360px;right:56px;top:64px;bottom:64px;background:${B.paper2};padding:0 36px;display:flex;flex-direction:column;justify-content:center}
  .fn{font:500 21px 'Geist Mono';padding-bottom:16px;margin-bottom:22px;border-bottom:1px solid ${B.rule}}
  pre{font:400 20.5px/1.7 'Geist Mono';white-space:pre}`,
    `<div class="m">One file suffix moves a route to native code.<small>Same Next.js app, same Web Response API.</small></div><figure><div class="fn">app/api/hello/route.native.ts</div><pre>${lines.map(l => l.html).join('\n')}</pre></figure>`);
}
function useB() {
  const lines = codeLines(stripFirst(useNativeCode), 'paper');
  return page(1000, 800, 'Offload one function with use native', `body{background:${B.bg};color:${B.ink}}
  .rule{position:absolute;left:56px;right:56px;top:52px;height:5px;background:${B.ink}}
  h1{position:absolute;left:56px;top:76px;width:860px;font:400 50px/1.05 'Instrument Serif'}
  .fn{position:absolute;left:56px;top:150px;font:400 20px 'Geist Mono';color:${B.muted}}
  pre{position:absolute;left:56px;right:56px;top:212px;font:400 20.5px/1.78 'Geist Mono';white-space:pre;background:${B.paper2};padding:26px 28px}
  .dl{background:#f1d77a;box-shadow:0 0 0 5px #f1d77a}
  .note{position:absolute;right:84px;top:${238 + 6 * 20.5 * 1.78 - 2}px;font:italic 400 30px/1.2 'Instrument Serif';color:${B.ink}}`,
    `<div class="rule"></div><h1>Offload one function with a directive.</h1><div class="fn">examples/demo/lib/revenue.ts · simplified</div><pre>${lines.map(l => l.html).join('\n')}</pre><div class="note">← compiles to native</div>`);
}

// ---------- Direction C · Spec sheet ----------
const C = { bg: '#0a0a0a', fg: '#ededed', muted: '#a1a1a1', grid: '#1f1f1f', cross: P.crosshair, blue: '#006bff' };
const cross = (x, y, arm = 14) => `<i class="x" style="left:${x - arm}px;top:${y}px;width:${arm * 2}px;height:1px"></i><i class="x" style="left:${x}px;top:${y - arm}px;width:1px;height:${arm * 2}px"></i>`;
const frame = (w, h, xs, ys, crosses) => xs.map(x => `<i class="ln" style="left:${x}px;top:0;width:1px;height:${h}px"></i>`).join('') + ys.map(y => `<i class="ln" style="left:0;top:${y}px;width:${w}px;height:1px"></i>`).join('') + crosses.map(([x, y, a]) => cross(x, y, a)).join('');
const frameCss = `.ln{position:absolute;background:${C.grid}}.x{position:absolute;background:${C.cross}}`;
// Left column: every word (headline, scope label, description, method, caveat). Right column: the chart alone.
function chartC(s0) {
  const s = specOf(s0);
  const W = 1200, H = 800, X0 = 488, X1 = 1136, Y0 = 64, Y1 = 736, grouped = s.groups.length > 1;
  const plotL = X0 + 84, plotR = X1 - 44, top = grouped ? 196 : 150, base = 604, ph = base - top;
  const rows = allRows(s), slots = grouped ? s.groups.length : rows.length, slotW = (plotR - plotL) / slots;
  let marks = s.scale.ticks.map(t => { const y = base - ph * t / s.scale.top; return `<i class="gr${t === 0 ? ' z' : ''}" style="left:${plotL}px;top:${y.toFixed(1)}px;width:${plotR - plotL}px"></i><span class="tk" style="right:${W - plotL + 14}px;top:${(y - 13).toFixed(1)}px">${tickText(t)}</span>`; }).join('');
  const col = (r, cx, bw) => { const bh = ph * r.value / s.scale.top; return `<i class="b" style="left:${(cx - bw / 2).toFixed(1)}px;top:${(base - bh).toFixed(1)}px;width:${bw}px;height:${bh.toFixed(1)}px;background:${r.native ? '#fff' : C.blue}"></i><span class="val num" style="left:${(cx - 70).toFixed(1)}px;top:${(base - bh - 44).toFixed(1)}px">${r.text}</span>`; };
  if (grouped) s.groups.forEach((g, i) => {
    const cx = plotL + slotW * (i + .5);
    g.rows.forEach((r, j) => { marks += col(r, cx + (j ? 1 : -1) * 34, 56); });
    marks += `<span class="cl" style="left:${(cx - slotW / 2).toFixed(1)}px;width:${slotW.toFixed(1)}px;top:${base + 18}px">${esc(g.name)}</span>`;
  });
  else rows.forEach((r, i) => {
    const cx = plotL + slotW * (i + .5), bw = rows.length <= 2 ? 112 : 84;
    marks += col(r, cx, bw) + `<span class="cl${r.native ? ' nv' : ''}" style="left:${(cx - slotW / 2).toFixed(1)}px;width:${slotW.toFixed(1)}px;top:${base + 18}px">${r.short ? r.short.filter(Boolean).map(esc).join('<br>') : esc(r.label)}</span>`;
  });
  const legend = grouped ? `<div class="lg"><i style="background:#fff"></i>Native<i style="background:${C.blue}"></i>Node.js</div>` : '';
  return page(W, H, s.title, `body{background:${C.bg};color:${C.fg}}${frameCss}
  .lc{position:absolute;left:96px;top:${Y0 + 40}px;width:360px;bottom:${H - Y1 + 32}px;display:flex;flex-direction:column}
  h1{font:600 44px/1.08 Geist;letter-spacing:-.03em}
  .sc{margin-top:18px;font:500 20px/1.35 'Geist Mono';color:#fff;display:flex;gap:10px;align-items:baseline}.sc i{flex:none;width:10px;height:10px;background:${C.blue};transform:translateY(-1px)}
  .sub{margin-top:16px;font:400 21px/1.4 Geist;color:${C.muted}}
  .bt{margin-top:auto;padding-top:20px;border-top:1px solid ${C.grid}}
  .m{font:400 20px/1.45 'Geist Mono';color:${C.muted}}
  .foot{margin-top:10px;font:400 20px/1.4 Geist;color:${C.muted}}
  .gr{position:absolute;height:1px;background:${C.grid}}.gr.z{background:#555}
  .tk{position:absolute;font:400 22px 'Geist Mono';color:${C.muted}}
  .b{position:absolute}.val{position:absolute;width:140px;text-align:center;font:500 30px Geist}
  .cl{position:absolute;text-align:center;font:400 22px/1.25 Geist;color:${C.muted}}.cl.nv{color:#fff;font-weight:500}
  .lg{position:absolute;right:${W - plotR}px;top:112px;display:flex;align-items:center;gap:10px;font:400 22px Geist;color:${C.muted}}.lg i{width:14px;height:14px}.lg i:nth-of-type(2){margin-left:16px}`,
    frame(W, H, [64, X0, X1], [Y0, Y1], [[64, Y0, 18], [X0, Y0, 14], [X1, Y1, 18], [X0, Y1, 14]])
    + `<div class="lc" data-col="left"><h1>${esc(s.headline)}</h1>${s.scope ? `<p class="sc"><i></i>${esc(s.scope)}</p>` : ''}<p class="sub">${esc(s.sub)}</p><div class="bt"><p class="m">${esc(s.method)}</p><p class="foot">${esc(s.foot)}</p></div></div><div data-col="right">${legend}${marks}</div>`);
}
function heroC(w, h, og) {
  const lines = codeLines(nativeCode, 'ref-dark');
  if (og) return page(w, h, 'next-scriptc', `body{background:${C.bg};color:#fff}${frameCss}
    .wm{position:absolute;left:44px;top:40px;font:400 13px 'Geist Mono';color:${C.muted}}
    h1{position:absolute;left:44px;top:84px;font:600 40px/1.05 Geist;letter-spacing:-.035em}
    .p{position:absolute;left:44px;top:232px;font:400 14px 'Geist Mono';color:${C.muted}}.p b{color:#fff;font-weight:400}`,
    frame(w, h, [24, 576], [24, 291], [[24, 24, 9], [576, 291, 9]]) + `<div class="wm">next-scriptc</div><h1>TypeScript, compiled<br>to native Vercel<br>Functions.</h1><div class="p"><b>route.native.ts</b> → scriptc → native binary</div>`);
  return page(w, h, 'next-scriptc', `body{background:${C.bg};color:#fff}${frameCss}
  .wm{position:absolute;left:64px;top:72px;font:400 20px 'Geist Mono';color:${C.fg}}
  h1{position:absolute;left:64px;top:186px;font:600 56px/1.06 Geist;letter-spacing:-.035em}
  .p{position:absolute;left:64px;top:474px;font:400 20px 'Geist Mono';color:${C.muted}}.p b{color:#fff;font-weight:400}
  pre{position:absolute;left:730px;top:228px;font:400 16px/1.75 'Geist Mono';white-space:pre}`,
    frame(w, h, [704, 1184], [174, 452, 564], [[704, 174, 12], [1184, 452, 12], [704, 564, 12]])
    + `<div class="wm">next-scriptc</div><h1>TypeScript, compiled<br>to native Vercel<br>Functions.</h1><div class="p"><b>route.native.ts</b> → scriptc → native binary</div><pre>${lines.map(l => l.html).join('\n')}</pre>`);
}
function routeC() {
  const lines = codeLines(stripFirst(routeUseNativeCode), 'ref-dark');
  const di = lines.findIndex(l => l.directive), lh = 36, top = 196;
  return page(1024, 576, 'A route that calls a use native function', `body{background:${C.bg};color:#fff}${frameCss}
  .tab{position:absolute;left:96px;top:96px;font:400 20px 'Geist Mono';color:${C.fg};display:flex;gap:14px;align-items:center}
  .tab span{font-size:20px;color:${C.blue};border:1px solid #1d3f73;padding:3px 10px}
  .hl{position:absolute;left:73px;right:73px;top:${top + di * lh - 2}px;height:${lh}px;background:#141414;border-left:2px solid #fff}
  .g{position:absolute;left:96px;top:${top}px;font:400 22px/${lh}px 'Geist Mono';color:#4b4b4b;text-align:right;width:28px;white-space:pre}
  pre{position:absolute;left:156px;top:${top}px;font:400 22px/${lh}px 'Geist Mono';white-space:pre}
  .a{position:absolute;right:104px;top:${top + di * lh + 5}px;font:400 20px 'Geist Mono';color:${C.muted}}`,
    frame(1024, 576, [72, 952], [64, 160, 512], [[72, 64, 14], [952, 512, 14], [72, 160, 10]])
    + `<div class="hl"></div><div class="tab">app/api/hello/route.ts<span>use native</span></div><div class="g">${lines.map((_, i) => i + 1).join('\n')}</div><pre>${lines.map(l => l.html).join('\n')}</pre><div class="a">← compiles to native</div>`);
}
function useC() {
  const lines = codeLines(stripFirst(useNativeCode), 'ref-dark');
  const di = lines.findIndex(l => l.directive), lh = 33, top = 186;
  return page(1000, 800, 'Offload one function with use native', `body{background:${C.bg};color:#fff}${frameCss}
  .tab{position:absolute;left:96px;top:96px;font:400 20px 'Geist Mono';color:${C.fg}}
  .hl{position:absolute;left:73px;right:73px;top:${top + di * lh - 2}px;height:${lh}px;background:#141414;border-left:2px solid #fff}
  .g{position:absolute;left:96px;top:${top}px;font:400 20px/${lh}px 'Geist Mono';color:#4b4b4b;text-align:right;width:28px;white-space:pre}
  pre{position:absolute;left:148px;top:${top}px;font:400 20px/${lh}px 'Geist Mono';white-space:pre}
  .a{position:absolute;right:104px;top:${top + di * lh + 3}px;font:400 20px 'Geist Mono';color:${C.muted}}
  .foot{position:absolute;left:96px;bottom:${800 - 736 + 30}px;font:400 22px Geist;color:${C.muted}}.foot b{color:#fff;font-weight:500}`,
    frame(1000, 800, [72, 928], [64, 160, 736], [[72, 64, 14], [928, 736, 14], [72, 160, 10]])
    + `<div class="hl"></div><div class="tab">examples/demo/lib/revenue.ts · simplified</div><div class="g">${lines.map((_, i) => i + 1).join('\n')}</div><pre>${lines.map(l => l.html).join('\n')}</pre><div class="a">← native</div><p class="foot"><b>One directive</b> compiles this function to native. The route around it stays on Node.js.</p>`);
}

// ---------- Direction D · Signal ----------
const D = { bg: '#1c3cf4', fg: '#ffffff', muted: 'rgba(255,255,255,.8)', dim: 'rgba(255,255,255,.3)', card: '#08090f' };
function chartD(s) {
  const W = 1200, H = 800, L = 80, labelW = 300, avail = W - 2 * L - labelW;
  const grouped = s.groups.length > 1, rows = allRows(s);
  const areaH = grouped ? 380 : rows.length <= 2 ? 300 : 360, gapRow = grouped ? 10 : 22, groupHead = grouped ? 36 : 0;
  // Pick squares-per-column that gives the largest square while fitting both width and height.
  const fit = per => Math.floor(Math.min(rows.length <= 2 ? 34 : 28, avail / Math.max(...rows.map(r => Math.ceil(r.value / s.unitStep / per - 1e-9))), (areaH - rows.length * gapRow - s.groups.length * groupHead) / (rows.length * per)));
  const per = [1, 2, 3, 4, 5, 6, 8, 10].reduce((best, p) => fit(p) > fit(best) ? p : best, 1), pitch = fit(per);
  const row = r => `<div class="r"><div class="l"><span class="val num${r.native ? '' : ' o'}">${r.text}<small> ${r.unit}</small></span><span class="lab">${esc(r.label)}</span></div>${tally(r.value, s.unitStep, pitch, per, r.native ? '#fff' : D.dim)}</div>`;
  const body = s.groups.map(g => (grouped ? `<div class="gh">${esc(g.name)}</div>` : '') + g.rows.map(row).join('')).join('');
  return page(W, H, s.title, `body{background:${D.bg};color:${D.fg}}
  .wrap{position:absolute;inset:64px ${L}px 48px;display:flex;flex-direction:column}
  .top{display:flex;justify-content:space-between;font:400 22px 'Geist Mono';color:${D.muted}}
  .top b{font-weight:400;display:flex;align-items:center;gap:10px}.top i{width:16px;height:16px;background:#fff;display:inline-block}
  h1{margin-top:22px;font:600 54px/1.05 Geist;letter-spacing:-.035em;max-width:1000px}
  .sub{margin-top:14px;font:400 24px/1.35 Geist;color:${D.muted}}
  .chart{margin-top:auto;padding-top:28px}
  .gh{font:500 22px Geist;color:${D.muted};margin:14px 0 6px;text-transform:none}.gh:first-child{margin-top:0}
  .r{display:flex;align-items:center;margin-bottom:${gapRow}px}.val small{white-space:nowrap}.r:last-child{margin-bottom:0}
  .l{width:${labelW}px;flex:none;display:flex;flex-direction:${grouped ? 'row' : 'column'};gap:${grouped ? 14 : 2}px;align-items:baseline;padding-right:24px;white-space:nowrap}
  .lab{font:400 ${grouped ? 22 : 23}px Geist;color:${D.muted}}.val{font:600 ${rows.length <= 2 ? 44 : grouped ? 28 : 32}px/1.1 Geist;letter-spacing:-.02em}.val small{font-size:20px;font-weight:400;color:${D.muted}}
  .val.o{color:${D.muted}}
  .foot{margin-top:30px;font:400 22px/1.4 Geist;color:${D.muted}}`,
    `<div class="wrap"><div class="top"><span>${esc(s.kicker)}</span><b><i></i>= ${esc(s.unitLabel)}</b></div><h1>${esc(s.headline)}</h1><p class="sub">${esc(s.sub)}</p><div class="chart">${body}</div><p class="foot">${esc(s.foot)}</p></div>`);
}
const cardCss = `.card{background:${D.card};border-radius:14px;box-shadow:0 30px 80px rgba(4,10,60,.45)}.card .bar{display:flex;align-items:center;gap:12px;border-bottom:1px solid #1d1f2a;font-family:'Geist Mono';color:${P.comment}}.card .bar span{color:#fff}`;
function heroD(w, h, og) {
  const lines = codeLines(stripFirst(nativeCode), 'ref-dark');
  if (og) return page(w, h, 'next-scriptc', `body{background:${D.bg};color:#fff;text-align:center}
    .wm{position:absolute;left:0;right:0;top:34px;font:400 13px 'Geist Mono';color:${D.muted}}
    h1{position:absolute;left:0;right:0;top:78px;font:600 44px/1.04 Geist;letter-spacing:-.04em}
    .chip{position:absolute;left:50%;transform:translateX(-50%);top:212px;font:400 16px 'Geist Mono';background:${D.card};padding:10px 18px;border-radius:999px;white-space:nowrap}`,
    `<div class="wm">next-scriptc</div><h1>TypeScript, compiled to<br>native Vercel Functions.</h1><div class="chip">app/api/hello/route.native.ts</div>`);
  return page(w, h, 'next-scriptc', `body{background:${D.bg};color:#fff}${cardCss}
  .wm{position:absolute;left:72px;top:64px;font:400 20px 'Geist Mono';color:${D.muted}}
  h1{position:absolute;left:72px;top:150px;width:520px;font:600 66px/1.02 Geist;letter-spacing:-.045em}
  p{position:absolute;left:72px;bottom:64px;width:480px;font:400 24px/1.4 Geist;color:${D.muted}}
  .card{position:absolute;left:640px;top:150px;width:620px;height:560px}
  .card .bar{padding:20px 28px;font-size:16px}
  pre{padding:30px 28px;font:400 17px/1.8 'Geist Mono';white-space:pre}`,
    `<div class="wm">next-scriptc</div><h1>TypeScript, compiled to native Vercel Functions.</h1><p>A Next.js adapter powered by scriptc. Rename a route to <b style="font-weight:500;color:#fff">.native.ts</b></p><div class="card" data-bleed><div class="bar"><span>route.native.ts</span>app/api/hello</div><pre>${lines.map(l => l.html).join('\n')}</pre></div>`);
}
function routeD() {
  const lines = codeLines(stripFirst(nativeCode), 'ref-dark');
  return page(1024, 576, 'A route.native.ts handler', `body{background:${D.bg};color:#fff}${cardCss}
  .card{position:absolute;left:112px;right:112px;top:80px;bottom:80px;display:flex;flex-direction:column}
  .card .bar{padding:22px 34px;font-size:19px}
  pre{flex:1;display:flex;align-items:center;padding:0 34px;font:400 22.5px/1.7 'Geist Mono';white-space:pre}`,
    `<div class="card"><div class="bar"><span>route.native.ts</span>app/api/hello</div><pre><code>${lines.map(l => l.html).join('\n')}</code></pre></div>`);
}
function useD() {
  const lines = codeLines(stripFirst(useNativeCode), 'ref-dark', { mono: D.bg });
  return page(1000, 800, 'Offload one function with use native', `body{background:${D.bg};color:#fff}${cardCss}
  h1{position:absolute;left:72px;top:60px;font:600 40px/1.1 Geist;letter-spacing:-.03em}
  .c{position:absolute;left:72px;top:112px;font:400 22px Geist;color:${D.muted}}
  .card{position:absolute;left:72px;right:72px;top:176px;bottom:56px}
  .card .bar{padding:18px 30px;font-size:17px}
  pre{padding:22px 30px;font:400 19.5px/1.62 'Geist Mono';white-space:pre}
  .dl{background:#fff;border-radius:2px;box-shadow:0 0 0 6px #fff}`,
    `<h1>One directive, one native function.</h1><div class="c">The rest of the route stays on Node.js.</div><div class="card"><div class="bar"><span>revenue.ts</span>examples/demo/lib · simplified</div><pre>${lines.map(l => l.html).join('\n')}</pre></div>`);
}

// ---------- Asset matrix ----------
export const directions = [
  { id: 'a-monolith', name: 'Monolith' }, { id: 'b-editorial', name: 'Editorial' }, { id: 'c-spec', name: 'Spec sheet' }, { id: 'd-signal', name: 'Signal' },
];
const render = { a: { chart: chartA, hero: heroA, route: routeA, use: useA }, b: { chart: chartB, hero: heroB, route: routeB, use: useB }, c: { chart: chartC, hero: heroC, route: routeC, use: useC }, d: { chart: chartD, hero: heroD, route: routeD, use: useD } };
const assets = [
  { id: 'hero', w: 1200, h: 628, make: r => r.hero(1200, 628, false) },
  { id: 'og', w: 600, h: 315, make: r => r.hero(600, 315, true) },
  { id: 'code-route-native', w: 1024, h: 576, make: r => r.route() },
  { id: 'code-use-native', w: 1000, h: 800, make: r => r.use() },
  ...Object.keys(charts).map(id => ({ id, w: 1200, h: 800, chart: true, dirs: charts[id].dirs, make: r => r.chart(charts[id]) })),
];
const only = process.argv.find(a => a.startsWith('--only='))?.slice(7).split(',');
const dirsArg = process.argv.find(a => a.startsWith('--dirs='))?.slice(7).split(',');
const jobs = assets.filter(a => !only || only.includes(a.id)).flatMap(a => directions.filter(d => (!a.dirs || a.dirs.includes(d.id)) && (!dirsArg || dirsArg.includes(d.id))).map(d => ({ ...a, dir: d, name: `${a.id}--${d.id}`, html: a.make(render[d.id[0]]) })));
for (const j of jobs) writeFileSync(join(srcDir, `${j.name}.html`), j.html);

// Expected strings per chart for validate.mjs (computed here from chart-data, rechecked there independently).
const expected = (id, dir) => { const s = dir === 'c-spec' ? specOf(charts[id]) : charts[id]; return { headline: s.headline, values: allRows(s).map(r => r.text), big: s.big }; };

const chrome = [process.env.CHROME_BIN, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].filter(Boolean).find(existsSync);
const manifestPath = join(dir, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : [];
if (!process.argv.includes('--html-only')) {
  assert.ok(chrome, 'No local Chrome. Set CHROME_BIN or use --html-only.');
  const run = j => new Promise((ok, fail) => {
    const work = mkdtempSync(join(tmpdir(), 'scriptc-redesign-')), out = join(pngDir, `${j.name}.png`);
    const p = spawn(chrome, ['--headless', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--hide-scrollbars', '--allow-file-access-from-files', '--force-device-scale-factor=2', `--window-size=${j.w},${j.h}`, '--virtual-time-budget=3000', `--user-data-dir=${join(work, 'profile')}`, `--screenshot=${out}`, '--dump-dom', pathToFileURL(join(srcDir, `${j.name}.html`)).href]);
    let stdout = ''; p.stdout.on('data', d => stdout += d); p.stderr.on('data', () => {});
    const timer = setTimeout(() => p.kill('SIGKILL'), 45000);
    p.on('close', async code => {
      clearTimeout(timer); rmSync(work, { recursive: true, force: true });
      try {
        assert.equal(code, 0, `Chrome failed: ${j.name}`);
        const m = stdout.match(/data-qa="([^"]*)"/); assert.ok(m, `QA did not finish: ${j.name}`);
        const qa = JSON.parse(m[1].replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&'));
        const buf = await sharp(out).png({ compressionLevel: 9, adaptiveFiltering: true, palette: false }).toBuffer();
        writeFileSync(out, buf);
        const meta = await sharp(out).metadata();
        ok({ asset: j.id, direction: j.dir.id, name: j.name, png: `png/${j.name}.png`, src: `src/${j.name}.html`, width: meta.width, height: meta.height, cssWidth: j.w, bytes: buf.length, qa, ...(j.chart ? { expected: expected(j.id, j.dir.id) } : {}) });
      } catch (e) { fail(e); }
    });
  });
  const results = [];
  for (let i = 0; i < jobs.length; i += 6) results.push(...await Promise.all(jobs.slice(i, i + 6).map(run)));
  const byName = new Map(manifest.map(m => [m.name, m]));
  for (const r of results) {
    byName.set(r.name, r);
    const q = r.qa, flags = [!q.fonts && 'FONTS', q.outside.length && `OUTSIDE ${q.outside}`, q.overlap.length && `OVERLAP ${q.overlap.join(' | ')}`, q.boxes.length && `BOX ${q.boxes}`].filter(Boolean);
    console.log(`${r.name}: ${r.width}×${r.height} ${Math.round(r.bytes / 1024)} KB · min text ${(q.minFont * 600 / r.cssWidth).toFixed(1)}px @600w${flags.length ? ' · ' + flags.join(' · ') : ''}`);
  }
  const order = jobs.length ? [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)) : manifest;
  writeFileSync(manifestPath, JSON.stringify(order, null, 2) + '\n');
}
highlighter.dispose();
if (existsSync(manifestPath)) await import('./gallery.mjs');
console.log(`Wrote ${jobs.length} sources${process.argv.includes('--html-only') ? '' : ' and PNGs'}.`);
