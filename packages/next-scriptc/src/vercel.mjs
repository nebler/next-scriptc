import {promotionArtifacts} from './functions/promotion-runtime.mjs';
import { compilerPath } from "./paths.mjs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { prepareNativeSources } from "./native-config.mjs";
import { processEntrySource } from "./routes.mjs";
import { planProcesses } from "./options.mjs";
import { takeFunctionPlan } from "./functions/build.mjs";

const require = createRequire(import.meta.url);
const version = require("scriptc/package.json").version;

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: "inherit", ...options });
}

export async function vercelAdapter() {
  if (!process.env.NEXT_ADAPTER_PATH) throw new Error("[next-scriptc] Vercel did not supply NEXT_ADAPTER_PATH.");
  return (await import(pathToFileURL(process.env.NEXT_ADAPTER_PATH).href)).default;
}


async function cached(cache, name, build) {
  const destination = path.join(cache, name);
  try { await lstat(destination); return destination; } catch (error) { if (error.code !== "ENOENT") throw error; }
  await mkdir(cache, { recursive: true });
  const temporary = await mkdtemp(path.join(cache, ".build-"));
  try {
    await build(temporary);
    try { await rename(temporary, destination); } catch (error) {
      if (error.code !== "EEXIST" && error.code !== "ENOTEMPTY") throw error;
    }
  } finally { await rm(temporary, { recursive: true, force: true }); }
  return destination;
}

async function toolchain(cache) {
  const runtime = await cached(cache, `runtime-linux-x64-musl-${version}`, async (temporary) => {
    run("npm", ["pack", `@scriptc/runtime-linux-x64-musl@${version}`, "--ignore-scripts", "--silent", "--pack-destination", temporary]);
    const archive = path.join(temporary, `scriptc-runtime-linux-x64-musl-${version}.tgz`);
    run("tar", ["-xzf", archive, "-C", temporary]);
    await rm(archive);
  });
  return path.join(runtime, "package");
}

async function functionDirectories(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.name.endsWith(".func")) result.push(file);
    else if (entry.isDirectory()) result.push(...await functionDirectories(file));
  }
  return result;
}

export async function replaceFunctions(functionsDir, replacements) {
  const functions = await functionDirectories(functionsDir);
  const targets = new Map(await Promise.all(functions.map(async (file) => [file, await realpath(file)])));
  const replaced = new Set(replacements.flatMap((route) => route.functions));
  // A shared Node function may be physically stored at a native route's path.
  for (const [file, target] of targets) {
    if (!replaced.has(file) || (await lstat(file)).isSymbolicLink()) continue;
    const remaining = functions.filter((other) => targets.get(other) === target && !replaced.has(other));
    if (!remaining.length) continue;
    const [owner, ...aliases] = remaining;
    await rm(owner);
    await rename(file, owner);
    for (const alias of aliases) {
      await rm(alias);
      await symlink(path.relative(path.dirname(alias), owner), alias);
    }
  }
  for (const route of replacements) {
    const [main, ...aliases] = route.functions;
    for (const file of route.functions) await rm(file, { recursive: true, force: true });
    await mkdir(main, { recursive: true });
    await copyFile(route.binary, path.join(main, "executable"));
    await chmod(path.join(main, "executable"), 0o755);
    await writeFile(path.join(main, ".vc-config.json"), JSON.stringify(route.config, null, 2) + "\n");
    for (const alias of aliases) await symlink(path.relative(path.dirname(alias), main), alias);
  }
}

// Trace paths are relative to Next's outputFileTracingRoot, not the .func
// directory. Bundlers may inline the client, so inspect traced chunks too.
export async function functionUsesNative(owner, config, traceRoot, { promotion = false } = {}) {
  let files;
  if (config.filePathMap && typeof config.filePathMap === "object" && !Array.isArray(config.filePathMap)) {
    files = Object.entries(config.filePathMap).map(([target, source]) => ({ target, source, root: traceRoot }));
  } else {
    // Unbundled handlers can expose the NFT trace directly.
    try {
      const trace = path.join(owner, config.handler + ".nft.json");
      const nft = JSON.parse(await readFile(trace, "utf8"));
      if (!Array.isArray(nft.files)) return true;
      files = nft.files.map((source) => ({ target: typeof source === "string" ? path.resolve(path.dirname(trace), source) : source, source, root: path.dirname(trace) }));
    } catch { return true; }
  }
  if (!files.length) return true;
  if (typeof config.handler === "string") files.push({ target: config.handler, source: config.handler, root: owner });
  let uncertain = false;
  for (const { target, source, root } of files) {
    if (typeof source !== "string") { uncertain = true; continue; }
    if (!promotion && [target, source].some((file) => /(?:^|\/)(?:next-scriptc\/src\/functions\/(?:client\.mjs|sidecar\.mjs)|scriptc-functions\/manifest\.json)$/.test(file))) return true;
    if (!/\.[cm]?[jt]sx?$/.test(source)) continue;
    let content;
    try { content = await readFile(path.resolve(owner, target), "utf8"); }
    catch {
      try { content = await readFile(path.resolve(root, source), "utf8"); }
      catch { uncertain = true; continue; }
    }
    // Symbol.for's stable process singleton name survives minification and
    // identifies the native client even when its source path is not traced.
    if (content.includes(promotion ? "next-scriptc.functions.promotion" : "next-scriptc.functions.sidecar")) return true;
  }
  return uncertain;
}

