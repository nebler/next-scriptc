// Local production-boundary benchmark. Run with Node 24 and an output JSON path.
// Set BENCH_REVISION=53da3a7 to reproduce the original HTTP/serializer baseline.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Agent, request } from 'node:http';
import { promisify } from 'node:util';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../../..');
const sourceRuntime = path.join(root, 'packages/next-scriptc/src/functions');
let runtime = sourceRuntime;
const require = createRequire(path.join(sourceRuntime, '../../package.json'));
const compiler = path.resolve(path.dirname(require.resolve('scriptc/package.json')), require('scriptc/package.json').bin.scriptc);
const cache = path.resolve(import.meta.dirname, '../.next/cache');
await mkdir(cache, { recursive: true });
const dir = await mkdtemp(path.join(cache, 'overhead-'));
const children = [];
const agent = new Agent({ keepAlive: true });
const stats = values => {
  const sorted = [...values].sort((a,b) => a-b);
  return { p50: sorted[Math.ceil(sorted.length*.5)-1], p95: sorted[Math.ceil(sorted.length*.95)-1], max: sorted.at(-1) };
};
try {
  await writeFile(path.join(dir, 'package.json'), '{"type":"module"}');
  // Use the same harness against a committed baseline without checking out or
  // rebuilding Next. Stage all transport sources together to preserve imports.
  if (process.env.BENCH_REVISION) {
    runtime = path.join(dir, 'runtime');
    await mkdir(runtime);
    for (const file of ['client.mjs', 'sidecar.mjs', 'serve.ts', 'json.ts']) {
      const { stdout } = await promisify(execFile)('git', ['show', `${process.env.BENCH_REVISION}:packages/next-scriptc/src/functions/${file}`], { cwd: root });
      await writeFile(path.join(runtime, file), stdout);
    }
  }
  const { callNative } = await import(path.join(runtime, 'client.mjs'));
  const { serialize } = await import(path.join(runtime, 'json.ts'));
  const typedEncoding = (await readFile(path.join(runtime, 'serve.ts'), 'utf8')).includes('FunctionResult');
  await writeFile(path.join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, skipLibCheck: true, allowImportingTsExtensions: true, noEmit: true } }));
  // Only add stored 1k/2k/3k fixtures. The function and generator are unchanged.
  let revenue = await readFile(path.join(import.meta.dirname, '../lib/revenue.ts'), 'utf8');
  revenue = revenue.replace('"../app/api/analytics/revenue/events.ts"', JSON.stringify(path.resolve(import.meta.dirname, '../app/api/analytics/revenue/events.ts'))).replace('[5000, 15000, 50000, 200000]', '[1000, 2000, 3000, 5000, 15000, 50000, 200000]');
  await writeFile(path.join(dir, 'revenue.ts'), revenue);
  // Instrument a copy, leaving the production listener untouched. HTTP parser
  // CPU before createServer's callback and OS/event-loop waits remain residual.
  let serve = await readFile(path.join(runtime, 'serve.ts'), 'utf8');
  serve = serve.replace('"./json.ts"', JSON.stringify(path.join(runtime, 'json.ts')))
    .replace('export function serveFunctions', 'export function serveProfile')
    .replace('    try {', '    const begin = performance.now();\n    try {')
    .replace('      const value = await dispatch', '      const assembled = performance.now();\n      const value = await dispatch')
    .replace('      const body = serialize', '      const computed = performance.now();\n      const body = serialize')
    .replace('      outgoing.setHeader("content-type"', '      const encoded = performance.now();\n      outgoing.setHeader("x-profile", JSON.stringify([assembled - begin, computed - assembled, encoded - computed]));\n      outgoing.setHeader("content-type"');
  await writeFile(path.join(dir, 'profile-serve.ts'), serve);
  const entry = path.join(dir, 'entry.ts');
  await writeFile(entry, `import { serveFunctions } from ${JSON.stringify(path.join(runtime, 'serve.ts'))};
import { serveProfile } from './profile-serve.ts';
import { revenue } from './revenue.ts';
const dispatch = async (id: string, body: string) => {
 if (id === 'echo') { const value = JSON.parse(body) as string[]; return ${typedEncoding ? '{ value, encode: () => JSON.stringify(value) }' : 'value'}; }
 const args = JSON.parse(body) as [string, string, number, boolean];
 const value = await revenue(args[0], args[1], args[2], args[3]);
 return ${typedEncoding ? '{ value, encode: () => JSON.stringify(value) }' : 'value'};
};
if (process.env.PROFILE) serveProfile(dispatch); else serveFunctions(dispatch);
`);
  const binary = path.join(dir, 'functions');
  await promisify(execFile)(compiler, ['build', entry, '-o', binary, '--optimization', 'release', '--strip', '--no-keep-llvm', '--node-islands=off'], { env: {...process.env, SCRIPTC_CHECKER_SERVER:'0'}, maxBuffer: 8e6 });
  async function start(native, profile) {
    const child = spawn(native ? binary : process.execPath, native ? [] : [entry], { env: {...process.env, PORT:'0', PROFILE:profile?'1':'', NEXT_SCRIPTC_PARENT:String(process.pid)}, stdio:['ignore','pipe','pipe'] });
    const closed = new Promise(r => child.once('close', r));
    children.push({child,closed});
    return await new Promise((resolve,reject) => {
      let logs = '';
      const timer = setTimeout(() => reject(new Error(logs)), 30000);
      child.stderr.on('data', b => logs += b);
      child.stdout.on('data', b => { logs += b; const m = logs.match(/127\.0\.0\.1:(\d+)/); if(m) {clearTimeout(timer);resolve(Number(m[1]));} });
      child.once('exit', () => { clearTimeout(timer);reject(new Error(logs)); });
      child.once('error', reject);
    });
  }
  // Load the same unchanged revenue source in Node for the in-process baseline.
  const { revenue: nodeRevenue } = await import(path.join(dir, 'revenue.ts'));
  const port = await start(true, false);
  const profilePort = await start(true, true);
  const result = { revision:process.env.BENCH_REVISION || 'working tree', node:process.version, scriptc:require('scriptc/package.json').version, platform:`${process.platform}/${process.arch}`, warmups:100, samples:300, curve:{}, breakdown:{} };
  for (const size of (process.env.BENCH_QUICK ? [5000] : [1000,2000,3000,5000,15000,200000])) {
    const args = ['2026-01-01','2026-01-31',size,false];
    const nativeTimes=[],nodeTimes=[];
    for(let i=-100;i<300;i++) {
      for(let order=0;order<2;order++) {
        const native=(i+order)%2===0;
        const begin=performance.now();
        const value=native ? await callNative(port,'revenue',args) : await nodeRevenue(...args);
        const elapsed=performance.now()-begin;
        assert.equal(value.events,size);
        if(i>=0) (native?nativeTimes:nodeTimes).push(elapsed);
      }
    }
    assert.equal(JSON.stringify(await callNative(port,'revenue',args)),JSON.stringify(await nodeRevenue(...args)));
    result.curve[size]={node:stats(nodeTimes),native:stats(nativeTimes)};
    await writeFile(process.argv[2],JSON.stringify(result,null,2)+'\n');
  }
  async function profileCall(id,args) {
    const begin=performance.now();
    const body=serialize(args);
    const encoded=performance.now();
    return new Promise((resolve,reject) => {
      const req=request({hostname:'127.0.0.1',port:profilePort,method:'POST',path:`/${id}`,agent,headers:{'content-type':'application/json','content-length':Buffer.byteLength(body)}},response=>{
        const headers=performance.now();
        let text='';
        response.setEncoding('utf8');
        response.on('data',b=>text+=b);
        response.on('end',()=>{
          const received=performance.now();
          JSON.parse(text);
          const end=performance.now();
          if (!response.headers['x-profile']) { reject(new Error(JSON.stringify({headers:response.headers,text:text.slice(0,200)}))); return; }
          const server=JSON.parse(response.headers['x-profile']);
          resolve({argumentSerialize:encoded-begin,clientRequest:submitted-encoded,nativeAssembly:server[0],nativeDispatch:server[1],nativeSerialize:server[2],returnReceive:received-headers,resultParse:end-received,residual:headers-submitted-server.reduce((a,b)=>a+b,0),total:end-begin});
        });
      });
      req.on('error',reject); req.end(body);
      const submitted=performance.now();
    });
  }
  for(const [name,id,args] of [['echo','echo',['hello']],['revenue5000','revenue',['2026-01-01','2026-01-31',5000,false]]]) {
    const samples=[];
    for(let i=-100;i<1000;i++) { const value=await profileCall(id,args); if(i>=0)samples.push(value); }
    result.breakdown[name]=Object.fromEntries(Object.keys(samples[0]).map(k=>[k,stats(samples.map(s=>s[k]))]));
  }
  // Batched in-process parse, compute and serialization components (no HTTP).
  let profile = await readFile(path.join(import.meta.dirname, 'function-profile.ts'), 'utf8');
  profile = profile.replaceAll('\"../lib/revenue.ts\"', JSON.stringify(path.join(import.meta.dirname, '../lib/revenue.ts'))).replaceAll('\"./function-json-legacy.ts\"', JSON.stringify(path.join(import.meta.dirname, 'function-json-legacy.ts'))).replaceAll('\"../../../packages/next-scriptc/src/functions/json.ts\"', JSON.stringify(path.join(runtime, 'json.ts'))).replace(/serialize\(result, true(?:, \(\) => JSON\.stringify\(result\))?\)/, typedEncoding ? 'serialize(result, true, () => JSON.stringify(result))' : 'serialize(result, true)');
  await writeFile(path.join(dir, 'profile.ts'), profile);
  const probe=path.join(dir,'probe.ts');
  await writeFile(probe,`import { profile } from ${JSON.stringify(path.join(dir,'profile.ts'))};
async function run() { const samples=[]; for(let i=-100;i<300;i++) { const v=await profile(5000); if(i>=0)samples.push(v); } console.log(JSON.stringify(samples)); } run();`);
  const probeBinary=path.join(dir,'probe');
  await promisify(execFile)(compiler,['build',probe,'-o',probeBinary,'--optimization','release','--strip','--no-keep-llvm','--node-islands=off'],{env:{...process.env,SCRIPTC_CHECKER_SERVER:'0'},maxBuffer:8e6});
  const {stdout}=await promisify(execFile)(probeBinary,[],{maxBuffer:8e6});
  const samples=JSON.parse(stdout);
  result.components=Object.fromEntries(Object.keys(samples[0]).map(k=>[k,stats(samples.map(s=>s[k]))]));
  await writeFile(process.argv[2],JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
} finally {
  agent.destroy();
  for(const {child} of children)child.kill('SIGKILL');
  await Promise.all(children.map(c=>c.closed));
  await rm(dir,{recursive:true,force:true});
}
