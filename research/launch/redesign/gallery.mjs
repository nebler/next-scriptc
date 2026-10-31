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
const vr = extra.vectorRss.results, wan = extra.vectorWan.results, c4 = extra.vectorC4, vcpu = extra.vectorCpu.results;
const f1 = v => v.toFixed(1), f3 = v => v.toFixed(3);

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
  { id: 'code-route-native', name: 'Code: hello route', original: G + 'code-route-native.png', notes: 'Monolith, Editorial and Signal keep the original <code>route.native.ts</code> hello handler. <b>Spec sheet (revised)</b> adds the requested <code>"use native"</code> directive in the one place the adapter supports it in a route: a named module-level async function with a JSON result (<code>greet</code>), called from an ordinary <code>route.ts</code> GET. Inside <code>route.native.ts</code> the directive would be a silent no-op (those files are skipped by function extraction, <code>packages/next-scriptc/src/functions/extract.mjs</code>), and a file-level directive in any route file fails the build (<code>src/routes.mjs</code>). The generator runs the real extractor on the snippet and asserts it finds <code>greet</code>. Caveat: function-level <code>"use native"</code> currently runs on Node on Vercel (README); only <code>route.native.ts</code> deploys as a native Vercel Function. The Spec Sheet hero therefore keeps the <code>route.native.ts</code> snippet.' },
  { id: 'code-use-native', name: 'Code: "use native"', original: G + 'code-use-native.png', notes: 'Same simplified revenue function (generator asserts the directive, range predicate and cents arithmetic still exist in <code>examples/demo/lib/revenue.ts</code>). Each direction isolates the one directive line.' },
  { id: 'vector-search', name: 'Vector search: server compute', original: G + 'chart-vector-vercel.png', notes: `Replaces “Int8 search on Vercel Functions”. Headline describes the work (find the 10 closest of ${data.vector.rows.value.toLocaleString('en-US')} embeddings); int8 and 768 dimensions live in these notes. Server-side compute p50 on Vercel Functions iad1, request parse → top-10 → JSON, 3 fresh preview sets × 40 C=1 requests per variant, identical top-10 on every response. The timer runs inside the function (request parse → top-10 → JSON); network, platform routing and IPC are outside it. <b>Full requests are about even:</b> client-observed median ${f3(wan[0].p50.value)} vs ${f3(wan[1].p50.value)} ms (native vs Go SIMD), p95 ${f3(wan[0].p95.value)} vs ${f3(wan[1].p95.value)} ms, and at 4 concurrent requests native loses (see the Spec Sheet page). Native = patched scriptc with CPU dispatch; stock scriptc with <code>Math.imul</code> already reaches ${'10.087'} ms. Go SIMD = experimental <code>simd/archsimd</code>. Source: ${report(data.vectorVercel.results[0].source)}.` },
  { id: 'vector-kernel', name: 'Vector search: loop only (supplemental)', original: '../chart-b-int8-kernel.png', notes: `Separate kernel-only evidence, kept separate from the hosted chart. Excludes corpus initialization, JSON, HTTP and platform overhead. Linux Vercel Sandbox, same host and corpus, exact integer results. Source: ${report(data.vector.results[0].source)}.` },
  { id: 'cpu-per-request', name: 'Native vs Node: CPU (3 routes)', original: G + 'chart-vercel-native-vs-node.png', notes: `The original five-panel native-vs-Node chart is split into three single-takeaway images: CPU (this), memory and first response. Self-reported process user+system CPU per request, three accepted 100-request C=1 windows, final pair. Not billed Active CPU. Verify and gzip-export lack Node medians (retry limit) and stay out. Markdown is a native loss: CPU ${extra.markdownCpu.native.value} vs ${extra.markdownCpu.node.value} ms/request, warm p50 ${md.native.value} vs ${md.comparison.value} ms; the footnote says so in plain words. Source: ${report(m('CPU / request: hello').native.source)}.` },
  { id: 'memory', name: 'Native vs Node: memory (hello route)', original: G + 'chart-vercel-native-vs-node.png', notes: `<b>What the image shows:</b> serving-process RSS after the first hello response, median of five deployment pairs: native ${rss.native.value} vs Node ${rss.comparison.value} MiB (${(rss.comparison.value / rss.native.value).toFixed(2)}×). Process RSS/VmRSS only. Not whole-instance, not billed and not the 2,048 MiB allocation. Source: ${report(rss.native.source)}.<br><br><b>Not shown on purpose.</b> After load (pair 5 only): native ${extra.rssAfterLoad.native.value} vs Node ${extra.rssAfterLoad.node.value} MiB, which comes from a different request history. Vector search has its own memory data, post-work RSS medians: native ${vr[0].value}, Go SIMD ${vr[1].value}, Go ${vr[2].value}, Node ${vr[3].value} MiB. Every runtime holds the same 100,000×768 int8 corpus (about 73 MiB), so native and Go are effectively tied and Node is about ${(vr[3].value / vr[0].value).toFixed(1)}×. Go excludes its separate IPC proxy. That is a real but different claim, so it stays here and out of the hello-route image. Source: ${report(vr[0].source)}.` },
  { id: 'vector-memory', name: 'Vector search: memory (4 runtimes)', only: 'c-spec', original: G + 'chart-vercel-native-vs-node.png', notes: `Spec Sheet only (new). Same hosted run, same 120 C=1 requests as the server-compute chart: median post-work serving-process RSS, native ${vr[0].value}, Go SIMD ${vr[1].value}, Go ${vr[2].value}, Node ${vr[3].value} MiB. Every runtime holds the same 100,000×768 int8 corpus (76,800,000 bytes ≈ 73 MiB), so most of each bar is the data and native and Go are effectively tied (native is ${f1(vr[1].value - vr[0].value)} MiB lower than Go SIMD, within instance/GC variation). Node is ${(vr[3].value / vr[0].value).toFixed(2)}× native. <b>Coverage:</b> Go’s numbers exclude its separate IPC proxy process; native includes its in-process IPC runtime; Node includes all process threads. Process RSS only, not whole-instance, PSS or billed memory. Never compared with the hello-route 5.6/80 MiB values, which are a different workload and protocol. Source: ${report(vr[0].source)}.` },
  { id: 'first-response', name: 'Native vs Node: first response (hello route)', original: G + 'chart-vercel-native-vs-node.png', notes: `First drained hello response on an untouched immutable preview, end to end (DNS/TCP/TLS, network, activation, handler). Medians of five pairs: native ${fr.native.value} vs Node ${fr.comparison.value} ms. Fresh previews may be prewarmed; this is not a certified process-cold start, and the image says so. Source: ${report(fr.native.source)}.` },
];
const byKey = new Map(manifest.map(x => [`${x.asset}|${x.direction}`, x]));
const dirsOf = a => directions.filter(([d]) => !a.only || a.only === d);
for (const a of assets) for (const [d] of dirsOf(a)) if (!byKey.has(`${a.id}|${d}`)) throw new Error(`Missing variant ${a.id} ${d}`);

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
<header><h1>Launch graphics redesign<small>4 directions × ${assets.length - 1} graphics + Spec Sheet vector memory · originals untouched · <a href="spec-sheet.html">Spec Sheet (chosen) →</a></small></h1>
<div class="bar"><span>view</span><button data-mode="asset" aria-pressed="true">By graphic</button><button data-mode="dir">By direction</button><span style="margin-left:18px">width</span><button data-w="fit" aria-pressed="true">Fit</button><button data-w="600">600px</button><button data-w="375">375px phone</button></div>
<div class="bar" id="assetbar"><span>graphic</span>${assets.map((a, i) => `<button data-asset="${a.id}" aria-pressed="${i === 4}">${esc(a.name)}</button>`).join('')}</div>
<div class="bar" id="dirbar" hidden><span>direction</span>${directions.map(([d, n], i) => `<button data-dir="${d}" aria-pressed="${i === 0}">${n}</button>`).join('')}</div>
</header><main id="main">
<div class="intro"><p>Every graphic has one takeaway, a plain-language headline, zero-based scales and a single caveat line. Full methods live in the notes under each graphic. Keys: ←/→ change graphic, 1–4 change direction, O toggles originals.</p></div>
${assets.map(a => `<section data-asset="${a.id}" hidden><div class="grid">${dirsOf(a).map(d => card(a, d)).join('')}<figure class="orig" data-orig><a href="${a.original}"><img src="${a.original}" alt="Published original" loading="lazy"></a><figcaption><b>${esc(a.name)}</b><span><a href="${a.original}">png</a></span></figcaption></figure></div><div class="notes">${a.notes}</div></section>`).join('')}
${directions.map(([d, n, t]) => `<section data-dirview="${d}" hidden><p class="dirnote"><b style="color:var(--fg)">${n}.</b> ${t}</p><div class="grid">${assets.filter(a => !a.only || a.only === d).map(a => card(a, [d, a.name])).join('')}</div></section>`).join('')}
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

