import { Miniflare } from 'miniflare';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import os from 'node:os';
const token = randomBytes(32).toString('hex');
const mf = new Miniflare({ modules: true, script: await readFile(new URL('./worker.mjs', import.meta.url),'utf8'),
  compatibilityDate: '2026-07-30', cf: false, host: '127.0.0.1', port: 0,
  kvNamespaces: ['KV'], kvPersist: false, bindings: { PROXY_TOKEN: token } });
try {
  const url = await mf.ready;
  const output = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath,[new URL('./bench.mjs',import.meta.url).pathname],{
      env: {...process.env, PROXY_URL: String(url), PROXY_TOKEN: token}, stdio: ['ignore','pipe','inherit'] });
    let data = ''; child.stdout.on('data', chunk => data += chunk);
    child.on('error',reject); child.on('exit',code => code === 0 ? resolve(JSON.parse(data)) : reject(new Error(`benchmark exit ${code}`)));
  });
  const result = { at: new Date().toISOString(), node: process.version, platform: process.platform, arch: process.arch,
    cpu: os.cpus()[0].model, miniflare: '4.20260730.0', warmups: 30, concurrency: 1, ...output };
  await writeFile(new URL(process.env.OUTPUT || './results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
  for (const [name, value] of [['ping',result.ping],...Object.entries(result.payloads).flatMap(([size,ops]) => Object.entries(ops).map(([op,v]) => [`${op} ${size}B`,v]))])
    console.log(name,JSON.stringify({p50Ms:value.p50Ms,p95Ms:value.p95Ms,meanMs:value.meanMs,n:value.n}));
} finally { await mf.dispose(); }
