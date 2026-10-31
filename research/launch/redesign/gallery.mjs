// Writes index.html: switch by asset or by direction, compare with the published originals, check at phone width.
// Run by generate.mjs; can also run alone: node research/launch/redesign/gallery.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const data = JSON.parse(readFileSync(join(dir, '../chart-data.json'), 'utf8'));
const extra = JSON.parse(readFileSync(join(dir, 'data-extra.json'), 'utf8'));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const report = src => `<a href="../../../${src}">${esc(src)}</a>`;
const m = label => data.vercel.metrics.find(x => x.label === label);
const fr = m('First response after deploy'), rss = m('Serving process RSS'), md = m('Markdown warm latency');
const vr = extra.vectorRss.results;

const directions = [
  ['a-monolith', 'Monolith', 'The number is the image. One large figure, one sentence, thin direct-labelled bars, no axes. Black, white, one gray.'],
  ['b-editorial', 'Editorial', 'Financial-page chart on warm paper. Serif sentence headline, ranked horizontal bars with ticks, native the only saturated color.'],
  ['c-spec', 'Spec sheet', 'Lineage of the current assets, decluttered. Framed split: plain text left, one column chart right, mono method label.'],
  ['d-signal', 'Signal', 'Saturated blue field. Quantities drawn as counted squares (stated unit each, exact partial squares), so zero-based by construction.'],
];
const G = '../../../.github/assets/';
const assets = [
  { id: 'hero', name: 'Hero', original: G + 'hero.png', notes: 'README header. Plain claim plus how you use it (rename a route to <code>route.native.ts</code>). The Monolith hero drops code entirely; the others keep the hello route.' },
  { id: 'og', name: 'OG image', original: G + 'og.png', notes: 'Social card, 1200×630 export. Text only or a single filename chip, so it survives thumbnail size.' },
  { id: 'code-route-native', name: 'Code: route.native.ts', original: G + 'code-route-native.png', notes: 'Same hello handler as the original. The file name moves out of a code comment and becomes the subject.' },
  { id: 'code-use-native', name: 'Code: "use native"', original: G + 'code-use-native.png', notes: 'Same simplified revenue function (generator asserts the directive, range predicate and cents arithmetic still exist in <code>examples/demo/lib/revenue.ts</code>). Each direction isolates the one directive line.' },
  { id: 'vector-search', name: 'Vector search (hosted)', original: G + 'chart-vector-vercel.png', notes: `Replaces “Int8 search on Vercel Functions”. Headline describes the work (find the 10 closest of ${data.vector.rows.value.toLocaleString('en-US')} embeddings); int8 and 768 dimensions are demoted to the method label (Spec sheet) and this page. Server-side compute p50 on Vercel Functions iad1, request parse → top-10 → JSON, 3 fresh preview sets × 40 C=1 requests per variant, identical top-10 on every response. Excludes network/IPC. Native = patched scriptc with CPU dispatch; stock scriptc with <code>Math.imul</code> already reaches ${'10.087'} ms. Go SIMD = experimental <code>simd/archsimd</code>. Source: ${report(data.vectorVercel.results[0].source)}.` },
  { id: 'vector-kernel', name: 'Vector search (loop only)', original: '../chart-b-int8-kernel.png', notes: `Separate kernel-only evidence, kept separate from the hosted chart. Excludes corpus initialization, JSON, HTTP and platform overhead. Linux Vercel Sandbox, same host and corpus, exact integer results. Source: ${report(data.vector.results[0].source)}.` },
  { id: 'cpu-per-request', name: 'Native vs Node: CPU', original: G + 'chart-vercel-native-vs-node.png', notes: `The original five-panel native-vs-Node chart is split into three single-takeaway images: CPU (this), memory and first response. Self-reported process user+system CPU per request, three accepted 100-request C=1 windows, final pair. Not billed Active CPU. Verify and gzip-export lack Node medians (retry limit) and stay out. Markdown is a native loss: CPU ${extra.markdownCpu.native.value} vs ${extra.markdownCpu.node.value} ms/request, warm p50 ${md.native.value} vs ${md.comparison.value} ms; the footnote says so in plain words. Source: ${report(m('CPU / request: hello').native.source)}.` },
  { id: 'memory', name: 'Native vs Node: memory', original: G + 'chart-vercel-native-vs-node.png', notes: `<b>What the image shows:</b> serving-process RSS after the first hello response, median of five deployment pairs: native ${rss.native.value} vs Node ${rss.comparison.value} MiB (${(rss.comparison.value / rss.native.value).toFixed(2)}×). Process RSS/VmRSS only. Not whole-instance, not billed and not the 2,048 MiB allocation. Source: ${report(rss.native.source)}.<br><br><b>Not shown on purpose.</b> After load (pair 5 only): native ${extra.rssAfterLoad.native.value} vs Node ${extra.rssAfterLoad.node.value} MiB, which comes from a different request history. Vector search has its own memory data, post-work RSS medians: native ${vr[0].value}, Go SIMD ${vr[1].value}, Go ${vr[2].value}, Node ${vr[3].value} MiB. Every runtime holds the same 100,000×768 int8 corpus (about 73 MiB), so native and Go are effectively tied and Node is about ${(vr[3].value / vr[0].value).toFixed(1)}×. Go excludes its separate IPC proxy. That is a real but different claim, so it stays here and out of the hello-route image. Source: ${report(vr[0].source)}.` },
  { id: 'first-response', name: 'Native vs Node: first response', original: G + 'chart-vercel-native-vs-node.png', notes: `First drained hello response on an untouched immutable preview, end to end (DNS/TCP/TLS, network, activation, handler). Medians of five pairs: native ${fr.native.value} vs Node ${fr.comparison.value} ms. Fresh previews may be prewarmed; this is not a certified process-cold start, and the image says so. Source: ${report(fr.native.source)}.` },
];
const byKey = new Map(manifest.map(x => [`${x.asset}|${x.direction}`, x]));
for (const a of assets) for (const [d] of directions) if (!byKey.has(`${a.id}|${d}`)) throw new Error(`Missing variant ${a.id} ${d}`);

