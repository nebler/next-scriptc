import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { findRootDirAndLockFiles } = require("next/dist/lib/find-root.js");
const loader = fileURLToPath(new URL("./loader.mjs", import.meta.url));
const client = fileURLToPath(new URL("./client.mjs", import.meta.url));

export function withFunctions(config, modules, port, projectDir, promotionFile) {
  if (!modules.length) return config;
  modules = [...Map.groupBy(modules, m => m.source).values()].map(group=>({...group[0],promotion:group.every(m=>m.promotion),dependencies:group.flatMap(m=>m.dependencies??[]),functions:group.flatMap(m=>m.functions).sort((a,b)=>a.start-b.start)}));
  const options = { modules: Object.fromEntries(modules.map(({ source, hash, functions, promotion, dependencies }) => [source, { hash, functions, promotion, dependencies }])), port, client, promotionFile, promotionClient: fileURLToPath(new URL("./promotion-client.mjs", import.meta.url)) };
  const rules = { ...config.turbopack?.rules };
  const root = config.turbopack?.root ?? findRootDirAndLockFiles(projectDir).rootDir;
  // Regex conditions avoid treating route segments such as [id] as glob syntax.
  const files = { any: modules.map(({ source }) => ({ path: new RegExp("^" + path.relative(root, source).split(path.sep).join("/").replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$") })) };
  const existing = rules["*"];
  rules["*"] = [
    ...(existing ? Array.isArray(existing) ? existing : [existing] : []),
    { condition: { all: [files, "production", "node", { not: "browser" }] }, loaders: [{ loader, options: { ...options, server: true } }] },
    { condition: { all: [files, "production", { any: ["browser", "edge-light"] }] }, loaders: [{ loader, options: { ...options, server: false } }] },
  ];
  const webpack = config.webpack;
  return {
    ...config,
    turbopack: { ...config.turbopack, rules },
    webpack(value, context) {
      value = webpack?.(value, context) ?? value;
      if (!context.dev) value.module.rules.push({
        test: /\.[cm]?[jt]sx?$/,
        include: modules.map((module) => module.source),
        enforce: "pre",
        use: [{ loader, options: { ...options, server: context.isServer && context.nextRuntime !== "edge" } }],
      });
      return value;
    },
  };
}
