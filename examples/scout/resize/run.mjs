// Run sequentially, on an otherwise idle host. Artifacts are intentionally ignored.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
const root = path.resolve(import.meta.dirname, '../../..');
const dir = path.resolve(process.env.SCOUT_SOURCE_DIR ?? import.meta.dirname);
const artifacts = path.join(dir, '.artifacts'); mkdirSync(artifacts, {recursive:true});
const node = process.env.REPRO_NODE ?? process.execPath, go = process.env.REPRO_GO ?? 'go';
const compiler = path.join(root,'packages/next-scriptc/node_modules/.bin/scriptc');
const env = {...process.env, SCRIPTC_CHECKER_SERVER:'0', PATH:path.dirname(node)+':'+process.env.PATH};
const exec = (cmd,args,cwd=root) => execFileSync(cmd,args,{cwd,env,encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024});
const arg = (name,fallback) => { const i=process.argv.indexOf(name); return i<0?fallback:process.argv[i+1]; };
const rounds = Number(arg('--rounds','3'));
const data = {date:new Date().toISOString(),platform:process.platform,arch:process.arch,cpu:os.cpus()[0].model,
 node:exec(node,['--version']).trim(),go:process.env.SCOUT_GO_VERSION ?? exec(go,['version']).trim(),scriptc:exec(compiler,['--version']).trim(),
 loadAverageStart:os.loadavg(),warmup:20,iterations:40,rounds,builds:[],runs:[],sources:{}};
for (const file of ['kernel.ts','bench.ts','main.go','go.mod','go.sum']) data.sources[file]=createHash('sha256').update(readFileSync(path.join(dir,file))).digest('hex');
if (!data.node.startsWith('v24.')) throw new Error('Use Node 24');
if (!process.argv.includes('--skip-build')) {
 for (const mode of ['release','speed']) {
  const args=['build',path.join(dir,'bench.ts'),'--optimization',mode,'--node-islands=off','--keep-llvm','-o',path.join(artifacts,mode)];
  data.builds.push({command:[compiler,...args],stdout:exec(compiler,args)});
 }
 data.builds.push({command:[go,'build','-o','.artifacts/go','.'],stdout:exec(go,['build','-o','.artifacts/go','.'],dir)});
 data.coverage=exec(compiler,['coverage',path.join(dir,'bench.ts'),'--explain-dynamic']);
}
const sizes=process.argv.includes('--largest')?[[4096,512]]:arg('--sizes','1024:256,2048:512,4096:512').split(',').map(s=>s.split(':').map(Number));
const orders=[['node','release','speed','go'],['go','speed','node','release'],['release','node','go','speed']];
const expected=new Map();
const kinds=arg('--kinds','box,bilinear,ximage,ximage-approx').split(',');
for (let round=0;round<rounds;round++) for (const [width,size] of sizes) for (const kind of kinds) {
 for (const runtime of kind.startsWith('ximage')?['go']:orders[round%orders.length]) {
  const command=runtime==='node'?[node,path.join(dir,'bench.ts')]:[path.join(artifacts,runtime)];
  const output=path.join(artifacts,`${runtime}-${kind}-${width}.rgba`);
  const flags=process.platform==='darwin'?['-l']:['-v'];
  const result=spawnSync('/usr/bin/time',[...flags,...command],{cwd:root,env:{...env,WIDTH:String(width),SIZE:String(size),KIND:kind,WARMUP:'20',ITERATIONS:'40',OUTPUT:output},encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
  if (result.status!==0) throw new Error(JSON.stringify({runtime,kind,status:result.status,error:result.error?.message,stderr:result.stderr}));
  const row=JSON.parse(result.stdout.trim());
  const match=result.stderr.match(process.platform==='darwin'?/([\d]+)\s+maximum resident set size/:/Maximum resident set size \(kbytes\):\s*(\d+)/);
  if (!match) throw new Error('Missing peak RSS: '+result.stderr);
  const peakRssBytes=Number(match[1])*(process.platform==='darwin'?1:1024);
  const bytes=readFileSync(output),key=`${kind}-${width}`;
  if (createHash('sha256').update(bytes).digest('hex')!==row.sha256) throw new Error('output/hash mismatch');
  if (expected.has(key) && !bytes.equals(expected.get(key))) throw new Error('byte parity: '+key+' '+runtime);
  expected.set(key,bytes);
  data.runs.push({round,runtime,command,peakRssBytes,...row});
  const sorted=[...row.samples].sort((a,b)=>a-b);
  console.error(`${round} ${runtime} ${kind} ${width}->${size}: ${sorted[20].toFixed(3)} ms; RSS ${(peakRssBytes/1048576).toFixed(1)} MiB`);
 }
}
data.loadAverageEnd=os.loadavg(); data.summary=[];
for (const [width,size] of sizes) for (const kind of kinds) for (const runtime of kind.startsWith('ximage')?['go']:['node','release','speed','go']) {
 const rows=data.runs.filter(r=>r.width===width&&r.kind===kind&&r.runtime===runtime);
 const times=rows.flatMap(r=>r.samples).sort((a,b)=>a-b);
 data.summary.push({width,size,kind,runtime,n:times.length,medianMs:times[Math.floor(times.length/2)],p95Ms:times[Math.ceil(times.length*.95)-1],peakRssMiB:Math.max(...rows.map(r=>r.peakRssBytes))/1048576,sha256:rows[0].sha256});
}
const file=path.resolve(arg('--output',path.join(dir,'mac-results.json')));
writeFileSync(file,JSON.stringify(data,null,2)+'\n');
console.log(JSON.stringify({file,summary:data.summary},null,2));
