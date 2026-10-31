// Isolated Build Output API test; read research/vercel-deploy-test.md before deploying.
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeNativeConfig } from "../packages/next-scriptc/src/native-config.mjs";
import { shimPath } from "../packages/next-scriptc/src/paths.mjs";
import { discoverRoutes, entrySource } from "../packages/next-scriptc/src/routes.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const project = path.join(root, "examples/demo");
const output = path.join(root, ".vercel/output");
const func = path.join(output, "functions/api/hello.func");
const build = path.join(project, ".next/vercel-native-smoke");
const commit = "84878e532142f0ac584953695658b324eb9e5b80";
const temporary = await mkdtemp(path.join(tmpdir(), "vercel-native-smoke-"));

function run(command, args, options = {}) {
  execFileSync(command, args, { cwd: root, stdio: "inherit", ...options });
}

try {
  const route = (await discoverRoutes(project)).find((route) => route.pattern === "/api/hello");
  if (!route) throw new Error("Demo /api/hello route not found");
  await rm(output, { recursive: true, force: true });
  await mkdir(func, { recursive: true });
  await mkdir(build, { recursive: true });
  await writeNativeConfig(project, build, { typescript: {}, experimental: {} });
  await writeFile(path.join(build, "package.json"), '{"type":"module"}\n');
  const entry = path.join(build, "entry.ts");
  await writeFile(entry, `import { serve } from ${JSON.stringify(shimPath)};\n${entrySource(route)}`);

  run("npm", ["pack", "@scriptc/runtime-linux-x64-musl@0.4.6", "--ignore-scripts", "--silent", "--pack-destination", temporary]);
  run("tar", ["-xzf", path.join(temporary, "scriptc-runtime-linux-x64-musl-0.4.6.tgz"), "-C", temporary]);
  run(path.join(root, "packages/next-scriptc/node_modules/.bin/scriptc"), [
    "build", entry, "-o", path.join(func, "user-server"), "--strip", "--no-keep-llvm",
  ], {
    cwd: project,
    env: { ...process.env, SCRIPTC_TARGET: "x86_64-linux-musl", SCRIPTC_RUNTIME_PACK: path.join(temporary, "package") },
  });

  const source = path.join(temporary, "vercel");
  run("git", ["init", "--quiet", source]);
  run("git", ["remote", "add", "origin", "https://github.com/vercel/vercel.git"], { cwd: source });
  run("git", ["sparse-checkout", "set", "internals/ipc-proxy/bootstrap"], { cwd: source });
  run("git", ["fetch", "--quiet", "--depth=1", "--filter=blob:none", "origin", commit], { cwd: source });
  run("git", ["checkout", "--quiet", "--detach", "FETCH_HEAD"], { cwd: source });
  run("go", ["build", "-trimpath", "-ldflags=-s -w", "-o", path.join(func, "executable"), "."], {
    cwd: path.join(source, "internals/ipc-proxy/bootstrap"),
    env: { ...process.env, GOOS: "linux", GOARCH: "amd64", CGO_ENABLED: "0" },
  });

  for (const name of ["executable", "user-server"]) await chmod(path.join(func, name), 0o755);
  await writeFile(path.join(func, ".vc-config.json"), JSON.stringify({
    runtime: "executable",
    handler: "executable",
    architecture: "x86_64",
    supportsResponseStreaming: true,
    maxDuration: 10,
  }, null, 2) + "\n");
  await writeFile(path.join(output, "config.json"), '{"version":3}\n');
  run("file", [path.join(func, "executable"), path.join(func, "user-server")]);
  console.log("Built .vercel/output. Check research/vercel-deploy-test.md before deploying: Vercel forces first deployments to production.");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
