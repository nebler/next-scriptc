import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compilerPath } from '../paths.mjs';

export async function prepareCloudflare(projectDir, options) {
  if (!options) return; // JS-only Cloudflare target.
  const require = createRequire(path.join(projectDir, 'package.json'));
  // Optional runtime pack must belong to the consuming app.
  const pack = path.dirname(require.resolve('@scriptc/runtime-wasm32-wasi/package.json'));
  if (require('@scriptc/runtime-wasm32-wasi/package.json').version !== '0.4.6') throw new Error('[next-scriptc] CF1 requires stock runtime pack 0.4.6.');
  const out = path.join(projectDir, '.scriptc/cloudflare');
  await mkdir(out, { recursive: true });
  const profile = { profile_format: 1, name: 'cloudflare', entry: path.resolve(projectDir, options.entry), emission: 'llvm', abi: { prefix: 'bench_', init_symbol: 'bench_init', sink_register_symbol: 'bench_sink', collect_symbol: 'bench_collect' }, exports: [{ export: 'run', symbol: 'bench_run', params: ['string'], returns: 'string' }] };
  await writeFile(path.join(out, 'profile.json'), JSON.stringify(profile));
  await new Promise((resolve, reject) => {
    const child = spawn(compilerPath(), ['build', '--lib', '--profile', path.join(out, 'profile.json'), '-o', path.join(out, 'compute.wasm')], { cwd: projectDir, stdio: 'inherit', env: { ...process.env, SCRIPTC_TARGET: 'wasm32-wasi', SCRIPTC_RUNTIME_PACK: pack, SCRIPTC_CHECKER_SERVER: '0' } });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`[next-scriptc] Cloudflare wasm build failed (${code}).`)));
  });
  const bridge = fileURLToPath(new URL('./bridge.mjs', import.meta.url));
  const runtime = fileURLToPath(new URL('./runtime.mjs', import.meta.url));
  // Wrangler sees the static wasm import after OpenNext builds the Next server.
  await writeFile(path.join(out, 'worker.mjs'), `import worker from '../../.open-next/worker.js';\nimport module from './compute.wasm';\nimport {instantiate} from ${JSON.stringify(bridge)};\nimport {installCloudflare} from ${JSON.stringify(runtime)};\nlet initialized=false;\nexport * from '../../.open-next/worker.js';\nexport default {...worker,fetch(request,env,ctx){if(!initialized){initialized=true;try{installCloudflare(instantiate(module));}catch{installCloudflare(undefined);}}return worker.fetch(request,env,ctx);}};\n`);
}