const card = (a, [d, name]) => { const x = byKey.get(`${a.id}|${d}`); return `<figure data-asset="${a.id}" data-dir="${d}"><a href="${x.png}"><img src="${x.png}" alt="${esc(a.name)}, ${name}" loading="lazy"></a><figcaption><b>${name}</b><span>${x.width}×${x.height} · ${Math.round(x.bytes / 1024)} KB · <a href="${x.png}">png</a> · <a href="${x.src}">html</a></span></figcaption></figure>`; };
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>next-scriptc launch graphics · redesign</title>
<style>@font-face{font-family:Geist;src:url(../node_modules/geist/dist/fonts/geist-sans/Geist-Regular.woff2)}@font-face{font-family:Geist;font-weight:600;src:url(../node_modules/geist/dist/fonts/geist-sans/Geist-SemiBold.woff2)}@font-face{font-family:'Geist Mono';src:url(../node_modules/geist/dist/fonts/geist-mono/GeistMono-Regular.woff2)}
:root{color-scheme:dark;--bg:#0b0b0b;--fg:#ededed;--mu:#a1a1a1;--ln:#232323;--ac:#3b82f6}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 Geist,system-ui,sans-serif}
header{position:sticky;top:0;z-index:2;background:rgba(11,11,11,.94);backdrop-filter:blur(8px);border-bottom:1px solid var(--ln);padding:16px 28px 12px}
h1{font-size:18px;margin:0 0 10px;font-weight:600}h1 small{color:var(--mu);font-weight:400;margin-left:10px}
.bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:6px}.bar>span{color:var(--mu);font:12px 'Geist Mono';width:84px}
button{font:inherit;font-size:13px;color:var(--fg);background:#151515;border:1px solid var(--ln);border-radius:999px;padding:5px 12px;cursor:pointer}button[aria-pressed=true]{background:var(--fg);color:#000;border-color:var(--fg)}
main{padding:24px 28px 80px;max-width:1700px;margin:auto}
.intro{color:var(--mu);max-width:900px;margin:0 0 20px}.intro p{margin:0 0 6px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px}
figure{margin:0}figure img{display:block;width:100%;height:auto;border:1px solid var(--ln);border-radius:4px}
figcaption{display:flex;justify-content:space-between;gap:12px;padding:8px 2px;font-size:13px}figcaption span{color:var(--mu);font:12px 'Geist Mono'}a{color:var(--fg)}
.phone .grid{grid-template-columns:repeat(auto-fill,600px)}.phone figure img{width:600px}
.phone.narrow .grid{grid-template-columns:repeat(auto-fill,375px)}.phone.narrow figure img{width:375px}
.notes{margin:28px 0 0;padding:18px 20px;border:1px solid var(--ln);border-radius:6px;color:var(--mu);max-width:1100px}.notes b{color:var(--fg)}.notes code{font:13px 'Geist Mono';color:var(--fg)}
.orig{opacity:.92}.orig figcaption b::after{content:' · published original';color:var(--mu);font-weight:400}
.dirnote{color:var(--mu);margin:0 0 18px;max-width:900px}
@media (max-width:900px){.grid{grid-template-columns:1fr}header{padding:12px 14px}main{padding:16px 14px}.bar>span{width:auto;margin-right:4px}.notes{overflow-wrap:anywhere}}
</style></head><body>
<header><h1>Launch graphics redesign<small>4 directions × ${assets.length} graphics · originals untouched</small></h1>
<div class="bar"><span>view</span><button data-mode="asset" aria-pressed="true">By graphic</button><button data-mode="dir">By direction</button><span style="margin-left:18px">width</span><button data-w="fit" aria-pressed="true">Fit</button><button data-w="600">600px</button><button data-w="375">375px phone</button></div>
<div class="bar" id="assetbar"><span>graphic</span>${assets.map((a, i) => `<button data-asset="${a.id}" aria-pressed="${i === 4}">${esc(a.name)}</button>`).join('')}</div>
<div class="bar" id="dirbar" hidden><span>direction</span>${directions.map(([d, n], i) => `<button data-dir="${d}" aria-pressed="${i === 0}">${n}</button>`).join('')}</div>
</header><main id="main">
<div class="intro"><p>Every graphic has one takeaway, a plain-language headline, zero-based scales and a single caveat line. Full methods live in the notes under each graphic. Keys: ←/→ change graphic, 1–4 change direction, O toggles originals.</p></div>
${assets.map(a => `<section data-asset="${a.id}" hidden><div class="grid">${directions.map(d => card(a, d)).join('')}<figure class="orig" data-orig><a href="${a.original}"><img src="${a.original}" alt="Published original" loading="lazy"></a><figcaption><b>${esc(a.name)}</b><span><a href="${a.original}">png</a></span></figcaption></figure></div><div class="notes">${a.notes}</div></section>`).join('')}
${directions.map(([d, n, t]) => `<section data-dirview="${d}" hidden><p class="dirnote"><b style="color:var(--fg)">${n}.</b> ${t}</p><div class="grid">${assets.map(a => card(a, [d, a.name])).join('')}</div></section>`).join('')}
</main><script>
const S={mode:'asset',asset:'vector-search',dir:'a-monolith',orig:true,w:'fit'},A=${JSON.stringify(assets.map(a => a.id))},D=${JSON.stringify(directions.map(d => d[0]))};
function draw(){document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.mode===S.mode));
document.getElementById('assetbar').hidden=S.mode!=='asset';document.getElementById('dirbar').hidden=S.mode!=='dir';
document.querySelectorAll('#assetbar button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.asset===S.asset));
document.querySelectorAll('#dirbar button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.dir===S.dir));
document.querySelectorAll('section[data-asset]').forEach(s=>s.hidden=S.mode!=='asset'||s.dataset.asset!==S.asset);
document.querySelectorAll('section[data-dirview]').forEach(s=>s.hidden=S.mode!=='dir'||s.dataset.dirview!==S.dir);
document.querySelectorAll('[data-orig]').forEach(f=>f.hidden=!S.orig);
document.querySelectorAll('[data-w]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.w===S.w));
const m=document.getElementById('main');m.classList.toggle('phone',S.w!=='fit');m.classList.toggle('narrow',S.w==='375');
history.replaceState(null,'','#'+[S.mode,S.mode==='asset'?S.asset:S.dir,S.w].join('/'));}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.mode)S.mode=b.dataset.mode;if(b.dataset.asset)S.asset=b.dataset.asset;if(b.dataset.dir)S.dir=b.dataset.dir;if(b.dataset.w)S.w=b.dataset.w;draw();});
document.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){const d=e.key==='ArrowRight'?1:-1;if(S.mode==='asset')S.asset=A[(A.indexOf(S.asset)+d+A.length)%A.length];else S.dir=D[(D.indexOf(S.dir)+d+D.length)%D.length];}else if('1234'.includes(e.key)&&e.key){S.mode='dir';S.dir=D[+e.key-1];}else if(e.key==='o'||e.key==='O')S.orig=!S.orig;else return;draw();});
const [mo,k,w]=location.hash.slice(1).split('/');if(mo==='dir'&&D.includes(k)){S.mode='dir';S.dir=k}else if(A.includes(k))S.asset=k;if(['fit','600','375'].includes(w))S.w=w;draw();
</script></body></html>`;
writeFileSync(join(dir, 'index.html'), html);
console.log(`Gallery: ${join(dir, 'index.html')}`);
