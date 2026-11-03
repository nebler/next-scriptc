import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';

const repair = 'pnpm approve-builds scriptc && pnpm rebuild scriptc';
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const configs = {
 next: ['next.config', 'withScriptc'], vite: ['vite.config', 'scriptcPromote'],
 sveltekit: ['vite.config', 'scriptcPromote'], nitro: ['nitro.config', 'scriptcNitro'],
 nuxt: ['nuxt.config', 'scriptcNitro'], astro: ['astro.config', 'scriptcAstro'],
 'react-router': ['vite.config', 'scriptcReactRouter'], tanstack: ['vite.config', 'scriptcTanstack'],
};

/** Read-only preflight. Configs are inspected as text, never executed. */
export function doctor(directory = '.', options = {}) {
 const root = path.resolve(directory), checks = [];
 const add = (id, ok, message, command) => checks.push({id, ok, message, ...(ok ? {} : {repair: command})});
 const node = options.nodeVersion ?? process.versions.node;
 add('node', Number(node.split('.')[0]) >= 24, `Node ${node}; requires >=24`, 'nvm install 24 && nvm use 24');
 let pkg = {}, require;
 try { pkg = read(path.join(root, 'package.json')); require = createRequire(path.join(root, 'package.json')); add('project', true, root); }
 catch { add('project', false, 'Cannot read package.json', `cd ${quote(root)} && npm init -y`); }
 const deps = {...pkg.dependencies, ...pkg.devDependencies};
 const framework = deps.next ? 'next' : deps.nuxt ? 'nuxt' : deps['@sveltejs/kit'] ? 'sveltekit' : deps['@tanstack/react-start'] ? 'tanstack' : deps['@react-router/dev'] ? 'react-router' : deps.astro ? 'astro' : deps.nitropack ? 'nitro' : deps.vite ? 'vite' : null;
 add('framework', !!framework, framework ?? 'No supported framework detected', 'See docs/quick-start.md and install a supported framework');
 if (framework) {
  const [base, symbol] = configs[framework];
  const files = ['ts','mts','js','mjs','cjs'].map(ext => path.join(root, `${base}.${ext}`));
  const text = files.filter(fs.existsSync).map(f => fs.readFileSync(f, 'utf8')).join('\n');
  add('adapter', new RegExp(`\\b${symbol}\\s*\\(`).test(text), `${base}: expected ${symbol}() (static check only)`, `Wire ${symbol}() as shown in docs/${framework === 'nuxt' ? 'nitro' : framework}.md`);
  if (framework === 'sveltekit') {
   const svelte = ['js','mjs','ts'].map(ext => path.join(root, `svelte.config.${ext}`)).filter(fs.existsSync).map(f => fs.readFileSync(f,'utf8')).join('\n');
   add('svelte-adapter', /scriptcAdapter\s*\(/.test(svelte), 'adapter-node artifact copying', 'Wrap adapter() with scriptcAdapter() in svelte.config.js; see docs/sveltekit.md');
  }
 }
 let scriptc;
 try { scriptc = require.resolve('scriptc/package.json'); }
 catch { try { scriptc = createRequire(require.resolve(framework === 'next' ? 'next-scriptc' : 'scriptc-promote')).resolve('scriptc/package.json'); } catch {} }
 add('scriptc', !!scriptc && read(scriptc).version === '0.4.6', scriptc ? `scriptc ${read(scriptc).version}` : 'scriptc is missing', 'pnpm add -D scriptc@0.4.6');
 if (scriptc) {
  const identity = read(scriptc), bin = path.resolve(path.dirname(scriptc), typeof identity.bin === 'string' ? identity.bin : identity.bin.scriptc);
  let manifest;
  try { manifest = read(bin + '.json'); } catch {}
  add('approved-build', !!manifest, manifest ? 'Postinstall toolchain manifest exists; approval inferred from installed artifacts' : 'Postinstall has not completed (build scripts may be blocked)', repair);
  const helpers = [['compiler', bin]];
  if (manifest) {
   for (const key of ['ts7','tsc_ts','comptime']) if (manifest[key]) helpers.push([key, path.resolve(path.dirname(bin), manifest[key])]);
   if (manifest.llvm_package) helpers.push(['llvm', path.resolve(path.dirname(bin), manifest.llvm_package, 'bin/scriptc-llvm-codegen')]);
  }
  for (const [name, file] of helpers) {
   let ok = false; try { fs.accessSync(file, fs.constants.X_OK); ok = fs.statSync(file).size > (name === 'compiler' ? 107 : 0); } catch {}
   add(`helper-${name}`, ok, file, repair);
  }
 }
 const platform = options.platform ?? process.platform;
 add('platform', ['darwin','linux'].includes(platform), `Native adapters support macOS/Linux; host ${platform}`, 'Use a macOS or Linux build host');
 const tools = options.findTool ?? (name => (process.env.PATH ?? '').split(path.delimiter).some(dir => {try { fs.accessSync(path.join(dir,name),fs.constants.X_OK); return true; } catch {return false;}}));
 const toolRepair = platform === 'darwin' ? 'xcode-select --install' : 'sudo apt-get install clang build-essential';
 for (const tool of ['clang','ar']) add(`tool-${tool}`, tools(tool), `${tool} on PATH`, toolRepair);
 // Zig is needed for cross targets, not the stock host macOS/Linux toolchain.
 if (options.cross || (process.env.SCRIPTC_TARGET && !process.env.SCRIPTC_TARGET.startsWith(platform === 'darwin' ? 'aarch64-macos' : 'x86_64-linux'))) add('tool-zig', tools('zig'), 'zig for cross compilation', platform === 'darwin' ? 'brew install zig' : 'Install zig from https://ziglang.org/download/ and add it to PATH');
 try { const ts = require('typescript'); const config = ts.findConfigFile(root, fs.existsSync); if (!config) throw Error('tsconfig.json missing'); const parsed = ts.readConfigFile(config, ts.sys.readFile); if (parsed.error) throw Error(ts.flattenDiagnosticMessageText(parsed.error.messageText,' ')); const resolved = ts.parseJsonConfigFileContent(parsed.config, ts.sys, path.dirname(config)); const errors = resolved.errors.filter(e => e.code !== 18003); if (errors.length) throw Error(errors.map(e => ts.flattenDiagnosticMessageText(e.messageText, ' ')).join('; ')); add('typescript', true, `TypeScript ${ts.version}; ${config}`); }
 catch(e) {add('typescript', false, e.message, framework === 'sveltekit' ? 'pnpm add -D typescript@^5 && pnpm exec svelte-kit sync' : 'pnpm add -D typescript@^5 && pnpm exec tsc --init');}
 for (const [name, target] of [['project-cache', path.join(root, framework === 'next' ? '.next/cache' : 'node_modules/.cache')], ['temp', options.tmpdir ?? os.tmpdir()]]) {
  try { let existing = target; while (!fs.existsSync(existing) && path.dirname(existing) !== existing) existing = path.dirname(existing); if (!fs.statSync(existing).isDirectory()) throw Error('Not a directory'); fs.accessSync(existing, fs.constants.W_OK); const disk = fs.statfsSync(existing); const free = Number(disk.bavail) * Number(disk.bsize); add(name, free >= 256 * 1024 * 1024, `${target}; ${Math.floor(free/1024/1024)} MiB available (minimum 256 MiB)`, `Free disk space and grant write permission to ${quote(existing)}`); }
  catch(e) {add(name, false, `${target}: ${e.message}`, `Create a writable cache directory at ${quote(target)}`);}
 }
 return {version: 1, directory: root, framework, ok: checks.every(c => c.ok), checks};
}
export function doctorCommand(args = process.argv.slice(3)) {
 const positional = args.filter(a => !a.startsWith('--'));
 if (args.some(a => a.startsWith('--') && a !== '--json' && a !== '--cross') || positional.length > 1) throw Error('Usage: doctor [dir] [--json] [--cross]');
 const result = doctor(positional[0], {cross: args.includes('--cross')});
 console.log(args.includes('--json') ? JSON.stringify(result, null, 2) : result.checks.map(c => `${c.ok ? 'PASS' : 'FAIL'} ${c.id}: ${c.message}${c.ok ? '' : `\n  Repair: ${c.repair}`}`).join('\n'));
 if (!result.ok) process.exitCode = 1;
 return result;
}
