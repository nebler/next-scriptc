// Sequential prebuilt programs; OS peak RSS via time (Mac) / wait4 (Linux).
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../../..');
const node = process.env.BLURHASH_NODE || process.execPath;
const prefix = process.env.BLURHASH_BIN_PREFIX || '/tmp/scout-blurhash';
const sizes = (process.env.BLURHASH_SIZES || '512,1024,2048').split(',').map(Number);
const iterations = Number(process.env.BLURHASH_ITERATIONS || '30');
const warmup = Number(process.env.BLURHASH_WARMUP || '5');
const variants = [
 ['node', node, [path.join(import.meta.dirname, 'blurhash.ts')]],
 ['release', prefix + '-release', []], ['speed', prefix + '-speed', []],
 ['go-library', prefix + '-go', ['library']], ['go-port', prefix + '-go', ['port']],
 ['go-components', prefix + '-go', ['components']],
];
const output = { platform:process.platform, arch:process.arch, cpus:os.cpus()[0]?.model, timestamp:new Date().toISOString(),
 sourceSha256:createHash('sha256').update(readFileSync(path.join(import.meta.dirname,'blurhash.ts'))).digest('hex'),
 versions: { node:spawnSync(node,['--version'],{encoding:'utf8'}).stdout.trim(), go:spawnSync(process.env.BLURHASH_GO || 'go',['version'],{encoding:'utf8'}).stdout?.trim() }, results:[] };
for (const size of sizes) {
 let expected;
 // Rotate starting order by size; each variant has its own process/fixture.
 const offset=sizes.indexOf(size)%variants.length;
 for (let i=0;i<variants.length;i++) {
  const [variant,command,args]=variants[(i+offset)%variants.length];
  const program=[command,...args,String(size),String(iterations),String(warmup)];
  const measure=process.platform==='darwin'?['/usr/bin/time','-l',...program]:[process.env.BLURHASH_RSS_HELPER || '/usr/bin/time',...(process.env.BLURHASH_RSS_HELPER?[]:['-v']),...program];
  const run=spawnSync(measure[0],measure.slice(1),{encoding:'utf8',cwd:root,timeout:600_000,maxBuffer:16*1024*1024});
  if (run.status!==0) throw new Error(`${variant} failed: ${run.error || run.stderr}`);
  const row=JSON.parse(run.stdout.trim());
  expected ??= row.hash;
  if(row.hash!==expected) throw new Error(`hash mismatch at ${size}: ${variant}: ${row.hash} != ${expected}`);
  const rss=process.platform==='darwin'?run.stderr.match(/(\d+)\s+maximum resident set size/):run.stderr.match(/Maximum resident set size \(kbytes\):\s+(\d+)/);
  if(!rss) throw new Error(`missing RSS: ${run.stderr}`);
  const samples=[...row.samples].sort((a,b)=>a-b);
  const entry={variant,...row,medianMs:samples[Math.ceil(samples.length*.5)-1],p95Ms:samples[Math.ceil(samples.length*.95)-1],peakRssMiB:Number(rss[1])/(process.platform==='darwin'?1048576:1024),command:[command,...args,String(size),String(iterations),String(warmup)],timeStderr:run.stderr};
  output.results.push(entry);
  console.error(`${size} ${variant}: ${entry.medianMs.toFixed(3)} / ${entry.p95Ms.toFixed(3)} ms, ${entry.peakRssMiB.toFixed(1)} MiB, ${row.hash}`);
  writeFileSync(process.argv[2] || '/tmp/scout-blurhash-results.json',JSON.stringify(output,null,2)+'\n');
 }
}
