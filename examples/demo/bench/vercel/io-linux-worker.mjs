import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const messages = [], socketPath = '/tmp/io-native.sock';
const ipc = createServer((socket) => {
  let pending = '';
  socket.on('data', (chunk) => { pending += chunk; let end;
    while ((end = pending.indexOf('\0')) >= 0) { messages.push(JSON.parse(pending.slice(0,end))); pending = pending.slice(end+1); }
  });
});
await new Promise((resolve)=>ipc.listen(socketPath,resolve));
const child=spawn('/work/executable',[],{env:{...process.env,VERCEL_IPC_PATH:socketPath},stdio:['ignore','pipe','pipe']});
let stderr='';child.stderr.on('data',(c)=>{stderr+=c;});
let requests=0;
try {
  for(let i=0;i<200&&!messages.some((m)=>m.type==='server-started');i++) await new Promise((r)=>setTimeout(r,50));
  const handshake=messages.find((m)=>m.type==='server-started');assert(handshake,'missing IPC handshake');
  const origin=`http://127.0.0.1:${handshake.payload.httpPort}`;
  const results=[];
  for(const route of ['/api/app/diagnostics/redis','/api/app/diagnostics/process']) {
    requests++;const res=await fetch(origin+route);assert.equal(res.status,200);const body=await res.json();results.push({route,status:res.status,body});
    if(route.endsWith('redis')) assert.equal(body.rows,50);
    else {const status=readFileSync(`/proc/${body.pid}/status`,'utf8');const rss=Number(status.match(/^VmRSS:\s+(\d+)/m)[1])*1024;
      assert(body.cpu.user>=0&&body.cpu.system>=0);assert(Math.abs(body.rss-rss)<2*1048576);assert.equal(body.procRss,rss);}
  }
  console.log(JSON.stringify({status:'complete',requests,messages,results,stderr}));
} catch(error) {console.log(JSON.stringify({status:'failed',requests,error:error.message,stderr}));process.exitCode=1;}
finally {child.kill('SIGTERM');ipc.close();setTimeout(()=>process.exit(process.exitCode??0),500).unref();}
