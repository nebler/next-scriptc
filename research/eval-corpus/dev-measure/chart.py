#!/usr/bin/env python3
"""Export a standalone research figure and a self-contained HTML view."""
import pathlib,json,gzip,os,sys,base64
os.environ.setdefault('MPLCONFIGDIR','/tmp/m1-mpl-config');sys.path.insert(0,'/tmp/m1-chart-libs')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
D=pathlib.Path(__file__).parent;p=D/'functions.json';p=p if p.exists() else p.with_suffix('.json.gz')
rows=json.loads(gzip.decompress(p.read_bytes()) if p.suffix=='.gz' else p.read_bytes());s=json.loads((D/'summary.json').read_text())
ratios=[m['native']['median']/m['js']['median'] for r in rows for m in r['measurements'] if m['status']=='ok'];limits=[.9,1,10,100,1000,float('inf')];labels=['≤ 0.90','0.90–1','1–10','10–100','100–1,000','> 1,000'];counts=[0]*len(limits)
for r in ratios:
 for i,b in enumerate(limits):
  if r<=b:counts[i]+=1;break
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':11,'axes.spines.top':False,'axes.spines.right':False,'axes.spines.left':False})
fig,ax=plt.subplots(figsize=(8,4.4),dpi=180);fig.subplots_adjust(left=.20,right=.92,top=.83,bottom=.19)
ax.barh(range(6),counts,color=['#b65b24']+['#315e8c']*5,height=.58);ax.set_yticks(range(6),labels);ax.invert_yaxis();ax.set_xlim(0,max(1,max(counts))*1.14)
ax.set_xlabel('Measured input cases');ax.tick_params(axis='y',length=0,pad=10);ax.spines['bottom'].set_color('#aab4bf');ax.xaxis.grid(True,color='#e5e9ed',linewidth=.6);ax.set_axisbelow(True)
for i,n in enumerate(counts):ax.text(n+max(1,max(counts))*.02,i,str(n),va='center',fontsize=11)
fig.suptitle('Native / JS CPU ratios',x=.20,ha='left',fontsize=16,fontweight='bold');fig.text(.20,.875,f'{len(ratios)} case medians · boundary-inclusive native · lower favors native',fontsize=10,color='#485766')
fig.text(.20,.045,'Input cases have equal weight here. This is not a traffic distribution.\nThe 0.90 gate also requires correctness and a bootstrap upper bound below 1.',fontsize=9,color='#485766')
fig.savefig(D/'ratios.png',facecolor='white');plt.close(fig)
data=base64.b64encode((D/'ratios.png').read_bytes()).decode()
page=f'''<!doctype html><html lang="en"><meta charset="utf-8"><style>body{{font-family:var(--font-sans);color:var(--foreground);margin:0}}figure{{margin:0}}img{{width:100%;height:auto;display:block}}figcaption,p,summary{{font-size:13px;line-height:1.5;color:var(--muted-foreground)}}table{{width:100%;border-collapse:collapse;font-size:13px}}td,th{{text-align:left;padding:5px;border-bottom:1px solid var(--border)}}</style><figure><img src="data:image/png;base64,{data}" alt="Counts of measured native to JavaScript CPU median ratios by range. Lower ratios favor native."><figcaption>{s['accepted']} accepted functions; {s['nativeMeasuredFunctions']} with comparable native timings; {s['unknownScreen']} without an intensity result. Endpoint CPU remains unmeasured.</figcaption></figure><details><summary>Show counts</summary><table><tr><th>Native / JS ratio</th><th>Input cases</th></tr>{''.join(f'<tr><td>{l}</td><td>{n}</td></tr>' for l,n in zip(labels,counts))}</table></details></html>'''
(D/'ratios.html').write_text(page)
print('Exported ratios.png and ratios.html with matplotlib',matplotlib.__version__)
