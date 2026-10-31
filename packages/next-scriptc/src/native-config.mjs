import { cp, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

export async function writeNativeConfig(projectDir, output, config) {
  // Production startup never writes compiler configuration. Load Next's
  // TypeScript/config tooling only when building native entries.
  const loadJsConfig = require("next/dist/build/load-jsconfig.js").default;
  const { jsConfig, jsConfigPath, resolvedBaseUrl } = await loadJsConfig(projectDir, config);
  // scriptc 0.4.6 treats shipped TS under node_modules as dependency code and
  // rejects bridge types accepted in application code. Stage our runtime sources
  // beside generated entries, preserving their relative imports and class identity.
  const shimDirectory = fileURLToPath(new URL("../shim", import.meta.url));
  const shimOutput = path.join(output, "shim");
  await cp(shimDirectory, shimOutput, {
    recursive: true,
    filter: (source) => source === shimDirectory || source.endsWith(".ts"),
  });
  const functionsOutput = path.join(output, "functions-runtime");
  await mkdir(functionsOutput, { recursive: true });
  for (const file of ["serve.ts", "json.ts"]) {
    await cp(new URL(`./functions/${file}`, import.meta.url), path.join(functionsOutput, file));
  }
  const nextServerPath = path.join(shimOutput, "next-server.ts");
  const paths = {};
  for (const [name, targets] of Object.entries(jsConfig?.compilerOptions?.paths ?? {})) {
    paths[name] = targets.map((target) => path.resolve(resolvedBaseUrl?.baseUrl ?? projectDir, target));
  }
  // scriptc adopts the nearest tsconfig to its entry. Override only this build's
  // resolution, retaining inherited strictness/JSX and absolute project aliases.
  await writeFile(path.join(output, "tsconfig.json"), JSON.stringify({
    ...(jsConfigPath ? { extends: jsConfigPath } : {}),
    compilerOptions: {
      ...(jsConfigPath ? {} : { strict: true }),
      strictNullChecks: true,
      allowJs: true,
      allowImportingTsExtensions: true,
      noEmit: true,
      paths: { ...paths, "next/server": [nextServerPath] },
    },
  }, null, 2) + "\n");
  return { shimPath: path.join(shimOutput, "serve.ts"), functionServePath: path.join(functionsOutput, "serve.ts") };
}
