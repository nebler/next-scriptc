#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--check')) throw new Error('Usage: node scripts/compress-artifacts.mjs [--check]');
const files = execFileSync('git', ['ls-files', '-z', '--', 'research/'], { cwd: root, encoding: 'utf8' })
  .split('\0').filter(Boolean).filter(file => /\.(json|jsonl|ndjson|txt|log)$/.test(file))
  .filter(file => {
    try { return statSync(new URL(file, new URL('../', import.meta.url))).size > 256 * 1024; }
    catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  });
if (args.includes('--check')) {
  if (files.length) console.error('Large uncompressed research artifacts:\n' + files.join('\n'));
  process.exitCode = files.length ? 1 : 0;
} else {
  for (const file of files) {
    const source = new URL(file, new URL('../', import.meta.url));
    const bytes = readFileSync(source);
    // Node zlib emits MTIME=0 and no filename header (RFC 1952).
    const compressed = gzipSync(bytes, { level: 9 });
    if (compressed.readUInt32LE(4) !== 0 || (compressed[3] & 8)) throw new Error('Non-deterministic gzip header');
    if (!gunzipSync(compressed).equals(bytes)) throw new Error(`Round-trip failed: ${file}`);
    writeFileSync(new URL(file + '.gz', new URL('../', import.meta.url)), compressed);
    execFileSync('git', ['rm', '-f', '--', file], { cwd: root });
    console.log(`${file}: ${bytes.length} → ${compressed.length}`);
  }
  console.log(`Compressed ${files.length} artifacts. Stage the .gz files explicitly.`);
}