async function bootstrapFunction(owner, config) {
  const original = config.handler;
  if (original === "scriptc-bootstrap.cjs") return;
  if (typeof original !== "string" || !original || path.isAbsolute(original) || path.relative(owner, path.resolve(owner, original)).startsWith("..")) {
    throw new Error("[next-scriptc] Invalid Node Function handler");
  }
  const source = await readFile(path.join(owner, original));
  // Keep Next's existing bundling groups: the CLI compares handler bytes. A
  // wrapper on only native outputs would split a shared group into more paid
  // Functions; identical wrappers around different launchers would merge them.
  const digest = createHash("sha256").update(source).digest("hex");
  const wrapper = "scriptc-bootstrap.cjs";
  const runtime = "scriptc-sidecar.cjs";
  await writeFile(path.join(owner, wrapper), `// Original launcher: ${digest}
const { existsSync } = require("node:fs");
const { join } = require("node:path");
const binary = join(__dirname, "scriptc-functions");
if (existsSync(binary)) require("./${runtime}").startSidecar(binary);
module.exports = require(${JSON.stringify("./" + original)});
`);
  config.handler = wrapper;
}

// Copy once per physical Node output. A conservative unknown trace includes
// the binary. All launchers get the same conditional bootstrap so Vercel can
// retain its existing shared Function groups when it unions their traced files.
export async function bundleFunctionSidecar(functionsDir, binary, { traceRoot = process.cwd() } = {}) {
  const owners = new Set(await Promise.all((await functionDirectories(functionsDir)).map((file) => realpath(file))));
  let count = 0, runtimeSource;
  for (const owner of owners) {
    const config = JSON.parse(await readFile(path.join(owner, ".vc-config.json"), "utf8"));
    if (!config.runtime?.startsWith("nodejs")) continue;
    if (await functionUsesNative(owner, config, traceRoot)) {
      await copyFile(binary, path.join(owner, "scriptc-functions"));
      await chmod(path.join(owner, "scriptc-functions"), 0o755);
      // Vercel's runtime loader rejects require(ESM), even on Node 24. Use
      // Next's shipped Babel to compile our own tiny runtime, not user code.
      if (!runtimeSource) {
        const babel = require("next/dist/compiled/babel/bundle.js");
        runtimeSource = babel.core().transformSync(await readFile(new URL("./functions/sidecar.mjs", import.meta.url), "utf8"), {
          babelrc: false, configFile: false, plugins: [babel.pluginTransformModulesCommonjs()],
        }).code;
      }
      await writeFile(path.join(owner, "scriptc-sidecar.cjs"), runtimeSource);
      count++;
    }
    // Architecture is part of Vercel's bundling signature too. Keep otherwise
    // identical native/non-native outputs compatible on macOS build hosts.
    config.architecture = "x86_64";
    await bootstrapFunction(owner, config);
    await writeFile(path.join(owner, ".vc-config.json"), JSON.stringify(config, null, 2) + "\n");
  }
  return count;
}

export async function buildVercelFunctions({ projectDir, distDir }) {
  const plan = takeFunctionPlan(projectDir);
  const promotion=path.join(distDir,'scriptc-promotion');
  try{
    await lstat(path.join(promotion,'promotion.node'));
    const required=JSON.parse(await readFile(path.join(distDir,'required-server-files.json'),'utf8'));
    const traceRoot=required.config.outputFileTracingRoot||projectDir;
    for(const owner of new Set(await Promise.all((await functionDirectories(path.join(distDir,'output/functions'))).map(f=>realpath(f))))){
      const cfg=JSON.parse(await readFile(path.join(owner,'.vc-config.json'),'utf8'));
      if(!cfg.runtime?.startsWith('nodejs')||!await functionUsesNative(owner,cfg,traceRoot,{promotion:true}))continue;
      // Absolute loader path is retained by Next. Ship at its trace-relative path.
      const target=path.join(owner,'.next/scriptc-promotion');
      await mkdir(target,{recursive:true});
      for(const file of promotionArtifacts)await copyFile(path.join(promotion,file),path.join(target,file));
    }
  }catch(e){if(e.code!=='ENOENT')throw e;}
  if (!plan) return;
  const build = process.env.NEXT_SCRIPTC_VERCEL;
  await mkdir(build, { recursive: true });
  const runtime = await toolchain(path.join(path.dirname(build), "cache/scriptc"));
  const binary = path.join(build, "functions");
  run(compilerPath(), ["build", path.join(plan.output, "entry.ts"), "-o", binary, "--optimization", "release", "--cpu-dispatch", "--strip", "--no-keep-llvm", "--node-islands=off"], {
    cwd: projectDir,
    env: { ...process.env, SCRIPTC_TARGET: "x86_64-linux-musl", SCRIPTC_RUNTIME_PACK: runtime },
  });
  const required = JSON.parse(await readFile(path.join(distDir, "required-server-files.json"), "utf8"));
  const traceRoot = required.config.outputFileTracingRoot || projectDir;
  const count = await bundleFunctionSidecar(path.join(distDir, "output/functions"), binary, { traceRoot });
  console.log(`[next-scriptc] Bundled native functions sidecar in ${count} shared Node Function(s)`);
}

