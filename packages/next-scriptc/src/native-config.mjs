import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { nextServerPath } from "./paths.mjs";

const require = createRequire(import.meta.url);
const loadJsConfig = require("next/dist/build/load-jsconfig.js").default;

export async function writeNativeConfig(projectDir, output, config) {
  const { jsConfig, jsConfigPath, resolvedBaseUrl } = await loadJsConfig(projectDir, config);
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
}
