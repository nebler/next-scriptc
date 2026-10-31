import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeNativeConfig } from "../native-config.mjs";
import { startNativeProcesses } from "../runtime.mjs";
import { discoverFunctions } from "./extract.mjs";
import { withFunctions } from "./config.mjs";

const require = createRequire(import.meta.url);
const plans = new Map();
const serve = fileURLToPath(new URL("./serve.ts", import.meta.url));

export async function prepareFunctions(config, projectDir) {
  const distDir = path.resolve(projectDir, config.distDir ?? ".next");
  const modules = await discoverFunctions(projectDir, distDir, config);
  if (!modules.length) { plans.delete(projectDir); return config; }
  if (config.output) throw new Error("[next-scriptc] Native functions require the local Next server (output: export/standalone is unsupported).");
  const port = 40000 + createHash("sha256").update(projectDir).digest().readUInt16BE(0) % 10000;
  const output = path.join(distDir, "cache/scriptc-functions");
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await writeNativeConfig(projectDir, output, config);
  await writeFile(path.join(output, "package.json"), '{"type":"module"}\n');
  let entry = `import { serveFunctions } from ${JSON.stringify(serve)};\n`;
  const cases = [];
  let index = 0;
  for (const [moduleIndex, module] of modules.entries()) {
    const file = path.join(output, `module-${moduleIndex}.ts`);
    await writeFile(file, module.native);
    for (const fn of module.functions) {
      const name = `fn${index++}`;
      entry += `import { ${fn.name} as ${name} } from ${JSON.stringify(file)};\n`;
      cases.push(`case ${JSON.stringify(fn.id)}: { const args = JSON.parse(body) as Parameters<typeof ${name}>; return await ${name}(${fn.params.map((_, i) => `args[${i}]`).join(", ")}); }`);
    }
  }
  entry += `serveFunctions(async (id: string, body: string): Promise<unknown> => { switch (id) {\n${cases.join("\n")}\ndefault: throw new Error("Unknown native function");\n} });\n`;
  const file = path.join(output, "entry.ts");
  await writeFile(file, entry);
  const compiler = path.resolve(path.dirname(require.resolve("scriptc/package.json")), require("scriptc/package.json").bin.scriptc);
  console.log(`[next-scriptc] Compiling ${index} native function(s)`);
  await new Promise((resolve, reject) => {
    const child = spawn(compiler, ["build", file, "-o", path.join(output, "functions"), "--optimization", "release", "--strip", "--no-keep-llvm", "--node-islands=off"], { cwd: projectDir, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`[next-scriptc] Function compilation failed (${signal ?? `exit ${code}`}). See scriptc diagnostics above.`)));
  });
  const processes = [{ binary: "functions", port, routes: ["native functions"] }];
  plans.set(projectDir, { output, processes });
  await startNativeProcesses(projectDir, output, processes);
  return withFunctions(config, modules, port);
}

export async function finishFunctions(projectDir, distDir, buildId) {
  const output = path.join(distDir, "scriptc-functions");
  await rm(output, { recursive: true, force: true });
  const plan = plans.get(projectDir);
  if (!plan) return;
  await mkdir(output, { recursive: true });
  await cp(path.join(plan.output, "functions"), path.join(output, "functions"));
  await writeFile(path.join(output, "manifest.json"), JSON.stringify({ buildId, processes: plan.processes }) + "\n");
  plans.delete(projectDir);
}

export async function startFunctions(projectDir, distDir) {
  const output = path.join(distDir, "scriptc-functions");
  let manifest;
  try { manifest = JSON.parse(await readFile(path.join(output, "manifest.json"), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return; throw error; }
  if (manifest.buildId !== (await readFile(path.join(distDir, "BUILD_ID"), "utf8")).trim() ||
      manifest.processes?.length !== 1 || manifest.processes[0].binary !== "functions" ||
      !Array.isArray(manifest.processes[0].routes) || manifest.processes[0].routes.length !== 1 || manifest.processes[0].routes[0] !== "native functions" ||
      !Number.isInteger(manifest.processes[0].port) || manifest.processes[0].port < 40000 || manifest.processes[0].port >= 50000) {
    throw new Error("[next-scriptc] Invalid native functions manifest. Rebuild the application.");
  }
  await startNativeProcesses(projectDir, output, manifest.processes);
}
