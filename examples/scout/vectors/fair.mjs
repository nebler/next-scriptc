// Fairness follow-up. Original scout files/evidence are retained unchanged.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
const dir=import.meta.dirname, root=path.resolve(dir,'../../..'), artifacts=path.join(dir,'.artifacts');
mkdirSync(artifacts,{recursive:true});
const linux=os.platform()==='linux';
const output=process.argv[2] ?? path.join(root,'research/benchmarks/vector-scout-mac.json');
if(existsSync(output))throw new Error('Evidence exists; use a new artifact name, never replace measurements');
const go=process.env.VECTOR_GO || 'go';
const native=path.join(artifacts,linux?'fair-native-linux':'fair-native');
const goBin=path.join(artifacts,linux?'fair-go-linux':'fair-go');
const compiler=process.env.SCRIPTC_COMPILER || path.join(root,'packages/next-scriptc/node_modules/.bin/scriptc');
if(!process.argv.includes('--skip-build')) {
 execFileSync(go,['build','-C',path.join(root,'examples/demo/go'),'-trimpath','-o',goBin,'./cmd/vectors'],{env:{...process.env,CGO_ENABLED:'0',GOEXPERIMENT:'simd'},stdio:'inherit'});
 execFileSync(compiler,['build',path.join(dir,'vectors.ts'),'--optimization','release','--no-keep-llvm','-o',native],{env:{...process.env,SCRIPTC_CHECKER_SERVER:'0'},stdio:'inherit'});
}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={status:'running',startedAt:new Date().toISOString(),sourceCommit:process.env.BENCH_COMMIT,platform:os.platform(),arch:os.arch(),cpu:os.cpus()[0].model,loadBefore:os.loadavg(),node:process.version,go:process.env.VECTOR_GO_VERSION || execFileSync(go,['version'],{encoding:'utf8'}).trim(),scriptc:process.env.VECTOR_COMPILER_VERSION || execFileSync(compiler,['--version'],{encoding:'utf8'}).trim(),sourceSha256:sha(readFileSync(path.join(dir,'vectors.ts'))),binarySha256:{go:sha(readFileSync(goBin)),native:sha(readFileSync(native))},runs:[]};
const save=()=>writeFileSync(output,JSON.stringify(report,null,2)+'\n');
const iterations=linux?10:20,warmup=linux?5:10;
const reference=new Map();
const cases=[['node-number','int8'],['node-i32','int8-i32'],['node-imul','int8-imul'],['go-plain','int8'],['go-unrolled','int8'],['go-simd','int8'],['native-natural','int8-i32'],['native-imul','int8-imul'],['node-float','float'],['go-plain','float'],['go-unrolled','float'],['go-simd','float'],['native-float','float']];
try {
 for(let round=0;round<2;round++) for(const [n,d] of [[20000,384],[100000,768]]) for(const [runtime,kind] of round===0?cases:[...cases].reverse()) {
  const command=runtime.startsWith('node')?[process.execPath,path.join(dir,'vectors.ts'),kind]:runtime.startsWith('go')?[goBin,kind,runtime.slice(3)]:[native,kind];
  const args=[...command,String(n),String(d),String(iterations),String(warmup)];
  const r=spawnSync(linux?path.join(artifacts,'rss-linux'):'/usr/bin/time',linux?args:['-l',...args],{encoding:'utf8',maxBuffer:2**22});
  if(r.status!==0)throw new Error(`${runtime}: ${r.stderr}`);
  const data=JSON.parse(r.stdout);
  const key=`${n}:${kind==='float'?'float':'int8'}`, prior=reference.get(key);
  let maxScoreError=0;
  if(prior) {
   if(JSON.stringify(data.ids)!==JSON.stringify(prior.ids))throw new Error(`IDs ${runtime}/${kind}`);
   for(let i=0;i<10;i++) {const err=Math.abs(data.scores[i]-prior.scores[i]);maxScoreError=Math.max(maxScoreError,err);if(err>(kind==='float'?1e-10+1e-12*Math.abs(prior.scores[i]):0))throw new Error(`score ${runtime}/${kind}`)}
  } else reference.set(key,data);
  const rss=linux?data.peakRssBytes:Number(r.stderr.match(/(\d+)\s+maximum resident set size/)[1]);
  report.runs.push({round,runtime,...data,peakRssBytes:rss,maxScoreError});save();
  console.log(`${round} ${runtime} ${kind} ${n}x${d} ${data.medianMs.toFixed(3)}ms`);
 }
 report.status='complete';
} catch(e){report.status='failed';report.error=String(e);process.exitCode=1;console.error(e)}
finally {report.loadAfter=os.loadavg();report.finishedAt=new Date().toISOString();save()}
