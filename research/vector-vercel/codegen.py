# Compact, reproducible link from generated route IR to final AVX2 instructions.
import re, json
from pathlib import Path
ir=Path('/tmp/vector-vercel/entry-0.ll')
last=''; callers={}; mapping=[]; recent=[]
with ir.open() as f:
 for line in f:
  if line.startswith('define '):last=line.strip()
  if 'invoke ptr @sc_bf__x25_m' in line and '_search.i32.' in line and not last.startswith('define internal ptr @sc_bf__x25_m'):
   callers.setdefault(last,[]).append(line.strip())
  if line.startswith('define internal ptr @sc_bf__x25_m') and '_search.i32.' in line:
   recent=[line.strip()]
  elif recent:
   if re.search(r'fmul|fadd|mul i32|add i32|and i32|wrap|sext i8',line):recent.append(line.strip())
   if line.strip()=='}':mapping.append({'definition':recent[0],'excerpt':recent[1:45]});recent=[]
wanted=[re.search(r'@([^ (]+)',definition)[1] for definition in callers]
out=[];current=None
with Path('/tmp/vector-vercel/patched-assembly.txt').open() as f:
 for line in f:
  if re.match('^[0-9a-f]+ <',line):
   if current:out.append(current)
   # Include dispatchers as well as both implementations.
   current={'name':line.strip(),'avx':[],'dispatch':[],'entry':[]} if any(name.rsplit('.',1)[0] in line for name in wanted) else None
  elif current:
   if len(current['entry'])<10 and line.strip():current['entry'].append(line.strip())
   if re.search(r'vpmovsxb|vpmadd|vpaddd|ymm',line):current['avx'].append(line.strip())
   if re.search(r'sc_cpu_level|\.base|\.v3',line) and re.search(r'call|jmp|cmpl|jb',line):current['dispatch'].append(line.strip())
 if current:out.append(current)
result={'source':'Unchanged natural and imul search functions, compiler IR and final stripped-equivalent executable .text. LLVM inlined each search into its request closure. Both v3 copies contain widening, signed pair multiplication and YMM accumulation. Baseline copies have no AVX instructions.','irSearchBodies':mapping,'irClosureCalls':callers,'assembly':out}
Path('research/vector-vercel/vector-assembly.json').write_text(json.dumps(result,separators=(',',':'))+'\n')
print([(x['name'],len(x['avx'])) for x in out])
