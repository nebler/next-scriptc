// External checkout only. No third-party source is copied into this repository.
import {execFileSync,spawn} from 'node:child_process';
import {mkdir,writeFile,readFile,rm,readdir,mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {discoverPromotions} from '../packages/scriptc-promote/src/functions/promotion-discovery.mjs';
const app=path.resolve(process.argv[2]);
const repo=path.resolve(import.meta.dirname,'..');
const require=createRequire(path.join(app,'package.json'));
const run=(command,args)=>execFileSync(command,args,{cwd:app,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:process.env});
const commit=run('git',['rev-parse','HEAD']).trim();
if(commit!=='df796708040f5200ec572b28ab7f88ecee5794dd')throw Error('Expected pinned sveltejs/realworld commit');
const logs=[];
const census=()=>discoverPromotions(app,path.join(app,'.svelte-kit'),{typescript:{tsconfigPath:'jsconfig.json'},promotionSourceDir:'src'},message=>logs.push(message));
// Run after installing dependencies and switching the external checkout to adapter-node.
run('npx',['svelte-kit','sync']);
await rm(path.join(app,'src/lib/server/scriptc-probe.ts'),{force:true});
await rm(path.join(app,'src/routes/__scriptc_probe'),{recursive:true,force:true});
const sourceFiles=(await readdir(path.join(app,'src'),{recursive:true})).filter(file=>/\.[cm]?[jt]sx?$/.test(file)).length;
const upstream=await census();
const upstreamDiagnostics=logs.splice(0);
await mkdir(path.join(app,'src/lib/server'),{recursive:true});
await mkdir(path.join(app,'src/routes/__scriptc_probe'),{recursive:true});
await writeFile(path.join(app,'src/lib/server/scriptc-probe.ts'),await readFile(path.join(repo,'examples/vite-demo/src/lib/server/checksum.ts')));
await writeFile(path.join(app,'src/routes/__scriptc_probe/+server.ts'),`import {checksum} from '../../lib/server/scriptc-probe';
export function GET({url}) {
 if(url.searchParams.has('state'))return new Response(JSON.stringify([...globalThis[Symbol.for('scriptc-promote.dispatchers')]??[]].map(([,dispatcher])=>dispatcher.snapshot())));
 const n=Number(url.searchParams.get('n')??1000);
 return new Response(JSON.stringify({checksum:checksum(n)}));
}`);
const probed=await census();
await writeFile(path.join(repo,'research/vite-plugin-census.json'),JSON.stringify({app:'sveltejs/realworld',commit,license:'MIT',sourceFiles,upstreamEligible:upstream.length,withProbeEligible:probed.length,upstreamDiagnostics,functions:probed.flatMap(m=>m.functions.map(f=>f.name)),diagnostics:logs},null,2)+'\n');
console.log(run('npm',['run','build']));
const versions=Object.fromEntries(['vite','svelte','@sveltejs/kit','@sveltejs/adapter-node','typescript'].map(name=>[name,require(name+'/package.json').version]));
const inputs=[0,1,10,100,1000,10000];
const crashDirectory=await mkdtemp(path.join(tmpdir(),'scriptc-real-app-'));
async function serve(mode,port,verify){
 let output='';const child=spawn(process.execPath,['--import','data:text/javascript,process.once("SIGTERM",()=>process.exit(0))','build'],{cwd:app,env:{...process.env,NEXT_SCRIPTC_CRASH_DIR:crashDirectory,HOST:'127.0.0.1',PORT:String(port),SCRIPTC_PROMOTE:mode},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 const base=`http://127.0.0.1:${port}/__scriptc_probe`;
 try{
  for(let i=0;i<100;i++){try{await fetch(base);break;}catch{if(child.exitCode!==null)throw Error(output);await new Promise(r=>setTimeout(r,50));}}
  const bodies=[];
  for(let i=0;i<120;i++){bodies.push(await (await fetch(base+'?n='+inputs[i%inputs.length])).text());await new Promise(r=>setTimeout(r,2));}
  const states=await (await fetch(base+'?state')).json();
  if(verify&&!states.some(instance=>Object.values(instance).some(fn=>fn.buckets.some(bucket=>bucket.verified>=3))))throw Error('No verified native shadow: '+JSON.stringify({states,output}));
  return {bodies,states,output};
 }finally{child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}
}
const js=await serve('0',4183,false),native=await serve('1',4184,true);
await rm(crashDirectory,{recursive:true,force:true});
if(JSON.stringify(js.bodies)!==JSON.stringify(native.bodies))throw Error('HTTP byte mismatch');
const states=native.states.map(instance=>Object.fromEntries(Object.entries(instance).map(([id,fn])=>[id,{calls:fn.calls,native:fn.native,fallback:fn.fallback,buckets:fn.buckets.map(b=>({bucket:b.bucket,state:b.state,verified:b.verified}))}])));
const result={commit,versions,upstreamEligible:upstream.length,withProbeEligible:probed.length,requests:js.bodies.length,byteIdentical:true,states,transitions:native.output.split('\n').filter(line=>line.startsWith('next-scriptc '))};
await writeFile(path.join(repo,'research/vite-plugin-parity.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
