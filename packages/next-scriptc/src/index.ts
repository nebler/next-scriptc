import type { NextConfig } from "next";
import { adapterPath } from "./paths.mjs";
import { optionsKey, validateOptions } from "./options.mjs";

export type ScriptcOptions = {
  routes?: Record<string, { group?: string; optimization?: "release" | "speed" | "dev" }>;
};

export function withScriptc(config: NextConfig = {}, options: ScriptcOptions = {}): NextConfig {
  const original = config.rewrites;
  const rewrites = Object.assign(async () => await original?.call(config) ?? [], {
    [optionsKey]: validateOptions(options),
  });
  const pageExtensions = config.pageExtensions ?? ["tsx", "ts", "jsx", "js"];
  return { ...config, pageExtensions: pageExtensions.includes("native.ts") ? pageExtensions : [...pageExtensions, "native.ts"], rewrites, adapterPath };
}
