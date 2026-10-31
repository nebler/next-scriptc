import { execFileSync } from "node:child_process";
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { writeNativeConfig } from "./native-config.mjs";
import { shimPath } from "./paths.mjs";
import { entrySource } from "./routes.mjs";

const require = createRequire(import.meta.url);
const proxyCommit = "84878e532142f0ac584953695658b324eb9e5b80";
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
  const proxy = await cached(cache, `ipc-proxy-${proxyCommit}`, async (temporary) => {
    const source = path.join(temporary, "source");
    run("git", ["init", "--quiet", source]);
    run("git", ["remote", "add", "origin", "https://github.com/vercel/vercel.git"], { cwd: source });
    run("git", ["sparse-checkout", "set", "internals/ipc-proxy/bootstrap"], { cwd: source });
    run("git", ["fetch", "--quiet", "--depth=1", "--filter=blob:none", "origin", proxyCommit], { cwd: source });
    run("git", ["checkout", "--quiet", "--detach", "FETCH_HEAD"], { cwd: source });
    run("go", ["build", "-trimpath", "-ldflags=-s -w", "-o", path.join(temporary, "executable"), "."], {
      cwd: path.join(source, "internals/ipc-proxy/bootstrap"),
      env: { ...process.env, GOOS: "linux", GOARCH: "amd64", CGO_ENABLED: "0" },
    });
    await rm(source, { recursive: true });
  });
  return { runtime: path.join(runtime, "package"), executable: path.join(proxy, "executable") };
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
    await copyFile(route.binary, path.join(main, "user-server"));
    await copyFile(route.executable, path.join(main, "executable"));
    for (const name of ["user-server", "executable"]) await chmod(path.join(main, name), 0o755);
    await writeFile(path.join(main, ".vc-config.json"), JSON.stringify(route.config, null, 2) + "\n");
    for (const alias of aliases) await symlink(path.relative(path.dirname(alias), main), alias);
  }
}

export async function buildVercelRoutes({ projectDir, distDir, config, outputs }, routes) {
  if (!routes.length) return;
  const build = process.env.NEXT_SCRIPTC_VERCEL;
  await mkdir(build);
  await writeNativeConfig(projectDir, build, config);
  await writeFile(path.join(build, "package.json"), '{"type":"module"}\n');
  const functionsDir = path.join(distDir, "output/functions");
  const { runtime, executable } = await toolchain(path.join(path.dirname(build), "cache/scriptc"));
  const compiler = path.resolve(path.dirname(require.resolve("scriptc/package.json")), require("scriptc/package.json").bin.scriptc);
  const replacements = [];
  for (const [index, route] of routes.entries()) {
    const main = outputs.appRoutes.find((item) => item.pathname === route.pattern);
    const functions = outputs.appRoutes.filter((item) => item.filePath === main.filePath).map((item) =>
      path.join(functionsDir, `${item.pathname === "/" ? "index" : item.pathname.slice(1)}.func`)
    );
    const original = JSON.parse(await readFile(path.join(functions[0], ".vc-config.json"), "utf8"));
    const functionConfig = { runtime: "executable", handler: "executable", architecture: "x86_64", supportsResponseStreaming: true };
    for (const key of ["memory", "maxDuration", "regions", "environment", "functionFailoverRegions", "framework"]) {
      if (original[key] !== undefined) functionConfig[key] = original[key];
    }
    const entry = path.join(build, `entry-${index}.ts`);
    const binary = path.join(build, `route-${index}`);
    await writeFile(entry, `import { serve } from ${JSON.stringify(shimPath)};\n${entrySource(route)}`);
    console.log(`[next-scriptc] Compiling Vercel Function ${route.pattern} (${route.optimization})`);
    run(compiler, ["build", entry, "-o", binary, "--optimization", route.optimization, "--strip", "--no-keep-llvm"], {
      cwd: projectDir,
      env: { ...process.env, SCRIPTC_TARGET: "x86_64-linux-musl", SCRIPTC_RUNTIME_PACK: runtime },
    });
    replacements.push({ functions, binary, executable, config: functionConfig });
  }
  await replaceFunctions(functionsDir, replacements);
  console.log(`[next-scriptc] Built ${routes.length} native Vercel Functions`);
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
