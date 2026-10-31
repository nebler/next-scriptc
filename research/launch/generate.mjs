// npm ci --prefix research/launch && node research/launch/generate.mjs
// All image layout is code. Chrome rasterizes at 2x, with embedded local Geist.
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHighlighter } from 'shiki';
import sharp from 'sharp';

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '../..');
const assets = join(root, '.github/assets');
mkdirSync(assets, { recursive: true });
const data = JSON.parse(readFileSync(join(dir, 'chart-data.json'), 'utf8'));
const palette = JSON.parse(readFileSync(join(dir, 'reference-palette.json'), 'utf8'));
const P = Object.fromEntries(Object.entries(palette.colors).map(([key, value]) => [key, value.hex]));
const C = { bg: P.background, text: P.punctuation, muted: P.comment, line: P.grid, blue: '#006bff', white: '#ffffff' };
const font = (family, file, weight) => `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${readFileSync(join(dir, 'node_modules/geist/dist/fonts',file)).toString('base64')}) format('woff2');font-weight:${weight};font-style:normal;font-display:block}`;
const fonts = [font('Geist','geist-sans/Geist-Regular.woff2',400),font('Geist','geist-sans/Geist-SemiBold.woff2',600),font('Geist Mono','geist-mono/GeistMono-Regular.woff2',400)].join('');
copyFileSync(join(dir,'node_modules/geist/LICENSE.txt'),join(dir,'LICENSE-Geist.txt'));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const text = (x,y,s,size=24,color=C.text,extra='') => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" ${extra}>${esc(s)}</text>`;
const rect = (x,y,w,h,fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
const line = (x1,y1,x2,y2,color=C.line,width=1) => `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="${color}" stroke-width="${width}" fill="none"/>`;
const plus = (x,y,arm=10) => line(x-arm,y,x+arm,y,P.crosshair,1)+line(x,y-arm,x,y+arm,P.crosshair,1);
const frame = (w,h,x1,y1,x2,y2) => line(x1,0,x1,h)+line(x2,0,x2,h)+line(0,y1,w,y1)+line(0,y2,w,y2)+plus(x1,y1,20)+plus(x2,y2,20);
const fmt = (v,n=2) => v.toFixed(n);
const ratio = (a,b) => fmt(a/b);
const ceiling = max => { const step=10**Math.floor(Math.log10(max));return Math.ceil(max/step)*step; };
const svg = (title,w,h,body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title"><title id="title">${esc(title)}</title><style>/* Geist fonts: SIL OFL 1.1, see research/launch/LICENSE-Geist.txt */${fonts}text{font-family:Geist;font-weight:400}.bold{font-weight:600}.mono{font-family:'Geist Mono'}</style>${rect(0,0,w,h,C.bg)}${body}</svg>`;

// Frozen observations must remain linked to a report and an exact row locator.
function verify(value) {
  if (!value || typeof value !== 'object') return;
  if ('value' in value) {
    assert.ok(typeof value.value === 'number' && value.value > 0 && Number.isFinite(value.value));
    assert.ok(value.source && value.locator, 'Measured values need source + locator');
    const report=readFileSync(resolve(root,value.source.split('#')[0]),'utf8').replaceAll(',','');
    assert.ok(report.includes(String(value.value)),`Value ${value.value} missing from ${value.source}`);
  }
  for(const v of Object.values(value)) verify(v);
}
verify(data);

const theme = {
  name:'reference-geist',type:'dark',colors:{'editor.background':P.background,'editor.foreground':P.punctuation},
  tokenColors:[
    {scope:['comment'],settings:{foreground:P.comment}},
    {scope:['keyword','storage','storage.type','keyword.operator'],settings:{foreground:P.keyword}},
    {scope:['entity.name.function','entity.name.type','entity.name.namespace','support.function','support.type','support.class','support.constant','constant.numeric','constant.language','variable.language','meta.type.annotation'],settings:{foreground:P.type}},
    {scope:['string'],settings:{foreground:P.string}},
    {scope:['punctuation'],settings:{foreground:P.punctuation}},
    {scope:['punctuation.definition.string'],settings:{foreground:P.string}},
  ],
};
const highlighter=await createHighlighter({themes:[theme],langs:['typescript','go']});
const nativeCode=`// app/api/hello/route.native.ts
export function GET() {
  return Response.json({
    message: "Hello from native TypeScript!"
  });
}`;
// Adapt the real revenue aggregation to accept the already-parsed events.
// Keep the import, directive, range filter and integer arithmetic from its source.
const revenueSource=readFileSync(join(root,'examples/demo/lib/revenue.ts'),'utf8');
for(const fragment of ['"use native";','event.day < from || event.day > to','event.amountCents * event.quantity']) assert.ok(revenueSource.includes(fragment));
const useNativeCode=`// examples/demo/lib/revenue.ts · simplified
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
function code(source,lang,x,y,size,lh,highlightWidth=0) {
  const {tokens}=highlighter.codeToTokens(source,{lang,theme:'reference-geist'});
  return tokens.map((tokens,i)=>{
    const highlight=source.split('\n')[i].includes('"use native"') && highlightWidth;
    return (highlight ? rect(x-12,y+i*lh-size+1,highlightWidth,lh,'#0a0a0a')+rect(x-12,y+i*lh-size+1,2,lh,P.string):'')+
      `<text class="mono code" xml:space="preserve" x="${x}" y="${y+i*lh}" font-size="${size}">${tokens.map(t=>`<tspan fill="${t.color??P.punctuation}">${esc(t.content)}</tspan>`).join('')}</text>`;
  }).join('');
}

function routeNative() {
  const w=1000,h=800;
  return svg('A TypeScript native route',w,h,frame(w,h,102,102,898,698)+code(nativeCode,'typescript',128,156,23.4,36));
}
function useNative() {
  const w=1000,h=800;
  return svg('Offload a revenue aggregation with use native',w,h,frame(w,h,80,108,920,692)+code(useNativeCode,'typescript',106,156,20.2,34,788));
}

const legend=(x,y,label,color,size=20)=>rect(x,y-14,14,14,color)+text(x+24,y,label,size);
function chartA() {
  const d=data.vercel,w=1000,h=830;
  let out=text(50,70,d.title,44,C.white,'class="bold"')+text(50,110,d.chartSubtitle,24,C.muted);
  out+=legend(50,157,'Native TypeScript',C.white)+legend(290,157,'Node / Next.js',C.blue);
  const metrics=d.metrics.filter(m=>m.includeInChart!==false);
  for(const [i,m] of metrics.entries()) {
    const cpu=i>=2,pw=cpu?280:430,x=50+(cpu?(i-2)*310:i*470),y=cpu?465:206;
    const a=m.native.value,b=m.comparison.value,max=ceiling(Math.max(a,b));
    out+=line(x,y-21,x+pw,y-21);
    out+=text(x,y+7,m.label,cpu?21:24,C.white,'class="bold"');
    out+=text(x,y+37,`${m.unit} · Node / native ${ratio(b,a)}×`,cpu?16:19,C.muted);
    const base=y+176,ph=109,left=x+43,right=x+pw-6;
    for(let j=0;j<=2;j++) {
      const gy=base-ph*j/2;
      out+=line(left,gy,right,gy,j===0?'#525252':C.line);
      out+=text(left-12,gy+5,Number((max*j/2).toFixed(2)),15,C.muted,'text-anchor="end"');
    }
    for(const [j,v] of [a,b].entries()) {
      const cx=left+(right-left)*(j+.5)/2,bh=ph*v/max,bw=cpu?54:72;
      out+=rect(cx-bw/2,base-bh,bw,bh,j===0?C.white:C.blue);
      const decimals=j===1 ? m.comparison.decimals??m.decimals : m.decimals;
      out+=text(cx,base-bh-10,fmt(v,decimals),25,C.white,'text-anchor="middle"');
      out+=text(cx,base+29,j===0?'Native':'Node',19,C.muted,'text-anchor="middle"');
    }
  }
  out+=text(50,728,d.chartNotes[0],19,C.muted);
  out+=text(50,760,d.chartNotes[1],17,C.muted);
  out+=text(50,798,d.sourceLine.replace(/^Source: /,''),17,C.muted);
  return svg(d.title,w,h,out);
}
function chartB(d,kernel=false) {
  const w=1000,h=750,results=d.results;
  let out=text(50,70,d.title,44,C.white,'class="bold"');
  out+=text(50,112,d.chartSubtitle,24,C.muted);
  out+=legend(50,162,'Native TS',C.white)+legend(220,162,'Comparisons',C.blue);
  out+=text(950,162,`Go SIMD / native · ${ratio(results[1].value,results[0].value)}×`,20,C.muted,'text-anchor="end"');
  const left=94,right=952,base=554,ph=314,max=ceiling(Math.max(...results.map(r=>r.value))/4)*4;
  for(let i=0;i<=4;i++) {
    const y=base-ph*i/4;
    out+=line(left,y,right,y,i===0?'#525252':C.line);
    out+=text(left-14,y+6,Number((max*i/4).toFixed(2)),18,C.muted,'text-anchor="end"');
  }
  for(const [i,r] of results.entries()) {
    const cx=left+(right-left)*(i+.5)/4,bh=ph*r.value/max;
    out+=rect(cx-46,base-bh,92,bh,r.role==='native'?C.white:C.blue);
    out+=text(cx,base-bh-13,fmt(r.value,d.decimals),30,C.white,'text-anchor="middle"');
    out+=text(cx,591,r.displayLabel??r.label,25,C.white,'text-anchor="middle"');
  }
  out+=text(50,641,`${data.vector.rows.value.toLocaleString('en-US')} rows × ${data.vector.dimensions.value} dimensions · ${d.nativeNote}`,18,C.muted);
  out+=text(50,671,d.experimentalNote,18,C.muted);
  out+=text(50,703,d.sourceLine,17,C.muted);
  out+=text(50,729,d.scopeLine,16,C.muted);
  return svg(d.title,w,h,out);
}
function hero() {
  const w=1200,h=628;
  let out=line(736,0,736,h)+line(1136,0,1136,h)+line(0,564,w,564)+plus(736,564);
  out+=text(64,86,'next-scriptc',21,C.text,'class="mono"');
  out+=text(64,250,'route.native.ts',54,C.muted);
  out+=text(64,326,'TypeScript, compiled',58,C.white,'class="bold" letter-spacing="-2"');
  out+=text(64,392,'to native',58,C.white,'class="bold" letter-spacing="-2"');
  out+=text(64,458,'Vercel Functions.',58,C.white,'class="bold" letter-spacing="-2"');
  out+=text(64,533,'A Next.js adapter powered by scriptc',18,C.muted);
  out+=line(736,174,1200,174)+line(736,454,1200,454)+plus(736,174)+plus(1136,454);
  const heroCode=`// route.native.ts
export function GET() {
  return Response.json({
    message:
      "Hello from native TS!"
  });
}`;
  out+=code(heroCode,'typescript',762,225,16,28);
  return svg('next-scriptc: TypeScript, compiled to native Vercel Functions',w,h,out);
}

const specs=[
  {name:'code-route-native',w:1000,h:800,svg:routeNative()},
  {name:'code-use-native',w:1000,h:800,svg:useNative()},
  {name:'chart-vector-vercel',w:1000,h:750,svg:chartB(data.vectorVercel),legacy:'chart-b-int8-vercel'},
  {name:'chart-vercel-native-vs-node',w:1000,h:830,svg:chartA(),legacy:'chart-a-vercel'},
  {name:'chart-b-int8-kernel',w:1000,h:750,svg:chartB(data.vector,true),local:true},
  {name:'hero',w:1200,h:628,svg:hero()},
  {name:'og',w:600,h:315,svg:hero()},
];
for(const spec of specs) if(spec.legacy||spec.local) writeFileSync(join(dir,`${spec.legacy??spec.name}.svg`),spec.svg);
const candidates=[process.env.CHROME_BIN,'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'].filter(Boolean);
const chrome=candidates.find(existsSync);
assert.ok(chrome || process.argv.includes('--svg-only'),'No local Chrome. Set CHROME_BIN or use --svg-only.');
const manifest=[];
if(!process.argv.includes('--svg-only')) {
  for(const spec of specs) {
    const work=mkdtempSync(join(tmpdir(),'next-scriptc-visual-'));
    try {
      const html=`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#000;width:${spec.w}px;height:${spec.h}px;overflow:hidden}body>svg{width:100%;height:100%;display:block}</style>${spec.svg}<script>Promise.all([document.fonts.load('400 20px Geist'),document.fonts.load('600 20px Geist'),document.fonts.load('400 20px \"Geist Mono\"')]).then(()=>document.fonts.ready).then(()=>{const s=document.querySelector('svg');const vb=s.viewBox.baseVal;const overflow=[...s.querySelectorAll('text')].flatMap(n=>{const b=n.getBBox();return b.x<0||b.y<0||b.x+b.width>vb.width+.5||b.y+b.height>vb.height+.5?[n.textContent]:[]});document.body.dataset.qa=JSON.stringify({fonts:document.fonts.check('20px Geist')&&document.fonts.check('20px "Geist Mono"'),overflow});})</script>`;
      writeFileSync(join(work,'asset.html'),html);
      const output=join(spec.local?dir:assets,`${spec.name}.png`);
      const result=spawnSync(chrome,['--headless','--disable-gpu','--no-sandbox','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--metrics-recording-only','--hide-scrollbars','--force-device-scale-factor=2',`--window-size=${spec.w},${spec.h}`,'--virtual-time-budget=1500',`--user-data-dir=${join(work,'profile')}`,`--screenshot=${output}`,'--dump-dom',pathToFileURL(join(work,'asset.html')).href],{encoding:'utf8',timeout:30000,maxBuffer:5e6});
      if(result.error||result.status!==0) throw result.error??new Error(result.stderr);
      const qaText=result.stdout.match(/data-qa="([^"]*)"/)?.[1];
      assert.ok(qaText,`Chrome did not finish font/layout checks: ${spec.name}`);
      const qa=JSON.parse(qaText.replaceAll('&quot;','"').replaceAll('&amp;','&').replaceAll('&gt;','>').replaceAll('&lt;','<'));
      assert.ok(qa.fonts,`Missing font: ${spec.name}`);
      assert.deepEqual(qa.overflow,[],`Clipped text: ${spec.name}`);
      const optimized=await sharp(output).png({compressionLevel:9,adaptiveFiltering:true}).toBuffer();
      writeFileSync(output,optimized);
      const meta=await sharp(output).metadata();
      assert.equal(meta.width,spec.w*2);assert.equal(meta.height,spec.h*2);
      assert.ok(optimized.length<1_000_000,`PNG exceeds 1 MB: ${spec.name}`);
      if(spec.legacy) copyFileSync(output,join(dir,`${spec.legacy}.png`));
      manifest.push({name:spec.name,path:output.replace(root+'/',''),width:meta.width,height:meta.height,bytes:optimized.length,scale:2,fonts:'Geist / Geist Mono',qa});
      console.log(`${spec.name}: ${meta.width}×${meta.height}, ${Math.round(optimized.length/1024)} KB`);
    } finally { rmSync(work,{recursive:true,force:true}); }
  }
  writeFileSync(join(dir,'asset-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
}

// The review page shows actual exports at exactly 600px wide.
const preview=`<!doctype html><meta charset="utf-8"><title>next-scriptc launch visual review</title><style>${fonts}body{margin:32px;background:#0a0a0a;color:#ededed;font-family:Geist}main{max-width:1200px;margin:auto}h1{font-size:26px}figure{margin:32px 0}img{display:block;width:600px;max-width:100%;height:auto;border:1px solid #191919}figcaption{font-family:'Geist Mono';font-size:13px;color:#a1a1a1;margin:12px 0}</style><main><h1>Launch assets · 600px review</h1>${specs.map(s=>`<figure><figcaption>${s.name}</figcaption><img src="${s.local?'':'../../.github/assets/'}${s.name}.png" alt="${s.name}"></figure>`).join('')}</main>`;
writeFileSync(join(dir,'preview.html'),preview);

// Frozen-evidence walkthrough, with charts letterboxed to preserve their aspect ratio.
const f=data.functionLevel;
const route=readFileSync(join(root,'examples/demo/app/api/analytics/revenue/route.native.ts'),'utf8');
const scenes=[
 `<h1>CPU-heavy routes. Still TypeScript.</h1><p>route.native.ts → scriptc → native Vercel Function</p><p>Plain adapter. No Next.js fork.</p><small>Recorded evidence. This is not a live timing demo.</small><p><button id="start">Start 40-second walkthrough</button></p>`,
 `<h1>Same TypeScript source</h1><pre>${esc(route.split('\n').slice(8,25).join('\n'))}</pre><small>examples/demo/app/api/analytics/revenue/route.native.ts · excerpt</small>`,
 '<img src="chart-a-vercel.png" alt="Vercel first response, process RSS and CPU observations">',
 '<img src="chart-b-int8-kernel.png" alt="KERNEL ONLY int8 comparison">',
 `<h1>Offload one function</h1><pre>${esc(useNativeCode)}</pre><p>Self-hosted Linux · ${f.rows.value/1000}k rows · full page p50: native ${fmt(f.native.value,0)} / Node ${fmt(f.node.value,0)} ms.</p><small>Observed crossover between ${f.crossoverLow.value/1000}k and ${f.crossoverHigh.value/1000}k rows · research/function-level.md, round 3</small>`,
 '<h1>Where Go still wins</h1><p>CSV, bcrypt, raw thumbnails and resize.</p><p>Go SIMD wins float search. Go popcount wins binary search.</p><p>Compiler patch in a fork. Full validation gate pending.</p><small>go-territory.md · scouting-summary.md · vector-cpu-levels.md · scriptc-int8-range-analysis.md</small>',
];
writeFileSync(join(dir,'recording.html'),`<!doctype html><meta charset="utf-8"><title>next-scriptc frozen evidence walkthrough</title><style>${fonts}body{margin:0;background:#000;color:#ededed;font-family:Geist}main{width:1600px;height:900px;position:relative}section{display:none;box-sizing:border-box;padding:48px 64px;width:1600px;height:860px}section.active{display:block}section:has(img){padding:0}h1{font-size:56px;margin:0 0 24px}p{font-size:30px;line-height:1.4}pre{font-family:'Geist Mono';font-size:25px;line-height:1.4;margin:0}img{width:1600px;height:860px;object-fit:contain}small{font-size:22px;color:#a1a1a1}button{font:24px Geist;padding:18px 26px;color:#000;background:#fff;border:0}footer{position:absolute;bottom:10px;right:28px;font-size:18px;color:#a1a1a1}</style><main>${scenes.map((s,i)=>`<section class="${i===0?'active':''}">${s}</section>`).join('')}<footer id="clock">Frozen source reports · no live requests</footer></main><script>const scenes=[...document.querySelectorAll('section')];let begun=false;document.getElementById('start').onclick=()=>{if(begun)return;begun=true;const began=performance.now();function tick(){const s=(performance.now()-began)/1000,index=s<7?1:s<16?2:s<25?3:s<32?4:5;scenes.forEach((n,i)=>n.classList.toggle('active',i===index));document.getElementById('clock').textContent='Recorded evidence · not live timings · '+Math.min(40,Math.floor(s))+' / 40 s';if(s<40)requestAnimationFrame(tick)}tick()};</script>`);
highlighter.dispose();
console.log('Generated launch assets, legacy chart copies, review page and recording.');
