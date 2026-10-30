import type { NextConfig } from "next";
import { adapterPath } from "./paths.mjs";

export function withScriptc(config: NextConfig = {}): NextConfig {
  return { ...config, adapterPath };
}
