"""Local packed-consumer checks; no deploys. Run from the repository root."""
import json, os, pathlib, shutil, subprocess, time, urllib.request
ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = pathlib.Path('/tmp/scriptc-p4-docs')
PACKS = pathlib.Path('/tmp/p4-packs')
BASE.mkdir(exist_ok=True)
ENV = dict(os.environ, NEXT_TELEMETRY_DISABLED='1', ASTRO_TELEMETRY_DISABLED='1')
CORE = str(PACKS / 'scriptc-promote-0.0.0.tgz')
NEXT = str(PACKS / 'next-scriptc-0.0.0.tgz')
CHECKSUM = 'export function checksum(n:number):number {let sum=0;for(let i=0;i<n;i++)sum+=i*i;return sum;}\n'

def setup(name, d):
 if name in ['sveltekit','astro','react-router','tanstack','nuxt']:
  example={'sveltekit':'vite-demo','astro':'astro-demo','react-router':'react-router-demo','tanstack':'tanstack-demo','nuxt':'nuxt-demo'}[name]
  shutil.copytree(ROOT/'examples'/example,d,ignore=shutil.ignore_patterns('node_modules','.svelte-kit','.output','dist','build','.astro','routeTree.gen.ts'))
  return
 d.mkdir()
 def put(file,text):
  p=d/file;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
 pkg={'private':True,'type':'module','dependencies':{'scriptc-promote':'file:'+CORE},'devDependencies':{'typescript':'5.9.3'}}
 put('tsconfig.json',json.dumps({'compilerOptions':{'strict':True,'target':'ESNext','module':'ESNext','moduleResolution':'bundler','jsx':'preserve','skipLibCheck':True}}))
 if name in ['next','cloudflare']:
  pkg['dependencies'].update({'next':'16.4.3','react':'19.3.0','react-dom':'19.3.0','next-scriptc':'file:'+NEXT})
  pkg['devDependencies'].update({'@types/react':'^19','@types/node':'^24'})
  pkg['scripts']={'build':'next build','start':'next start'}
  put('next.config.mjs',"import {withScriptc} from 'next-scriptc';\nexport default withScriptc({}, "+("{target:'cloudflare',cloudflare:{entry:'compute.ts'}}" if name=='cloudflare' else '{}')+");\n")
  put('app/layout.tsx','export default function Layout({children}:{children:React.ReactNode}){return <html><body>{children}</body></html>}')
  put('app/page.tsx','export default function Page(){return <p>scriptc</p>}')
  put('app/api/compute/route.ts',"import {checksum} from '../../../compute'; export function GET(){return Response.json(checksum(100));}")
  put('compute.ts',CHECKSUM+('export function run(input:string):string {return JSON.stringify(checksum(JSON.parse(input) as number));}' if name=='cloudflare' else ''))
  if name=='cloudflare':pkg['dependencies']['@scriptc/runtime-wasm32-wasi']='0.4.6'
 elif name=='vite':
  pkg['devDependencies']['vite']='7.3.7';pkg['scripts']={'build':'vite build --ssr src/entry.ts'}
  put('vite.config.mjs',"import {scriptcPromote} from 'scriptc-promote/vite';export default {plugins:[scriptcPromote()]};")
  put('src/entry.ts',CHECKSUM)
 elif name=='nitro':
  pkg['dependencies']['nitropack']='2.13.5';pkg['scripts']={'build':'nitro build','start':'node .output/server/index.mjs'}
  put('nitro.config.ts',"import {defineNitroConfig} from 'nitropack/config';import {scriptcNitro} from 'scriptc-promote/nitro';export default defineNitroConfig({srcDir:'server',preset:'node-server',modules:[scriptcNitro({sourceDir:'server'})]});")
  put('server/utils/checksum.ts',CHECKSUM)
  put('server/routes/compute.ts',"import {checksum} from '../utils/checksum';export default defineEventHandler(()=>checksum(100));")
 put('package.json',json.dumps(pkg,indent=2))

import sys
if len(sys.argv) == 4 and sys.argv[1] == '--prepare':
 setup(sys.argv[2], pathlib.Path(sys.argv[3])); sys.exit(0)

failed = []
for name in sys.argv[1:] or ['vite','sveltekit','nitro','nuxt','astro','react-router','tanstack','next','cloudflare']:
 d=BASE/name
 if d.exists():shutil.rmtree(d)
 setup(name,d)
 ENV['NEXT_SCRIPTC_CRASH_DIR'] = str(d / '.scriptc-crashes')
 pkg=json.loads((d/'package.json').read_text());pkg.setdefault('dependencies',{})['scriptc-promote']='file:'+CORE
 (d/'package.json').write_text(json.dumps(pkg,indent=2))
 (d/'pnpm-workspace.yaml').write_text("overrides:\n  scriptc-promote: file:"+CORE+"\nallowBuilds:\n  scriptc: true\n  esbuild: true\n  sharp: true\n")
 with (BASE/(name+'.log')).open('w') as log:
  def run(cmd):
   log.write('$ '+' '.join(cmd)+'\n');log.flush()
   try:r=subprocess.run(cmd,cwd=d,env=ENV,stdout=log,stderr=subprocess.STDOUT,timeout=360)
   except subprocess.TimeoutExpired:log.write('TIMEOUT\n');return False
   log.write('exit='+str(r.returncode)+'\n');log.flush();return r.returncode==0
  good=run(['pnpm','install','--store-dir','/tmp/p4-consumer-store'])
  good=good and run(['pnpm','rebuild','scriptc'])
  if good and name=='sveltekit':good=run(['pnpm','exec','svelte-kit','sync'])
  good=good and run(['pnpm','exec','next-scriptc' if name in ['next','cloudflare'] else 'scriptc-promote','doctor','.'])
  good=good and run(['pnpm','build'])
  if good and name=='vite':good=run(['node','--input-type=module','-e',"const m=await import('./dist/entry.js');if(m.checksum(100)!==328350)throw Error('wrong');console.log('RESULT 328350')"])
  if good and name not in ['vite','cloudflare']:
   command={'sveltekit':['node','build'],'astro':['node','dist/server/entry.mjs'],'react-router':['pnpm','exec','react-router-serve','build/server/index.js'],'next':['pnpm','exec','next','start','-p','3197']}.get(name,['node','.output/server/index.mjs'])
   child=subprocess.Popen(command,cwd=d,env=dict(ENV,PORT='3197',HOST='127.0.0.1'),stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
   try:
    target='/' if name=='sveltekit' else '/api/compute' if name in ['next','nuxt','tanstack'] else '/compute'
    for attempt in range(100):
     try:
      with urllib.request.urlopen('http://127.0.0.1:3197'+target+'?n=100',timeout=2) as r:body=r.read().decode()
      log.write('HTTP '+target+' '+body+'\n');good='328350' in body;break
     except Exception:time.sleep(.2)
    else:good=False;log.write('HTTP failed\n')
   finally:os.killpg(child.pid,15);child.wait()
  if good and name=='cloudflare':
   good=(d/'.scriptc/cloudflare/compute.wasm').exists();log.write('WASM artifact '+str(good)+'\n')
  log.flush()
  if good and name!='cloudflare':
   content=(BASE/(name+'.log')).read_text()
   good='promotion unavailable' not in content and ('compiled' in content or 'native function(s)' in content)
  log.write('RESULT '+('PASS' if good else 'FAIL')+'\n')
 if not good: failed.append(name)
 print(name,'PASS' if good else 'FAIL',flush=True)
 shutil.rmtree(d)

raise SystemExit(1 if failed else 0)
