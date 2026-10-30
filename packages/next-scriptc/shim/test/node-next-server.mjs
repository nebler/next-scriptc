import { registerHooks } from "node:module";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const real = pathToFileURL(createRequire(import.meta.url).resolve("next/server.js")).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server" || (specifier === "./next-server.ts" && context.parentURL?.endsWith("/serve.ts"))) {
      return { url: real, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
