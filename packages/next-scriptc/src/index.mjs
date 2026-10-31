import { adapterPath } from "./paths.mjs";
import { optionsKey, validateOptions } from "./options.mjs";

/**
 * @param {import("next").NextConfig} [config]
 * @param {import("./index.mjs").ScriptcOptions} [options]
 * @returns {import("next").NextConfig}
 */
export function withScriptc(config = {}, options = {}) {
  const original = config.rewrites;
  const rewrites = Object.assign(async () => await original?.call(config) ?? [], {
    [optionsKey]: validateOptions(options),
  });
  const pageExtensions = config.pageExtensions ?? ["tsx", "ts", "jsx", "js"];
  // Function stubs import the shared TypeScript JSON validator. Opt the package
  // into Next's dependency transpilation when installed under node_modules.
  const transpilePackages = [...new Set([...(config.transpilePackages ?? []), "next-scriptc"])];
  return { ...config, transpilePackages, pageExtensions: pageExtensions.includes("native.ts") ? pageExtensions : [...pageExtensions, "native.ts"], rewrites, adapterPath };
}