export async function buildVercelRoutes({ projectDir, distDir, config, outputs }, routes) {
  if (!routes.length) return;
  const build = process.env.NEXT_SCRIPTC_VERCEL;
  await mkdir(build, { recursive: true });
  const { shimPath } = await prepareNativeSources(projectDir, build, config);
  await writeFile(path.join(build, "package.json"), '{"type":"module"}\n');
  const functionsDir = path.join(distDir, "output/functions");
  const runtime = await toolchain(path.join(path.dirname(build), "cache/scriptc"));
  const compiler = compilerPath();
  const replacements = [];
  const processes = planProcesses(routes);
  const started = performance.now();
  for (const [index, nativeProcess] of processes.entries()) {
    const members = routes.filter((route) => route.process === nativeProcess.id);
    const { functions, config: functionConfig } = await planVercelFunction(functionsDir, outputs.appRoutes, members);
    const entry = path.join(build, `entry-${index}.ts`);
    const binary = path.join(build, `route-${index}`);
    await writeFile(entry, `import { serve, serveMany } from ${JSON.stringify(shimPath)};\n${processEntrySource(members, [], { vercel: true })}`);
    console.log(`[next-scriptc] Compiling Vercel Function ${members.map((route) => route.pattern).join(", ")} (${nativeProcess.optimization})`);
    // Vercel targets x86-64 Linux; dispatch retains baseline support on older CPUs.
    run(compiler, ["build", entry, "-o", binary, "--optimization", nativeProcess.optimization, "--cpu-dispatch", "--strip", "--no-keep-llvm"], {
      cwd: projectDir,
      env: { ...process.env, SCRIPTC_TARGET: "x86_64-linux-musl", SCRIPTC_RUNTIME_PACK: runtime },
    });
    replacements.push({ functions, binary, config: functionConfig });
  }
  await replaceFunctions(functionsDir, replacements);
  console.log(`[next-scriptc] Built ${routes.length} native routes in ${processes.length} Vercel Functions (${((performance.now() - started) / 1000).toFixed(1)}s compilation)`);
}

// Preserve every output variant identified by Next, including .rsc aliases.
// A group has one deployment configuration; reject incompatible route settings
// rather than silently applying the first member's memory/region/timeout.
export async function planVercelFunction(functionsDir, appRoutes, members) {
  const functions = new Set();
  let config;
  for (const route of members) {
    const main = appRoutes.find((item) => item.pathname === route.pattern);
    if (!main) throw new Error(`[next-scriptc] Missing Vercel output for ${route.pattern}`);
    const file = path.join(functionsDir, `${route.pattern.slice(1) || "index"}.func`);
    const original = JSON.parse(await readFile(path.join(file, ".vc-config.json"), "utf8"));
    const current = { runtime: "executable", handler: "executable", architecture: "x86_64", supportsResponseStreaming: true };
    for (const key of ["memory", "maxDuration", "regions", "environment", "functionFailoverRegions", "framework"]) {
      if (original[key] !== undefined) current[key] = original[key];
    }
    if (config && !isDeepStrictEqual(config, current)) {
      throw new Error(`[next-scriptc] Group ${JSON.stringify(route.group)} has incompatible Vercel Function settings at ${route.pattern}`);
    }
    config = current;
    functions.add(file);
    for (const item of appRoutes.filter((item) => item.filePath === main.filePath)) {
      functions.add(path.join(functionsDir, `${item.pathname.slice(1) || "index"}.func`));
    }
  }
  return { functions: [...functions], config };
}

export async function buildVercel(args) {
  if (args.some((arg) => arg !== "--prod")) throw new Error("Usage: next-scriptc vercel-build [--prod]");
  const output = path.resolve(".vercel/output");
  const build = path.resolve(".vercel/scriptc-build");
  await rm(build, { recursive: true, force: true });
  try {
    run("vercel", ["build", ...args], {
      env: { ...process.env, NEXT_ENABLE_ADAPTER: "1", NEXT_SCRIPTC_VERCEL: build },
    });
  } catch (error) {
    await rm(output, { recursive: true, force: true });
    throw error;
  }
}
