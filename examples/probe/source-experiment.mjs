// Probe-only import rewriting: demo routes and Node keep published packages.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parseCoverage } from '../demo/bench/coverage.mjs';

assert.match(process.version, /^v24\./, 'Use Node 24');
assert.ok(!process.env.NODE_OPTIONS?.trim(), 'Unset NODE_OPTIONS for the reference baseline');
const root = import.meta.dirname;
const compiler = path.resolve(root, '../../packages/next-scriptc/node_modules/.bin/scriptc');
const out = path.join(root, '.artifacts/source-experiment');
await mkdir(out, { recursive: true });
const env = { ...process.env, SCRIPTC_CHECKER_SERVER: '0', SCRIPTC_CACHE_DIR: path.join(root, '.artifacts/cache') };
const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => controller.abort(new Error(signal)));
async function run(command, args, timeout = 300_000) {
  controller.signal.throwIfAborted();
  const child = spawn(command, args, { cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', failure;
  function kill() {
    try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  const timer = setTimeout(() => { failure = `Exceeded ${timeout} ms`; kill(); }, timeout);
  controller.signal.addEventListener('abort', kill, { once: true });
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.once('error', (error) => { failure = error.message; });
  try {
    const [code, signal] = await new Promise((resolve) => child.once('close', (...result) => resolve(result)));
    return { command: [command, ...args], code, signal, error: failure, stdout, stderr };
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', kill);
    if (child.pid) kill(); // Include any surviving compiler helpers in the owned group.
  }
}
const libraries = [
  { name: 'marked', version: '18.1.2', tag: 'v18.1.2', url: 'https://github.com/markedjs/marked.git', source: 'src/marked.ts', routes: { markdown: 'posts/[slug]', feed: 'feed.xml' } },
  { name: 'minisearch', version: '7.2.0', tag: 'v7.2.0', url: 'https://github.com/lucaong/minisearch.git', source: 'src/MiniSearch.ts', routes: { search: 'search' } },
];
const results = { node: process.version, scriptc: (await run(compiler, ['--version'])).stdout.trim(), warmup: 200, iterations: 500, startedAt: new Date().toISOString(), libraries: [] };
for (const lib of libraries) {
  assert.equal(JSON.parse(await readFile(path.join(root, 'node_modules', lib.name, 'package.json'), 'utf8')).version, lib.version);
  const checkout = path.join(root, '.sources', lib.name);
  const sha = await run('git', ['-C', checkout, 'rev-parse', 'HEAD']);
  assert.equal(sha.code, 0, `First git clone --depth 1 --branch ${lib.tag} ${lib.url} ${checkout}`);
  assert.equal((await run('git', ['-C', checkout, 'status', '--porcelain'])).stdout, '', 'Upstream source must be unmodified');
  assert.equal((await run('git', ['-C', checkout, 'rev-parse', `${lib.tag}^{commit}`])).stdout, sha.stdout);
  const result = { ...lib, sha: sha.stdout.trim(), variants: {} };
  results.libraries.push(result);
  for (const variant of ['published', 'typescript']) {
    const dir = path.join(out, `${lib.name}-${variant}`);
    await mkdir(dir, { recursive: true });
    for (const [name, route] of Object.entries(lib.routes)) {
      const original = path.resolve(root, '../demo/app/api', route, 'route.native.ts');
      let text = (await readFile(original, 'utf8')).replace(/from "(\.[^"]+)"/g, (_, spec) => `from ${JSON.stringify(path.resolve(path.dirname(original), spec))}`);
      if (variant === 'typescript') text = text.replace(`from "${lib.name}"`, `from ${JSON.stringify(path.join(checkout, lib.source))}`);
      await writeFile(path.join(dir, `${name}.ts`), text);
    }
    const imports = Object.keys(lib.routes).map((name) => `import { GET as ${name} } from "./${name}.ts";`).join('\n');
    const calls = lib.name === 'marked' ? [
      ['markdown', 'markdown(new Request("http://demo.test/api/posts/reliable-webhooks"), { params: Promise.resolve({ slug: "reliable-webhooks" }) })'],
      ['feed', 'feed(new Request("http://demo.test/api/feed.xml"))'],
    ] : [['search', 'search(new Request("http://demo.test/api/search?q=desk%20lamp&limit=7"))']];
    // Print the full untimed response once for byte parity. Timing includes handler
    // invocation and draining its Response, excludes startup/index initialization.
    const source = imports + '\n' + calls.map(([name, call]) => `{
  const first = await ${call};
  const body = await first.text();
  for (let i = 0; i < ${results.warmup}; i++) await (await ${call}).text();
  const start = performance.now();
  for (let i = 0; i < ${results.iterations}; i++) await (await ${call}).text();
  const elapsedMs = performance.now() - start;
  console.log(JSON.stringify({ workload: "${name}", status: first.status, body, elapsedMs, msPerCall: elapsedMs / ${results.iterations} }));
}`).join('\n');
    const entry = path.join(dir, 'entry.ts');
    await writeFile(entry, source);
    const coverage = await run(compiler, ['coverage', entry, '--node-islands=off']);
    const build = await run(compiler, ['build', entry, '-o', path.join(dir, 'native'), '--no-keep-llvm', '--node-islands=off']);
    const node = variant === 'published' ? await run(process.execPath, [entry], 180_000) : null;
    const native = build.code === 0 ? await run(path.join(dir, 'native'), [], 180_000) : null;
    const rows = (execution) => execution?.code === 0 ? execution.stdout.trim().split('\n').map((line) => JSON.parse(line)) : null;
    const baseline = variant === 'published' ? rows(node) : result.variants.published.nodeRows;
    const nativeRows = rows(native);
    if (baseline) assert.ok(baseline.every((row) => row.status === 200), 'Node must exercise successful demo requests');
    const parity = nativeRows && baseline ? JSON.stringify(nativeRows.map(({ elapsedMs, msPerCall, ...response }) => response)) === JSON.stringify(baseline.map(({ elapsedMs, msPerCall, ...response }) => response)) : null;
    result.variants[variant] = { coverage, counts: coverage.code === 0 ? parseCoverage(coverage.stdout) : null, build, node, native, nodeRows: rows(node), nativeRows, parity };
    await writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 2) + '\n');
    console.log(`${lib.name}/${variant}: coverage ${coverage.code}, build ${build.code}, parity ${parity}`);
    if (nativeRows) console.log(nativeRows.map((r) => `${r.workload}: ${r.msPerCall.toFixed(3)} ms/call`).join('\n'));
  }
}
results.finishedAt = new Date().toISOString();
await writeFile(path.join(out, 'results.json'), JSON.stringify(results, null, 2) + '\n');
process.exitCode = results.libraries.some((lib) => Object.values(lib.variants).some((v) => v.parity === false || (v.node && v.node.code !== 0) || (v.build.code === 0 && v.native?.code !== 0))) ? 1 : 0;
