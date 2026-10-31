import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

// Build-time override applies to routes, native functions and Vercel builds.
// Resolve a file, never a shell command; runtime packs still come from scriptc.
export function compilerPath(env = process.env) {
  if (env.SCRIPTC_COMPILER !== undefined) {
    if (!path.isAbsolute(env.SCRIPTC_COMPILER))
      throw new Error("[next-scriptc] SCRIPTC_COMPILER must be an absolute executable path.");
    return env.SCRIPTC_COMPILER;
  }
  return path.resolve(path.dirname(require.resolve("scriptc/package.json")), require("scriptc/package.json").bin.scriptc);
}

export const adapterPath = fileURLToPath(new URL("./adapter.mjs", import.meta.url));
export const shimPath = fileURLToPath(new URL("../shim/serve.ts", import.meta.url));

export const nextServerPath = fileURLToPath(new URL("../shim/next-server.ts", import.meta.url));