// ---------- spec-sheet.html: the chosen direction, one graphic at a time, with methods in expandable notes ----------
const order = ['vector-search', 'vector-memory', 'memory', 'cpu-per-request', 'first-response', 'vector-kernel', 'code-route-native', 'code-use-native', 'hero', 'og'];
const byId = new Map(assets.map(a => [a.id, a]));
const labels = ['Native TypeScript', 'Go + SIMD (experimental)', 'Go', 'Node.js'];
const wanTable = `<table><caption>Same vector search, full request time · network included</caption>
<thead><tr><th></th><th>Server compute p50</th><th>Full request p50</th><th>Full request p95</th><th>4 concurrent · p50 / p95</th></tr></thead><tbody>
${labels.map((l, i) => `<tr${i === 0 ? ' class="nv"' : ''}><th>${l}</th><td>${f1(data.vectorVercel.results[i].value)} ms</td><td>${f1(wan[i].p50.value)} ms</td><td>${f1(wan[i].p95.value)} ms</td><td>${f1(c4.results[i].p50.value)} / ${f1(c4.results[i].p95.value)} ms</td></tr>`).join('')}
</tbody></table>
<p class="tn">Full request = client-observed time from a load client in Europe to Vercel iad1, 120 warm requests one at a time (C=1), same run and same deployments as the compute chart. The network round trip from Europe to iad1 dominates both, so native and Go + SIMD are about even end to end: native has the better median, Go + SIMD the better p95. In short 4-concurrent windows (48 requests each) native loses to Go + SIMD on p50, p95 and requests/second (per-set ${c4.reqPerSet.native.map(x => f1(x.value)).join(' / ')} vs ${c4.reqPerSet.goSimd.map(x => f1(x.value)).join(' / ')} req/s). Those windows are short closed-loop observations, not sustained throughput. Source: ${report(wan[0].p50.source)} and ${report(c4.results[0].p50.source)}.</p>`;
const extraNotes = {
  'vector-search': `<p><b>What the headline covers.</b> “TypeScript faster than Go + SIMD” is the server-compute result only, which is why the label <i>Vector-search server compute</i> sits directly under it and the caveat gives the full-request medians. It is not an end-to-end or general speed claim.</p><p><b>120 requests.</b> 3 fresh preview deployments × 40 measured requests, each after 10 warmups, sent one at a time on a keep-alive connection. Every response returned the identical top-10.</p><p><b>Server compute vs loop only.</b> Server compute (this chart) times the whole handler inside the hosted function: parse the request, scan all 100,000 rows, pick the top 10, build the JSON response. The loop-only chart times just the scan in a Sandbox, with no HTTP, JSON or platform at all. It is supplemental evidence that the lead comes from the search loop itself.</p><p><b>Process CPU</b> for the same requests (mean ms/request): ${vcpu.map((r, i) => `${labels[i]} ${r.value}`).join(', ')}. Go excludes its separate IPC proxy.</p>`,
  'vector-kernel': `<p>Supplemental. Read it as “the search loop alone also leads”, not as a second headline result. Different environment (Linux Vercel Sandbox, same host and data for each runtime) and a different boundary from the hosted chart; the two are never mixed on one axis.</p>`,
};
const go = `<h2>Where Go numbers exist (and where they don’t)</h2>
<ul><li><b>Vector search, hosted:</b> matched four-runtime data for server compute, process CPU, process memory and full-request time, all from one run (<a href="../../vector-vercel.md">vector-vercel.md</a>). Shown: compute and memory charts, the full-request table above.</li>
<li><b>Hello, revenue, nearby-store CPU; hello-route memory; first response after deploy:</b> measured native vs Node.js only (<a href="../../vercel-final.md">vercel-final.md</a>). <b>No matched Go measurement exists</b> for these routes, so those charts stay two-way. Adding Go would need a new benchmark.</li>
<li><b>CSV / JSON / thumbnail / bcrypt routes</b> (<a href="../../go-territory.md">go-territory.md</a>) have Go numbers, but the hosted Go run used a separate 1-vCPU load generator from the Node/native run, and these are different workloads. Not charted; mixing them into the charts above would be misleading. That report also records native losses (bcrypt, hosted JSON).</li></ul>`;
const figs = order.map(id => {
  const a = byId.get(id), x = byKey.get(`${id}|c-spec`);
  return `<section id="${id}"><h2>${esc(a.name)}</h2><figure><a href="${x.png}"><img src="${x.png}" alt="${esc(a.name)}, Spec sheet" width="${x.width / 2}" height="${x.height / 2}"></a><figcaption>${x.width}×${x.height} · ${Math.round(x.bytes / 1024)} KB · <a href="${x.png}">png</a> · <a href="${x.src}">html</a>${id === 'og' ? ' · approved, unchanged' : ''}</figcaption></figure>${id === 'vector-search' ? wanTable : ''}<details${id === 'vector-search' ? ' open' : ''}><summary>Method, scope and sources</summary>${extraNotes[id] ?? ''}<p>${a.notes}</p></details></section>`;
}).join('');
const spec = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>next-scriptc launch graphics · Spec Sheet</title>
<style>@font-face{font-family:Geist;src:url(../node_modules/geist/dist/fonts/geist-sans/Geist-Regular.woff2)}@font-face{font-family:Geist;font-weight:600;src:url(../node_modules/geist/dist/fonts/geist-sans/Geist-SemiBold.woff2)}@font-face{font-family:'Geist Mono';src:url(../node_modules/geist/dist/fonts/geist-mono/GeistMono-Regular.woff2)}
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0b0b0b;color:#ededed;font:15px/1.55 Geist,system-ui,sans-serif}
main{max-width:1240px;margin:auto;padding:36px 24px 96px}h1{font-size:22px;margin:0 0 6px;font-weight:600}.lede{color:#a1a1a1;margin:0 0 8px;max-width:820px}
nav{display:flex;flex-wrap:wrap;gap:6px 14px;font:13px 'Geist Mono';margin:16px 0 8px}a{color:#ededed}nav a{color:#a1a1a1}
section{margin-top:64px}h2{font-size:17px;font-weight:600;margin:0 0 12px}figure{margin:0}img{display:block;max-width:100%;height:auto;border:1px solid #232323}
figcaption{font:12px 'Geist Mono';color:#a1a1a1;padding:8px 0}
details{margin-top:10px;border:1px solid #232323;border-radius:6px;padding:10px 16px;color:#a1a1a1;max-width:1000px}summary{cursor:pointer;color:#ededed}details b{color:#ededed}code{font:13px 'Geist Mono';color:#ededed}
table{border-collapse:collapse;margin-top:18px;font-variant-numeric:tabular-nums;width:100%;max-width:1000px}caption{text-align:left;font-weight:600;padding-bottom:8px}
th,td{padding:7px 12px;border-bottom:1px solid #232323;text-align:right;white-space:nowrap}th:first-child{text-align:left}thead th{font:12px 'Geist Mono';color:#a1a1a1;font-weight:400}tr.nv th,tr.nv td{color:#fff;font-weight:600}tbody td{color:#cfcfcf}
.tn{color:#a1a1a1;max-width:1000px;font-size:14px}ul{color:#a1a1a1;max-width:1000px}ul b{color:#ededed}
@media (max-width:700px){table{display:block;overflow-x:auto}}</style></head><body><main>
<h1>Spec Sheet · revised launch graphics</h1><p class="lede">The chosen direction, one graphic at a time. Each chart has the chart alone on the right and all of its words on the left. Methods and sources are in the notes under each image. <a href="index.html">Four-direction comparison →</a></p>
<nav>${order.map(id => `<a href="#${id}">${esc(byId.get(id).name)}</a>`).join('')}</nav>
${figs}<section id="go">${go}</section></main></body></html>`;
writeFileSync(join(dir, 'spec-sheet.html'), spec);
console.log(`Spec Sheet: ${join(dir, 'spec-sheet.html')}`);
