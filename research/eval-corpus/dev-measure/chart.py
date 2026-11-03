#!/usr/bin/env python3
"""Render measured ratio counts as a self-contained, accessible HTML chart."""
import pathlib,json,gzip,html
D=pathlib.Path(__file__).parent
p=D/'functions.json';p=p if p.exists() else p.with_suffix('.json.gz');rows=json.loads(gzip.decompress(p.read_bytes()) if p.suffix=='.gz' else p.read_bytes())
ratios=[m['native']['median']/m['js']['median'] for r in rows for m in r['measurements'] if m['status']=='ok'];limits=[.9,1,10,100,1000,float('inf')];labels=['≤ 0.90','0.90–1','1–10','10–100','100–1,000','> 1,000'];counts=[0]*len(limits)
for r in ratios:
 for i,b in enumerate(limits):
  if r<=b:counts[i]+=1;break
bars=''.join(f'<div class="row"><span>{label}</span><div class="track"><div class="bar" style="width:{100*n/max(1,max(counts)):.2f}%"></div></div><b>{n}</b></div>' for label,n in zip(labels,counts))
s=json.loads((D/'summary.json').read_text())
page=f'''<!doctype html><html lang="en"><meta charset="utf-8"><style>
body{{color:var(--foreground);font-family:var(--font-sans);margin:0}}figure{{margin:0}}h3{{font-size:18px;margin:0 0 8px}}p,figcaption{{color:var(--muted-foreground);font-size:13px;line-height:1.5}}.row{{display:grid;grid-template-columns:96px 1fr 42px;gap:10px;align-items:center;height:36px;font-size:13px}}.track{{height:19px;background:var(--secondary);border-radius:3px}}.bar{{height:19px;background:var(--chart-1);border-radius:3px}}b{{text-align:right;font-variant-numeric:tabular-nums}}summary{{font-size:13px;cursor:pointer}}table{{font-size:13px;border-collapse:collapse;width:100%}}td,th{{text-align:left;padding:5px;border-bottom:1px solid var(--border)}}
</style><figure role="img" aria-label="Histogram of measured native to JavaScript CPU ratios. Lower is better."><h3>Native / JS process CPU</h3><p>{len(ratios)} measured input cases · lower ratios are better · native promotion threshold ≤ 0.90</p>{bars}<figcaption>{s['accepted']} accepted functions; {s['nativeMeasuredFunctions']} with comparable native timings; {s['unknownScreen']} without an intensity result. Input cases have equal weight here. This is not a traffic distribution or an endpoint saving.</figcaption></figure><details><summary>Show counts</summary><table><tr><th>Ratio</th><th>Input cases</th></tr>{''.join(f'<tr><td>{l}</td><td>{n}</td></tr>' for l,n in zip(labels,counts))}</table></details></html>'''
(D/'ratios.html').write_text(page)
