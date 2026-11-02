#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
let checked = 0;
const broken = [];
for (const name of readdirSync(resolve(root, 'research')).filter(name => name.endsWith('.md'))) {
  const file = resolve(root, 'research', name);
  const text = readFileSync(file, 'utf8');
  const targets = [
    ...text.matchAll(/\]\(<?([^\s)>]+)>?(?:\s+["'][^\n]*?["'])?\)/g),
    ...text.matchAll(/^\s*\[[^\]]+\]:\s*<?([^\s>]+)>?/gm),
  ];
  for (const match of targets) {
    const target = match[1];
    if (/^(?:[a-z][\w+.-]*:|\/|#)/i.test(target)) continue;
    const path = decodeURIComponent(target.split(/[?#]/)[0]);
    checked++;
    if (!existsSync(resolve(dirname(file), path))) broken.push(`research/${name}: ${target}`);
  }
}
if (broken.length) {
  console.error(broken.join('\n'));
  process.exitCode = 1;
} else console.log(`Checked ${checked} relative research links; none broken.`);
