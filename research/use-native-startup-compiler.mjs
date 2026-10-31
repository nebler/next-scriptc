#!/usr/bin/env node
// Measurement-only compiler shim. Instrument generated native sources, leaving
// the shipped function server and demo source unchanged.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(new URL('../packages/next-scriptc/package.json', import.meta.url));
const compiler = path.join(path.dirname(require.resolve('scriptc/package.json')), 'bin/scriptc.exe');
const args = process.argv.slice(2), entry = args[1];
if (args[0] === 'build' && process.env.SCRIPTC_TARGET === 'x86_64-linux-musl' && args[args.indexOf('-o') + 1].endsWith('/functions')) {
  const source = readFileSync(entry, 'utf8');
  const serve = JSON.parse(/import \{ serveFunctions \} from (".*?")/.exec(source)[1]);
  let server = readFileSync(serve, 'utf8');
  server = `import { performance } from 'node:perf_hooks';\n` + server;
  server = server.replace('const address = server.address();', `console.log('scriptc-startup ' + JSON.stringify({event:'listening', nativeMs:performance.now(), monoMs:Number(process.hrtime.bigint())/1e6}));\n    const address = server.address();`);
  writeFileSync(serve, server);
  writeFileSync(entry, source.replace('serveFunctions(async', `console.log('scriptc-startup ' + JSON.stringify({event:'modules-ready', nativeMs:process.uptime()*1000, monoMs:Number(process.hrtime.bigint())/1e6}));\nserveFunctions(async`));
  for (const match of source.matchAll(/import \{ .*? \} from (".*?module-\d+\.ts")/g)) {
    const file = JSON.parse(match[1]); let module = readFileSync(file, 'utf8');
    module = module.replace(/const fixtures = (.*);/, `const fixtures = (() => { const begin = performance.now(); console.log('scriptc-startup ' + JSON.stringify({event:'fixture-start', nativeMs:begin})); const value = $1; console.log('scriptc-startup ' + JSON.stringify({event:'fixture-end', nativeMs:performance.now(), durationMs:performance.now()-begin})); return value; })();`);
    writeFileSync(file, module);
  }
}
execFileSync(compiler, args, {stdio:'inherit'});
