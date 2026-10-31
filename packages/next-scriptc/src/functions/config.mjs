import { fileURLToPath } from "node:url";

const loader = fileURLToPath(new URL("./loader.mjs", import.meta.url));
const client = fileURLToPath(new URL("./client.mjs", import.meta.url));

export function withFunctions(config, modules, port) {
  if (!modules.length) return config;
  const options = { modules: Object.fromEntries(modules.map(({ source, hash, functions }) => [source, { hash, functions }])), port, client };
  const rules = { ...config.turbopack?.rules };
  for (const extension of ["ts", "tsx", "js", "jsx", "mts", "mjs", "cts", "cjs"]) {
    const key = `*.${extension}`;
    const existing = rules[key];
    rules[key] = [
      ...(existing ? Array.isArray(existing) ? existing : [existing] : []),
      { condition: { all: ["production", "node", { not: "browser" }, { not: "foreign" }] }, loaders: [{ loader, options: { ...options, server: true } }] },
      { condition: { all: ["production", { any: ["browser", "edge-light"] }, { not: "foreign" }] }, loaders: [{ loader, options: { ...options, server: false } }] },
    ];
  }
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
