#!/usr/bin/env python3
"""Reuse EV3's serial pin/install/cleanup policy, measuring the frozen B1 cohort."""
import pathlib,os
ROOT=pathlib.Path.cwd()
os.environ.update(DEV_CENSUS_OUTPUT=str(ROOT/'research/eval-corpus/dev-measure/results'),DEV_CENSUS_TEMP='/tmp/m1-dev-clones',DEV_CENSUS_BATCH_MODE='1',DEV_CENSUS_BUN_BINARY='/tmp/b1-bun-tools/node_modules/@oven/bun-darwin-aarch64/bin/bun')
pathlib.Path(os.environ['DEV_CENSUS_OUTPUT']).mkdir(exist_ok=True)
s=(ROOT/'research/eval-corpus/dev-census/run.py').read_text()
s=s.replace("for f in excluded:(p/f).unlink()", "# Keep fixtures for input provenance review; explicit source selection excludes them.")
s=s.replace("'/tmp/b1-tools/node_modules/typescript'", "str(ROOT/'packages/scriptc-promote/node_modules/typescript')")
s=s.replace("if slug=='growthbook' and pathlib.Path('/tmp/nsc-dev-growthbook').exists():", "if False:")
s=s.replace("subprocess.run(['python3',str(ROOT/'research/eval-corpus/dev-census/scan-batches.py'),slug],cwd=ROOT,check=True)","subprocess.run(['python3',str(ROOT/'research/eval-corpus/dev-measure/measure.py'),slug],cwd=ROOT,check=True)")
exec(compile(s,__file__,'exec'))
