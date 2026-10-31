// Builds/runs sequentially; no competing benchmark processes. Raw samples retained.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
const dir = import.meta.dirname;
const root = path.resolve(dir, '../../..');
const artifacts = path.join(dir, '.artifacts');
mkdirSync(artifacts, { recursive: true });
const node = process.env.VECTOR_NODE || '/Users/noah/.local/share/fnm/node-versions/v24.22.0/installation/bin/node';
const go = process.env.VECTOR_GO || '/opt/homebrew/bin/go';
const compiler = path.join(root, 'packages/next-scriptc/node_modules/.bin/scriptc');
if (!process.argv.includes('--skip-build')) {
  for (const mode of ['release', 'speed']) execFileSync(compiler, ['build', path.join(dir, 'vectors.ts'), '--optimization', mode, '--keep-llvm', '-o', path.join(artifacts, `vectors-${mode}`)], { cwd: root, env: { ...process.env, SCRIPTC_CHECKER_SERVER: '0' }, stdio: 'inherit' });
  execFileSync(go, ['build', '-o', path.join(artifacts, 'vectors-go'), path.join(dir, 'vectors.go')], { cwd: root, stdio: 'inherit' });
}
const commands = {
  node: [node, path.join(dir, 'vectors.ts')],
  release: [path.join(artifacts, 'vectors-release')],
  speed: [path.join(artifacts, 'vectors-speed')],
  go: [path.join(artifacts, 'vectors-go')],
};
const result = { date: new Date().toISOString(), platform: os.platform(), arch: os.arch(), cpu: os.cpus()[0].model, loadBefore: os.loadavg(), sourceSha256: Object.fromEntries(['vectors.ts','vectors.go'].map(f => [f, createHash('sha256').update(readFileSync(path.join(dir,f))).digest('hex')])), versions: { node: execFileSync(node,['--version']).toString().trim(), go: execFileSync(go,['version']).toString().trim(), scriptc: execFileSync(compiler,['--version']).toString().trim() }, runs: [] };
const destination = process.env.VECTOR_OUTPUT || path.join(dir, 'mac-results.json');
for (let round = 0; round < 2; round++) {
  const order = round === 0 ? ['node','release','speed','go'] : ['go','speed','release','node'];
  for (const [n,d] of [[20000,384],[100000,768]]) for (const kind of ['float','int8','int8-i32','int8-imul','binary']) {
    for (const runtime of order) {
      const command = commands[runtime];
      const args = [...command, kind, String(n), String(d), '30', '15'];
      const run = spawnSync('/usr/bin/time', [os.platform() === 'darwin' ? '-l' : '-v', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 4*1024*1024 });
      if (run.status !== 0) throw new Error(`${args.join(' ')}: ${run.stderr}`);
      const data = JSON.parse(run.stdout.trim());
      const rss = os.platform() === 'darwin' ? Number(run.stderr.match(/(\d+)\s+maximum resident set size/)[1]) : Number(run.stderr.match(/Maximum resident set size \(kbytes\): (\d+)/)[1])*1024;
      const prior = result.runs.find(r => r.kind === kind && r.n === n);
      if (prior && (JSON.stringify(prior.ids) !== JSON.stringify(data.ids) || JSON.stringify(prior.scores) !== JSON.stringify(data.scores))) throw new Error(`cross-runtime parity ${runtime}/${kind}/${n}`);
      result.runs.push({ round, runtime, ...data, peakRssBytes: rss });
      console.log(`${round} ${runtime} ${kind} ${n}x${d}: ${data.medianMs.toFixed(3)} / ${data.p95Ms.toFixed(3)} ms, ${(rss/1048576).toFixed(1)} MiB`);
      writeFileSync(destination, JSON.stringify(result,null,2)+'\n');
    }
    if (kind === 'binary') {
      const run = spawnSync('/usr/bin/time', [os.platform() === 'darwin' ? '-l' : '-v', ...commands.go, 'binary-plain', String(n), String(d), '30','15'], { encoding:'utf8' });
      if (run.status !== 0) throw new Error(run.stderr);
      const data = JSON.parse(run.stdout.trim());
      const prior = result.runs.find(r=>r.kind==='binary' && r.n===n);
      if (JSON.stringify(prior.ids)!==JSON.stringify(data.ids) || JSON.stringify(prior.scores)!==JSON.stringify(data.scores)) throw new Error('plain popcount parity');
      const rss = os.platform()==='darwin' ? Number(run.stderr.match(/(\d+)\s+maximum resident set size/)[1]) : Number(run.stderr.match(/Maximum resident set size \(kbytes\): (\d+)/)[1])*1024;
      result.runs.push({round,runtime:'go-plain',...data,kind:'binary',peakRssBytes:rss});
      console.log(`${round} go-plain binary ${n}x${d}: ${data.medianMs.toFixed(3)} ms`);
    }
  }
}
result.loadAfter=os.loadavg();
writeFileSync(destination,JSON.stringify(result,null,2)+'\n');
