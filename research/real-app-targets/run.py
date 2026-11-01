"""Re-run retained slices from repository root. No cloning or deployment."""
import json, os, shutil, subprocess, sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]
slices = root / 'research/real-app-targets'
out = slices / 'reproduced'
if out.exists():
    raise SystemExit('Move reproduced/ aside before rerunning; evidence is never overwritten.')
out.mkdir()
compiler = os.environ.get('SCRIPTC') or shutil.which('scriptc')
if not compiler:
    compiler = root / 'packages/next-scriptc/node_modules/.bin/scriptc'
compiler = str(Path(compiler).resolve())
version = subprocess.check_output([compiler, '--version'], text=True).strip()
if version != '0.4.6':
    raise SystemExit(f'Expected stock 0.4.6, got {version}')
results = []
def run(args, filename, cwd=slices, timeout=180):
    r = subprocess.run([str(x) for x in args], cwd=cwd, capture_output=True, text=True, timeout=timeout)
    (out / filename).write_text(r.stdout + r.stderr)
    results.append({'command': [str(x) for x in args], 'exit': r.returncode, 'log': filename})
    return r
for name in ['papermark', 'dub', 'cal', 'umami', 'twenty', 'formbricks']:
    run([compiler, 'coverage', f'{name}/probe.ts'], f'{name}-coverage.txt')
    binary = out / f'{name}-probe'
    build = run([compiler, 'build', f'{name}/probe.ts', '--node-islands=off', '-o', binary], f'{name}-build.txt')
    node = run(['node', f'{name}/probe.ts'], f'{name}-node.txt')
    if build.returncode == 0:
        native = run([binary], f'{name}-native.txt')
        results.append({'candidate': name, 'byteEqual': node.returncode == native.returncode == 0 and node.stdout == native.stdout})
        binary.unlink(missing_ok=True)
for intermediate in out.glob('*.ll'):
    intermediate.unlink()
for name in ['papermark', 'dub']:
    run([compiler, 'build', '--lib', '--profile', f'{name}/profile.json'], f'{name}-library.txt')
run(['node', slices / 'check-boundaries.mjs'], 'boundaries.json', cwd=root)
if '--skip-bench' not in sys.argv:
    run(['node', slices / 'bench.mjs'], 'node-timings.json', cwd=root)
(out / 'commands.json').write_text(json.dumps({'scriptc': version, 'results': results}, indent=2) + '\n')
print(f'Evidence written to {out}')
