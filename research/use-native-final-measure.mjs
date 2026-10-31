// N1 prebuilt preview workflow + E3 iad1 C=1 protocol, with O2 first-call headers.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';
import { serverEnv } from '../examples/demo/bench/config.mjs';
import { revenue } from '../examples/demo/lib/revenue.ts';
const directory = process.env.FINAL_OUTPUT ?? 'research/use-native-final';
mkdirSync(directory, {recursive:true});
const save = (name, value) => writeFileSync(`${directory}/${name}.json`, JSON.stringify(value)+'\n');
const load = name => JSON.parse(readFileSync(`${directory}/${name}.json`, 'utf8'));
const run = (...args) => JSON.parse(execFileSync('vercel', args, {encoding:'utf8',stdio:['ignore','pipe','inherit']}));
const sourceCommit = () => execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const sizes = [1000,2000,3000,5000,15000,200000];
const mode = process.argv[2];
if (mode === 'reference') {
  assert(!existsSync(`${directory}/reference.json`));
  const references = {};
  for (const size of sizes) references[size] = createHash('sha256').update(JSON.stringify(await revenue('2026-01-01','2026-01-31',size,false))).digest('hex');
  const n1 = JSON.parse(readFileSync('research/use-native-vercel/measurements.json'));
  for (const size of [5000,15000,200000]) assert.equal(references[size],n1.rows.find(r=>r.size===size).samples[0].digest);
  save('reference',references); console.log(JSON.stringify(references));
  process.exit(0);
}
const client = load('client-deployment');
const secret = parseEnv(readFileSync(process.env.NEAR_ENV_FILE ?? '.env.local','utf8')).VERCEL_AUTOMATION_BYPASS_SECRET;
assert(secret,'Missing private bypass');
const references = load('reference');
function target(d,size) { return {id:`report-${d.label}-${size}`,url:`${d.url}/reports?size=${size}`,kind:'report',size,expected:references[size]}; }
async function invoke(name,spec) {
  assert(!existsSync(`${directory}/${name}.json`),'Refusing duplicate batch');
  const response = await fetch(`${client.url}/bench`, {method:'POST', headers:{'content-type':'application/json','x-vercel-protection-bypass':secret,'x-bench-target-bypass':secret},body:JSON.stringify(spec),signal:AbortSignal.timeout(55000),redirect:'error'});
  // Persist the complete client response before validation. No target retries.
  const out = {callerStatus:response.status,callerVercelId:response.headers.get('x-vercel-id'),...await response.json()};
  save(name,out);
  assert.equal(out.callerStatus,200); assert.equal(out.status,'complete'); assert.equal(out.region,'iad1');
  for (const s of out.samples) { assert(s.valid); assert.equal(s.cache,'MISS'); assert.match(s.vercelId,/^iad1::iad1::/); }
  console.log(JSON.stringify({name,count:out.samples.length,elapsedMs:out.elapsedMs,cpu:out.cpu,instance:out.instance}));
  return out;
}
if (/^(node|native)-[12]$/.test(mode ?? '')) {
  assert(!existsSync(`${directory}/${mode}.json`),'Refusing duplicate deployment label');
  assert.equal(JSON.parse(readFileSync('.vercel/project.json')).projectName,'next-scriptc');
  const variant = mode.split('-')[0];
  const build = JSON.parse(readFileSync(`.vercel/${variant}-build.json`));
  assert.equal(build.sourceCommit,sourceCommit()); assert.equal(build.variant,variant);
  execFileSync(process.execPath,['examples/demo/bench/vercel/archive/startup-deploy.mjs','check-traces'],{stdio:'inherit'});
  const args = ['deploy','--prebuilt','--regions','iad1','--environment','preview','--force','--json'];
  for(const [key,value] of Object.entries({...serverEnv,NATIVE_VERCEL_TIMING:'1',NEXT_SCRIPTC_STARTUP_TIMING:'1'})) args.push('--env',`${key}=${value}`);
  const result = run(...args), d = result.deployment ?? result;
  const row = {label:mode,variant,id:d.id,url:`https://${d.url.replace(/^https:\/\//,'')}`,sourceCommit:sourceCommit(),build,client:client.url,status:'accepted'};
  save(mode,row);
  const info = run('inspect',row.url,'--json');
  assert.equal(info.readyState,'READY'); assert.notEqual(info.target,'production');
  const functions = new Map();
  for(const b of info.builds ?? []) for(const o of b.output ?? []) if(o.lambda) functions.set(o.lambda.functionName,{runtime:o.lambda.runtime,bytes:o.size,regions:o.lambda.deployedTo,memory:o.lambda.memorySize});
  row.functions=[...functions.values()]; assert(row.functions.length<=12);
  assert(row.functions.every(f=>f.regions?.every(r=>r==='iad1')));
  row.status='ready'; save(mode,row);
  row.first = await invoke(`${mode}-first`,{targets:[target(row,5000)],warmups:0,count:1,concurrency:1});
  row.status='complete'; save(mode,row);
  console.log(JSON.stringify({label:mode,url:row.url,first:row.first.samples}));
} else if (/^pair-[12]$/.test(mode ?? '')) {
  const pair=Number(mode.at(-1));
  assert(!existsSync(`${directory}/${mode}-run.json`),'Refusing duplicate pair run');
  const deployments=['node','native'].map(v=>load(`${v}-${pair}`));
  assert(deployments.every(d=>d.status==='complete'));
  assert.equal(deployments[0].sourceCommit,deployments[1].sourceCommit);
  const report={pair,client:client.url,sourceCommit:deployments[0].sourceCommit,protocol:{warmups:10,samples:60,concurrency:1,batches:3,batchCount:20,sizes,firstSize:5000,order:'A/B then B/A; pair 2 starts B/A',retries:0},batches:[],status:'running'};
  save(`${mode}-run`,report);
  try {
    for(const size of sizes) for(let batch=0;batch<3;batch++) {
      const name=`${mode}-${size}-c1-${batch+1}`;
      const out=await invoke(name,{targets:deployments.map(d=>target(d,size)),warmups:batch===0?10:0,count:20,concurrency:1,rotation:pair-1+batch*20});
      report.batches.push({name,status:out.status,count:out.samples.length}); save(`${mode}-run`,report);
    }
    report.status='complete';
  } catch { report.status='failed'; throw Error('Measurement stopped; partial batches retained without retries'); }
  finally { report.finishedAt=new Date().toISOString();save(`${mode}-run`,report); }
} else throw Error('Use reference, node/native-[12], or pair-[12]');
