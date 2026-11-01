"""Inspect ELF64 dynamic symbols without depending on host binutils."""
import json
from pathlib import Path
import struct
root = Path(__file__).resolve().parents[1]
results = []
for target in ('linux-arm64-gnu', 'linux-x64-gnu'):
    data = (root / '.checks/boundary' / target / 'promotion.node').read_bytes()
    assert data[:6] == b'\x7fELF\x02\x01'
    shoff = struct.unpack_from('<Q', data, 40)[0]
    entsize, count = struct.unpack_from('<HH', data, 58)
    sections = [struct.unpack_from('<IIQQQQIIQQ', data, shoff + i * entsize) for i in range(count)]
    undefined = []
    for section in sections:
        if section[1] != 11:  # SHT_DYNSYM
            continue
        strings = sections[section[6]]
        table = data[strings[4]:strings[4]+strings[5]]
        for offset in range(section[4], section[4]+section[5], section[9]):
            name, info, other, index, value, size = struct.unpack_from('<IBBHQQ', data, offset)
            if index == 0 and name:
                undefined.append(table[name:table.index(b'\0', name)].decode())
    unresolved_runtime = [n for n in undefined if n.startswith(('scr_', 'rev_'))]
    assert not unresolved_runtime, unresolved_runtime
    results.append({'target': target, 'elf_machine': struct.unpack_from('<H', data, 18)[0],
                    'unresolved_scriptc_or_shim_symbols': unresolved_runtime,
                    'node_api_imports': len([n for n in undefined if n.startswith('napi_')]),
                    'execution': 'not run; link and symbol audit only'})
print(json.dumps(results, indent=2))
