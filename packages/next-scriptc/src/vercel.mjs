import { compilerPath } from "./paths.mjs";
import { execFileSync } from "node:child_process";
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

// Next shares Node outputs via symlinks. Copy once per physical Node bundle;
// tracing is not used to guess whether a bundled/chunked client is reachable.
export async function bundleFunctionSidecar(functionsDir, binary) {
  const owners = new Set(await Promise.all((await functionDirectories(functionsDir)).map((file) => realpath(file))));
  let count = 0;
  for (const owner of owners) {
    const config = JSON.parse(await readFile(path.join(owner, ".vc-config.json"), "utf8"));
    if (!config.runtime?.startsWith("nodejs")) continue;
    await copyFile(binary, path.join(owner, "scriptc-functions"));
    await chmod(path.join(owner, "scriptc-functions"), 0o755);
    count++;
  }
  return count;
}

export async function buildVercelFunctions({ projectDir, distDir }) {
  const plan = takeFunctionPlan(projectDir);
  if (!plan) return;
  const build = process.env.NEXT_SCRIPTC_VERCEL;
  await mkdir(build, { recursive: true });
  const runtime = await toolchain(path.join(path.dirname(build), "cache/scriptc"));
  const binary = path.join(build, "functions");
  run(compilerPath(), ["build", path.join(plan.output, "entry.ts"), "-o", binary, "--optimization", "release", "--cpu-dispatch", "--strip", "--no-keep-llvm", "--node-islands=off"], {
    cwd: projectDir,
    env: { ...process.env, SCRIPTC_TARGET: "x86_64-linux-musl", SCRIPTC_RUNTIME_PACK: runtime },
  });
  const count = await bundleFunctionSidecar(path.join(distDir, "output/functions"), binary);
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
