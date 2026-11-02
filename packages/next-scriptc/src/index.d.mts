import type { NextConfig } from "next";

export type ScriptcOptions = {
  target?: "node" | "cloudflare";
  cloudflare?: { entry: string };
  /** Automatic discovery defaults to auto on Node, off on Cloudflare. */
  nativePromotion?: "auto" | "off";
  routes?: Record<string, { group?: string; optimization?: "release" | "speed" | "dev" }>;
};

export declare function withScriptc(config?: NextConfig, options?: ScriptcOptions): NextConfig;
