#!/usr/bin/env python3
"""Prepare the EV3-pinned Bun platform tool under this task's /tmp directory."""
import pathlib,shutil,subprocess,json,hashlib,base64,os
R=pathlib.Path.cwd();P=pathlib.Path('/tmp/m1-bun-tools');P.mkdir(exist_ok=True);free=shutil.disk_usage(P).free;assert free>=12_000_000_000
lock=json.loads((R/'research/eval-corpus/dev-census/bun-tool-lock.json').read_text());record=next(v for k,v in lock['packages'].items() if k.endswith('/@oven/bun-darwin-aarch64'))
tar=P/'oven-bun-darwin-aarch64-1.4.4.tgz'
if not tar.exists():subprocess.run(['npm','pack','@oven/bun-darwin-aarch64@1.4.4','--ignore-scripts','--pack-destination',str(P),'--silent'],env={**os.environ,'npm_config_cache':'/tmp/m1-tool-npm-cache'},check=True)
actual='sha512-'+base64.b64encode(hashlib.sha512(tar.read_bytes()).digest()).decode();assert actual==record['integrity']
subprocess.run(['tar','-xzf',str(tar),'-C',str(P)],check=True)
binary=P/'package/bin/bun';version=subprocess.check_output([str(binary),'--version'],text=True).strip();assert version=='1.4.4'
evidence={'version':version,'freeBytesBeforePrepare':free,'integrity':actual,'verifiedAgainst':'research/eval-corpus/dev-census/bun-tool-lock.json','binarySha256':hashlib.sha256(binary.read_bytes()).hexdigest(),'path':str(binary)}
(R/'research/eval-corpus/dev-measure/bun-tool.json').write_text(json.dumps(evidence,indent=2)+'\n');print(json.dumps(evidence,indent=2))
