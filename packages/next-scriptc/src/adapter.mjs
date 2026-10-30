import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { shimPath } from "./paths.mjs";
import { discoverRoutes, entrySource, withRewrites } from "./routes.mjs";
import { readManifest } from "./manifest.mjs";
import { writeNativeConfig } from "./native-config.mjs";

const require = createRequire(import.meta.url);
// Preserve the exact discovery snapshot used to emit rewrites; rediscovery could compile a different route set.
const buildPlans = new Map();

/** @type {import("next").NextAdapter} */
const adapter = {
  name: "next-scriptc",
  async modifyConfig(config, { phase, projectDir }) {
    if (process.platform === "win32") throw new Error("[next-scriptc] Windows is unsupported; use macOS or Linux.");
    if (phase === "phase-production-build") {
      const routes = await discoverRoutes(projectDir, config.pageExtensions);
      if (routes.length && config.output) {
        throw new Error("[next-scriptc] Native routes require the local Next server (output: export/standalone is unsupported).");
      }
      buildPlans.set(projectDir, { routes, config });
      return withRewrites(config, routes);
    }
    if (phase === "phase-production-server") {
      const manifest = await readManifest(path.resolve(projectDir, config.distDir));
      if (manifest.routes.length && process.env.NEXT_SCRIPTC_PROJECT !== projectDir) {
        throw new Error("[next-scriptc] Start native routes with `next-scriptc start`, which manages their processes. Replace `next start` in your start script.");
      }
    }
    return config;
  },
  async onBuildComplete({ projectDir, distDir, buildId, outputs }) {
    const plan = buildPlans.get(projectDir);
    if (!plan) throw new Error("[next-scriptc] Missing build plan from modifyConfig.");
    const { routes, config } = plan;
    const appRoutes = new Set(outputs.appRoutes.map((route) => route.pathname));
    for (const route of routes) {
      if (!appRoutes.has(route.pattern)) throw new Error(`[next-scriptc] Native route ${route.source} is missing from Next's appRoutes output.`);
    }
    const output = path.join(distDir, "scriptc");
    await rm(output, { recursive: true, force: true });
    await mkdir(output, { recursive: true });
    await writeNativeConfig(projectDir, output, config);
    // Next writes a CommonJS package boundary in .next; entries are ES modules.
    await writeFile(path.join(output, "package.json"), '{"type":"module"}\n');
    const compiler = path.resolve(path.dirname(require.resolve("scriptc/package.json")), require("scriptc/package.json").bin.scriptc);

    // Serial builds keep CPU/memory use bounded on local development machines.
    for (const [index, route] of routes.entries()) {
      const entry = path.join(output, `entry-${index}.ts`);
      await writeFile(entry, `import { serve } from ${JSON.stringify(shimPath)};\n${entrySource(route)}`);
      console.log(`[next-scriptc] Compiling ${route.source}`);
      await new Promise((resolve, reject) => {
        const child = spawn(compiler, ["build", entry, "-o", path.join(output, route.binary), "--no-keep-llvm"], {
          cwd: projectDir,
          stdio: "inherit",
        });
        child.once("error", (cause) => {
          reject(new Error(`[next-scriptc] Cannot compile ${route.source}`, { cause }));
        });
        child.once("exit", (code, signal) => {
          if (code === 0) resolve();
          else reject(new Error(`[next-scriptc] Compilation failed for ${route.source} (${signal ?? `exit ${code}`}). See scriptc diagnostics above.`));
        });
      });
    }
    await writeFile(path.join(output, "manifest.json"), JSON.stringify({ version: 1, buildId, routes }, null, 2) + "\n");
    buildPlans.delete(projectDir);
    console.log(`[next-scriptc] Built ${routes.length} native route(s).`);
  },
};

export default adapter;
