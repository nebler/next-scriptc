// Offline editorial checks. Counts use Twitter's 23-character URL convention.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const file = new URL('../launch-draft.md', import.meta.url);
const draft = readFileSync(file, 'utf8');
export const count = s => [...s.replace(/https?:\/\/[^\s]+/g, 'x'.repeat(23))].length;
const blocks = [...draft.matchAll(/### (Tweet [1-6]|Hook [ABC]|Hosted (?:win|tie|loss)|PR (?:open|coming))[^\n]*\n\n<!-- count: (\d+) -->\n```text\n([\s\S]*?)\n```/g)];
assert.equal(blocks.filter(b => b[1].startsWith('Tweet')).length, 6);
assert.equal(blocks.length, 14, 'Six tweets, three hooks, three hosted variants, two PR variants');
for (const [, label, declared, body] of blocks) {
  const n = count(body);
  assert.ok(n <= 280, `${label}: ${n} > 280`);
  assert.equal(n, Number(declared), `${label}: stale count`);
  assert.ok(!body.includes('—'), `${label}: em dash`);
  assert.ok(!/@[\w]+/.test(body), `${label}: handle`);
  const withUrls = count(body.replace(/\{\{(?:REPO_URL|RFC_URL|SCRIPTC_PR_URL)\}\}/g, 'https://example.invalid/link'));
  assert.ok(withUrls <= 280, `${label}: resolved URLs exceed limit`);
  console.log(`${label}: ${n}/280${withUrls !== n ? `; with resolved URLs: ${withUrls}` : ''}`);
}
console.log('Templates are counted literally; recount after replacing placeholders or URLs.');
