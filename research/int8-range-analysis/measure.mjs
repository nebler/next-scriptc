// Compare already-built executables sequentially. Node runs the unchanged TS.
import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
const dir = import.meta.dirname;
const source = path.resolve(dir, '../../examples/scout/vectors/vectors.ts');
const commands = {
  main: [process.env.INT8_MAIN_BINARY],
  patched: [process.env.INT8_PATCHED_BINARY],
  node: [process.env.VECTOR_NODE || process.execPath, source],
  go: [process.env.INT8_GO_BINARY],
};
for (const [name, command] of Object.entries(commands)) if (!command[0]) throw new Error(`Missing ${name} binary`);
const output = process.env.INT8_OUTPUT || path.join(dir, 'mac-results.json');
const rounds = Number(process.env.INT8_ROUNDS || 2);
const iterations = Number(process.env.INT8_ITERATIONS || 30);
const warmup = Number(process.env.INT8_WARMUP || 15);
const sizes = (process.env.INT8_SIZES || '20000:384,100000:768').split(',').map(s => s.split(':').map(Number));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const results = {
  timestamp: new Date().toISOString(), platform: process.platform, arch: process.arch,
  cpu: os.cpus()[0].model, loadBefore: os.loadavg(), iterations, warmup, rounds,
  sourceSha256: sha(readFileSync(source)),
  binaries: Object.fromEntries(['main', 'patched', 'go'].map(name => [name, {path: commands[name][0], sha256: sha(readFileSync(commands[name][0]))}])),
  node: execFileSync(commands.node[0], ['--version']).toString().trim(), runs: [],
};
for (let round = 0; round < rounds; round++) {
  const order = round % 2 ? ['go', 'patched', 'main', 'node'] : ['node', 'main', 'patched', 'go'];
  for (const [n, d] of sizes) for (const kind of ['int8-i32', 'int8-imul', 'int8', 'float', 'binary']) {
    for (const runtime of order) {
      const args = [...commands[runtime], kind, String(n), String(d), String(iterations), String(warmup)];
      const run = spawnSync(args[0], args.slice(1), {encoding: 'utf8', timeout: 120000, maxBuffer: 4*1024*1024});
      if (run.status !== 0) throw new Error(`${runtime}: ${run.error || run.stderr}`);
      const data = JSON.parse(run.stdout.trim());
      const prior = results.runs.find(r => r.kind === kind && r.n === n);
      if (prior && (JSON.stringify(prior.ids) !== JSON.stringify(data.ids) || JSON.stringify(prior.scores) !== JSON.stringify(data.scores))) throw new Error(`parity ${runtime}/${kind}/${n}`);
      results.runs.push({runtime, round, ...data});
      writeFileSync(output, JSON.stringify(results, null, 2)+'\n');
      console.log(`${round} ${runtime} ${kind} ${n}x${d}: ${data.medianMs.toFixed(3)} ms`);
    }
  }
}
results.loadAfter = os.loadavg();
writeFileSync(output, JSON.stringify(results, null, 2)+'\n');
