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
  return { ...config, rewrites, adapterPath };
}
