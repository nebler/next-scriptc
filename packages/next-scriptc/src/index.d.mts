import type { NextConfig } from "next";

export type ScriptcOptions = {
  routes?: Record<string, { group?: string; optimization?: "release" | "speed" | "dev" }>;
};

export declare function withScriptc(config?: NextConfig, options?: ScriptcOptions): NextConfig;
