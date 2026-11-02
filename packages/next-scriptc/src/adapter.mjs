import { compilerPath } from "./paths.mjs";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { discoverRoutes, processEntrySource, routeRewrite, withRewrites } from "./routes.mjs";
import { optionsKey, planRoutes, planProcesses } from "./options.mjs";
import { startNativeRoutes } from "./runtime.mjs";
import { prepareNativeSources } from "./native-config.mjs";
import { functionCounts, prepareFunctions, finishFunctions, publishPromotion, startFunctions } from "./functions/build.mjs";

const require = createRequire(import.meta.url);
// Preserve the exact discovery snapshot used to emit rewrites; rediscovery could compile a different route set.
const buildPlans = new Map();
const devNotices = new Set();

/** @type {import("next").NextAdapter} */
const adapter = {
  name: "next-scriptc",
  async modifyConfig(config, context) {
    const { phase, projectDir } = context;
    if (config.rewrites?.[optionsKey]?.target === "cloudflare") {
      if (phase === "phase-production-build") {
        const { prepareCloudflare } = await import("./cloudflare/build.mjs");
        await prepareCloudflare(projectDir, config.rewrites[optionsKey].cloudflare);
        buildPlans.set(projectDir, { cloudflare: true });
      }
      return config;
    }
    if (process.platform === "win32") throw new Error("[next-scriptc] Windows is unsupported; use macOS or Linux.");
    if (phase === "phase-production-build") {
      const routes = planRoutes(await discoverRoutes(projectDir, config.pageExtensions), config.rewrites?.[optionsKey]);
      if (routes.length && config.output) {
        throw new Error("[next-scriptc] Native routes require the local Next server (output: export/standalone is unsupported).");
      }
      buildPlans.set(projectDir, { routes, config });
      if (process.env.NEXT_SCRIPTC_VERCEL) {
        const { vercelAdapter } = await import("./vercel.mjs");
        return (await vercelAdapter()).modifyConfig(await prepareFunctions(config, projectDir), context);
      }
      return prepareFunctions(withRewrites(config, routes), projectDir);
    }
    if (phase === "phase-development-server" && !devNotices.has(projectDir)) {
      devNotices.add(projectDir);
      console.log('[next-scriptc] Promotion runs in production builds. Dev serves JS. Test native locally: pnpm build && pnpm start (see next-scriptc README).');
    }
    if (phase === "phase-production-server") {
      await startNativeRoutes(projectDir, path.resolve(projectDir, config.distDir));
      await startFunctions(projectDir, path.resolve(projectDir, config.distDir));
    }
    return config;
  },
  async onBuildComplete(context) {
    const { projectDir, distDir, buildId, outputs } = context;
    const plan = buildPlans.get(projectDir);
    if (!plan) throw new Error("[next-scriptc] Missing build plan from modifyConfig.");
    if (plan.cloudflare) { buildPlans.delete(projectDir); return; }
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
    if (process.env.NEXT_SCRIPTC_VERCEL) {
      const { vercelAdapter, buildVercelRoutes, buildVercelFunctions } = await import("./vercel.mjs");
      await publishPromotion(distDir);
      await (await vercelAdapter()).onBuildComplete(context);
      await buildVercelRoutes(context, routes);
      await buildVercelFunctions(context);
      buildPlans.delete(projectDir);
      return;
    }
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
    const { shimPath } = await prepareNativeSources(projectDir, output, config);
    // Next writes a CommonJS package boundary in .next; entries are ES modules.
    await writeFile(path.join(output, "package.json"), '{"type":"module"}\n');
    const compiler = compilerPath();

    // Serial builds keep CPU/memory use bounded on local development machines.
    const processes = planProcesses(routes);
    for (const [index, process] of processes.entries()) {
      const members = routes.filter((route) => route.process === process.id);
      const label = members.map((route) => route.pattern).join(", ");
      const entry = path.join(output, `entry-${index}.ts`);
      await writeFile(entry, `import { serve, serveMany } from ${JSON.stringify(shimPath)};\n${processEntrySource(members, interceptionPatterns)}`);
      console.log(`[next-scriptc] Compiling ${label} (${process.optimization})`);
      await new Promise((resolve, reject) => {
        const child = spawn(compiler, ["build", entry, "-o", path.join(output, process.binary), "--optimization", process.optimization, "--strip", "--no-keep-llvm"], {
          cwd: projectDir,
          stdio: "inherit",
        });
        child.once("error", (cause) => {
          reject(new Error(`[next-scriptc] Cannot compile ${label}`, { cause }));
        });
        child.once("exit", (code, signal) => {
          if (code === 0) resolve();
          else reject(new Error(`[next-scriptc] Compilation failed for ${label} (${signal ?? `exit ${code}`}). See scriptc diagnostics above.`));
        });
      });
    }
    await writeFile(path.join(output, "manifest.json"), JSON.stringify({ version: 2, buildId, routes, processes }, null, 2) + "\n");
    await finishFunctions(projectDir, distDir, buildId);
    buildPlans.delete(projectDir);
    const functions=functionCounts(projectDir);
    console.log(`[next-scriptc] Built ${functions.functions} native function(s) in ${functions.modules} module(s).`);
    console.log(`[next-scriptc] Built ${routes.length} native route(s) in ${processes.length} process(es).`);
  },
};

export default adapter;
