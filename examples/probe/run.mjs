import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { access, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

const root = dirname(fileURLToPath(import.meta.url));
const scriptc = resolve(root, '../../packages/next-scriptc/node_modules/.bin/scriptc');
const node = process.env.PROBE_NODE ?? process.execPath;
const version = spawnSync(node, ['--version'], { encoding: 'utf8' });
if (version.status !== 0 || !version.stdout.startsWith('v24.')) {
  throw new Error('Set PROBE_NODE to a Node 24 executable (the reference uses type stripping).');
}
const runTimeoutMs = Number(process.env.PROBE_RUN_TIMEOUT_MS ?? 15_000);
if (!Number.isSafeInteger(runTimeoutMs) || runTimeoutMs < 1) throw new Error('PROBE_RUN_TIMEOUT_MS must be a positive integer.');
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7).split(',');
const selected = only ?? (await readdir(join(root, 'routes'), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
for (const name of selected) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Invalid probe name: ${name}`);
  await access(join(root, 'entries', `${name}.ts`));
}
const abort = new AbortController();
process.once('SIGINT', () => abort.abort());
process.once('SIGTERM', () => abort.abort());

// Owned by this process; all fetch requests stay on loopback. No child server.
const server = createServer((request, response) => {
  const valid = request.url === '/inventory/LAMP' && request.headers['x-api-key'] === 'probe-local-only';
  response.writeHead(valid ? 200 : 404, { 'content-type': 'application/json' });
  response.end(JSON.stringify(valid ? { available: 17, warehouse: 'berlin' } : { error: 'Not found' }));
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
// The full demo-handler probe also pins JWT issuance and verification; no body fields are excluded.
const env = { ...process.env, TZ: 'UTC', LC_ALL: 'C', SCRIPTC_CHECKER_SERVER: '0', SCRIPTC_CACHE_DIR: join(root, '.artifacts', 'cache'), PROBE_UPSTREAM: `http://127.0.0.1:${server.address().port}`, DEMO_JWT_NOW: '1793318400', DEMO_JWT_SECRET: 'next-scriptc-probe-only-signing-secret-32-bytes' };

async function run(command, args, dir, label, timeoutMs) {
  if (abort.signal.aborted) throw new Error('Interrupted');
  const child = spawn(command, args, { cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const stdout = [];
  const stderr = [];
  child.stdout.on('data', (chunk) => stdout.push(chunk));
  child.stderr.on('data', (chunk) => stderr.push(chunk));
  let timedOut = false;
  function kill() {
    try { process.kill(-child.pid, 'SIGKILL'); } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
  abort.signal.addEventListener('abort', kill, { once: true });
  let spawnError;
  child.on('error', (error) => { spawnError = error.message; });
  const [code, signal] = await new Promise((resolveClose) => child.once('close', (...result) => resolveClose(result)));
  clearTimeout(timer);
  abort.signal.removeEventListener('abort', kill);
  const stdoutBytes = Buffer.concat(stdout);
  const stderrBytes = Buffer.concat(stderr);
  const result = {
    command: [command, ...args], code, signal, timedOut,
    stdout: stdoutBytes.toString(), stderr: stderrBytes.toString(),
    ...(spawnError ? { spawnError } : {}),
  };
  await Promise.all([
    writeFile(join(dir, `${label}.stdout`), stdoutBytes),
    writeFile(join(dir, `${label}.stderr`), stderrBytes),
    writeFile(join(dir, `${label}.json`), JSON.stringify(result, null, 2) + '\n'),
  ]);
  return { ...result, stdoutBytes, stderrBytes };
}

function firstDiagnostic(result) {
  if (result.timedOut) return 'TIMEOUT';
  const lines = (result.stderr + '\n' + result.stdout).split('\n').map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => /(?:error|fatal|SC\d{4}|unsupported|Unsupported|Cannot|refus)/.test(line)) ?? lines[0] ?? '';
}

const rows = [];
try {
  console.log(`Node ${version.stdout.trim()}; scriptc ${spawnSync(scriptc, ['--version'], { encoding: 'utf8' }).stdout.trim()}`);
  console.log('route | compiles? | output matches Node? | refusal / runtime diagnostic (first line)');
  for (const name of selected) {
    if (abort.signal.aborted) throw new Error('Interrupted');
    const dir = join(root, '.artifacts', name);
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    const entry = join(root, 'entries', `${name}.ts`);
    const binary = join(dir, 'route');
    console.log(`[${name}] coverage, then build (sequential)`);
    const coverage = await run(scriptc, ['coverage', entry, '--node-islands=off'], dir, 'coverage', 240_000);
    const build = await run(scriptc, ['build', entry, '-o', binary, '--no-keep-llvm', '--node-islands=off'], dir, 'build', 300_000);
    const reference = await run(node, ['--import', join(root, 'node-resolve.mjs'), entry], dir, 'node', runTimeoutMs);
    const compiles = build.code === 0 && !build.signal;
    const native = compiles ? await run(binary, [], dir, 'native', runTimeoutMs) : null;
    const matches = native && reference.code === native.code && reference.signal === native.signal &&
      reference.stdoutBytes.equals(native.stdoutBytes) && reference.stderrBytes.equals(native.stderrBytes) && !native.timedOut;
    let diff = '';
    if (native && !matches) {
      diff = `exit: Node=${reference.code} (${reference.signal}) native=${native.code} (${native.signal})\n`;
      for (const stream of ['stdout', 'stderr']) {
        diff += spawnSync('diff', ['-u', join(dir, `node.${stream}`), join(dir, `native.${stream}`)], { encoding: 'utf8' }).stdout;
      }
    }
    await writeFile(join(dir, 'parity.diff'), diff);
    const diagnostic = !compiles ? firstDiagnostic(build) : native.code !== 0 ? firstDiagnostic(native) : '';
    const row = { route: name, compiles, matches: native ? !!matches : null, nodeCode: reference.code,
      nativeCode: native?.code ?? null, coverageCode: coverage.code, diagnostic };
    rows.push(row);
    console.log(`${name} | ${compiles ? 'yes' : 'NO'} | ${native ? matches ? 'yes' : 'NO' : '—'} | ${diagnostic}`);
  }
  await writeFile(join(root, '.artifacts', only ? `summary-${selected.join('-')}.json` : 'summary.json'), JSON.stringify(rows, null, 2) + '\n');
} finally {
  server.closeAllConnections();
  await new Promise((resolveClose) => server.close(resolveClose));
}
// Expected refusals are data, not runner failures. Parity bugs and broken references fail the run.
process.exitCode = rows.some((row) => row.matches === false || row.nodeCode !== 0) ? 1 : 0;
