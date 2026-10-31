// Research-only instrumentation. Run after a grouped native build; never use
// this output for the uninstrumented paired benchmark. Sources stay unchanged.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { root, demo } from './build.mjs';

const mode = process.argv[2];
assert(['group', 'isolated'].includes(mode), 'Usage: startup-build.mjs group|isolated');
const destination = path.join(root, '.vercel/round2', mode);
await mkdir(destination, { recursive: true });
const shim = path.join(root, 'packages/next-scriptc/shim/serve.ts');
function replace(source, before, after) {
  assert.equal(source.split(before).length, 2, `Expected one instrumentation anchor: ${before}`);
  return source.replace(before, after);
}
let source = await readFile(shim, 'utf8');
source = replace(source, 'from "./next-server.ts"', `from ${JSON.stringify(path.join(path.dirname(shim), 'next-server.ts'))}`);
source += '\n';
source = replace(source, '// scriptc documents', `const diagnosticStarted = Date.now();
function diagnostic(stage: string, route = ""): void {
  console.log(JSON.stringify({ diagnostic: "next-scriptc-startup-v1", stage, route, pid: process.pid, at: Date.now(), elapsedMs: Date.now() - diagnosticStarted }));
}
diagnostic("shim-evaluated");
// scriptc documents`);
source = replace(source, '    get = route.GET;', '    diagnostic("module-initialized", options.pattern);\n    get = route.GET;');
source = replace(source, '    try {\n      if (initializing)', '    try {\n      diagnostic("request-received", options.pattern);\n      if (initializing)');
source = replace(source, '      await writeResponse(response, outgoing, method === "HEAD");', '      await writeResponse(response, outgoing, method === "HEAD");\n      diagnostic("response-end-called", options.pattern);');
source = replace(source, '      initializing = module().then(initialize);', '      diagnostic("module-start", options.pattern);\n      initializing = module().then(initialize);');
source = replace(source, '    console.log(`next-scriptc: listening', '    diagnostic("listening");\n    console.log(`next-scriptc: listening');
const diagnosticShim = path.join(destination, 'serve.ts');
await writeFile(diagnosticShim, source);
let entry = await readFile(path.join(demo, '.vercel/scriptc-build/entry-0.ts'), 'utf8');
entry = replace(entry, JSON.stringify(shim), JSON.stringify(diagnosticShim));
if (mode === 'isolated') {
  const hello = entry.match(/  \{ pattern: "\/api\/hello", module: async \(\) => \{[\s\S]*?\n\} \}/)?.[0];
  assert(hello, 'Missing hello entry');
  entry = entry.slice(0, entry.indexOf('serveMany([')) + `serveMany([\n${hello}\n], { vercel: true });\n`;
}
const entryFile = path.join(destination, 'entry.ts');
await writeFile(entryFile, entry);
execFileSync(path.join(root, 'packages/next-scriptc/node_modules/.bin/scriptc'), ['build', entryFile, '-o', path.join(destination, 'user-server'), '--optimization', 'release', '--strip', '--no-keep-llvm'], {
  cwd: demo, stdio: 'inherit', env: { ...process.env, SCRIPTC_CHECKER_SERVER: '0', SCRIPTC_TARGET: 'x86_64-linux-musl', SCRIPTC_RUNTIME_PACK: path.join(demo, '.vercel/cache/scriptc/runtime-linux-x64-musl-0.4.6/package') },
});
await copyFile(path.join(root, '.vercel/output/functions/api/hello.func/executable'), path.join(destination, 'executable'));
console.log(destination);
