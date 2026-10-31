# Reproducible local ZIP/deflate-6 estimate, not Vercel's private image size.
# Usage: function-sizes.py <label> <output directory> <repository root> <deployment JSON>
import sys, json, os, io, gzip, hashlib, zipfile, stat
from pathlib import Path
label, output, repo, deployment_file = sys.argv[1:]
base = Path(output) / 'functions'
deployment = json.loads(Path(deployment_file).read_text())['deployed']
remote = {}
for build in deployment['builds']:
 for item in build.get('output', []):
  if item.get('lambda'):
   key = item['lambda']['functionName']
   row = remote.setdefault(key, {'paths': [], 'runtime': item['lambda']['runtime'], 'compressedZipBytesReportedByInspect': item['size']})
   row['paths'].append(item['path'])

groups = {}
for name, remote_row in remote.items():
 physical = set()
 for route in remote_row['paths']:
  file = base / (route + '.func')
  if file.exists(): physical.add(file.resolve())
 assert physical, remote_row
 groups[name] = (remote_row, physical)
result = {'label': label, 'method': 'ZIP DEFLATE level 6 over deployed Function grouping, union of physical output plus traced filePathMap; symlinks stored as links; excludes .vc-config.json. Not private platform image/download size.', 'functions': []}
for function_name, (remote_row, physical) in groups.items():
 entries = {}
 for owner in sorted(physical):
  config = json.loads((owner / '.vc-config.json').read_text())
  current = {}
  for parent, dirs, files in os.walk(owner, followlinks=False):
   for name in files + [d for d in dirs if (Path(parent)/d).is_symlink()]:
    p = Path(parent)/name
    if p.name != '.vc-config.json': current[str(p.relative_to(owner))] = p
  for target, source in config.get('filePathMap', {}).items():
   current[target] = Path(repo) / source
  for target, p in current.items():
   if target in entries and entries[target] != p:
    assert entries[target].read_bytes() == p.read_bytes(), f'Conflicting grouped file {target}'
   entries[target] = p
 memory = io.BytesIO()
 total = 0; binaries = {}
 with zipfile.ZipFile(memory, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
  for target, p in sorted(entries.items()):
   if p.is_symlink():
    data = os.readlink(p).encode()
    z = zipfile.ZipInfo(target, (2026, 1, 1, 0, 0, 0)); z.create_system = 3; z.external_attr = (stat.S_IFLNK | 0o777) << 16
    archive.writestr(z, data)
   elif p.is_file():
    data = p.read_bytes()
    archive.writestr(target, data)
   else: raise RuntimeError(f'Unknown trace source: {p}')
   total += len(data)
   if target in ['user-server','executable']:
    binaries[target] = {'bytes': len(data), 'gzip9Bytes': len(gzip.compress(data, compresslevel=9, mtime=0)), 'sha256': hashlib.sha256(data).hexdigest()}
 result['functions'].append({'functionName': function_name, **remote_row, 'localOwners': [str(owner.relative_to(base.resolve())) for owner in sorted(physical)], 'uncompressedBytes': total, 'zipDeflate6Bytes': len(memory.getvalue()), 'entries': len(entries), 'binaries': binaries})
print(json.dumps(result, indent=2))
