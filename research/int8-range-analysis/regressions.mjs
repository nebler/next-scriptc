import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { revenueEventsJson } from '../../examples/demo/app/api/analytics/revenue/events.ts';
const dir = import.meta.dirname;
const root = path.resolve(dir, '../..');
const artifacts = process.env.INT8_ARTIFACTS || '/tmp/scriptc-int8';
const scratch = path.join(dir, '.artifacts'); mkdirSync(scratch, {recursive: true});
const input = path.join(scratch, 'dashboard.json');
writeFileSync(input, revenueEventsJson(200000));
const result = {timestamp: new Date().toISOString(), iterations: 30, warmup: 10, runs: []};
const median = xs => {const ys = [...xs].sort((a,b)=>a-b); return (ys[(ys.length-1)>>1]+ys[ys.length>>1])/2;};
for (let round = 0; round < 2; round++) for (const kernel of ['dashboard', 'resize-box', 'resize-bilinear', 'blurhash']) {
  const name = kernel.startsWith('resize') ? 'resize' : kernel;
  const order = round ? ['patched', 'main', 'node'] : ['node', 'main', 'patched'];
  let expected;
  for (const runtime of order) {
    const source = {dashboard: 'dashboard.ts', resize: 'bench.ts', blurhash: 'blurhash.ts'}[name];
    const command = runtime === 'node' ? process.execPath : path.join(artifacts, `${name}-${runtime}`);
    const args = runtime === 'node' ? [path.join(root, `examples/scout/${name}/${source}`)] : [];
    if (name === 'blurhash') args.push('2048', '30', '10');
    const output = path.join(scratch, 'dashboard-output.json');
    const env = {...process.env, INPUT: input, OUTPUT: name === 'dashboard' ? output : '',
      ITERATIONS: '30', WARMUP: '10', WIDTH: '4096', SIZE: '512', KIND: kernel.endsWith('bilinear') ? 'bilinear' : 'box'};
    const data = JSON.parse(execFileSync(command, args, {env, encoding: 'utf8', timeout: 120000}));
    const digest = name === 'dashboard' ? createHash('sha256').update(readFileSync(output)).digest('hex') : (data.sha256 || data.hash);
    expected ??= digest;
    if (digest !== expected) throw new Error(`parity ${kernel}/${runtime}`);
    const samples = data.samples || data.samplesMs;
    const row = {kernel, runtime, round, digest, medianMs: median(samples), ...data};
    result.runs.push(row);
    writeFileSync(path.join(dir, 'regressions.json'), JSON.stringify(result, null, 2)+'\n');
    console.log(`${round} ${kernel} ${runtime}: ${row.medianMs.toFixed(3)} ms`);
  }
}
