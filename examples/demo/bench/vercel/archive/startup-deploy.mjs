// Research-only prebuilt deploy: refuses production, records the artifact hashes
// and untouched output topology. Build/prepare .vercel/output explicitly first.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { serverEnv } from '../../config.mjs';
const label = process.argv[2];
assert(/^[a-z0-9-]+$/.test(label ?? ''), 'Supply a unique research label');
const project = JSON.parse(await readFile('.vercel/project.json'));
assert.equal(project.projectName, 'next-scriptc');
const run = (...args) => JSON.parse(execFileSync('vercel', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }));
assert(run('api', `/v6/deployments?projectId=${project.projectId}&limit=1`).deployments?.length);
// A saved .func tree still references live .next files. Refuse drift in
// SHA-256-tracked metadata before creating another preview. Compiler-provided
// 128-bit fingerprints are retained by Next and are not interpreted as MD5.
async function verifyTraces(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`;
    if (!entry.isDirectory()) continue;
    if (!entry.name.endsWith('.func')) { await verifyTraces(file); continue; }
    const config = JSON.parse(await readFile(`${file}/.vc-config.json`));
    for (const [target, source] of Object.entries(config.filePathMap ?? {})) {
      const fingerprint = config.fileHashes?.[target];
      if (source !== target || !source.startsWith('examples/demo/.next/') || !/^[a-f0-9]{64}$/.test(fingerprint ?? '')) continue;
      const required = JSON.parse(await readFile('examples/demo/.next/required-server-files.json'));
      const actual = createHash('sha256').update(required.config.outputHashSalt ?? '').update('file:').update(await readFile(source)).digest('hex');
      assert.equal(actual, fingerprint, `Stale traced input ${source}; rebuild this variant before deploying`);
    }
  }
}
await verifyTraces(label === 'check-traces' ? (process.argv[3] ?? '.vercel/output/functions') : '.vercel/output/functions');
if (label === 'check-traces') { console.log('Traced SHA-256 metadata matches the current build'); process.exit(0); }
const args = ['deploy', '--prebuilt', '--regions', 'iad1', '--environment', 'preview', '--force', '--json'];
for (const [key, value] of Object.entries(serverEnv)) args.push('--env', `${key}=${value}`);
const result = run(...args);
const deployment = result.deployment ?? result;
const url = new URL(`https://${deployment.url.replace(/^https:\/\//, '')}`).origin;
// Save accepted deployment before inspecting so failures cannot orphan it.
await writeFile(`.vercel/round2/${label}-accepted.json`, JSON.stringify({ label, url, deployment }, null, 2));
const info = run('inspect', url, '--json');
assert.notEqual(info.target, 'production');
assert.equal(info.readyState, 'READY');
const artifacts = {};
for (const name of ['user-server', 'executable']) {
  try {
    const buffer = await readFile(`.vercel/output/functions/api/hello.func/${name}`);
    artifacts[name] = { bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex') };
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
await writeFile(`research/benchmarks/vercel-round2-${label}-deployment.json`, JSON.stringify({ label, url, artifacts, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), deployed: info }, null, 2) + '\n');
console.log(JSON.stringify({ label, url, id: info.id, artifacts }));
