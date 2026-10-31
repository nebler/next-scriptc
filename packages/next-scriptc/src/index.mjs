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
  return { ...config, pageExtensions: pageExtensions.includes("native.ts") ? pageExtensions : [...pageExtensions, "native.ts"], rewrites, adapterPath };
}
