"""Summarize four alternating windows and macOS sample inclusive stacks."""
import json
import re
from pathlib import Path
from statistics import median

root = Path(__file__).parent
windows = {lane: [json.loads((root / f'final-{lane}{i}.json').read_text())['result'] for i in range(4)] for lane in ['b', 'p']}
rows = []
for cell in range(12):
    row = {k: windows['b'][0][cell][k] for k in ['n', 'shape', 'typed', 'bytes', 'oracle']}
    for lane in ['b', 'p']:
        row[lane] = {name: [median(s[index] for s in w[cell]['samples']) for w in windows[lane]] for name, index in [('decode', 0), ('destroy', 2)]}
    rows.append(row)
profiles = {}
for path in sorted(root.glob('final-baseline-*.txt')):
    stack = []
    totals = {}
    total = None
    active = False
    for line in path.read_text().splitlines():
        if line == 'Call graph:':
            active = True
            continue
        if not active:
            continue
        m = re.match(r'^([ +!:|]*)(\d+) (\S+)', line)
        if not m:
            if line.startswith('Total number'):
                break
            continue
        prefix, count, name = m.groups()
        depth = len(prefix)
        count = int(count)
        if total is None:
            total = count
        while stack and stack[-1][0] >= depth:
            stack.pop()
        if name not in [n for _, n in stack]:
            totals[name] = totals.get(name, 0) + count
        stack.append((depth, name))
    names = ['scr_json_parse', 'scr_json_parse_schema', 'scr_json_number_value', 'scr_json_plain_bytes', 'scr_str_new', 'bench_item_new', 'scr_jschema_record', 'scr_dyn_alloc', 'scr_dyn_obj_get', 'scr_dyn_release', 'scr_arr_release', 'scr_dyn_obj_layout_push', 'scr_json_shape_follow']
    profiles[path.stem] = {'total': total, 'inclusive': {n: totals.get(n, 0) for n in names}}
summary = {'rows': rows, 'profiles': profiles}
(root / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
for r in rows:
    b, p = [median(r[l]['decode']) for l in ['b', 'p']]
    print(f"| {r['n']} | {r['shape']} | {'typed' if r['typed'] else 'erased'} | {b:.3f} | {p:.3f} | {100*(p/b-1):+.1f}% | {median(r['b']['destroy']):.3f} | {median(r['p']['destroy']):.3f} |")
for name, p in profiles.items():
    print(name, p['total'], {n: round(100*v/p['total'], 1) for n,v in p['inclusive'].items() if v})
