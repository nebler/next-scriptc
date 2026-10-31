// Fresh preview first requests through the existing E3 iad1 client. No retries.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { serverEnv } from '../examples/demo/bench/config.mjs';
const directory = process.env.STARTUP_OUTPUT ?? 'research/use-native-startup';
mkdirSync(directory, {recursive:true});
const label = process.argv[2];
assert(/^(before|after)-(native|node)-[123]$/.test(label ?? ''), 'Supply a unique before/after label');
const file = `${directory}/${label}.json`;
assert(!existsSync(file), 'Refusing duplicate deployment');
assert.equal(JSON.parse(readFileSync('.vercel/project.json')).projectName, 'next-scriptc');
const run = (...args) => JSON.parse(execFileSync('vercel', args, {encoding:'utf8',stdio:['ignore','pipe','inherit']}));
execFileSync(process.execPath, ['examples/demo/bench/vercel/archive/startup-deploy.mjs','check-traces'], {stdio:'inherit'});
const args = ['deploy','--prebuilt','--regions','iad1','--environment','preview','--force','--json'];
for (const [key,value] of Object.entries({...serverEnv,NATIVE_VERCEL_TIMING:'1',NEXT_SCRIPTC_STARTUP_TIMING:'1'})) args.push('--env',`${key}=${value}`);
const result = run(...args), d = result.deployment ?? result;
const row = {label,id:d.id,url:`https://${d.url.replace(/^https:\/\//,'')}`,status:'accepted',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()};
const save = () => writeFileSync(file, JSON.stringify(row,null,2)+'\n'); save();
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
for(const [phase,count] of [['first',1],['warm',3]]) {
  const response = await fetch(`${client.url}/bench`,{method:'POST',headers:{'content-type':'application/json','x-vercel-protection-bypass':secret,'x-bench-target-bypass':secret},body:JSON.stringify({targets:[target],warmups:0,count,concurrency:1}),signal:AbortSignal.timeout(55000)});
  assert.equal(response.status,200);
  row[phase] = await response.json(); if(row[phase].status !== 'complete') row.status='failed'; save(); assert.equal(row[phase].status,'complete'); assert.equal(row[phase].region,'iad1');
}
row.status='complete'; save();
console.log(JSON.stringify({label,id:row.id,url:row.url,functions:row.functions,first:row.first.samples}));
