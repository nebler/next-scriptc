// Node 24 --env-file=<existing OIDC file>; credentials stay on the caller.
// One disposable 2-vCPU VM, hard 12-minute lease: <= 0.4 vCPU-hours total.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../..');
const require = createRequire(path.join(process.env.INT8_SDK_ROOT || root, 'package.json'));
const { Sandbox } = await import(require.resolve('@vercel/sandbox'));
const artifacts = process.env.INT8_ARTIFACTS || '/tmp/scriptc-int8';
const dest = import.meta.dirname;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const files = [
  ...['main', 'patched'].map(name => ({path: `vectors-${name}`, content: readFileSync(path.join(artifacts, `vectors-linux-${name}`)), mode: 0o755})),
  {path: 'vectors-go', content: readFileSync(path.join(artifacts, 'vectors-go-linux')), mode: 0o755},
  {path: 'rss', content: readFileSync(path.join(artifacts, 'rss-linux')), mode: 0o755},
  {path: 'vectors.ts', content: readFileSync(path.join(root, 'examples/scout/vectors/vectors.ts'))},
  {path: 'source.tar.gz', content: readFileSync(path.join(artifacts, 'source.tar.gz'))},
];
const retry = process.env.INT8_LINUX_RETRY === '1';
const prior = retry ? JSON.parse(readFileSync(path.join(dest, 'linux-provenance.json'))) : null;
if (prior && !prior.stopped) throw new Error('Previous sandbox must be stopped before retry');
const leaseMs = retry ? 600000 : 720000;
const previousVcpuMs = prior ? prior.vcpus * prior.elapsedMs : 0;
if (previousVcpuMs + 2 * leaseMs > 1800000) throw new Error('Combined 0.5 vCPU-hour budget');
const prefix = retry ? 'linux-retry' : 'linux';
const begin = Date.now();
const sandbox = await Sandbox.create({image: 'vercel/sandbox/universal', resources: {vcpus: 2}, timeout: leaseMs, persistent: false});
const provenance = {sandbox: sandbox.name, vcpus: 2, timeoutMs: leaseMs, maxVcpuHours: 2 * leaseMs / 3600000, previousVcpuMs, files: Object.fromEntries(files.map(f => [f.path, sha(f.content)])), steps: []};
const deadline = AbortSignal.timeout(leaseMs - 30000);
async function step(label, script, timeoutMs = 180000) {
  const r = await sandbox.runCommand({cmd: 'bash', cwd: sandbox.cwd, args: ['-lc', `set -euo pipefail\n${script}`], stdout: process.stdout, stderr: process.stderr, signal: AbortSignal.any([deadline, AbortSignal.timeout(timeoutMs)])});
  provenance.steps.push({label, exitCode: r.exitCode});
  if (r.exitCode !== 0) throw new Error(`${label}: exit ${r.exitCode}`);
}
try {
  console.log(`Sandbox ${sandbox.name}; 2 vCPUs / ${leaseMs / 1000} s hard lease`);
  await sandbox.writeFiles(files, {signal: deadline});
  if (!retry) {
  await step('measure', `
    node --version > versions.txt
    uname -a >> versions.txt
    lscpu >> versions.txt
    : > results.ndjson
    for kind in int8-i32 int8-imul int8 float binary; do
      for runtime in node main patched go; do
        if [ "$runtime" = node ]; then
          ./rss node vectors.ts "$kind" 100000 768 30 10 >> results.ndjson
        else
          ./rss ./vectors-$runtime "$kind" 100000 768 30 10 >> results.ndjson
        fi
      done
    done`);
  const runs = (await sandbox.readFileToBuffer({path: 'results.ndjson'})).toString().trim().split('\n').map((line, i) => ({...JSON.parse(line), runtime: ['node', 'main', 'patched', 'go'][i % 4]}));
  for (const kind of ['int8-i32', 'int8-imul', 'int8', 'float', 'binary']) {
    const group = runs.filter(r => r.kind === kind);
    for (const r of group) if (JSON.stringify(r.ids) !== JSON.stringify(group[0].ids) || JSON.stringify(r.scores) !== JSON.stringify(group[0].scores)) throw new Error(`parity ${kind}`);
  }
  writeFileSync(path.join(dest, 'linux-results.json'), JSON.stringify({versions: (await sandbox.readFileToBuffer({path: 'versions.txt'})).toString(), runs}, null, 2)+'\n');
  }
  await step('prepare focused source tests', `
    mkdir source
    tar -xzf source.tar.gz -C source
    cd source
    npx -y pnpm@11.1.3 install --frozen-lockfile --reporter=silent > install.log 2>&1
    mkdir /tmp/packs
    npm pack --silent @scriptc/llvm-linux-x64-gnu@0.4.7 @scriptc/runtime-linux-x64-gnu@0.4.7 --pack-destination /tmp/packs > packs.log
    tar -xzf /tmp/packs/scriptc-llvm-linux-x64-gnu-0.4.7.tgz --strip-components=1 -C packages/llvm-linux-x64-gnu
    tar -xzf /tmp/packs/scriptc-runtime-linux-x64-gnu-0.4.7.tgz --strip-components=1 -C packages/runtime-linux-x64-gnu
    clang --version > compiler-version.txt || true`, 180000);
  await step('clang for sanitizer', `
    if ! command -v clang >/dev/null; then
      . /etc/os-release
      curl -fsSL https://apt.llvm.org/llvm-snapshot.gpg.key -o /tmp/llvm-key
      gpg --dearmor --yes -o /tmp/llvm-key.gpg /tmp/llvm-key
      sudo install -D -m 0644 /tmp/llvm-key.gpg /etc/apt/keyrings/llvm-snapshot.gpg
      echo "deb [signed-by=/etc/apt/keyrings/llvm-snapshot.gpg] https://apt.llvm.org/$VERSION_CODENAME/ llvm-toolchain-$VERSION_CODENAME-22 main" | sudo tee /etc/apt/sources.list.d/llvm22.list >/dev/null
      sudo apt-get update -qq
      sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends clang-22 libclang-rt-22-dev lld-22
      sudo ln -sf /usr/bin/clang-22 /usr/local/bin/clang
    fi
    clang --version > source/compiler-version.txt`, 180000);
  await step('plain numeric parity and range tests', `
    cd source
    SCRIPTC_TEST_WORKERS=1 node_modules/.bin/vitest run packages/compiler/src/backend/llvm/wrapping-sums.test.ts packages/compiler/src/ir/integer-ranges.test.ts packages/compiler/src/backend/llvm/integer-views.test.ts > unit.log 2>&1
    SCRIPTC_TEST_WORKERS=1 node_modules/.bin/vitest run tests/harness/differential.test.ts tests/harness/llvm-differential.test.ts -t 'signed-products-wrapping-sums|int32-wrapping-sums|typed-array-integer-products|wrapping-products-near-2-53|typed-array-integer-widths|integer-view-numbers|integer-flow-arithmetic' > parity.log 2>&1`, 180000);
  await step('sanitizer new corpus', `
    cd source
    SCRIPTC_TEST_WORKERS=1 SCRIPTC_SAN=1 node_modules/.bin/vitest run tests/harness/differential.test.ts tests/harness/llvm-differential.test.ts -t 'signed-products-wrapping-sums' > sanitizer.log 2>&1`, 180000);
  provenance.status = 'focused checks complete; full suite not run';
} catch (error) {
  provenance.status = 'failed'; provenance.error = String(error); process.exitCode = 1; console.error(error);
} finally {
  for (const name of ['unit.log','parity.log','sanitizer.log','install.log','compiler-version.txt']) {
    try {const bytes = await sandbox.readFileToBuffer({path: `source/${name}`}); if (bytes) writeFileSync(path.join(dest, `${prefix}-${name}`), bytes);} catch (error) {provenance[`download-${name}`] = String(error);}
  }
  try {const stopped = await sandbox.stop({signal: AbortSignal.timeout(15000)}); provenance.stopped = true; provenance.activeCpuDurationMs = stopped.activeCpuDurationMs;} catch (error) {provenance.stopError = String(error); process.exitCode = 1;}
  provenance.elapsedMs = Date.now() - begin;
  provenance.allocatedVcpuHoursUpperBound = 2 * Math.min(provenance.elapsedMs, leaseMs)/3600000;
  provenance.combinedAllocatedVcpuHoursUpperBound = (previousVcpuMs + 2 * Math.min(provenance.elapsedMs, leaseMs))/3600000;
  writeFileSync(path.join(dest, `${prefix}-provenance.json`), JSON.stringify(provenance,null,2)+'\n');
  console.log(JSON.stringify(provenance));
}
