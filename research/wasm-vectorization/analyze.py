import pathlib,subprocess,json,re,shutil
p=pathlib.Path('.checks/vectorization').resolve();out=pathlib.Path('research/wasm-vectorization');cli='/Users/noah/code/next-scriptc/packages/next-scriptc/node_modules/scriptc/bin/scriptc.exe';import os
p.mkdir(parents=True,exist_ok=True)
(p/'package.json').write_text('{"type":"module"}')
(p/'tsconfig.json').write_text(json.dumps({'compilerOptions':{'strict':True,'skipLibCheck':True,'noEmit':True,'allowImportingTsExtensions':True,'target':'es2022','module':'nodenext','moduleResolution':'nodenext'}}))
(p/'profile.json').write_text(json.dumps({'profile_format':1,'name':'repro','entry':'repro.ts','emission':'llvm','abi':{'prefix':'repro_','init_symbol':'repro_init','sink_register_symbol':'repro_sink','collect_symbol':'repro_collect'},'exports':[]}))
# Install the stock WASI pack here first; the patched CLI may retain IR then fail pack resolution.
res=[]
for compiler in ['stock','patched']:
 for target in ['wasm','arm']:
  for kind,typ,expr in [('imul','Int8Array','(sum + Math.imul(a[i], b[i])) | 0'),('natural','Int8Array','(sum + a[i] * b[i]) | 0'),('float','Float32Array','sum + a[i] * b[i]'),('sum','Int32Array','(sum + a[i]) | 0'),('offset','Int8Array','(sum + Math.imul(a[base+i], b[i])) | 0')]:
   name=f'{compiler}-{target}-{kind}';src=f'function kernel(a: {typ}, b: {typ}, base: number): number {{ let sum=0; for(let i=0;i<{"768" if kind=="offset" else "a.length"};i++) sum={expr}; return sum; }}\n';src+=f'export function run(n:number):number {{return kernel(new {typ}(n),new {typ}(n),n);}}';(p/'repro.ts').write_text(src)
   profile=json.loads((p/'profile.json').read_text());profile['exports']=[{'export':'run','symbol':'repro_run','params':['f64'],'returns':'f64'}];(p/'profile.json').write_text(json.dumps(profile))
   env={**os.environ,'SCRIPTC_CHECKER_SERVER':'0'}
   if target=='wasm':env.update(SCRIPTC_TARGET='wasm32-wasi',SCRIPTC_RUNTIME_PACK=str(p/'node_modules/@scriptc/runtime-wasm32-wasi'))
   cmd=[cli] if compiler=='stock' else ['node','/Users/noah/code/scriptc-fork/packages/cli/dist/main.js']
   (p/'repro.lib.ll').unlink(missing_ok=True)
   r=subprocess.run(cmd+['build','--emit-ir','--lib','--profile',str(p/'profile.json'),'-o',str(p/('out.wasm' if target=='wasm' else 'out.dylib'))],env=env,capture_output=True,text=True)
   ir=p/'repro.lib.ll'
   if not ir.exists():raise Exception(r.stderr)
   shutil.copy(ir,p/(name+'.ll'))
   for arch,flags in ([('wasm',['-mtriple=wasm32-unknown-wasi','-mattr=+simd128'])] if target=='wasm' else [('arm',['-mtriple=arm64-apple-darwin','-mcpu=apple-m4']),('x86',['-mtriple=x86_64-unknown-linux-gnu','-mcpu=haswell'])]):
    opt=['/opt/homebrew/opt/llvm/bin/opt',str(ir),'-S','-passes=default<O3>','-pass-remarks=loop-vectorize','-pass-remarks-missed=loop-vectorize','-pass-remarks-analysis=loop-vectorize',*flags,'-o',str(p/(name+'-'+arch+'-opt.ll'))]
    o=subprocess.run(opt,capture_output=True,text=True);text=(p/(name+'-'+arch+'-opt.ll')).read_text();funcs=[m[0] for m in re.finditer(r'^define .*?^}',text,re.M|re.S) if '<' in m[0]]
    res.append(dict(name=name,arch=arch,compileStatus=r.returncode,compileError=r.stderr,optStatus=o.returncode,remarks=o.stderr,vectorFunctions=[f.splitlines()[0] for f in funcs]))
   print(name,flush=True)
(out/'isolated.json').write_text(json.dumps(res,indent=2))
