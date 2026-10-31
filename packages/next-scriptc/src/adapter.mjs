import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { shimPath } from "./paths.mjs";
import { discoverRoutes, entrySource, routeRewrite, withRewrites } from "./routes.mjs";
import { startNativeRoutes } from "./runtime.mjs";
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
      await startNativeRoutes(projectDir, path.resolve(projectDir, config.distDir));
    }
    return config;
  },
  async onBuildComplete({ projectDir, distDir, buildId, outputs }) {
    const plan = buildPlans.get(projectDir);
    if (!plan) throw new Error("[next-scriptc] Missing build plan from modifyConfig.");
    const { config } = plan;
    const appRoutes = new Set(outputs.appRoutes.map((route) => route.pathname));
    for (const route of plan.routes) {
      if (!appRoutes.has(route.pattern)) throw new Error(`[next-scriptc] Native route ${route.source} is missing from Next's appRoutes output.`);
    }
    const prerendered = new Set(outputs.prerenders.filter((route) =>
      route.routeType === "route" && route.response === "complete" && route.compute === "static"
    ).map((route) => route.route));
    const routes = plan.routes.filter((route) => !prerendered.has(route.pattern));
    const skipped = plan.routes.filter((route) => prerendered.has(route.pattern));
    const file = path.join(distDir, "routes-manifest.json");
    const manifest = JSON.parse(await readFile(file, "utf8"));
    const { isInterceptionRouteRewrite } = require("next/dist/lib/is-interception-route-rewrite.js");
    const interceptionPatterns = manifest.rewrites.beforeFiles.filter(isInterceptionRouteRewrite).map((rewrite) => rewrite.regex);
    if (skipped.length) {
      // Rewrites are generated before prerendering. Next reads this manifest at
      // production startup; the build has finished writing it before this hook.
      const destinations = new Set(skipped.map((route) => routeRewrite(route).destination));
      for (const phase of ["beforeFiles", "afterFiles"]) {
        manifest.rewrites[phase] = manifest.rewrites[phase].filter((rewrite) => !destinations.has(rewrite.destination));
      }
      await writeFile(file, JSON.stringify(manifest) + "\n");
      for (const route of skipped) console.log(`[next-scriptc] ${route.pattern} is prerendered by Next; serving the static output (native not needed)`);
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
      await writeFile(entry, `import { serve } from ${JSON.stringify(shimPath)};\n${entrySource(route, "route", interceptionPatterns)}`);
      console.log(`[next-scriptc] Compiling ${route.source}`);
      await new Promise((resolve, reject) => {
        const child = spawn(compiler, ["build", entry, "-o", path.join(output, route.binary), "--strip", "--no-keep-llvm"], {
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
