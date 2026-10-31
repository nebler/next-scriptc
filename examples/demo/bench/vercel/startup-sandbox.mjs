// Run once after startup-build.mjs group and isolated; no hosted invocations.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Sandbox } from '@vercel/sandbox';
async function check() {
  const { spawn, execFileSync } = await import('node:child_process');
  const { createServer } = await import('node:net');
  const { writeFile } = await import('node:fs/promises');
  const observations = [];
  for (const variant of ['original', 'fixed', 'group', 'isolated']) {
    for (const viaProxy of [false, true]) {
      for (let repeat = 0; repeat < 3; repeat++) {
        let cacheAdvice;
        try {
          cacheAdvice = execFileSync('./cold-file', [variant+'/user-server'], { encoding: 'utf8' }).trim();
          if (viaProxy) cacheAdvice += '; executable: ' + execFileSync('./cold-file', [variant+'/executable'], { encoding: 'utf8' }).trim();
        } catch { cacheAdvice = 'unavailable; filesystem cache uncontrolled'; }
        const start = performance.now(), wall = Date.now();
        const messages = [], sockets = [];
        const socketPath = `/tmp/startup-${variant}-${repeat}.sock`;
        let signalReady;
        const ready = new Promise(resolve => { signalReady = resolve; });
        const ipc = createServer(socket => {
          sockets.push(socket);
          let pending = '';
          socket.on('data', chunk => {
            pending += chunk;
            let end;
            while ((end = pending.indexOf('\0')) >= 0) {
              const message = JSON.parse(pending.slice(0, end)); pending = pending.slice(end+1);
              messages.push({ atMs: performance.now()-start, ...message });
              if (message.type === 'server-started') signalReady(3000);
            }
          });
        });
        if (viaProxy) await new Promise(resolve => ipc.listen(socketPath, resolve));
        const child = spawn(viaProxy ? './executable' : './user-server', [], { cwd: variant, detached: true, env: { ...process.env, PORT: '0', VERCEL_IPC_PATH: socketPath } });
        let stdout = '', stderr = '';
        child.stdout.on('data', chunk => {
          stdout += chunk;
          const match = stdout.match(/listening on 127\.0\.0\.1:(\d+)/);
          if (!viaProxy && match) signalReady(Number(match[1]));
        });
        child.stderr.on('data', chunk => { stderr += chunk; });
        const exited = new Promise(resolve => child.once('close', resolve));
        const timer = setTimeout(() => signalReady(null), 10_000);
        try {
          const port = await ready;
          assert(port, `Readiness timeout ${stderr}`);
          const readyMs = performance.now()-start;
          const readinessErrors = [];
          let response;
          for (let attempt = 0; attempt < 30; attempt++) {
            try { response = await fetch(`http://127.0.0.1:${port}/api/hello`); break; }
            catch (error) { readinessErrors.push({ atMs: performance.now()-start, code: error.cause?.code, error: error.message }); await new Promise(r => setTimeout(r, 5)); }
          }
          assert(response, 'Proxy never accepted requests after IPC');
          const body = await response.text();
          assert.equal(response.status, 200);
          assert.equal(body, '{"message":"Hello from next-scriptc!"}');
          observations.push({ variant, viaProxy, repeat, cacheAdvice, startedAt: wall, readinessErrors, readyMs, responseMs: performance.now()-start, messages, stdout, stderr });
        } finally {
          clearTimeout(timer);
          process.kill(-child.pid, 'SIGTERM');
          await exited;
          for (const socket of sockets) socket.destroy();
          if (viaProxy) await new Promise(resolve => ipc.close(resolve));
        }
      }
    }
  }
  await writeFile('result.json', JSON.stringify({ observations }, null, 2));
}
const started = Date.now();
let sandbox;
const result = { status: 'running', startedAt: new Date().toISOString(), artifacts: {} };
try {
  const files = [];
  for (const variant of ['original', 'fixed', 'group', 'isolated']) {
    for (const name of ['user-server', 'executable']) {
      const source = ['original', 'fixed'].includes(variant) ? `.vercel/round2/${variant === 'original' ? 'base' : 'fixed'}-output/functions/api/hello.func/${name}` : `.vercel/round2/${variant}/${name}`;
      const content = await readFile(source);
      result.artifacts[`${variant}/${name}`] = { bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') };
      files.push({ path: `${variant}/${name}`, content, mode: 0o755 });
    }
  }
  sandbox = await Sandbox.create({ image: 'vercel/sandbox/node:24', region: 'iad1', resources: { vcpus: 1 }, timeout: 120_000, persistent: false });
  result.sandbox = { id: sandbox.name, region: sandbox.region, vcpus: sandbox.vcpus };
  await sandbox.writeFiles([...files, { path: 'cold-file', content: await readFile('.vercel/round2/cold-file'), mode: 0o755 }, { path: 'check.mjs', content: Buffer.from(`import assert from 'node:assert/strict'; await (${check.toString()})();`) }]);
  const command = await sandbox.runCommand({ cmd: 'timeout', args: ['90s', 'node', 'check.mjs'], stdout: process.stdout, stderr: process.stderr });
  assert.equal(command.exitCode, 0);
  Object.assign(result, JSON.parse((await sandbox.readFileToBuffer({ path: 'result.json' })).toString()), { status: 'complete' });
} catch (error) { result.status = 'failed'; result.error = error.stack; process.exitCode = 1; }
finally {
  if (sandbox) {
    const stopped = await sandbox.stop();
    result.sandbox.activeCpuDurationMs = stopped.activeCpuDurationMs ?? null;
    result.sandbox.provisionedVcpuHours = (Date.now()-started)/3_600_000;
  }
  await writeFile('research/benchmarks/vercel-round2-startup-sandbox.json', JSON.stringify(result, null, 2)+'\n');
  console.log(JSON.stringify({ status: result.status, sandbox: result.sandbox, error: result.error }));
}
