// Fresh preview first requests through the existing E3 iad1 client. No retries.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { serverEnv } from '../examples/demo/bench/config.mjs';
const directory = process.env.FIRST_CALL_OUTPUT ?? 'research/use-native-first-call';
mkdirSync(directory, {recursive:true});
const label = process.argv[2];
assert(/^(trace|warm-trace|ready-trace|after|final)-(native|node)-[12]$/.test(label ?? ''), 'Supply a unique before/after label');
const file = `${directory}/${label}.json`;
assert(!existsSync(file), 'Refusing duplicate deployment');
assert.equal(JSON.parse(readFileSync('.vercel/project.json')).projectName, 'next-scriptc');
const run = (...args) => JSON.parse(execFileSync('vercel', args, {encoding:'utf8',stdio:['ignore','pipe','inherit']}));
execFileSync(process.execPath, ['examples/demo/bench/vercel/archive/startup-deploy.mjs','check-traces'], {stdio:'inherit'});
const variant = label.includes('-node-') ? 'node' : 'native';
assert.equal(existsSync('.vercel/output/functions/reports.func/scriptc-functions'), variant === 'native', 'Build variant does not match deployment label');
const args = ['deploy','--prebuilt','--regions','iad1','--environment','preview','--force','--json'];
for (const [key,value] of Object.entries({...serverEnv,NATIVE_VERCEL_TIMING:'1',...(label.includes('trace-') ? {NEXT_SCRIPTC_STARTUP_TIMING:'1',NEXT_SCRIPTC_CALL_TIMING:'1'} : {})})) args.push('--env',`${key}=${value}`);
const result = run(...args), d = result.deployment ?? result;
const row = {label,id:d.id,url:`https://${d.url.replace(/^https:\/\//,'')}`,status:'accepted',built:JSON.parse(readFileSync(`.vercel/${label.includes('-node-') ? 'node' : 'native'}-build.json`)),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()};
row.artifacts = {};
for (const source of ['packages/next-scriptc/src/functions/client.mjs','packages/next-scriptc/src/functions/sidecar.mjs','packages/next-scriptc/src/functions/serve.ts','packages/next-scriptc/src/functions/json.ts','packages/next-scriptc/src/functions/build.mjs','.vercel/output/functions/reports.func/scriptc-functions','.vercel/output/functions/reports.func/scriptc-sidecar.cjs']) {
  if (existsSync(source)) { const bytes = readFileSync(source); row.artifacts[source] = {bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}; }
}
const save = () => writeFileSync(file, JSON.stringify(row)+'\n'); save();
const info = run('inspect',row.url,'--json');
assert.equal(info.readyState,'READY'); assert.notEqual(info.target,'production');
const functions = new Map();
for (const b of info.builds ?? []) for (const o of b.output ?? []) if(o.lambda) functions.set(o.lambda.functionName,{runtime:o.lambda.runtime,bytes:o.size,regions:o.lambda.deployedTo});
row.functions = [...functions.values()]; assert(row.functions.length <= 12);
row.status='ready'; save();
const secret = parseEnv(readFileSync('.env.local','utf8')).VERCEL_AUTOMATION_BYPASS_SECRET; assert(secret);
const client = JSON.parse(readFileSync('research/vercel-near-client/client-deployment.json'));
row.client = client.url;
const target = {id:`report-${label}`,url:`${row.url}/reports?size=5000`,kind:'report',size:5000,expected:'58e99230368693d8899627a9c334b197a66005e8504ac2874e55fb6596ef720c'};
for(const [phase,count] of [['first',1],['warm',10]]) {
  const response = await fetch(`${client.url}/bench`,{method:'POST',headers:{'content-type':'application/json','x-vercel-protection-bypass':secret,'x-bench-target-bypass':secret},body:JSON.stringify({targets:[target],warmups:0,count,concurrency:1}),signal:AbortSignal.timeout(55000)});
  assert.equal(response.status,200);
  row[phase] = await response.json(); if(row[phase].status !== 'complete') row.status='failed'; save(); assert.equal(row[phase].status,'complete'); assert.equal(row[phase].region,'iad1');
}
row.status='complete'; save();
console.log(JSON.stringify({label,id:row.id,url:row.url,functions:row.functions,first:row.first.samples}));

if (label.includes('trace-')) {
  // Ingestion can lag the responses. Retry only the log read, never the target.
  for (let attempt = 0; attempt < 6; attempt++) {
    const logs = execFileSync('vercel', ['logs','--deployment',row.id,'--json','--limit','1000','--since','30m'],{encoding:'utf8',stdio:['ignore','pipe','inherit']});
    writeFileSync(`${directory}/${label}-logs.jsonl`,logs);
    const messages = logs.split('\n').filter(Boolean).map(line=>JSON.parse(line).data?.message ?? '').join('\n');
    if ((messages.match(/"side":"revenue"/g) ?? []).length >= 11) break;
    if (attempt < 5) await new Promise(resolve=>setTimeout(resolve,5000));
  }
}
