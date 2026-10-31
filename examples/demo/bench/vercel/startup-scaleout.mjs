// Separate bounded scale-out observation after cold-only measurements.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { Sandbox } from '@vercel/sandbox';
const deployments = ['native', 'node'].map((variant, i) => ({ variant, url: process.argv[i+2] }));
for (const d of deployments) { const url = new URL(d.url); assert.equal(url.protocol, 'https:'); assert(url.hostname.endsWith('.vercel.app')); }
const files = ['client.mjs'].map(x => `examples/demo/bench/vercel/${x}`).concat(['examples/demo/bench/config.mjs','examples/demo/bench/load.mjs','examples/demo/bench/fixtures.mjs']);
const worker = `import {createClient,workloads} from './examples/demo/bench/vercel/client.mjs';
import https from 'node:https'; import {readFile,writeFile} from 'node:fs/promises';
const rows=[]; const client=createClient(process.env.VERCEL_AUTOMATION_BYPASS_SECRET,1466);
try { for (const deployment of JSON.parse(await readFile('job.json'))) {
 const agent=new https.Agent({keepAlive:true}); let first;
 try {first=await client.request(deployment.url,workloads[0],agent);} finally {agent.destroy();}
 const startedAt=new Date().toISOString();
 const window=await client.window(deployment.url,workloads[0],16,32,{count:700,durationMs:3000},first.digest,true);
 rows.push({...deployment,startedAt,first,window});
} } finally {await writeFile('result.json',JSON.stringify({rows,requestsIssued:client.issued}));}`;
const data = { startedAt: new Date().toISOString(), status: 'running', deployments, protocol: 'hello only; C=16; 32 warmup; min(700 requests,3s) measured; existing deployments; no cold guarantee' };
let sandbox;
const started = Date.now();
try {
 sandbox=await Sandbox.create({image:'vercel/sandbox/node:24',region:'iad1',resources:{vcpus:2},timeout:90_000,persistent:false});
 data.sandbox={id:sandbox.name,region:sandbox.region,vcpus:sandbox.vcpus};
 await sandbox.writeFiles([...(await Promise.all(files.map(async path=>({path,content:await readFile(path)})))),{path:'worker.mjs',content:Buffer.from(worker)},{path:'job.json',content:Buffer.from(JSON.stringify(deployments))}]);
 const command=await sandbox.runCommand({cmd:'timeout',args:['60s','node','worker.mjs'],env:{VERCEL_AUTOMATION_BYPASS_SECRET:process.env.VERCEL_AUTOMATION_BYPASS_SECRET},stdout:process.stdout,stderr:process.stderr});
 const result=await sandbox.readFileToBuffer({path:'result.json'});
 if(result) Object.assign(data,JSON.parse(result.toString()));
 assert.equal(command.exitCode,0);
 assert(data.rows.every(row=>row.window.status==='complete'));
 data.status='complete';
} catch(error) {data.status='failed';data.error=error.stack;process.exitCode=1;}
finally {
 if(sandbox){const stopped=await sandbox.stop();data.sandbox.activeCpuDurationMs=stopped.activeCpuDurationMs??null;data.sandbox.provisionedVcpuHours=(Date.now()-started)*2/3_600_000;}
 await writeFile('research/benchmarks/vercel-round2-scaleout.json',JSON.stringify(data,null,2)+'\n');
 console.log(JSON.stringify({status:data.status,requestsIssued:data.requestsIssued,sandbox:data.sandbox}));
}
