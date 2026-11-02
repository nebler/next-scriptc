#!/usr/bin/env python3
"""Inventory an existing checkout without importing or executing app code.
Usage: inspect.py CHECKOUT DOMAIN FRAMEWORK OUTPUT.json
Numeric syntax scores are search hints, not CPU measurements or request-path proof.
"""
import os,subprocess,json,pathlib,re,sys
if len(sys.argv)!=5: raise SystemExit(__doc__)
dest=pathlib.Path(sys.argv[1]).resolve();domain=sys.argv[2];framework=sys.argv[3]
repo=subprocess.check_output(['git','-C',str(dest),'remote','get-url','origin'],text=True).strip().removesuffix('.git').removeprefix('https://github.com/')
sha=subprocess.check_output(['git','-C',str(dest),'rev-parse','HEAD'],text=True).strip()
packages=[]; hits=[];licenses=[]
for root,dirs,files in os.walk(dest):
 dirs[:]=[d for d in dirs if not d.startswith('.') and d not in ['node_modules','vendor','fixtures','test','tests','__tests__','dist','build']]
 for f in files:
  fp=pathlib.Path(root)/f;rel=str(fp.relative_to(dest))
  if fp.is_symlink() or not fp.is_file():continue
  if f=='package.json':
   try:
    pkg=json.load(open(fp));deps={**pkg.get('dependencies',{}),**pkg.get('devDependencies',{})};packages.append({'file':rel,'license':pkg.get('license'),'frameworks':[d for d in deps if d in ['next','vite','@sveltejs/kit','nitropack','nuxt','astro','@tanstack/react-start','react-router','express','fastify','@nestjs/core','koa']],'computeDeps':{d:v for d,v in deps.items() if re.search('statistic|formula|finance|turf|polygon|diff|fuse|search|decimal|big.js|rrule|sharp|chroma|color|jstat|mathjs',d)}})
   except:pass
  if f.lower().startswith(('license','copying')) and len(licenses)<8:
   t=fp.read_text(errors='replace')[:5000];licenses.append({'file':rel,'declaration':('AGPL-3.0' if 'AFFERO' in t else 'GPL-3.0' if 'GNU GENERAL PUBLIC' in t else 'MIT' if 'MIT License' in t or 'Permission is hereby granted, free of charge' in t else 'Apache-2.0' if 'Apache License' in t else 'source-available/custom; review pinned file')})
  if re.search(r'\.[cm]?[jt]sx?$',f) and not re.search(r'test|spec|stories|storybook|generated|locales|migrations|lock',rel,re.I):
   t=fp.read_text(errors='replace')
   score=len(re.findall(r'\bfor\s*\(|\bwhile\s*\(',t))+2*len(re.findall(r'Math\.(?:pow|exp|log|sqrt|sin|cos)|(?:irr|variance|standardDeviation|levenshtein|significance|correlation)\b',t,re.I))
   if score>=3:hits.append({'file':rel,'score':score,'symbols':[{'name':m.group(1),'line':t[:m.start()].count('\n')+1} for m in re.finditer(r'(?:function\s+|(?:export\s+)?const\s+)([A-Za-z_$][\w$]*)\s*(?:\(|=)',t)][:35]})
data={'repo':repo,'url':'https://github.com/'+repo,'sha':sha,'domain':domain,'frameworkHypothesis':framework,'licenses':licenses,'packages':packages,'hotFiles':sorted(hits,key=lambda x:-x['score'])[:18]}
json.dump(data,open(sys.argv[4],'w'),indent=2)
